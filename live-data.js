(function () {
  const LIVE_URL = './api/mapa';
  const STATIC_URL = './data/mapa.json';
  const POLL_MS = 300000;

  async function getJson(url) {
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function liveLoadData(force) {
    try {
      if (typeof setLoading === 'function') setLoading(true);
      let source = 'live';
      try {
        rawData = await getJson(LIVE_URL);
      } catch (err) {
        console.warn('Fuente viva no disponible; usando copia publicada.', err);
        source = 'static';
        rawData = await getJson(STATIC_URL);
      }

      normalizeData();
      buildFilterUI();
      populateSelectors();
      fillMeta();
      buildKPIs();
      createNetwork();
      renderGraph();
      showOverview();

      if (force && typeof toast === 'function') {
        toast(source === 'live' ? 'Datos actualizados desde la fuente viva del Cerebro ORZZEN.' : 'Fuente viva no disponible. Se mantiene la última copia publicada.');
      }
    } catch (err) {
      console.error(err);
      if (typeof toast === 'function') toast('No fue posible actualizar el mapa: ' + err.message);
    } finally {
      if (typeof setLoading === 'function') setLoading(false);
    }
  }

  try { loadData = liveLoadData; } catch (_) { window.loadData = liveLoadData; }
  setTimeout(function () { liveLoadData(false); }, 250);
  setInterval(function () { liveLoadData(false); }, POLL_MS);
  window.ORZZEN_LIVE_SYNC = { refresh: function () { return liveLoadData(true); }, poll_ms: POLL_MS };
})();
