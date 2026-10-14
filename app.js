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
  probable: { color: '#c57a1d', dashes: [8,6], width: 2 },
  pendiente: { color: '#c53f3f', dashes: [2,6], width: 2 },
  bloqueado: { color: '#c53f3f', dashes: [2,6], width: 2 }
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
  ['searchInput','productSelect','sourceSelect'].forEach(id => el(id).addEventListener('input', renderGraph));
  ['productSelect','sourceSelect'].forEach(id => el(id).addEventListener('change', renderGraph));
  el('btnReset').addEventListener('click', resetAllFilters);
  el('btnFit').addEventListener('click', () => network && network.fit({ animation: true }));
  el('btnRefresh').addEventListener('click', async () => { await loadData(true); });
  el('btnShowSelection').addEventListener('click', showOnlySelection);
  el('btnShowNeighbors').addEventListener('click', showNeighbors);
  el('btnExportSelection').addEventListener('click', exportSelection);
}

async function loadData(force=false) {
  const url = `./data/mapa.json${force ? `?t=${Date.now()}` : ''}`;
  rawData = await fetch(url).then(r => r.json());
  normalizeData();
  buildFilterUI();
  populateSelectors();
  fillMeta();
  createNetwork();
  renderGraph();
}

function normalizeData() {
  allNodes = rawData.nodos.map(n => ({ ...n }));
  allEdges = rawData.relaciones.map((r, i) => ({ id: `e${i}`, ...r }));
}

function fillMeta() {
  el('badgeSchema').textContent = rawData.schema || 'sin esquema';
  el('generatedAt').textContent = `Generado: ${formatDate(rawData.generado)}`;
  el('summaryCounts').textContent = `${rawData.conteo?.nodos || allNodes.length} nodos · ${rawData.conteo?.relaciones || allEdges.length} relaciones`;
  const frescura = rawData.frescura || {};
  const cobertura = frescura.cobertura || {};
  el('freshnessBox').innerHTML = `
    <div><strong>Capturador:</strong> ${escapeHtml(formatDate(frescura.capturador_ultimo_ciclo) || '—')}</div>
    <div><strong>Meta leído:</strong> ${escapeHtml(formatDate(frescura.meta_leido) || '—')}</div>
    <div><strong>Fuentes al día:</strong> ${Object.keys(frescura.fuentes || {}).length}</div>
    <div><strong>No cubierto:</strong> ${(cobertura.no_cubierto || []).length}</div>
  `;
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
  ['confirmado','probable','pendiente'].forEach(ev => {
    const count = evidenceCounts[ev] || 0;
    evWrap.insertAdjacentHTML('beforeend', `
      <label class="checkbox-item"><input type="checkbox" class="evidence-filter" value="${ev}" checked> <span>${ev} (${count})</span></label>
    `);
  });
  document.querySelectorAll('.type-filter,.evidence-filter').forEach(ch => ch.addEventListener('change', renderGraph));
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
  nodesDS = new vis.DataSet([]);
  edgesDS = new vis.DataSet([]);
  const container = el('network');
  network = new vis.Network(container, { nodes: nodesDS, edges: edgesDS }, {
    autoResize: true,
    physics: {
      stabilization: { iterations: 150 },
      barnesHut: { gravitationalConstant: -4000, springLength: 120, springConstant: 0.03, damping: 0.22 }
    },
    interaction: { hover: true, multiselect: false, navigationButtons: true, keyboard: true },
    layout: { improvedLayout: true },
    nodes: {
      font: { face: 'Inter', size: 12, color: '#233143' },
      borderWidth: 1,
      shadow: false
    },
    edges: {
      smooth: { type: 'dynamic' },
      selectionWidth: 2,
      color: { inherit: false, opacity: 0.45 }
    }
  });
  network.on('click', params => {
    if (params.nodes.length) {
      selectedNodeId = params.nodes[0];
      selectedEdgeId = null;
      renderDetailsForNode(selectedNodeId);
      if (currentMode !== 'resumen') renderGraph();
    } else if (params.edges.length) {
      selectedEdgeId = params.edges[0];
      selectedNodeId = null;
      renderDetailsForEdge(selectedEdgeId);
    }
  });
}

function getActiveTypeSet() {
  return new Set([...document.querySelectorAll('.type-filter:checked')].map(x => x.value));
}
function getActiveEvidenceSet() {
  return new Set([...document.querySelectorAll('.evidence-filter:checked')].map(x => x.value));
}

