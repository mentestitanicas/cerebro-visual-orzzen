const TYPE_STYLES = {
  area: { color: '#7B8794', shape: 'dot', size: 22 },
  producto: { color: '#D08A00', shape: 'dot', size: 18 },
  conversacion: { color: '#9AD4B0', shape: 'square', size: 9 },
  hipotesis: { color: '#A8AF1C', shape: 'diamond', size: 14 },
  decision: { color: '#C54343', shape: 'triangle', size: 13 },
  aprendizaje: { color: '#88B85B', shape: 'triangle', size: 12 },
  anuncio: { color: '#8DB2F8', shape: 'dot', size: 10 },
  campana: { color: '#5B89E8', shape: 'dot', size: 18 },
  conjunto: { color: '#769CE6', shape: 'dot', size: 14 },
  cuenta: { color: '#4A78D9', shape: 'dot', size: 18 },
  creativo: { color: '#B8C2CC', shape: 'dot', size: 12 },
  creador: { color: '#C6A66A', shape: 'dot', size: 12 },
  guion: { color: '#D94F8A', shape: 'square', size: 10 },
  material: { color: '#6DCAD0', shape: 'dot', size: 10 },
  documento: { color: '#B8C2CC', shape: 'box', size: 11 },
  exportacion: { color: '#7B8794', shape: 'box', size: 10 },
  fuente: { color: '#AAB4BE', shape: 'dot', size: 14 },
  landing: { color: '#43B6B8', shape: 'diamond', size: 12 },
  upsell: { color: '#43B6B8', shape: 'diamond', size: 12 },
  checkout: { color: '#43B6B8', shape: 'diamond', size: 12 },
  cluster: { color: '#7B8794', shape: 'dot', size: 20 },
  investigacion: { color: '#D8C39A', shape: 'dot', size: 14 },
  automatizacion: { color: '#78A3C9', shape: 'diamond', size: 13 },
  prueba: { color: '#EE7D7D', shape: 'triangle', size: 11 },
  video_original: { color: '#C68F4F', shape: 'square', size: 10 }
};

const EVIDENCE_STYLES = {
  confirmado: { color: '#2e7d59', dashes: false, width: 2 },
  probable: { color: '#c57a1d', dashes: [8, 6], width: 2 },
  pendiente: { color: '#c53f3f', dashes: [2, 6], width: 2 },
  bloqueado: { color: '#c53f3f', dashes: [2, 6], width: 2 }
};

let rawData;
let network;
let allNodes = [];
let allEdges = [];
let nodesDS;
let edgesDS;
let selectedNodeId = null;
let selectedEdgeId = null;
let currentMode = 'resumen';
let currentRendered = { nodes: [], edges: [] };
let focusType = null;

const el = (id) => document.getElementById(id);

async function init() {
  bindUI();
  await loadData();
}

function bindUI() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      renderGraph();
    });
  });

  ['searchInput', 'productSelect', 'sourceSelect'].forEach(id => {
    el(id).addEventListener('input', renderGraph);
  });
  ['productSelect', 'sourceSelect'].forEach(id => el(id).addEventListener('change', renderGraph));

  el('btnReset').addEventListener('click', resetAllFilters);
  el('btnFit').addEventListener('click', () => network && network.fit({ animation: true }));
  el('btnRefresh').addEventListener('click', async () => loadData(true));
  el('btnShowSelection').addEventListener('click', showOnlySelection);
  el('btnShowNeighbors').addEventListener('click', showNeighbors);
  el('btnExportSelection').addEventListener('click', exportSelection);
  el('btnCopyContext').addEventListener('click', copyCurrentContext);
  el('btnClearSearch').addEventListener('click', () => { el('searchInput').value = ''; renderGraph(); });
  el('btnOverview').addEventListener('click', showOverview);
  el('toggleLabels').addEventListener('change', renderGraph);
  el('toggleEdgeLabels').addEventListener('change', renderGraph);
  el('btnTypesAll').addEventListener('click', () => {
    document.querySelectorAll('.type-filter').forEach(ch => ch.checked = true);
    focusType = null;
    renderGraph();
  });

  document.querySelectorAll('.quick-focus').forEach(btn => {
    btn.addEventListener('click', () => quickFocus(btn.dataset.focusType));
  });
}

