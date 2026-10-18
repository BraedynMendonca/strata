'use strict';
let study, grid, map, layer, marker, currentSlide = 0;
const $ = id => document.getElementById(id);
const slides = [...document.querySelectorAll('.slide')];
const format = (n, d=1) => Number(n).toFixed(d);
const modes = {
  prediction: ['prediction', 'Degrees above / below the scene median'],
  observed: ['observed', 'Measured surface heat · relative to scene median'],
  error: ['error', 'Model estimate minus satellite measurement'],
  priority: ['priority', 'High estimated heat + low vegetation · review only']
};
function showSlide(index, updateHash=true) {
  currentSlide = Math.max(0, Math.min(slides.length-1, index));
  slides.forEach((slide,i) => { slide.hidden = i !== currentSlide; slide.classList.toggle('active',i===currentSlide); });
  document.querySelectorAll('nav a').forEach(a => a.setAttribute('aria-current',a.hash === '#'+slides[currentSlide].id ? 'page' : 'false'));
  document.querySelectorAll('.slide-dots button').forEach((b,i) => { b.classList.toggle('active',i===currentSlide); b.setAttribute('aria-current',i===currentSlide?'step':'false'); });
  $('previous').disabled = currentSlide === 0;
  $('next').disabled = currentSlide === slides.length-1;
  $('slide-counter').textContent = `${String(currentSlide+1).padStart(2,'0')} / 05`;
  if(updateHash) history.replaceState(null,'','#'+slides[currentSlide].id);
  if(map && slides[currentSlide].id==='map-section') requestAnimationFrame(()=>{ map.invalidateSize(); resetMap(); });
  window.scrollTo(0,0);
}
function bindNavigation() {
  const dots=document.querySelector('.slide-dots');
  slides.forEach((s,i)=>{ const b=document.createElement('button'); b.setAttribute('aria-label',`Section ${i+1}: ${s.querySelector('h1,h2').textContent}`); b.addEventListener('click',()=>showSlide(i)); dots.append(b); });
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const i=slides.findIndex(s=>'#'+s.id===a.hash); if(i>=0){ e.preventDefault(); showSlide(i); }}));
  $('previous').addEventListener('click',()=>showSlide(currentSlide-1)); $('next').addEventListener('click',()=>showSlide(currentSlide+1));
  document.addEventListener('keydown',e=>{if($('sources-dialog').open || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.altKey || e.metaKey)return;
    if(['ArrowRight','PageDown'].includes(e.key)){e.preventDefault();showSlide(currentSlide+1);}
    if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();showSlide(currentSlide-1);}
    if(e.key==='Home'){e.preventDefault();showSlide(0);} if(e.key==='End'){e.preventDefault();showSlide(slides.length-1);}
  });
  $('sources-open').addEventListener('click',()=>$('sources-dialog').showModal());
  $('sources-close').addEventListener('click',()=>$('sources-dialog').close());
  $('sources-dialog').addEventListener('click',e=>{if(e.target===$('sources-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(_){$('fullscreen').title='Full screen is unavailable in this browser';}});
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit full screen':'Enter full screen');if(map)map.invalidateSize();});
  window.addEventListener('hashchange',()=>showSlide(Math.max(0,slides.findIndex(s=>'#'+s.id===location.hash)),false));
  showSlide(Math.max(0,slides.findIndex(s=>'#'+s.id===location.hash)),false);
}
function chartResults() {
  const test=study.test_scenes;
  const mean=k=>test.reduce((sum,s)=>sum+s[k],0)/test.length;
  $('error-reduction').textContent=`${format((1-mean('rmse_c')/mean('baseline_rmse_c'))*100)}%`;
  const left=125, chartWidth=310, max=3.5;
  const bar=(value,y,color)=>`<rect x="${left}" y="${y}" width="${value/max*chartWidth}" height="22" rx="3" fill="${color}"/><text x="${left+value/max*chartWidth+9}" y="${y+15}" fill="#365332" font-size="12">${format(value,2)}°</text>`;
  let svg='<svg viewBox="0 0 520 220" role="img" aria-label="Model RMSE was 1.39 degrees versus a 2.12 degree baseline on June 20, and 2.46 versus 2.90 on August 31, 2025.">';
  for(let n=0;n<=3;n++) {const x=left+n/max*chartWidth;svg+=`<line x1="${x}" y1="12" x2="${x}" y2="186" stroke="#ecf0e7"/><text x="${x}" y="209" text-anchor="middle" fill="#7c8a73" font-size="10">${n}°C</text>`;}
  test.forEach((s,i)=>{const y=25+i*88;const date=new Date(s.date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});svg+=`<text x="0" y="${y+31}" fill="#506646" font-size="12">${date}</text>`+bar(s.baseline_rmse_c,y,'#ced8c8')+bar(s.rmse_c,y+28,'#426e4d');});
  $('error-chart').innerHTML=svg+'</svg>';
  const target=test.find(s=>s.scene===study.prediction_scene)||test.at(-1);
  function dots(precision){const n=Math.round(precision*100);return Array.from({length:100},(_,i)=>`<i class="${i<n?'filled':''}" aria-hidden="true"></i>`).join('');}
  $('hotspot-chart').innerHTML=`<div class="hotspot-comparison"><div class="dot-row"><span>Our model</span><div class="dot-track">${dots(target.hottest_quintile_precision)}</div><b>${format(target.hottest_quintile_precision*100)}%</b></div><div class="dot-row random"><span>Random</span><div class="dot-track">${dots(.2)}</div><b>20%</b></div></div><p class="dates-note">Aug 31: ${format(test[1].hottest_quintile_precision*100)}% · Jun 20: ${format(test[0].hottest_quintile_precision*100)}%. Each square represents about one percentage point.</p>`;
  const km=study.cooling_screen_area_ha/100, percentage=km/study.modeled_area_km2*100;
  $('candidate-km').innerHTML=`${format(km)} <span>km²</span>`;
  $('candidate-percent').textContent=`${format(percentage)}% of the mapped area`;
  $('area-caption').textContent=`${format(study.modeled_area_km2)} km² studied → ${format(km)} km² flagged`;
  $('area-grid').innerHTML=Array.from({length:200},(_,i)=>`<i class="${i<Math.round(percentage*2)?'flagged':''}" aria-hidden="true"></i>`).join('');
  const names=['Microsoft Planetary Computer · Landsat data catalog','USGS · Landsat surface-temperature product','USGS · Collection 2 science products'];
  $('sources').innerHTML=study.source_urls.map((url,i)=>`<a href="${url}" target="_blank" rel="noreferrer">${names[i]} ↗</a>`).join('');
  $('method-detail').textContent=`${study.model} Eight 2022–2024 scenes train the model; two 2025 scenes are held out by date. On those later dates, mean absolute error is ${format(mean('mae_c'),2)}°C and mean date-specific RMSE is ${format(mean('rmse_c'),2)}°C. No causal intervention effect or emissions reduction is measured.`;
  $('spatial-detail').textContent=`A separate check withholds 600 m blocks across training-year images: RMSE ${format(study.spatial_holdout.rmse_c,2)}°C (baseline ${format(study.spatial_holdout.baseline_rmse_c,2)}°C), R² ${format(study.spatial_holdout.r2,2)}. All observations are from one San José study area.`;
}
function resetMap(){map.fitBounds([[grid.bounds[1],grid.bounds[0]],[grid.bounds[3],grid.bounds[2]]],{padding:[8,8],animate:false});}
function setMode(mode){
  if(layer)layer.remove(); const [key,label]=modes[mode];
  layer=L.imageOverlay(study.images[key].url,[[grid.bounds[1],grid.bounds[0]],[grid.bounds[3],grid.bounds[2]]],{opacity:.88,interactive:false}).addTo(map);
  $('map-note').textContent=label;
  const min=study.images[key].min,max=study.images[key].max;
  $('legend-left').textContent=mode==='priority'?'Flagged areas':`${format(min)}°C`;
  $('legend-right').textContent=mode==='priority'?'Higher estimated heat':`+${format(max)}°C`;
  document.querySelectorAll('.mode').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
function inspect(lat,lon){
  const [w,s,e,n]=grid.bounds,[h,width]=grid.shape,row=Math.floor((n-lat)/(n-s)*h),col=Math.floor((lon-w)/(e-w)*width);
  $('pixel-title').innerHTML=`<span>${lat.toFixed(3)}° N</span><span>${Math.abs(lon).toFixed(3)}° W</span>`;
  const clear=()=>{['pixel-pred','pixel-observed','pixel-error','pixel-ndvi'].forEach(id=>$(id).textContent='—');$('pixel-priority').textContent='Not assessed';};
  if(row<0||col<0||row>=h||col>=width){clear();$('pixel-copy').textContent='Outside the study area.';return;}
  const pred=grid.predicted_c[row][col],obs=grid.observed_c[row][col];
  if(pred===-999||obs===-999){clear();$('pixel-copy').textContent='No valid cloud-screened observation here.';return;}
  const signed=v=>`${v>0?'+':''}${format(v)}°C`;
  $('pixel-copy').textContent='Relative surface heat · Aug 31, 2025';
  $('pixel-pred').textContent=signed(pred);$('pixel-observed').textContent=signed(obs);$('pixel-error').textContent=signed(pred-obs);$('pixel-ndvi').textContent=format(grid.ndvi[row][col],2);
  $('pixel-priority').textContent=grid.priority[row][col]?'Flagged for field review':'Outside the review screen';
  if(marker)marker.remove();marker=L.circleMarker([lat,lon],{radius:7,color:'#fff',weight:2,fillColor:'#213b30',fillOpacity:.9}).addTo(map);
}
function initMap(){
  map=L.map('map',{preferCanvas:true,scrollWheelZoom:false,zoomControl:true,keyboard:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors · Landsat / USGS'}).addTo(map);
  resetMap();setMode('prediction');map.on('click',e=>inspect(e.latlng.lat,e.latlng.lng));
  document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $('map-reset').addEventListener('click',resetMap);
  // Start on a genuine flagged cell so the comparison is immediately visible.
  let selected=false;for(let r=0;r<grid.shape[0]&&!selected;r++){for(let c=0;c<grid.shape[1];c++){if(grid.priority[r][c]&&grid.observed_c[r][c]!==-999){const [w,s,e,n]=grid.bounds;inspect(n-(r+.5)/grid.shape[0]*(n-s),w+(c+.5)/grid.shape[1]*(e-w));selected=true;break;}}}
  if(slides[currentSlide].id==='map-section')requestAnimationFrame(()=>{map.invalidateSize();resetMap();});
}
async function start(){
 bindNavigation();
 try{[study,grid]=await Promise.all(['study','grid'].map(async name=>{const response=await fetch(`heat/${name}.json`);if(!response.ok)throw Error('Satellite results could not be loaded. Please reload the page.');return response.json();}));chartResults();initMap();}
 catch(error){$('load-error').hidden=false;$('load-error').textContent=error.message;}
}
start();