function renderGraph() {
  const search = el('searchInput').value.trim().toLowerCase();
  const product = el('productSelect').value;
  const source = el('sourceSelect').value;
  const activeTypes = getActiveTypeSet();
  const activeEvidence = getActiveEvidenceSet();

  let baseNodes = allNodes.filter(n => activeTypes.has(n.t));
  if (product) baseNodes = baseNodes.filter(n => n.g === product || (n.n || '').toLowerCase().includes(product.toLowerCase()));
  if (source) baseNodes = baseNodes.filter(n => (n.src || []).includes(source) || JSON.stringify(n.d || {}).includes(source));
  if (search) baseNodes = baseNodes.filter(n => textBlob(n).includes(search));

  const nodeIds = new Set(baseNodes.map(n => n.id));
  let baseEdges = allEdges.filter(e => nodeIds.has(e.s) && nodeIds.has(e.t) && activeEvidence.has(normalizeEvidence(e.e)));
  if (source) baseEdges = baseEdges.filter(e => (e.ev || '').includes(source));
  if (search) baseEdges = baseEdges.filter(e => JSON.stringify(e).toLowerCase().includes(search));

  if (currentMode === 'conexiones' && selectedNodeId) {
    const neighborIds = new Set([selectedNodeId]);
    baseEdges.forEach(e => { if (e.s === selectedNodeId || e.t === selectedNodeId) { neighborIds.add(e.s); neighborIds.add(e.t); } });
    baseNodes = baseNodes.filter(n => neighborIds.has(n.id));
    baseEdges = baseEdges.filter(e => neighborIds.has(e.s) && neighborIds.has(e.t));
  }
  if (currentMode === 'recorrido' && selectedNodeId) {
    const hop2 = collectHops(selectedNodeId, baseEdges, 2);
    baseNodes = baseNodes.filter(n => hop2.has(n.id));
    baseEdges = baseEdges.filter(e => hop2.has(e.s) && hop2.has(e.t));
  }
  currentRendered = { nodes: baseNodes, edges: baseEdges };

  nodesDS.clear();
  edgesDS.clear();
  nodesDS.add(baseNodes.map(buildVisNode));
  edgesDS.add(baseEdges.map(buildVisEdge));

  el('activeModeLabel').textContent = modeLabel();
  el('activeViewStats').textContent = `${baseNodes.length} elementos · ${baseEdges.length} relaciones`;
  if (network) network.fit({ animation: true });
}

function buildVisNode(n) {
  const style = TYPE_STYLES[n.t] || { color: '#90a4ae', shape: 'dot', size: 10 };
  const isSelected = n.id === selectedNodeId;
  return {
    id: n.id,
    label: n.n,
    title: `${n.t}: ${n.n}`,
    color: {
      background: style.color,
      border: isSelected ? '#3478f6' : '#ffffff',
      highlight: { background: style.color, border: '#3478f6' },
      hover: { background: style.color, border: '#3478f6' }
    },
    shape: style.shape,
    size: isSelected ? style.size + 3 : style.size,
    font: { color: '#22313f', size: n.lvl <= 1 ? 15 : 12, bold: n.lvl <=1 ? '700' : '500' },
    mass: Math.max(1, 5 - (n.lvl || 0)),
    borderWidth: isSelected ? 3 : 1,
    opacity: 1
  };
}

function buildVisEdge(e) {
  const ev = normalizeEvidence(e.e);
  const style = EVIDENCE_STYLES[ev] || EVIDENCE_STYLES.pendiente;
  return {
    id: e.id,
    from: e.s,
    to: e.t,
    label: e.r,
    arrows: 'to',
    dashes: style.dashes,
    width: style.width,
    color: { color: style.color, highlight: '#3478f6', hover: '#3478f6', opacity: 0.45 },
    title: `${e.r} · ${ev}`,
    font: { size: 10, align: 'middle', strokeWidth: 3, strokeColor: '#fff' }
  };
}

function renderDetailsForNode(id) {
  const node = allNodes.find(n => n.id === id);
  if (!node) return;
  selectedNodeId = id;
  el('detailsEmpty').classList.add('hidden');
  el('detailsEdge').classList.add('hidden');
  const rels = allEdges.filter(e => e.s === id || e.t === id);
  const relatedCards = rels.slice(0, 30).map(e => {
    const otherId = e.s === id ? e.t : e.s;
    const other = allNodes.find(n => n.id === otherId);
    return `<div class="card"><div class="title">${escapeHtml(node.n)} ${escapeHtml(e.r)} ${escapeHtml(other?.n || otherId)}</div><div class="meta">${escapeHtml(normalizeEvidence(e.e))} · ${escapeHtml(e.ev || 'sin evidencia')}</div></div>`;
  }).join('');
  const docs = (node.docs || []).map(d => `<div class="card"><div class="title">${escapeHtml(d.n || d.p)}</div><div class="meta copyable">${escapeHtml(d.p || '')}</div>${d.id ? `<div class="meta">ID Drive: ${escapeHtml(d.id)}</div>`:''}</div>`).join('');
  const sourceList = (node.src || []).join(' · ');
  el('detailsNode').classList.remove('hidden');
  el('detailsNode').innerHTML = `
    <div class="detail-header">
      <div class="detail-eyebrow">${escapeHtml(node.t)}</div>
      <h2 class="detail-title">${escapeHtml(node.n)}</h2>
      <div class="status-badge ${badgeClass(inferNodeStatus(node, rels))}">${escapeHtml(inferNodeStatus(node, rels))}</div>
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
    ${node.d ? `<div class="detail-section"><h4>Contexto / datos</h4><div class="card"><pre class="json-dump">${escapeHtml(JSON.stringify(node.d, null, 2))}</pre></div></div>`:''}
    ${docs ? `<div class="detail-section"><h4>Documentos en Drive</h4><div class="doc-list">${docs}</div></div>`:''}
    <div class="detail-section"><h4>Relaciones (${rels.length})</h4><div class="relation-list">${relatedCards || '<div class="card">Sin relaciones visibles</div>'}</div></div>
  `;
}

