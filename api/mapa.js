// ORZZEN live map proxy for Vercel.
// Reads the latest mirror from Google Drive and returns only the JSON payload.
// The frontend remains protected by Vercel Deployment Protection.

const DEFAULT_DRIVE_FILE_ID = '1HiFOBTJu5Uo5KaKkTdSc7nfdel3TsgTz';

function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('La fuente de Drive llegó vacía.');

  // If Drive returns the raw JSON directly.
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);

  // The current Drive mirror is Markdown and contains the complete JSON
  // after the heading "## Contenido extraído".
  const marker = '## Contenido extraído';
  const markerIndex = trimmed.indexOf(marker);
  const searchFrom = markerIndex >= 0 ? markerIndex + marker.length : 0;
  const jsonStart = trimmed.indexOf('{', searchFrom);
  if (jsonStart < 0) throw new Error('No se encontró el JSON dentro del espejo de Drive.');

  const candidate = trimmed.slice(jsonStart).trim();
  return JSON.parse(candidate);
}

module.exports = async function handler(req, res) {
  const fileId = process.env.ORZZEN_MAP_DRIVE_FILE_ID || DEFAULT_DRIVE_FILE_ID;
  const urls = [
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`
  ];

  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'ORZZEN-Cerebro-Visual/2.0' }
      });

      if (!response.ok) {
        lastError = new Error(`Drive respondió HTTP ${response.status}`);
        continue;
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const text = await response.text();

      // Private Drive files commonly resolve to an HTML login/permission page.
      if (contentType.includes('text/html') && /accounts\.google\.com|sign in|request access|drive\/u\/0/i.test(text)) {
        lastError = new Error('La fuente de Drive requiere autenticación y no puede leerse desde Vercel todavía.');
        continue;
      }

      const data = extractJson(text);
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).json({
        ...data,
        _sync: {
          source: 'google-drive-live',
          fetched_at: new Date().toISOString(),
          drive_file_id: fileId
        }
      });
      return;
    } catch (err) {
      lastError = err;
    }
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(502).json({
    error: 'LIVE_SOURCE_UNAVAILABLE',
    message: lastError ? lastError.message : 'No fue posible leer la fuente viva de Drive.',
    hint: 'El visor seguirá usando la copia publicada hasta que Drive permita la lectura del archivo desde Vercel.'
  });
};
