(function () {
  'use strict';

  const MONTHS = { enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,setiembre:8,octubre:9,noviembre:10,diciembre:11 };

  function stripAccents(value){ return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
  function esc(value){ return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

  function positionNodes(items){
    const out = new Map();
    if(!items || !items.length) return out;
    if(items.length <= 24){
      const radius = items.length <= 1 ? 0 : Math.max(90, 24 * items.length);
      items.forEach((n,i)=>{ const a = items.length<=1?0:(Math.PI*2*i/items.length)-Math.PI/2; out.set(n.id,{x:Math.cos(a)*radius,y:Math.sin(a)*radius}); });
      return out;
    }
    const groups = new Map();
    items.forEach(n=>{ const k=n.g||n.t||'otros'; if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(n); });
    const entries=[...groups.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    const groupCount=entries.length;
    const clusterRadius=groupCount<=1?0:Math.min(620,Math.max(280,145*Math.sqrt(groupCount)));
    const golden=Math.PI*(3-Math.sqrt(5));
    entries.forEach(([k,list],gi)=>{
      const ga=groupCount<=1?0:(Math.PI*2*gi/groupCount)-Math.PI/2;
      const cx=Math.cos(ga)*clusterRadius, cy=Math.sin(ga)*clusterRadius;
      list.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      const spacing=list.length>700?11:list.length>300?13:list.length>120?16:22;
      list.forEach((n,i)=>{
        if(i===0){ out.set(n.id,{x:cx,y:cy}); return; }
        const r=spacing*Math.sqrt(i+1), a=(i+1)*golden;
        out.set(n.id,{x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r});
      });
    });
    return out;
  }

  function fastCreateNetwork(){
    if(network) network.destroy();
    nodesDS = new vis.DataSet([]);
    edgesDS = new vis.DataSet([]);
    network = new vis.Network(el('network'), {nodes:nodesDS,edges:edgesDS}, {
      autoResize:true,
      physics:{enabled:false},
      layout:{improvedLayout:false},
      interaction:{hover:false,multiselect:false,navigationButtons:false,keyboard:true,tooltipDelay:250,zoomView:true,dragView:true,dragNodes:true,hideEdgesOnDrag:true,hideEdgesOnZoom:true},
      nodes:{font:{face:'Inter',size:12,color:'#233143'},borderWidth:1,shadow:false},
      edges:{smooth:false,shadow:false,selectionWidth:1.5,hoverWidth:0,color:{inherit:false,opacity:0.34}}
    });
    network.on('click', params=>{
      if(params.nodes.length){ selectedNodeId=params.nodes[0]; selectedEdgeId=null; renderDetailsForNode(selectedNodeId); if(currentMode!=='resumen') renderGraph(false); }
      else if(params.edges.length){ selectedEdgeId=params.edges[0]; selectedNodeId=null; renderDetailsForEdge(selectedEdgeId); }
    });
    network.on('doubleClick', params=>{
      if(params.nodes.length){ selectedNodeId=params.nodes[0]; currentMode='conexiones'; document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.mode==='conexiones')); renderGraph(); }
    });
  }

  function fastRenderGraph(fit=true){
    if(!nodesDS || !edgesDS || !network) return;
    const search=el('searchInput').value.trim().toLowerCase();
    const product=el('productSelect').value;
    const source=el('sourceSelect').value;
    const activeTypes=getActiveTypeSet();
    const activeEvidence=getActiveEvidenceSet();
    let baseNodes=allNodes.filter(n=>activeTypes.has(n.t));
    if(focusType) baseNodes=baseNodes.filter(n=>n.t===focusType);
    if(product) baseNodes=baseNodes.filter(n=>n.g===product||String(n.n||'').toLowerCase().includes(product.toLowerCase()));
    if(source) baseNodes=baseNodes.filter(n=>(n.src||[]).includes(source)||JSON.stringify(n.d||{}).includes(source));
    if(search) baseNodes=baseNodes.filter(n=>textBlob(n).includes(search));
    let nodeIds=new Set(baseNodes.map(n=>n.id));
    let baseEdges=allEdges.filter(e=>nodeIds.has(e.s)&&nodeIds.has(e.t)&&activeEvidence.has(normalizeEvidence(e.e)));
    if(source) baseEdges=baseEdges.filter(e=>String(e.ev||'').includes(source));
    if(search) baseEdges=baseEdges.filter(e=>JSON.stringify(e).toLowerCase().includes(search)||nodeIds.has(e.s)||nodeIds.has(e.t));
    if(currentMode==='conexiones'&&selectedNodeId){
      const neighborIds=new Set([selectedNodeId]);
      allEdges.forEach(e=>{ if(!activeEvidence.has(normalizeEvidence(e.e)))return; if(e.s===selectedNodeId||e.t===selectedNodeId){neighborIds.add(e.s);neighborIds.add(e.t);} });
      baseNodes=allNodes.filter(n=>neighborIds.has(n.id)&&activeTypes.has(n.t));
      nodeIds=new Set(baseNodes.map(n=>n.id));
      baseEdges=allEdges.filter(e=>nodeIds.has(e.s)&&nodeIds.has(e.t)&&activeEvidence.has(normalizeEvidence(e.e)));
    }
    if(currentMode==='recorrido'&&selectedNodeId){
      const eligible=allEdges.filter(e=>activeEvidence.has(normalizeEvidence(e.e)));
      const hop2=collectHops(selectedNodeId,eligible,2);
      baseNodes=allNodes.filter(n=>hop2.has(n.id)&&activeTypes.has(n.t));
      nodeIds=new Set(baseNodes.map(n=>n.id));
      baseEdges=eligible.filter(e=>nodeIds.has(e.s)&&nodeIds.has(e.t));
    }
    currentRendered={nodes:baseNodes,edges:baseEdges};
    const showAllLabels=el('toggleLabels').checked;
    const showEdgeLabels=el('toggleEdgeLabels').checked;
    const dense=baseNodes.length>180;
    const positions=positionNodes(baseNodes);
    const visNodes=baseNodes.map(n=>{ const v=buildVisNode(n,showAllLabels,dense),p=positions.get(n.id)||{x:0,y:0}; return {...v,x:p.x,y:p.y,physics:false}; });
    const visEdges=baseEdges.map(e=>{ const v=buildVisEdge(e,showEdgeLabels,dense); v.smooth=false; return v; });
    nodesDS.clear(); edgesDS.clear();
    if(visNodes.length) nodesDS.add(visNodes);
    if(visEdges.length) edgesDS.add(visEdges);
    el('activeModeLabel').textContent=modeLabel();
    el('activeViewStats').textContent=`${formatNumber(baseNodes.length)} elementos · ${formatNumber(baseEdges.length)} relaciones`;
    el('activeFilterSummary').textContent=buildFilterSummary(search,product,source);
    network.redraw();
    if(fit&&visNodes.length) requestAnimationFrame(()=>{ try{ network.fit({animation:false}); }catch(_){} });
  }

  try { createNetwork = fastCreateNetwork; } catch(_) { window.createNetwork = fastCreateNetwork; }
  try { renderGraph = fastRenderGraph; } catch(_) { window.renderGraph = fastRenderGraph; }

  function zoom(factor){ try{ if(!network)return; const next=Math.max(.05,Math.min(6,network.getScale()*factor)); network.moveTo({scale:next,animation:false}); }catch(_){} }
  function fitFast(){ try{ if(network&&nodesDS&&nodesDS.length){network.redraw();network.fit({animation:false});} }catch(_){} }

  function injectZoom(){
    if(document.getElementById('orzzenZoomControls')) return;
    const host=document.querySelector('.center-panel'); if(!host)return;
    const box=document.createElement('div'); box.id='orzzenZoomControls'; box.className='orzzen-zoom-controls';
    box.innerHTML='<button type="button" data-z="in">+</button><button type="button" data-z="out">−</button><button type="button" data-z="fit" class="zoom-fit">Ajustar</button>';
    host.appendChild(box);
    box.addEventListener('click',e=>{ const a=e.target?.dataset?.z; if(a==='in')zoom(1.35); if(a==='out')zoom(.74); if(a==='fit')fitFast(); });
  }

  function parsePeriod(q){ const s=stripAccents(q); let month=null; for(const [n,i] of Object.entries(MONTHS)){if(s.includes(stripAccents(n))){month=i;break;}} const y=s.match(/\b(20\d{2})\b/); return {month,year:y?Number(y[1]):null}; }
  function objectDate(o){ for(const v of [o?.f,o?.fecha,o?.date,o?.created_at,o?.timestamp]){ if(!v)continue; const d=new Date(v); if(!Number.isNaN(d.getTime()))return d; } return null; }
  function matchesPeriod(o,p){ if(p.month==null&&p.year==null)return true; const d=objectDate(o); if(d){if(p.year!=null&&d.getFullYear()!==p.year)return false;if(p.month!=null&&d.getMonth()!==p.month)return false;return true;} const t=stripAccents(JSON.stringify(o||{})); if(p.year!=null&&!t.includes(String(p.year)))return false; return true; }
  function flattenNumbers(o,p='',out=[]){ if(!o||typeof o!=='object')return out; if(Array.isArray(o)){o.slice(0,100).forEach((v,i)=>flattenNumbers(v,`${p}[${i}]`,out));return out;} Object.entries(o).forEach(([k,v])=>{const key=p?`${p}.${k}`:k;if(typeof v==='number'&&Number.isFinite(v))out.push({key,value:v});else if(v&&typeof v==='object')flattenNumbers(v,key,out);});return out; }
  function metricForAd(n){ const nums=flattenNumbers(n),defs=[[/ventas|purchases?|compras|orders?|conversiones/i,'ventas',1e9],[/revenue|ingresos|facturacion|valor.*conversion/i,'ingresos',1e6],[/roas/i,'ROAS',1e3],[/cpa|costo.*compra|cost.*purchase/i,'CPA',1]]; for(const [re,kind,w] of defs){const f=nums.filter(x=>re.test(x.key)).sort((a,b)=>b.value-a.value)[0];if(f)return {...f,kind,score:kind==='CPA'?-f.value:f.value*w};} return null; }
  function answerQuestion(){
    const input=document.getElementById('brainQuestion'),out=document.getElementById('brainAnswer'); if(!input||!out)return; const q=input.value.trim(); if(!q)return;
    out.classList.remove('hidden');
    const s=stripAccents(q),p=parsePeriod(q),nodes=Array.isArray(allNodes)?allNodes:[];
    if((s.includes('anuncio')||s.includes('anuncios'))&&/(vendido|vendieron|ventas|compras|mejor.*vende)/.test(s)){
      const ads=nodes.filter(n=>n.t==='anuncio'&&matchesPeriod(n,p)); const ranked=ads.map(n=>({n,m:metricForAd(n)})).filter(x=>x.m).sort((a,b)=>b.m.score-a.m.score);
      if(ranked.length){out.innerHTML='<strong>Ranking según métricas registradas:</strong>'+ranked.slice(0,10).map((x,i)=>`<div class="brain-result"><span>${i+1}. ${esc(x.n.n||x.n.id)}</span><small>${esc(x.m.kind)}: ${Number(x.m.value).toLocaleString('es-CO')}</small></div>`).join('');return;}
      out.innerHTML=`<strong>Encontré ${ads.length} anuncios del período, pero no una métrica numérica suficiente para ordenarlos por ventas.</strong><div class="brain-answer-note">No voy a inventar un ranking que el mapa no soporte.</div>`; return;
    }
    const stop=new Set(['que','cual','cuales','como','cuando','donde','del','de','la','el','los','las','un','una','por','para','con','mas']);
    const terms=s.split(/[^a-z0-9ñ]+/).filter(t=>t.length>=3&&!stop.has(t));
    const scored=nodes.map(n=>{if(!matchesPeriod(n,p))return null;const blob=stripAccents(JSON.stringify(n));let score=0;terms.forEach(t=>{if(stripAccents(n.n||'').includes(t))score+=8;if(stripAccents(n.t||'').includes(t))score+=5;if(blob.includes(t))score+=1;});return score?{n,score}:null;}).filter(Boolean).sort((a,b)=>b.score-a.score);
    if(!scored.length){out.innerHTML='<strong>No encontré evidencia suficiente para responder con el mapa actual.</strong>';return;}
    out.innerHTML=`<strong>Encontré ${scored.length} elementos relacionados.</strong>`+scored.slice(0,8).map(x=>`<button class="brain-result" type="button" data-id="${esc(x.n.id)}"><span>${esc(x.n.n||x.n.id)}</span><small>${esc(x.n.t||'')}${x.n.g?' · '+esc(x.n.g):''}</small></button>`).join('');
    out.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>jumpToNode(b.dataset.id)));
  }

  function injectAsk(){
    if(document.getElementById('brainAskBox'))return;
    const host=document.querySelector('.center-panel'),toolbar=host?.querySelector('.mini-toolbar'); if(!host||!toolbar)return;
    const wrap=document.createElement('section'); wrap.id='brainAskBox'; wrap.className='brain-ask-box';
    wrap.innerHTML='<div class="brain-ask-title">Pregúntale al Cerebro ORZZEN</div><div class="brain-ask-row"><input id="brainQuestion" type="text" autocomplete="off" placeholder="Ej.: ¿Cuáles son los anuncios que más han vendido en septiembre de 2026?"><button id="brainAskButton" type="button">Preguntar</button></div><div class="brain-ask-help">Responde únicamente con la información disponible en el mapa.</div><div id="brainAnswer" class="brain-answer hidden"></div>';
    host.insertBefore(wrap,toolbar);
    document.getElementById('brainAskButton').addEventListener('click',answerQuestion);
    document.getElementById('brainQuestion').addEventListener('keydown',e=>{if(e.key==='Enter')answerQuestion();});
  }

  function bootstrap(){ injectAsk(); injectZoom(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bootstrap); else bootstrap();
  window.ORZZEN_VISUAL_TOOLS={zoomIn:()=>zoom(1.35),zoomOut:()=>zoom(.74),fit:fitFast};
})();