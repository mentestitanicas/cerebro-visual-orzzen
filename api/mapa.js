// ORZZEN live map proxy for Vercel.
// Reads the private Google Drive source with a service account.
// Required Vercel env vars:
//   GOOGLE_DRIVE_FILE_ID
//   GOOGLE_SERVICE_ACCOUNT_JSON

const crypto = require('crypto');

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function readServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON en Vercel.');

  let creds;
  try {
    creds = JSON.parse(raw);
    // Tolerate a JSON string that itself contains the credentials JSON.
    if (typeof creds === 'string') creds = JSON.parse(creds);
  } catch (err) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no contiene JSON válido.');
  }

  if (!creds.client_email || !creds.private_key) {
    throw new Error('La credencial de Google no contiene client_email/private_key.');
  }
  return creds;
}

async function getAccessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(creds.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google OAuth falló (${response.status}): ${payload.error_description || payload.error || 'sin access_token'}`);
  }
  return payload.access_token;
}

function extractJson(text) {
  const trimmed = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) throw new Error('La fuente de Drive llegó vacía.');

  // Normal case: raw JSON file.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }

  // Backward compatibility with old Markdown mirrors.
  const marker = '## Contenido extraído';
  const markerIndex = trimmed.indexOf(marker);
  const searchFrom = markerIndex >= 0 ? markerIndex + marker.length : 0;
  const objectStart = trimmed.indexOf('{', searchFrom);
  const arrayStart = trimmed.indexOf('[', searchFrom);
  let jsonStart = -1;
  if (objectStart >= 0 && arrayStart >= 0) jsonStart = Math.min(objectStart, arrayStart);
  else jsonStart = Math.max(objectStart, arrayStart);
  if (jsonStart < 0) throw new Error('No se encontró JSON en la fuente de Drive.');
  return JSON.parse(trimmed.slice(jsonStart).trim());
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const fileId = process.env.GOOGLE_DRIVE_FILE_ID || process.env.ORZZEN_MAP_DRIVE_FILE_ID;
    if (!fileId) throw new Error('Falta GOOGLE_DRIVE_FILE_ID en Vercel.');

    const creds = readServiceAccount();
    const accessToken = await getAccessToken(creds);
    const authHeaders = { Authorization: `Bearer ${accessToken}` };

    const metadataUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime&supportsAllDrives=true`;
    const metadataResponse = await fetch(metadataUrl, { headers: authHeaders, cache: 'no-store' });
    const metadata = await metadataResponse.json().catch(() => ({}));
    if (!metadataResponse.ok) {
      throw new Error(`Drive metadata HTTP ${metadataResponse.status}: ${metadata.error?.message || 'sin detalle'}`);
    }

    const mediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
    const mediaResponse = await fetch(mediaUrl, { headers: authHeaders, cache: 'no-store' });
    if (!mediaResponse.ok) {
      const detail = await mediaResponse.text().catch(() => '');
      throw new Error(`Drive media HTTP ${mediaResponse.status}: ${detail.slice(0, 300)}`);
    }

    const text = await mediaResponse.text();
    const data = extractJson(text);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      ...data,
      _sync: {
        source: 'google-drive-authenticated-live',
        fetched_at: new Date().toISOString(),
        drive_modified_at: metadata.modifiedTime || null,
        drive_file_id: fileId,
        drive_file_name: metadata.name || null,
        drive_file_size: metadata.size || null
      }
    });
  } catch (err) {
    res.status(502).json({
      error: 'LIVE_SOURCE_UNAVAILABLE',
      message: err && err.message ? err.message : 'No fue posible leer la fuente viva de Drive.',
      hint: 'El visor seguirá usando la copia publicada hasta que la fuente viva vuelva a estar disponible.'
    });
  }
};