function renderDetailsForEdge(edgeId) {
  const e = allEdges.find(x => x.id === edgeId);
  if (!e) return;
  selectedEdgeId = edgeId;
  const s = allNodes.find(n => n.id === e.s);
  const t = allNodes.find(n => n.id === e.t);
  el('detailsEmpty').classList.add('hidden');
  el('detailsNode').classList.add('hidden');
  el('detailsEdge').classList.remove('hidden');
  el('detailsEdge').innerHTML = `
    <div class="detail-header">
      <div class="detail-eyebrow">Relación</div>
      <h2 class="detail-title">${escapeHtml(s?.n || e.s)} → ${escapeHtml(e.r)} → ${escapeHtml(t?.n || e.t)}</h2>
      <div class="status-badge ${badgeClass(normalizeEvidence(e.e))}">${escapeHtml(normalizeEvidence(e.e))}</div>
    </div>
    <div class="kv">
      <div>Origen</div><div>${escapeHtml(s?.n || e.s)}</div>
      <div>Destino</div><div>${escapeHtml(t?.n || e.t)}</div>
      <div>Tipo</div><div>${escapeHtml(e.r || '—')}</div>
      <div>Evidencia</div><div>${escapeHtml(e.ev || '—')}</div>
      <div>Confirmación</div><div>${escapeHtml(normalizeEvidence(e.e))}</div>
    </div>
    <div class="detail-section"><h4>Nota</h4><div class="highlight-note">Esta relación ayuda a reconstruir contexto y conexiones dentro del cerebro. Usa la vista <strong>Conexiones</strong> o <strong>Recorrido</strong> para profundizar.</div></div>
  `;
}

function modeLabel() {
  return currentMode === 'resumen' ? 'Resumen por productos y áreas' : currentMode === 'conexiones' ? 'Conexiones del elemento seleccionado' : 'Recorrido del elemento seleccionado';
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

function textBlob(n) {
  return [n.id, n.n, n.t, n.g, n.cl, n.st, JSON.stringify(n.d || {}), (n.src || []).join(' '), JSON.stringify(n.docs || [])].join(' ').toLowerCase();
}

function collectHops(startId, edges, depth) {
  const seen = new Set([startId]);
  let frontier = new Set([startId]);
  for (let d=0; d<depth; d++) {
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
  if (!selectedNodeId) return;
  const node = allNodes.find(n => n.id === selectedNodeId);
  const rels = allEdges.filter(e => e.s === selectedNodeId || e.t === selectedNodeId);
  nodesDS.clear(); edgesDS.clear();
  nodesDS.add([buildVisNode(node)]);
  edgesDS.add([]);
  el('activeViewStats').textContent = `1 elemento · ${rels.length} relaciones asociadas`;
}

function showNeighbors() {
  if (!selectedNodeId) return;
  currentMode = 'conexiones';
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.mode === 'conexiones'));
  renderGraph();
}

function exportSelection() {
  let payload;
  if (selectedNodeId) {
    const node = allNodes.find(n => n.id === selectedNodeId);
    const rels = allEdges.filter(e => e.s === selectedNodeId || e.t === selectedNodeId);
    payload = { tipo: 'nodo', nodo: node, relaciones: rels };
  } else if (selectedEdgeId) {
    payload = { tipo: 'relacion', relacion: allEdges.find(e => e.id === selectedEdgeId) };
  } else {
    payload = { tipo: 'vista', nodos: currentRendered.nodes.map(n => n.id), relaciones: currentRendered.edges.map(e => e.id) };
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cerebro-visual-orzzen-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function resetAllFilters() {
  el('searchInput').value = '';
  el('productSelect').value = '';
  el('sourceSelect').value = '';
  document.querySelectorAll('.type-filter,.evidence-filter').forEach(ch => ch.checked = true);
  currentMode = 'resumen';
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.mode === 'resumen'));
  selectedNodeId = null;
  selectedEdgeId = null;
  el('detailsNode').classList.add('hidden');
  el('detailsEdge').classList.add('hidden');
  el('detailsEmpty').classList.remove('hidden');
  renderGraph();
}

function badgeClass(status) {
  if (status === 'confirmado') return 'status-confirmado';
  if (status === 'probable') return 'status-probable';
  return 'status-pendiente';
}

function countBy(items, key) {
  return items.reduce((acc, item) => { const k = item[key] || '—'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
}
function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString('es-CO');
}
function escapeHtml(str) { return String(str ?? '').replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m])); }
function escapeAttr(str) { return escapeHtml(str); }

init();
