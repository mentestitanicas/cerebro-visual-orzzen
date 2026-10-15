(function () {
  'use strict';

  const MONTHS = { enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,setiembre:8,octubre:9,noviembre:10,diciembre:11 };
  const STOP = new Set(['que','cual','cuales','como','cuando','donde','del','de','la','el','los','las','un','una','por','para','con','mas','sus','este','esta','estos','estas','y','o','en','al','se','ha','han','fue','son']);

  function stripAccents(value){
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  }

  function esc(value){
    return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function parsePeriod(q){
    const s = stripAccents(q);
    let month = null;
    for (const [name, index] of Object.entries(MONTHS)) {
      if (s.includes(stripAccents(name))) { month = index; break; }
    }
    const yearMatch = s.match(/\b(20\d{2})\b/);
    return { month, year: yearMatch ? Number(yearMatch[1]) : null };
  }

  function dateFromObject(o){
    if (!o || typeof o !== 'object') return null;
    const candidates = [o.f,o.fecha,o.date,o.created_at,o.timestamp,o.updated_at,o?.d?.fecha,o?.d?.date,o?.d?.timestamp,o?.d?.actualizado];
    for (const value of candidates) {
      if (!value) continue;
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }

  function matchesPeriod(o, p){
    if (p.month == null && p.year == null) return true;
    const d = dateFromObject(o);
    if (d) {
      if (p.year != null && d.getFullYear() !== p.year) return false;
      if (p.month != null && d.getMonth() !== p.month) return false;
      return true;
    }
    const text = stripAccents(JSON.stringify(o || {}));
    if (p.year != null && !text.includes(String(p.year))) return false;
    if (p.month != null) {
      const names = Object.entries(MONTHS).filter(([,m])=>m===p.month).map(([n])=>stripAccents(n));
      if (!names.some(n=>text.includes(n)) && !text.includes(String(p.month + 1).padStart(2,'0'))) return false;
    }
    return true;
  }

  function termsForQuestion(q){
    return stripAccents(q).split(/[^a-z0-9ñ]+/).filter(t => t.length >= 3 && !STOP.has(t));
  }

  function nodeBlob(n){
    try { return stripAccents(JSON.stringify(n || {})); }
    catch (_) { return ''; }
  }

  function scoreNode(n, terms, period){
    if (!matchesPeriod(n, period)) return 0;
    const name = stripAccents(n?.n || n?.id || '');
    const type = stripAccents(n?.t || '');
    const group = stripAccents(n?.g || '');
    const blob = nodeBlob(n);
    let score = 0;
    for (const term of terms) {
      if (name.includes(term)) score += 12;
      if (type.includes(term)) score += 7;
      if (group.includes(term)) score += 5;
      if (blob.includes(term)) score += 2;
    }
    if (/anuncio|ads?/.test(stripAccents(terms.join(' '))) && n?.t === 'anuncio') score += 8;
    if (/venta|vendido|vendieron|compras?|purchase|roas|cpa|ingresos?/.test(stripAccents(terms.join(' ')))) {
      if (/venta|vendido|vendieron|compras?|purchase|roas|cpa|ingresos?|conversion/.test(blob)) score += 8;
    }
    return score;
  }

  function flattenNumbers(o, path = '', out = []){
    if (!o || typeof o !== 'object') return out;
    if (Array.isArray(o)) {
      o.slice(0,100).forEach((v,i)=>flattenNumbers(v,`${path}[${i}]`,out));
      return out;
    }
    Object.entries(o).forEach(([k,v])=>{
      const key = path ? `${path}.${k}` : k;
      if (typeof v === 'number' && Number.isFinite(v)) out.push({ key, value:v });
      else if (v && typeof v === 'object') flattenNumbers(v,key,out);
    });
    return out;
  }

  function metricSummary(n){
    const nums = flattenNumbers(n);
    const patterns = [
      [/ventas|purchases?|compras|orders?|conversiones/i,'ventas'],
      [/revenue|ingresos|facturacion|valor.*conversion/i,'ingresos'],
      [/roas/i,'ROAS'],
      [/cpa|costo.*compra|cost.*purchase/i,'CPA'],
      [/gasto|spend|importe.*gastado/i,'gasto']
    ];
    const found = [];
    for (const [re,label] of patterns) {
      const hit = nums.filter(x=>re.test(x.key)).sort((a,b)=>b.value-a.value)[0];
      if (hit) found.push({ metric:label, key:hit.key, value:hit.value });
    }
    return found;
  }

  function buildEvidence(question){
    const nodes = typeof allNodes !== 'undefined' && Array.isArray(allNodes) ? allNodes : [];
    const edges = typeof allEdges !== 'undefined' && Array.isArray(allEdges) ? allEdges : [];
    const period = parsePeriod(question);
    const terms = termsForQuestion(question);

    let scored = nodes.map(n=>({ n, score:scoreNode(n,terms,period) })).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    if (!scored.length) {
      scored = nodes.filter(n=>matchesPeriod(n,period)).slice(0,30).map((n,i)=>({n,score:30-i}));
    }

    const primary = scored.slice(0,32);
    const ids = new Set(primary.map(x=>x.n.id));
    const relatedEdges = edges.filter(e=>ids.has(e.s)||ids.has(e.t)).slice(0,50);
    const neighborIds = new Set();
    relatedEdges.forEach(e=>{ neighborIds.add(e.s); neighborIds.add(e.t); });
    const neighbors = nodes.filter(n=>neighborIds.has(n.id) && !ids.has(n.id)).slice(0,12);

    const evidence = [];
    primary.forEach(({n,score})=>evidence.push({
      kind:'node', id:n.id, name:n.n || n.id, type:n.t || null, group:n.g || null,
      score, confirmation:n.e || n.c || null, date:dateFromObject(n)?.toISOString?.() || null,
      metrics:metricSummary(n), data:n.d || null, source:n.src || null
    }));
    neighbors.forEach(n=>evidence.push({
      kind:'related_node', id:n.id, name:n.n || n.id, type:n.t || null, group:n.g || null,
      confirmation:n.e || n.c || null, date:dateFromObject(n)?.toISOString?.() || null,
      metrics:metricSummary(n), data:n.d || null, source:n.src || null
    }));
    relatedEdges.forEach(e=>evidence.push({
      kind:'relation', source:e.s, target:e.t, type:e.ti || e.r || e.type || null,
      confirmation:e.e || null, evidence:e.ev || null
    }));

    const adLike = primary.filter(x=>x.n?.t==='anuncio').map(x=>({
      id:x.n.id, name:x.n.n || x.n.id, metrics:metricSummary(x.n)
    })).filter(x=>x.metrics.length);
    if (adLike.length) evidence.unshift({ kind:'computed_metric_candidates', note:'Candidatos con métricas numéricas detectadas. La IA debe comparar solo métricas compatibles.', items:adLike.slice(0,15) });

    return evidence;
  }

  function renderTextAnswer(out, answer, provider, model){
    const safe = esc(answer).replace(/\n/g,'<br>');
    out.innerHTML = `<div class="brain-ai-meta">IA: ${esc(provider || 'proveedor configurado')}${model ? ' · '+esc(model) : ''}</div><div class="brain-ai-response">${safe}</div>`;
  }

  function fallbackLocal(out, question, message){
    const evidence = buildEvidence(question).filter(x=>x.kind==='node' || x.kind==='related_node').slice(0,8);
    let html = `<div class="brain-ai-warning"><strong>IA no disponible.</strong> ${esc(message || 'Se usará la búsqueda local del mapa.')}</div>`;
    if (!evidence.length) html += '<strong>No encontré evidencia suficiente en el mapa actual.</strong>';
    else html += `<strong>Coincidencias locales:</strong>${evidence.map(x=>`<div class="brain-result"><span>${esc(x.name || x.id)}</span><small>${esc(x.type || '')}${x.group?' · '+esc(x.group):''}</small></div>`).join('')}`;
    out.innerHTML = html;
  }

  async function askAI(question, out){
    const evidence = buildEvidence(question);
    out.classList.remove('hidden');
    out.innerHTML = '<div class="brain-ai-loading">Analizando el Cerebro ORZZEN con IA…</div>';
    try {
      const r = await fetch('/api/ask', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ question, evidence })
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok || !data?.ok) {
        fallbackLocal(out, question, data?.message || `Error IA (${r.status})`);
        return;
      }
      renderTextAnswer(out, data.answer, data.provider, data.model);
    } catch (err) {
      fallbackLocal(out, question, err?.message || 'No fue posible conectar con la IA.');
    }
  }

  function install(){
    const input = document.getElementById('brainQuestion');
    const button = document.getElementById('brainAskButton');
    const out = document.getElementById('brainAnswer');
    if (!input || !button || !out) {
      setTimeout(install,250);
      return;
    }
    if (button.dataset.aiInstalled === '1') return;
    button.dataset.aiInstalled = '1';

    button.addEventListener('click', function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      const q = input.value.trim();
      if (q) askAI(q,out);
    }, true);

    input.addEventListener('keydown', function(e){
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const q = input.value.trim();
      if (q) askAI(q,out);
    }, true);

    const help = document.querySelector('.brain-ask-help');
    if (help) help.textContent = 'Analiza con IA únicamente la evidencia disponible en el Cerebro ORZZEN. Si falta evidencia, lo indicará.';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
