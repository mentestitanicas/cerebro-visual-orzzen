(function () {
  'use strict';

  const MONTHS = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
    noviembre: 10, diciembre: 11
  };

  let optimizedNetwork = null;
  let observedDataSet = null;
  let settleTimer = null;
  let freezeTimer = null;

  function stripAccents(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function escapeLocal(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function visibleCount() {
    try { return typeof nodesDS !== 'undefined' && nodesDS ? nodesDS.length : 0; } catch (_) { return 0; }
  }

  function fitFast(delay) {
    setTimeout(function () {
      try {
        if (typeof network !== 'undefined' && network && visibleCount()) {
          network.redraw();
          network.fit({ animation: false });
        }
      } catch (_) {}
    }, delay || 0);
  }

  function settleGraph() {
    clearTimeout(settleTimer);
    clearTimeout(freezeTimer);
    settleTimer = setTimeout(function () {
      try {
        if (typeof network === 'undefined' || !network || !visibleCount()) return;
        const count = visibleCount();
        const iterations = count > 900 ? 28 : count > 350 ? 36 : count > 120 ? 45 : 60;

        network.setOptions({
          physics: {
            enabled: true,
            stabilization: { enabled: true, iterations, updateInterval: 20, fit: false },
            barnesHut: {
              gravitationalConstant: count > 500 ? -2600 : -3400,
              springLength: count > 500 ? 90 : 115,
              springConstant: 0.025,
              damping: 0.32,
              avoidOverlap: 0.08
            }
          }
        });
        network.stabilize(iterations);

        freezeTimer = setTimeout(function () {
          try {
            if (network) {
              network.setOptions({ physics: { enabled: false } });
              network.redraw();
              network.fit({ animation: false });
            }
          } catch (_) {}
        }, count > 700 ? 850 : 500);
      } catch (err) {
        console.warn('ORZZEN settle warning:', err);
      }
    }, 60);
  }

  function optimizeNetwork() {
    try {
      if (typeof network === 'undefined' || !network) return;

      if (network !== optimizedNetwork) {
        optimizedNetwork = network;
        network.setOptions({
          interaction: {
            hover: false,
            multiselect: false,
            navigationButtons: false,
            keyboard: true,
            zoomView: true,
            dragView: true,
            dragNodes: true,
            hideEdgesOnDrag: true,
            hideEdgesOnZoom: true,
            tooltipDelay: 350
          },
          edges: {
            smooth: false,
            shadow: false,
            selectionWidth: 1.5,
            hoverWidth: 0
          },
          nodes: { shadow: false }
        });
        settleGraph();
      }

      if (typeof nodesDS !== 'undefined' && nodesDS && nodesDS !== observedDataSet) {
        observedDataSet = nodesDS;
        nodesDS.on('*', function (event) {
          if (event === 'add' || event === 'remove' || event === 'update') settleGraph();
        });
      }
    } catch (err) {
      console.warn('ORZZEN performance optimization warning:', err);
    }
  }

  function zoom(factor) {
    try {
      if (typeof network === 'undefined' || !network) return;
      const scale = network.getScale();
      const next = Math.max(0.05, Math.min(5, scale * factor));
      network.moveTo({ scale: next, animation: { duration: 100, easingFunction: 'easeInOutQuad' } });
    } catch (_) {}
  }

  function injectZoomControls() {
    if (document.getElementById('orzzenZoomControls')) return;
    const host = document.querySelector('.center-panel');
    if (!host) return;
    const box = document.createElement('div');
    box.id = 'orzzenZoomControls';
    box.className = 'orzzen-zoom-controls';
    box.innerHTML = '<button type="button" data-zoom="in" title="Acercar">+</button><button type="button" data-zoom="out" title="Alejar">−</button><button type="button" data-zoom="fit" class="zoom-fit" title="Ajustar todo">Ajustar</button>';
    host.appendChild(box);
    box.addEventListener('click', function (ev) {
      const action = ev.target && ev.target.dataset ? ev.target.dataset.zoom : null;
      if (action === 'in') zoom(1.35);
      if (action === 'out') zoom(0.74);
      if (action === 'fit') fitFast();
    });
  }

  function injectAskBar() {
    if (document.getElementById('brainAskBox')) return;
    const host = document.querySelector('.center-panel');
    const toolbar = host && host.querySelector('.mini-toolbar');
    if (!host || !toolbar) return;
    const wrap = document.createElement('section');
    wrap.id = 'brainAskBox';
    wrap.className = 'brain-ask-box';
    wrap.innerHTML = `
      <div class="brain-ask-title">Pregúntale al Cerebro ORZZEN</div>
      <div class="brain-ask-row">
        <input id="brainQuestion" type="text" autocomplete="off" placeholder="Ej.: ¿Cuáles son los anuncios que más han vendido en septiembre de 2026?" />
        <button id="brainAskButton" type="button">Preguntar</button>
      </div>
      <div class="brain-ask-help">Responde únicamente con la información disponible en el mapa. Si falta evidencia, lo indicará.</div>
      <div id="brainAnswer" class="brain-answer hidden"></div>`;
    host.insertBefore(wrap, toolbar);
    const input = document.getElementById('brainQuestion');
    document.getElementById('brainAskButton').addEventListener('click', answerQuestion);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') answerQuestion(); });
  }

  function parsePeriod(question) {
    const q = stripAccents(question);
    let month = null;
    for (const [name, idx] of Object.entries(MONTHS)) {
      if (q.includes(stripAccents(name))) { month = idx; break; }
    }
    const yearMatch = q.match(/\b(20\d{2})\b/);
    return { month, year: yearMatch ? Number(yearMatch[1]) : null };
  }

  function objectDate(obj) {
    const candidates = [obj?.f, obj?.fecha, obj?.date, obj?.created_at, obj?.timestamp];
    for (const v of candidates) {
      if (!v) continue;
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }

  function matchesPeriod(obj, period) {
    if (period.month == null && period.year == null) return true;
    const d = objectDate(obj);
    if (d) {
      if (period.year != null && d.getFullYear() !== period.year) return false;
      if (period.month != null && d.getMonth() !== period.month) return false;
      return true;
    }
    const text = stripAccents(JSON.stringify(obj || {}));
    if (period.year != null && !text.includes(String(period.year))) return false;
    if (period.month != null) {
      const names = Object.entries(MONTHS).filter(([, idx]) => idx === period.month).map(([n]) => stripAccents(n));
      if (!names.some(n => text.includes(n))) return false;
    }
    return true;
  }

  function flattenNumbers(obj, prefix, out) {
    prefix = prefix || ''; out = out || [];
    if (!obj || typeof obj !== 'object') return out;
    if (Array.isArray(obj)) { obj.slice(0, 100).forEach((v, i) => flattenNumbers(v, `${prefix}[${i}]`, out)); return out; }
    Object.entries(obj).forEach(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'number' && Number.isFinite(v)) out.push({ key, value: v });
      else if (typeof v === 'string') {
        const cleaned = v.replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
        const num = Number(cleaned);
        if (cleaned && Number.isFinite(num)) out.push({ key, value: num });
      } else if (v && typeof v === 'object') flattenNumbers(v, key, out);
    });
    return out;
  }

  function metricForAd(node) {
    const nums = flattenNumbers(node);
    const priorities = [
      { re: /(ventas|purchases?|compras|orders?|conversiones)/i, kind: 'ventas', weight: 1000000000 },
      { re: /(revenue|ingresos|facturacion|valor.*conversion)/i, kind: 'ingresos', weight: 1000000 },
      { re: /roas/i, kind: 'ROAS', weight: 1000 },
      { re: /(cpa|costo.*compra|cost.*purchase)/i, kind: 'CPA', weight: 1 }
    ];
    for (const p of priorities) {
      const found = nums.filter(x => p.re.test(x.key)).sort((a, b) => b.value - a.value)[0];
      if (found) return { ...found, kind: p.kind, score: p.kind === 'CPA' ? -found.value : found.value * p.weight };
    }
    return null;
  }

  function findTopSellingAds(question) {
    const period = parsePeriod(question);
    const ads = (typeof allNodes !== 'undefined' ? allNodes : []).filter(n => n.t === 'anuncio' && matchesPeriod(n, period));
    const ranked = ads.map(node => ({ node, metric: metricForAd(node) })).filter(x => x.metric).sort((a, b) => b.metric.score - a.metric.score);
    if (!ads.length) return '<strong>No encontré anuncios del período solicitado en el mapa.</strong><div class="brain-answer-note">No voy a inventar resultados que el Cerebro ORZZEN no tenga registrados.</div>';
    if (!ranked.length) {
      const names = ads.slice(0, 8).map(x => `<li>${escapeLocal(x.n || x.id)}</li>`).join('');
      return `<strong>Encontré ${ads.length} anuncios del período, pero no una métrica numérica de ventas asociada que permita ordenarlos con rigor.</strong><div class="brain-answer-note">El mapa contiene esos anuncios, pero necesito ventas/compras/ingresos explícitos para afirmar cuáles vendieron más.</div><ul>${names}</ul>`;
    }
    const rows = ranked.slice(0, 10).map((x, i) => `<tr><td>${i + 1}</td><td>${escapeLocal(x.node.n || x.node.id)}</td><td>${escapeLocal(x.metric.kind)}</td><td>${Number(x.metric.value).toLocaleString('es-CO',{maximumFractionDigits:2})}</td></tr>`).join('');
    return `<strong>Ranking según las métricas registradas en el Cerebro ORZZEN:</strong><div class="brain-answer-table-wrap"><table><thead><tr><th>#</th><th>Anuncio</th><th>Métrica</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table></div><div class="brain-answer-note">Calculado únicamente con datos existentes en el mapa.</div>`;
  }

  function countIntent(question) {
    const q = stripAccents(question);
    if (!/(cuantos|cuantas|cantidad|numero de)/.test(q)) return null;
    const typeMap = { anuncios:'anuncio', anuncio:'anuncio', decisiones:'decision', decision:'decision', aprendizajes:'aprendizaje', aprendizaje:'aprendizaje', conversaciones:'conversacion', conversacion:'conversacion', creativos:'creativo', creativo:'creativo', productos:'producto', producto:'producto', campanas:'campana', campana:'campana', guiones:'guion', guion:'guion' };
    for (const [word,type] of Object.entries(typeMap)) {
      if (q.includes(word)) {
        const period = parsePeriod(question);
        const items = (typeof allNodes !== 'undefined' ? allNodes : []).filter(n => n.t === type && matchesPeriod(n, period));
        return `<strong>${items.length.toLocaleString('es-CO')}</strong> ${escapeLocal(word)} encontrados en el mapa.`;
      }
    }
    return null;
  }

  function genericSearch(question) {
    const q = stripAccents(question);
    const stop = new Set(['que','cual','cuales','como','cuando','donde','del','de','la','el','los','las','un','una','y','en','por','para','con','me','dime','son','fue','han','mas']);
    const terms = q.split(/[^a-z0-9ñáéíóúü]+/i).map(stripAccents).filter(t => t.length >= 3 && !stop.has(t));
    const period = parsePeriod(question);
    const nodes = typeof allNodes !== 'undefined' ? allNodes : [];
    const scored = nodes.map(node => {
      if (!matchesPeriod(node, period)) return null;
      const name=stripAccents(node.n||''), type=stripAccents(node.t||''), group=stripAccents(node.g||''), blob=stripAccents(JSON.stringify(node));
      let score=0; terms.forEach(term => { if(name.includes(term))score+=8; if(type.includes(term))score+=5; if(group.includes(term))score+=4; if(blob.includes(term))score+=1; });
      if(q && blob.includes(q))score+=20;
      return score>0?{node,score}:null;
    }).filter(Boolean).sort((a,b)=>b.score-a.score);
    if (!scored.length) return '<strong>No encontré evidencia suficiente para responder esa pregunta con el mapa actual.</strong><div class="brain-answer-note">Prueba con nombres concretos como AN48, CP1, Autómatas, septiembre 2026, ventas, CPA o ROAS.</div>';
    const items=scored.slice(0,8).map(({node})=>{const detail=node.d?JSON.stringify(node.d).slice(0,240):'';return `<button class="brain-result" type="button" data-brain-node="${escapeLocal(node.id)}"><span>${escapeLocal(node.n||node.id)}</span><small>${escapeLocal(node.t||'')}${node.g?' · '+escapeLocal(node.g):''}${detail?' · '+escapeLocal(detail):''}</small></button>`;}).join('');
    return `<strong>Encontré ${scored.length.toLocaleString('es-CO')} elementos relacionados.</strong><div class="brain-answer-note">Te muestro los de mayor coincidencia.</div><div class="brain-results">${items}</div>`;
  }

  function answerQuestion() {
    const input=document.getElementById('brainQuestion'), out=document.getElementById('brainAnswer');
    if(!input||!out)return; const question=input.value.trim(); if(!question)return;
    out.classList.remove('hidden'); out.innerHTML='<div class="brain-thinking">Consultando el mapa…</div>';
    setTimeout(function(){
      const q=stripAccents(question); let html;
      if((q.includes('anuncio')||q.includes('anuncios'))&&/(vendido|vendieron|ventas|compras|purchases|mejor.*vende)/.test(q)) html=findTopSellingAds(question);
      else html=countIntent(question)||genericSearch(question);
      out.innerHTML=html;
      out.querySelectorAll('[data-brain-node]').forEach(btn=>btn.addEventListener('click',function(){
        const id=btn.dataset.brainNode;
        try{if(typeof renderDetailsForNode==='function')renderDetailsForNode(id);if(typeof network!=='undefined'&&network){network.selectNodes([id]);network.focus(id,{scale:Math.max(network.getScale(),1.25),animation:{duration:180}});}}catch(_){}
      }));
    },20);
  }

  function bootstrap() {
    injectAskBar(); injectZoomControls(); optimizeNetwork();
    const timer=setInterval(function(){injectAskBar();injectZoomControls();optimizeNetwork();},500);
    setTimeout(()=>clearInterval(timer),30000);

    // Los botones/filtros originales sí modifican el DataSet. Este listener solo
    // asegura que el nuevo subconjunto tenga posiciones visibles y se congele rápido.
    document.addEventListener('click',function(ev){
      if(ev.target.closest('.tab,.quick-focus,#btnReset,#btnFit,#btnRefresh,#btnTypesAll,.type-filter,.evidence-filter,#btnShowSelection,#btnShowNeighbors')) setTimeout(settleGraph,20);
    });
    document.addEventListener('change',function(ev){
      if(ev.target.matches('#productSelect,#sourceSelect,.type-filter,.evidence-filter')) setTimeout(settleGraph,20);
    });
    document.addEventListener('input',function(ev){
      if(ev.target.matches('#searchInput')) setTimeout(settleGraph,80);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap);else bootstrap();
  window.ORZZEN_VISUAL_TOOLS={optimize:optimizeNetwork,zoomIn:()=>zoom(1.35),zoomOut:()=>zoom(0.74),fit:()=>fitFast(),settle:settleGraph};
})();