async function loadData(force = false) {
  try {
    setLoading(true);
    const url = `./data/mapa.json${force ? `?t=${Date.now()}` : ''}`;
    const res = await fetch(url, { cache: force ? 'no-store' : 'default' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rawData = await res.json();
    normalizeData();
    buildFilterUI();
    populateSelectors();
    fillMeta();
    buildKPIs();
    createNetwork();
    renderGraph();
    showOverview();
    if (force) toast('Datos recargados desde la versión publicada del mapa.');
  } catch (err) {
    console.error(err);
    toast(`No fue posible cargar el mapa: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

function normalizeData() {
  allNodes = Array.isArray(rawData?.nodos) ? rawData.nodos.map(n => ({ ...n })) : [];
  allEdges = Array.isArray(rawData?.relaciones) ? rawData.relaciones.map((r, i) => ({ id: `e${i}`, ...r })) : [];
}

function fillMeta() {
  el('badgeSchema').textContent = rawData?.schema || 'sin esquema';
  el('generatedAt').textContent = `Generado: ${formatDate(rawData?.generado)}`;
  el('summaryCounts').textContent = `${rawData?.conteo?.nodos || allNodes.length} nodos · ${rawData?.conteo?.relaciones || allEdges.length} relaciones`;

  const frescura = rawData?.frescura || {};
  const cobertura = frescura.cobertura || {};
  const noCubierto = Array.isArray(cobertura.no_cubierto) ? cobertura.no_cubierto : [];
  const capturador = frescura.capturador_ultimo_ciclo || rawData?.generado;
  const age = ageInHours(capturador);
  const status = age == null ? 'Sin fecha' : age <= 2 ? 'Al día' : `Hace ${Math.round(age)} h`;
  const statusClass = age == null ? 'stale' : age <= 2 ? 'fresh' : age <= 12 ? 'stale' : 'old';

  el('freshnessStatus').textContent = status;
  el('freshnessStatus').className = `freshness-pill ${statusClass}`;
  el('freshnessBox').innerHTML = `
    <div><strong>Capturador:</strong> ${escapeHtml(formatDate(capturador))}</div>
    <div><strong>Meta leído:</strong> ${escapeHtml(formatDate(frescura.meta_leido))}</div>
    <div><strong>Fuentes registradas:</strong> ${Object.keys(frescura.fuentes || {}).length}</div>
    <div class="${noCubierto.length ? 'coverage-warning' : ''}"><strong>No cubierto:</strong> ${noCubierto.length}</div>
    ${noCubierto.slice(0, 4).map(x => `<div>• ${escapeHtml(typeof x === 'string' ? x : JSON.stringify(x))}</div>`).join('')}
  `;
}

function buildKPIs() {
  const nodeCounts = countBy(allNodes, 't');
  const edgeCounts = countBy(allEdges.map(e => ({ ev: normalizeEvidence(e.e) })), 'ev');
  const pendingNodes = allNodes.filter(n => Boolean(n.pend)).length;
  const connected = allNodes.length ? Math.round((new Set(allEdges.flatMap(e => [e.s, e.t])).size / allNodes.length) * 100) : 0;
  const groups = new Set(allNodes.map(n => n.g).filter(Boolean)).size;
  const decisions = nodeCounts.decision || 0;
  const learnings = nodeCounts.aprendizaje || 0;

  const items = [
    ['Nodos', formatNumber(allNodes.length), `${groups} grupos / productos`],
    ['Relaciones', formatNumber(allEdges.length), `${connected}% de nodos conectados`],
    ['Confirmadas', formatNumber(edgeCounts.confirmado || 0), 'evidencia directa'],
    ['Probables', formatNumber(edgeCounts.probable || 0), 'evidencia indirecta'],
    ['Decisiones', formatNumber(decisions), `${learnings} aprendizajes`],
    ['Pendientes', formatNumber((edgeCounts.pendiente || 0) + pendingNodes), 'requieren revisión']
  ];

  el('kpiStrip').innerHTML = items.map(([label, value, sub]) => `
    <div class="kpi-card">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="kpi-value">${escapeHtml(value)}</div>
      <div class="kpi-sub">${escapeHtml(sub)}</div>
    </div>
  `).join('');
}

function buildFilterUI() {
  const typeCounts = countBy(allNodes, 't');
  const evidenceCounts = countBy(allEdges.map(e => ({ e: normalizeEvidence(e.e) })), 'e');
  const typeWrap = el('typeFilters');
  typeWrap.innerHTML = '';

  Object.keys(typeCounts).sort().forEach(type => {
    const id = `type_${type}`;
    typeWrap.insertAdjacentHTML('beforeend', `
      <label class="checkbox-item"><input type="checkbox" class="type-filter" id="${id}" value="${escapeAttr(type)}" checked> <span>${escapeHtml(type)} (${typeCounts[type]})</span></label>
    `);
  });

  const evWrap = el('evidenceFilters');
  evWrap.innerHTML = '';
  ['confirmado', 'probable', 'pendiente'].forEach(ev => {
    const count = evidenceCounts[ev] || 0;
    evWrap.insertAdjacentHTML('beforeend', `
      <label class="checkbox-item"><input type="checkbox" class="evidence-filter" value="${ev}" checked> <span>${ev} (${count})</span></label>
    `);
  });

  document.querySelectorAll('.type-filter,.evidence-filter').forEach(ch => ch.addEventListener('change', () => {
    focusType = null;
    renderGraph();
  }));
}

function populateSelectors() {
  const products = new Set();
  const sources = new Set();
  allNodes.forEach(n => {
    if (n.g) products.add(n.g);
    (n.src || []).forEach(s => sources.add(s));
  });
  allEdges.forEach(e => { if (e.ev) sources.add(e.ev); });

  el('productSelect').innerHTML = '<option value="">Todos</option>' + [...products].sort().map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
  el('sourceSelect').innerHTML = '<option value="">Todas</option>' + [...sources].sort().map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
}

function createNetwork() {
  if (network) network.destroy();
  nodesDS = new vis.DataSet([]);
  edgesDS = new vis.DataSet([]);
  network = new vis.Network(el('network'), { nodes: nodesDS, edges: edgesDS }, {
    autoResize: true,
    physics: {
      stabilization: { iterations: 120, updateInterval: 20 },
      barnesHut: { gravitationalConstant: -4200, springLength: 115, springConstant: 0.025, damping: 0.24, avoidOverlap: 0.12 }
    },
    interaction: { hover: true, multiselect: false, navigationButtons: false, keyboard: true, tooltipDelay: 120 },
    layout: { improvedLayout: true },
    nodes: { font: { face: 'Inter', size: 12, color: '#233143' }, borderWidth: 1, shadow: false },
    edges: { smooth: { type: 'dynamic' }, selectionWidth: 2, color: { inherit: false, opacity: 0.42 } }
  });

  network.on('click', params => {
    if (params.nodes.length) {
      selectedNodeId = params.nodes[0];
      selectedEdgeId = null;
      renderDetailsForNode(selectedNodeId);
      if (currentMode !== 'resumen') renderGraph(false);
    } else if (params.edges.length) {
      selectedEdgeId = params.edges[0];
      selectedNodeId = null;
      renderDetailsForEdge(selectedEdgeId);
    }
  });

  network.on('doubleClick', params => {
    if (params.nodes.length) {
      selectedNodeId = params.nodes[0];
      currentMode = 'conexiones';
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.mode === 'conexiones'));
      renderGraph();
    }
  });
}

function getActiveTypeSet() {
  return new Set([...document.querySelectorAll('.type-filter:checked')].map(x => x.value));
}
function getActiveEvidenceSet() {
  return new Set([...document.querySelectorAll('.evidence-filter:checked')].map(x => x.value));
}

function renderGraph(fit = true) {
  const search = el('searchInput').value.trim().toLowerCase();
  const product = el('productSelect').value;
  const source = el('sourceSelect').value;
  const activeTypes = getActiveTypeSet();
  const activeEvidence = getActiveEvidenceSet();

  let baseNodes = allNodes.filter(n => activeTypes.has(n.t));
  if (focusType) baseNodes = baseNodes.filter(n => n.t === focusType);
  if (product) baseNodes = baseNodes.filter(n => n.g === product || String(n.n || '').toLowerCase().includes(product.toLowerCase()));
  if (source) baseNodes = baseNodes.filter(n => (n.src || []).includes(source) || JSON.stringify(n.d || {}).includes(source));
  if (search) baseNodes = baseNodes.filter(n => textBlob(n).includes(search));

  let nodeIds = new Set(baseNodes.map(n => n.id));
  let baseEdges = allEdges.filter(e => nodeIds.has(e.s) && nodeIds.has(e.t) && activeEvidence.has(normalizeEvidence(e.e)));
  if (source) baseEdges = baseEdges.filter(e => String(e.ev || '').includes(source));
  if (search) baseEdges = baseEdges.filter(e => JSON.stringify(e).toLowerCase().includes(search) || nodeIds.has(e.s) || nodeIds.has(e.t));

  if (currentMode === 'conexiones' && selectedNodeId) {
    const neighborIds = new Set([selectedNodeId]);
    allEdges.forEach(e => {
      if (!activeEvidence.has(normalizeEvidence(e.e))) return;
      if (e.s === selectedNodeId || e.t === selectedNodeId) { neighborIds.add(e.s); neighborIds.add(e.t); }
    });
    baseNodes = allNodes.filter(n => neighborIds.has(n.id) && activeTypes.has(n.t));
    nodeIds = new Set(baseNodes.map(n => n.id));
    baseEdges = allEdges.filter(e => nodeIds.has(e.s) && nodeIds.has(e.t) && activeEvidence.has(normalizeEvidence(e.e)));
  }

  if (currentMode === 'recorrido' && selectedNodeId) {
    const eligible = allEdges.filter(e => activeEvidence.has(normalizeEvidence(e.e)));
    const hop2 = collectHops(selectedNodeId, eligible, 2);
    baseNodes = allNodes.filter(n => hop2.has(n.id) && activeTypes.has(n.t));
    nodeIds = new Set(baseNodes.map(n => n.id));
    baseEdges = eligible.filter(e => nodeIds.has(e.s) && nodeIds.has(e.t));
  }

  currentRendered = { nodes: baseNodes, edges: baseEdges };
  const showAllLabels = el('toggleLabels').checked;
  const showEdgeLabels = el('toggleEdgeLabels').checked;
  const dense = baseNodes.length > 180;

  nodesDS.clear();
  edgesDS.clear();
  nodesDS.add(baseNodes.map(n => buildVisNode(n, showAllLabels, dense)));
  edgesDS.add(baseEdges.map(e => buildVisEdge(e, showEdgeLabels, dense)));

  el('activeModeLabel').textContent = modeLabel();
  el('activeViewStats').textContent = `${formatNumber(baseNodes.length)} elementos · ${formatNumber(baseEdges.length)} relaciones`;
  el('activeFilterSummary').textContent = buildFilterSummary(search, product, source);
  if (network && fit) network.fit({ animation: { duration: 350, easingFunction: 'easeInOutQuad' } });
}

function buildVisNode(n, showAllLabels, dense) {
  const style = TYPE_STYLES[n.t] || { color: '#90a4ae', shape: 'dot', size: 10 };
  const isSelected = n.id === selectedNodeId;
  const important = (n.lvl ?? 99) <= 1 || ['producto', 'campana', 'cuenta', 'decision', 'aprendizaje', 'area'].includes(n.t);
  const label = showAllLabels || isSelected || important || !dense ? n.n : '';

  return {
    id: n.id,
    label,
    title: `${n.t}: ${n.n}`,
    color: {
      background: style.color,
      border: isSelected ? '#3478f6' : '#ffffff',
      highlight: { background: style.color, border: '#3478f6' },
      hover: { background: style.color, border: '#3478f6' }
    },
    shape: style.shape,
    size: isSelected ? style.size + 4 : style.size,
    font: { color: '#22313f', size: important ? 14 : 11, bold: important ? '700' : '500', strokeWidth: dense ? 2 : 3, strokeColor: '#fff' },
    mass: Math.max(1, 5 - (n.lvl || 0)),
    borderWidth: isSelected ? 3 : 1,
    opacity: 1
  };
}

function buildVisEdge(e, showEdgeLabels, dense) {
  const ev = normalizeEvidence(e.e);
  const style = EVIDENCE_STYLES[ev] || EVIDENCE_STYLES.pendiente;
  return {
    id: e.id,
    from: e.s,
    to: e.t,
    label: showEdgeLabels && !dense ? (e.r || '') : '',
    arrows: { to: { enabled: true, scaleFactor: dense ? 0.35 : 0.55 } },
    dashes: style.dashes,
    width: dense ? Math.max(1, style.width - 0.5) : style.width,
    color: { color: style.color, highlight: '#3478f6', hover: '#3478f6', opacity: dense ? 0.28 : 0.45 },
    title: `${e.r || 'relación'} · ${ev}`,
    font: { size: 9, align: 'middle', strokeWidth: 3, strokeColor: '#fff' }
  };
}

function renderDetailsForNode(id) {
  const node = allNodes.find(n => n.id === id);
  if (!node) return;
  selectedNodeId = id;
  el('overviewPanel').classList.add('hidden');
  el('detailsEmpty').classList.add('hidden');
  el('detailsEdge').classList.add('hidden');

  const rels = allEdges.filter(e => e.s === id || e.t === id);
  const relsSorted = [...rels].sort((a, b) => evidenceRank(normalizeEvidence(a.e)) - evidenceRank(normalizeEvidence(b.e)));
  const relatedCards = relsSorted.slice(0, 40).map(e => {
    const otherId = e.s === id ? e.t : e.s;
    const other = allNodes.find(n => n.id === otherId);
    return `<div class="card clickable" data-node-jump="${escapeAttr(otherId)}"><div class="title">${escapeHtml(node.n)} ${escapeHtml(e.r || 'relaciona con')} ${escapeHtml(other?.n || otherId)}</div><div class="meta">${escapeHtml(normalizeEvidence(e.e))} · ${escapeHtml(e.ev || 'sin evidencia explícita')}</div></div>`;
  }).join('');

  const docs = (node.docs || []).map(d => `<div class="card"><div class="title">${escapeHtml(d.n || d.p || 'Documento')}</div><div class="meta copyable">${escapeHtml(d.p || '')}</div>${d.id ? `<div class="meta">ID Drive: ${escapeHtml(d.id)}</div>` : ''}</div>`).join('');
  const sourceList = (node.src || []).join(' · ');
  const status = inferNodeStatus(node, rels);

  el('detailsNode').classList.remove('hidden');
  el('detailsNode').innerHTML = `
    <div class="detail-header">
      <div class="detail-eyebrow">${escapeHtml(node.t)}</div>
      <h2 class="detail-title">${escapeHtml(node.n)}</h2>
      <div class="status-badge ${badgeClass(status)}">${escapeHtml(status)}</div>
    </div>
    <div class="kv">
      <div>ID</div><div class="copyable">${escapeHtml(node.id)}</div>
      <div>Nivel</div><div>${escapeHtml(String(node.lvl ?? '—'))}</div>
      <div>Grupo / producto</div><div>${escapeHtml(node.g || '—')}</div>
      <div>Estado</div><div>${escapeHtml(node.st || '—')}</div>
      <div>Fecha</div><div>${escapeHtml(formatDate(node.f))}</div>
      <div>Clase</div><div>${escapeHtml(node.cl || '—')}</div>
      <div>Fuente</div><div>${escapeHtml(sourceList || '—')}</div>
      <div>Pendiente</div><div>${escapeHtml(node.pend || '—')}</div>
    </div>
    ${node.d ? `<div class="detail-section"><h4>Contexto / datos</h4><div class="card"><pre class="json-dump">${escapeHtml(JSON.stringify(node.d, null, 2))}</pre></div></div>` : ''}
    ${docs ? `<div class="detail-section"><h4>Documentos en Drive</h4><div class="doc-list">${docs}</div></div>` : ''}
    <div class="detail-section"><h4>Relaciones (${rels.length})</h4><div class="relation-list">${relatedCards || '<div class="card">Sin relaciones visibles</div>'}</div></div>
  `;

  document.querySelectorAll('[data-node-jump]').forEach(card => card.addEventListener('click', () => jumpToNode(card.dataset.nodeJump)));
}

function renderDetailsForEdge(edgeId) {
  const e = allEdges.find(x => x.id === edgeId);
  if (!e) return;
  selectedEdgeId = edgeId;
  const s = allNodes.find(n => n.id === e.s);
  const t = allNodes.find(n => n.id === e.t);
  el('overviewPanel').classList.add('hidden');
  el('detailsEmpty').classList.add('hidden');
  el('detailsNode').classList.add('hidden');
  el('detailsEdge').classList.remove('hidden');
  const status = normalizeEvidence(e.e);

  el('detailsEdge').innerHTML = `
    <div class="detail-header">
      <div class="detail-eyebrow">Relación</div>
      <h2 class="detail-title">${escapeHtml(s?.n || e.s)} → ${escapeHtml(e.r || 'relación')} → ${escapeHtml(t?.n || e.t)}</h2>
      <div class="status-badge ${badgeClass(status)}">${escapeHtml(status)}</div>
    </div>
    <div class="kv">
      <div>Origen</div><div>${escapeHtml(s?.n || e.s)}</div>
      <div>Destino</div><div>${escapeHtml(t?.n || e.t)}</div>
      <div>Tipo</div><div>${escapeHtml(e.r || '—')}</div>
      <div>Evidencia</div><div>${escapeHtml(e.ev || '—')}</div>
      <div>Confirmación</div><div>${escapeHtml(status)}</div>
    </div>
    <div class="detail-section"><h4>Lectura</h4><div class="highlight-note">Esta relación es parte de la evidencia existente del cerebro. La interfaz no cambia ni recalifica el dato fuente; solo lo visualiza.</div></div>
  `;
}

function showOverview() {
  selectedNodeId = null;
  selectedEdgeId = null;
  el('detailsNode').classList.add('hidden');
  el('detailsEdge').classList.add('hidden');
  el('detailsEmpty').classList.add('hidden');
  el('overviewPanel').classList.remove('hidden');

  const typeCounts = countBy(allNodes, 't');
  const evCounts = countBy(allEdges.map(e => ({ ev: normalizeEvidence(e.e) })), 'ev');
  const topGroups = topCounts(allNodes.map(n => n.g).filter(Boolean), 6);
  const degree = {};
  allEdges.forEach(e => { degree[e.s] = (degree[e.s] || 0) + 1; degree[e.t] = (degree[e.t] || 0) + 1; });
  const topConnected = Object.entries(degree).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, count]) => ({ node: allNodes.find(n => n.id === id), count }));
  const maxType = Math.max(1, ...Object.values(typeCounts));
  const maxGroup = Math.max(1, ...topGroups.map(x => x.count));
  const recentDecisions = allNodes.filter(n => ['decision', 'aprendizaje'].includes(n.t)).sort((a, b) => dateValue(b.f) - dateValue(a.f)).slice(0, 6);

  el('overviewPanel').innerHTML = `
    <div class="overview-head">
      <div><h2>Resumen ejecutivo</h2><p>Vista derivada de los datos existentes. No modifica la estructura ni las reglas del Cerebro ORZZEN.</p></div>
    </div>
    <div class="overview-grid">
      <div class="overview-stat"><strong>${formatNumber(evCounts.confirmado || 0)}</strong><span>relaciones confirmadas</span></div>
      <div class="overview-stat"><strong>${formatNumber(evCounts.probable || 0)}</strong><span>relaciones probables</span></div>
      <div class="overview-stat"><strong>${formatNumber(typeCounts.decision || 0)}</strong><span>decisiones registradas</span></div>
      <div class="overview-stat"><strong>${formatNumber(typeCounts.aprendizaje || 0)}</strong><span>aprendizajes</span></div>
    </div>

    <div class="detail-section"><h4>Composición del cerebro</h4><div class="overview-list">
      ${Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).slice(0,8).map(([k,v]) => `
        <div class="card"><div class="insight-row"><span class="insight-label">${escapeHtml(k)}</span><span class="insight-value">${formatNumber(v)}</span></div><div class="progress"><span style="width:${Math.max(4,(v/maxType)*100)}%"></span></div></div>
      `).join('')}
    </div></div>

    <div class="detail-section"><h4>Grupos con mayor contexto</h4><div class="overview-list">
      ${topGroups.map(x => `<div class="card clickable" data-group-focus="${escapeAttr(x.value)}"><div class="insight-row"><span class="insight-label">${escapeHtml(x.value)}</span><span class="insight-value">${formatNumber(x.count)} elementos</span></div><div class="progress"><span style="width:${Math.max(4,(x.count/maxGroup)*100)}%"></span></div></div>`).join('') || '<div class="card">Sin grupos</div>'}
    </div></div>

    <div class="detail-section"><h4>Nodos más conectados</h4><div class="overview-list">
      ${topConnected.map(x => `<div class="card clickable" data-node-jump="${escapeAttr(x.node?.id || '')}"><div class="title">${escapeHtml(x.node?.n || x.node?.id || '—')}</div><div class="meta">${escapeHtml(x.node?.t || 'nodo')} · ${formatNumber(x.count)} conexiones</div></div>`).join('')}
    </div></div>

    <div class="detail-section"><h4>Decisiones y aprendizajes recientes</h4><div class="overview-list">
      ${recentDecisions.map(n => `<div class="card clickable" data-node-jump="${escapeAttr(n.id)}"><div class="title">${escapeHtml(n.n)}</div><div class="meta">${escapeHtml(n.t)} · ${escapeHtml(formatDate(n.f))}</div></div>`).join('') || '<div class="card">No hay fechas suficientes para ordenar esta sección.</div>'}
    </div></div>
  `;

  document.querySelectorAll('[data-node-jump]').forEach(card => card.addEventListener('click', () => jumpToNode(card.dataset.nodeJump)));
  document.querySelectorAll('[data-group-focus]').forEach(card => card.addEventListener('click', () => {
    el('productSelect').value = card.dataset.groupFocus;
    renderGraph();
  }));
}

function quickFocus(type) {
  focusType = focusType === type ? null : type;
  document.querySelectorAll('.quick-focus').forEach(btn => btn.classList.toggle('primary', btn.dataset.focusType === focusType));
  renderGraph();
}

function jumpToNode(id) {
  const node = allNodes.find(n => n.id === id);
  if (!node) return;
  selectedNodeId = id;
  selectedEdgeId = null;
  focusType = null;
  renderGraph(false);
  renderDetailsForNode(id);
  if (network && nodesDS.get(id)) {
    network.selectNodes([id]);
    network.focus(id, { scale: 1.15, animation: { duration: 450 } });
  }
}

function modeLabel() {
  if (currentMode === 'resumen') return 'Resumen por productos y áreas';
  if (currentMode === 'conexiones') return selectedNodeId ? 'Conexiones del elemento seleccionado' : 'Conexiones · selecciona un nodo';
  return selectedNodeId ? 'Recorrido del elemento seleccionado' : 'Recorrido · selecciona un nodo';
}

function inferNodeStatus(node, rels) {
  if (node.pend || rels.some(r => normalizeEvidence(r.e) === 'pendiente')) return 'pendiente';
  if (rels.some(r => normalizeEvidence(r.e) === 'probable')) return 'probable';
  return 'confirmado';
}

function normalizeEvidence(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('confirm')) return 'confirmado';
  if (s.includes('prob')) return 'probable';
  return 'pendiente';
}

function evidenceRank(v) {
  return v === 'confirmado' ? 0 : v === 'probable' ? 1 : 2;
}

function textBlob(n) {
  return [n.id, n.n, n.t, n.g, n.cl, n.st, n.pend, JSON.stringify(n.d || {}), (n.src || []).join(' '), JSON.stringify(n.docs || [])].join(' ').toLowerCase();
}

function collectHops(startId, edges, depth) {
  const seen = new Set([startId]);
  let frontier = new Set([startId]);
  for (let d = 0; d < depth; d++) {
    const next = new Set();
    edges.forEach(e => {
      if (frontier.has(e.s) && !seen.has(e.t)) next.add(e.t);
      if (frontier.has(e.t) && !seen.has(e.s)) next.add(e.s);
    });
    next.forEach(x => seen.add(x));
    frontier = next;
  }
  return seen;
}

function showOnlySelection() {
  if (!selectedNodeId) return toast('Selecciona primero un nodo.');
  const node = allNodes.find(n => n.id === selectedNodeId);
  const rels = allEdges.filter(e => e.s === selectedNodeId || e.t === selectedNodeId);
  nodesDS.clear();
  edgesDS.clear();
  nodesDS.add([buildVisNode(node, true, false)]);
  el('activeViewStats').textContent = `1 elemento · ${rels.length} relaciones asociadas`;
}

function showNeighbors() {
  if (!selectedNodeId) return toast('Selecciona primero un nodo.');
  currentMode = 'conexiones';
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.mode === 'conexiones'));
  renderGraph();
}

function exportSelection() {
  let payload;
  if (selectedNodeId) {
    payload = { tipo: 'nodo', nodo: allNodes.find(n => n.id === selectedNodeId), relaciones: allEdges.filter(e => e.s === selectedNodeId || e.t === selectedNodeId) };
  } else if (selectedEdgeId) {
    payload = { tipo: 'relacion', relacion: allEdges.find(e => e.id === selectedEdgeId) };
  } else {
    payload = { tipo: 'vista', nodos: currentRendered.nodes, relaciones: currentRendered.edges };
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cerebro-visual-orzzen-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copyCurrentContext() {
  let text;
  if (selectedNodeId) {
    const node = allNodes.find(n => n.id === selectedNodeId);
    const rels = allEdges.filter(e => e.s === selectedNodeId || e.t === selectedNodeId).slice(0, 20);
    text = `Cerebro ORZZEN\nNodo: ${node?.n}\nTipo: ${node?.t}\nGrupo: ${node?.g || '—'}\nEstado: ${node?.st || '—'}\nContexto: ${JSON.stringify(node?.d || {})}\nRelaciones: ${rels.map(r => `${r.r} (${normalizeEvidence(r.e)})`).join('; ')}`;
  } else {
    text = `Cerebro ORZZEN — vista actual\n${currentRendered.nodes.length} nodos, ${currentRendered.edges.length} relaciones.\nFiltros: ${buildFilterSummary(el('searchInput').value, el('productSelect').value, el('sourceSelect').value)}`;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Contexto copiado. Puedes pegarlo en ChatGPT o Claude.');
  } catch {
    toast('No se pudo copiar automáticamente.');
  }
}

function resetAllFilters() {
  el('searchInput').value = '';
  el('productSelect').value = '';
  el('sourceSelect').value = '';
  el('toggleLabels').checked = false;
  el('toggleEdgeLabels').checked = false;
  document.querySelectorAll('.type-filter,.evidence-filter').forEach(ch => ch.checked = true);
  document.querySelectorAll('.quick-focus').forEach(btn => btn.classList.remove('primary'));
  focusType = null;
  currentMode = 'resumen';
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.mode === 'resumen'));
  selectedNodeId = null;
  selectedEdgeId = null;
  el('detailsNode').classList.add('hidden');
  el('detailsEdge').classList.add('hidden');
  renderGraph();
  showOverview();
}

function buildFilterSummary(search, product, source) {
  const parts = [];
  if (focusType) parts.push(`enfoque: ${focusType}`);
  if (search) parts.push(`búsqueda: “${search}”`);
  if (product) parts.push(`grupo: ${product}`);
  if (source) parts.push(`fuente: ${source}`);
  return parts.length ? parts.join(' · ') : 'Sin filtros adicionales';
}

function badgeClass(status) {
  if (status === 'confirmado') return 'status-confirmado';
  if (status === 'probable') return 'status-probable';
  return 'status-pendiente';
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const k = item[key] || '—';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function topCounts(values, limit = 5) {
  const counts = values.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  return Object.entries(counts).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString('es-CO');
}

function dateValue(s) {
  const d = new Date(s || 0);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function ageInHours(s) {
  const t = dateValue(s);
  if (!t) return null;
  return Math.max(0, (Date.now() - t) / 3600000);
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('es-CO');
}

function setLoading(loading) {
  const btn = el('btnRefresh');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Cargando…' : 'Recargar datos';
}

function toast(message) {
  const t = el('toast');
  t.textContent = message;
  t.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m]));
}
function escapeAttr(str) { return escapeHtml(str); }

init();
