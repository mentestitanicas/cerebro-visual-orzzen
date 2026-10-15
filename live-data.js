(function () {
  const LIVE_URL = './api/mapa';
  const STATIC_URL = './data/mapa.json';
  const POLL_MS = 300000;
  const FRESH_SYNC_MINUTES = 10;
  const STALE_SYNC_MINUTES = 30;
  let liveLoading = false;

  async function getJson(url) {
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function updateLiveFreshness(source) {
    const pill = document.getElementById('freshnessStatus');
    if (!pill) return;
    const sync = rawData && rawData._sync ? rawData._sync : null;
    const isAuthenticatedLive = source === 'live' && sync && sync.source === 'google-drive-authenticated-live';
    if (!isAuthenticatedLive) {
      pill.textContent = source === 'static' ? 'Fuente no disponible' : 'Sin verificar';
      pill.className = 'freshness-pill old';
      pill.title = source === 'static' ? 'No fue posible leer Google Drive. El visor está usando la última copia publicada.' : 'La fuente viva respondió, pero no se pudo verificar la sincronización autenticada con Google Drive.';
      return;
    }
    const fetchedAt = sync.fetched_at ? new Date(sync.fetched_at) : null;
    const fetchedMs = fetchedAt && !Number.isNaN(fetchedAt.getTime()) ? fetchedAt.getTime() : null;
    const ageMinutes = fetchedMs == null ? null : Math.max(0, (Date.now() - fetchedMs) / 60000);
    if (ageMinutes == null) {
      pill.textContent = 'Fuente viva';
      pill.className = 'freshness-pill fresh';
      pill.title = 'Google Drive está conectado mediante la cuenta de servicio.';
      return;
    }
    if (ageMinutes <= FRESH_SYNC_MINUTES) { pill.textContent = 'Al día'; pill.className = 'freshness-pill fresh'; }
    else if (ageMinutes <= STALE_SYNC_MINUTES) { pill.textContent = 'Sincronización retrasada'; pill.className = 'freshness-pill stale'; }
    else { pill.textContent = 'Desactualizado'; pill.className = 'freshness-pill old'; }
    const modifiedAt = sync.drive_modified_at ? new Date(sync.drive_modified_at) : null;
    pill.title = `Fuente viva autenticada · última lectura: ${fetchedAt.toLocaleString()} · archivo Drive modificado: ${modifiedAt && !Number.isNaN(modifiedAt.getTime()) ? modifiedAt.toLocaleString() : 'sin fecha'}`;
  }

  async function liveLoadData(force) {
    if (liveLoading) return;
    liveLoading = true;
    try {
      if (typeof setLoading === 'function') setLoading(true);
      let source = 'live';
      try { rawData = await getJson(LIVE_URL); }
      catch (err) {
        console.warn('Fuente viva no disponible; usando copia publicada.', err);
        source = 'static';
        rawData = await getJson(STATIC_URL);
      }
      normalizeData();
      buildFilterUI();
      populateSelectors();
      fillMeta();
      updateLiveFreshness(source);
      buildKPIs();
      if (!network || !nodesDS || !edgesDS) createNetwork();
      renderGraph();
      showOverview();
      if (force && typeof toast === 'function') toast(source === 'live' ? 'Datos actualizados desde la fuente viva del Cerebro ORZZEN.' : 'Fuente viva no disponible. Se mantiene la última copia publicada.');
    } catch (err) {
      console.error(err);
      const pill = document.getElementById('freshnessStatus');
      if (pill) { pill.textContent = 'Error de actualización'; pill.className = 'freshness-pill old'; pill.title = 'No fue posible actualizar el mapa.'; }
      if (typeof toast === 'function') toast('No fue posible actualizar el mapa: ' + err.message);
    } finally {
      liveLoading = false;
      if (typeof setLoading === 'function') setLoading(false);
    }
  }

  try { loadData = liveLoadData; } catch (_) { window.loadData = liveLoadData; }
  // app.js inicia primero con la copia local. Esperamos a que termine y luego
  // sustituimos los datos por la fuente viva sin destruir/recrear el grafo.
  setTimeout(function () { liveLoadData(false); }, 1200);
  setInterval(function () { liveLoadData(false); }, POLL_MS);
  window.ORZZEN_LIVE_SYNC = { refresh: function () { return liveLoadData(true); }, poll_ms: POLL_MS };
})();