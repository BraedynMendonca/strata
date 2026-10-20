'use strict';
let study, grid, places = [], map, layer, marker, selectedCircle, comparisonCircles, currentSlide = 0;
let selectedLocation = null, comparisons = [], activeMode = 'prediction', nextAreaId = 1;
let screening = {...StrataAnalysis.DEFAULT_SCREEN};
let customImage = null, comparisonUndo = null, savedMapView = null;
const A = StrataAnalysis;
const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signed = v => `${v > 0 ? '+' : ''}${format(v)}°C`;
const dateText = () => new Date(study.prediction_date + 'T12:00:00Z').toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
const announce = text => { $('action-status').textContent = text; };
const $ = id => document.getElementById(id);
const slides = [...document.querySelectorAll('.slide')];
const format = (n, d=1) => Number(n).toFixed(d);
const percent = n => n > 0 && n < 0.1 ? 'Less than 0.1' : format(n);
const modes = {
  prediction: ['prediction', 'Degrees above / below the scene median'],
  observed: ['observed', 'Measured surface heat relative to scene median'],
  error: ['error', 'Model estimate minus satellite measurement'],
  priority: ['priority', 'High estimated heat and low vegetation; review only']
};
function showSlide(index, updateHash=true) {
  if(map && slides[currentSlide].id==='map-section' && index!==currentSlide) savedMapView={center:map.getCenter(),zoom:map.getZoom()};
  currentSlide = Math.max(0, Math.min(slides.length-1, index));
  slides.forEach((slide,i) => { slide.hidden = i !== currentSlide; slide.classList.toggle('active',i===currentSlide); });
  document.querySelectorAll('nav a').forEach(a => a.setAttribute('aria-current',a.hash === '#'+slides[currentSlide].id ? 'page' : 'false'));
  document.querySelectorAll('.slide-dots button').forEach((b,i) => { b.classList.toggle('active',i===currentSlide); b.setAttribute('aria-current',i===currentSlide?'step':'false'); });
  $('previous').disabled = currentSlide === 0;
  $('next').disabled = currentSlide === slides.length-1;
  $('slide-counter').textContent = `${String(currentSlide+1).padStart(2,'0')} / 05`;
  if(updateHash) history.replaceState(null,'','#'+slides[currentSlide].id);
  if(map && slides[currentSlide].id==='map-section') requestAnimationFrame(()=>{map.invalidateSize({pan:false});if(savedMapView)map.setView(savedMapView.center,savedMapView.zoom,{animate:false});});
  window.scrollTo(0,0);
}
function bindNavigation() {
  const dots=document.querySelector('.slide-dots');
  slides.forEach((s,i)=>{ const b=document.createElement('button'); b.setAttribute('aria-label',`Section ${i+1}: ${s.querySelector('h1,h2').textContent}`); b.addEventListener('click',()=>showSlide(i)); dots.append(b); });
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const i=slides.findIndex(s=>'#'+s.id===a.hash); if(i>=0){ e.preventDefault(); showSlide(i); }}));
  $('previous').addEventListener('click',()=>showSlide(currentSlide-1)); $('next').addEventListener('click',()=>showSlide(currentSlide+1));
  document.addEventListener('keydown',e=>{if(e.defaultPrevented || $('sources-dialog').open || e.target.closest('input,textarea,select,button,summary,form,#map,[contenteditable]') || e.ctrlKey || e.altKey || e.metaKey)return;
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
  $('hotspot-chart').innerHTML=`<div class="hotspot-comparison"><div class="dot-row"><span>Our model</span><div class="dot-track">${dots(target.hottest_quintile_precision)}</div><b>${format(target.hottest_quintile_precision*100)}%</b></div><div class="dot-row random"><span>Random</span><div class="dot-track">${dots(.2)}</div><b>20%</b></div></div><p class="dates-note">Aug 31: ${format(test[1].hottest_quintile_precision*100)}%; Jun 20: ${format(test[0].hottest_quintile_precision*100)}%. Each square represents about one percentage point.</p>`;
  const km=study.cooling_screen_area_ha/100, percentage=km/study.modeled_area_km2*100;
  $('candidate-km').innerHTML=`${format(km)} <span>km²</span>`;
  $('candidate-percent').textContent=`${format(percentage)}% of the mapped area`;
  $('area-caption').textContent=`${format(study.modeled_area_km2)} km² studied → ${format(km)} km² flagged`;
  $('area-grid').innerHTML=Array.from({length:200},(_,i)=>`<i class="${i<Math.round(percentage*2)?'flagged':''}" aria-hidden="true"></i>`).join('');
  const names=['Microsoft Planetary Computer Landsat catalog','USGS Landsat surface-temperature product','USGS Collection 2 science products'];
  $('sources').innerHTML=study.source_urls.map((url,i)=>`<a href="${url}" target="_blank" rel="noreferrer">${names[i]} ↗</a>`).join('');
  $('method-detail').textContent=`${study.model} Eight 2022–2024 scenes train the model; two 2025 scenes are held out by date. On those later dates, mean absolute error is ${format(mean('mae_c'),2)}°C and mean date-specific RMSE is ${format(mean('rmse_c'),2)}°C. No causal intervention effect or emissions reduction is measured.`;
  $('ridge-comparison').textContent = `ExtraTrees RMSE: ${format(study.spatial_holdout.rmse_c,2)}°C; Ridge regression on the same features: ${format(study.spectral_baseline.rmse_c,2)}°C; constant-median baseline: ${format(study.spatial_holdout.baseline_rmse_c,2)}°C. These are spatial-block results, not the 2025 date-holdout results.`;
  $('ridge-detail').textContent = $('ridge-comparison').textContent;
  $('spatial-detail').textContent=`A separate check withholds 600 m blocks across training-year images: RMSE ${format(study.spatial_holdout.rmse_c,2)}°C (baseline ${format(study.spatial_holdout.baseline_rmse_c,2)}°C), R² ${format(study.spatial_holdout.r2,2)}. All observations are from one San José study area.`;
}
function resetMap() {
  map.fitBounds([[grid.bounds[1],grid.bounds[0]],[grid.bounds[3],grid.bounds[2]]],{padding:[12,12],animate:false});
}
function customOverlay() {
  if (customImage) return customImage;
  const canvas = document.createElement('canvas');
  canvas.height = grid.shape[0]; canvas.width = grid.shape[1];
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--review-fill').trim();
  for (let r=0;r<grid.shape[0];r++) for(let c=0;c<grid.shape[1];c++) if(A.qualifies(grid,r,c,screening)) ctx.fillRect(c,r,1,1);
  customImage = canvas.toDataURL('image/png');
  return customImage;
}
function setMode(mode) {
  activeMode = mode;
  if(layer) layer.remove();
  const key = modes[mode][0], custom = mode === 'priority' && screening.mode === 'custom';
  const url = custom ? customOverlay() : study.images[key].url;
  layer = L.imageOverlay(url,[[grid.bounds[1],grid.bounds[0]],[grid.bounds[3],grid.bounds[2]]],{opacity:.88,interactive:false}).addTo(map);
  layer.on('error',()=>{ $('data-status').hidden=false; $('data-status').textContent='This image layer could not load. Numeric comparisons and exports remain available; try another layer or reload.'; });
  layer.on('load',()=>{ $('data-status').hidden=true; });
  $('map-note').textContent = `${dateText()} · ${mode === 'priority' ? (custom ? 'Custom criteria · rounded display grid' : 'Original saved study screen') : modes[mode][1]}`;
  $('legend-left').textContent = mode === 'priority' ? (custom ? 'Qualifies for review' : 'Saved flagged cells') : `${format(study.images[key].min)}°C`;
  $('legend-right').textContent = mode === 'priority' ? (custom ? 'Custom criteria' : 'Higher modeled heat') : `+${format(study.images[key].max)}°C`;
  $('legend-gradient').style.background = mode !== 'priority' ? '' : custom ? 'var(--review-fill)' : 'linear-gradient(90deg,var(--heat-mid),var(--heat-hot))';
  document.querySelectorAll('.mode').forEach(b=>{ const active=b.dataset.mode===mode; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active)); });
}
function renderPlaces() {
  const q=$('place-search').value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const filtered=places.filter(p=>`${p.name} ${p.kind} ${p.address}`.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q));
  $('place-list').innerHTML=filtered.map(p=>`<button class="place-button" data-place="${escapeHTML(p.id)}" type="button"><span class="place-symbol" aria-hidden="true">${p.id==='guadalupe'?'♧':p.id==='sjsu'?'▥':'⌂'}</span><span><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.kind)}</small></span><span aria-hidden="true">↗</span></button>`).join('');
  $('place-empty').hidden=filtered.length>0;
}
function updateAddButton() {
  const duplicate=selectedLocation && comparisons.some(p=>A.distanceM(p,selectedLocation)<1);
  $('compare-add').disabled=!selectedLocation || !A.cellForLocation(grid,selectedLocation.lat,selectedLocation.lon) || duplicate || comparisons.length>=3;
  $('compare-add').textContent=duplicate?'Already in comparison':comparisons.length>=3?'Three areas selected':'Compare this area · 300 m';
}
function inspect(lat,lon,place=null,pan=false) {
  const cell=A.cellForLocation(grid,lat,lon);
  const name=place?.name || `Map selection ${nextAreaId}`;
  selectedLocation=cell?{lat,lon,name,source:place?.source || '',notes:''}:null;
  $('pixel-title').textContent=cell?name:'Outside the study area';
  $('pixel-coordinates').textContent=`${format(lat,5)}° N, ${format(Math.abs(lon),5)}° W`;
  $('latitude').value=lat; $('longitude').value=lon;
  $('place-source').hidden=!place?.source;
  if(place?.source) $('place-source').href=place.source;
  if(marker) marker.remove();
  if(selectedCircle) selectedCircle.remove();
  if(cell) {
    marker=L.circleMarker([lat,lon],{radius:6,color:getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),weight:2,fillColor:getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),fillOpacity:1}).addTo(map);
    selectedCircle=L.circle([lat,lon],{radius:A.RADIUS_M,color:getComputedStyle(document.documentElement).getPropertyValue('--selection').trim(),weight:2,dashArray:'5 5',fillOpacity:0.04}).addTo(map);
    if(pan) map.setView([lat,lon],15,{animate:false});
  }
  ['pixel-pred','pixel-observed','pixel-error','pixel-ndvi'].forEach(id=>$(id).textContent='—');
  if(!cell) {
    $('pixel-copy').textContent='Choose a location inside the colored study footprint.';
    $('pixel-priority').textContent='Not assessed';
  } else if(!A.validCell(grid,cell.r,cell.c)) {
    $('pixel-copy').textContent='No valid cloud-screened observation at this display cell. The surrounding area can still be checked for coverage.';
    $('pixel-priority').textContent='No valid point observation';
  } else {
    const {r,c}=cell,pred=grid.predicted_c[r][c],obs=grid.observed_c[r][c];
    $('pixel-copy').textContent=`Historical surface heat · ${dateText()}`;
    $('pixel-pred').textContent=signed(pred); $('pixel-observed').textContent=signed(obs);
    $('pixel-error').textContent=signed(pred-obs); $('pixel-ndvi').textContent=format(grid.ndvi[r][c],2);
    $('pixel-priority').textContent=A.qualifies(grid,r,c,screening)?'● Meets the selected review criteria':'○ Does not meet the selected review criteria';
  }
  updateAddButton();
}
function renderComparisonCircles() {
  comparisonCircles.clearLayers();
  comparisons.forEach((p,i)=>{
    L.circle([p.lat,p.lon],{radius:A.RADIUS_M,color:getComputedStyle(document.documentElement).getPropertyValue(['--compare-one','--compare-two','--compare-three'][i]).trim(),weight:3,fillOpacity:.08})
      .bindTooltip(`${i+1}. ${p.name} · 300 m radius`,{direction:'top'}).addTo(comparisonCircles);
  });
}
function summaryMarkup(x) {
  if(!x.eligible) return `<p class="coverage-warning">Summary withheld: ${escapeHTML(x.reason)}</p><p class="small-copy">${x.valid} of ${x.total} in-grid display cells are valid (${format(x.coverage*100)}%). ${x.crossesBoundary?'Coverage outside the study is unknown.':''}</p>`;
  return `<dl class="area-values"><dt>Average model estimate</dt><dd>${signed(x.predicted)}</dd><dt>Average satellite measurement</dt><dd>${signed(x.observed)}</dd><dt>Average greenness · NDVI</dt><dd>${format(x.ndvi,2)}</dd><dt>Meets review criteria</dt><dd>${format(x.flaggedPercent)}%</dd></dl><p class="coverage-label">✓ ${format(x.coverage*100)}% valid coverage · ${x.valid} display cells</p>`;
}
function renderComparisons() {
  $('comparison-cards').innerHTML=comparisons.map((p,i)=>`<article class="area-card"><div class="area-card-heading"><h4><span class="area-number">${i+1}</span> ${escapeHTML(p.name)}</h4><button type="button" class="remove-area" data-remove="${p.id}" aria-label="Remove ${escapeHTML(p.name)}">×</button></div><p class="small-copy">300 m radius · ${format(p.lat,5)}, ${format(p.lon,5)}</p>${summaryMarkup(A.summarizeCircle(grid,p,screening))}<label class="notes-label">Field-review notes<textarea data-notes="${p.id}" rows="2" maxlength="1000" placeholder="What would you check here?">${escapeHTML(p.notes)}</textarea></label></article>`).join('');
  $('comparison-message').textContent=comparisons.length?`${comparisons.length} of 3 areas selected. Percentages use valid cells in each circle; they do not describe planting feasibility.`:'Select a place, then choose “Compare this area.” You can add up to three.';
  $('comparison-reset').disabled=!comparisons.length;
  $('comparison-undo').hidden=comparisonUndo===null;
  $('review-link').hidden=!comparisons.length;
  updateAddButton(); renderComparisonCircles(); renderBrief();
}
function rememberComparisons() { comparisonUndo = comparisons.map(p=>({...p})); }
function addComparison() {
  if(!selectedLocation || comparisons.length>=3 || comparisons.some(p=>A.distanceM(p,selectedLocation)<1)) return;
  rememberComparisons(); comparisons.push({...selectedLocation,id:nextAreaId++}); renderComparisons();
  map.fitBounds(comparisonCircles.getBounds(),{padding:[25,25],maxZoom:15,animate:false});
  announce(`${selectedLocation.name} added to comparison. ${comparisons.length} of three areas selected.`);
}
function updateScreen() {
  screening={mode:document.querySelector('input[name="screen-method"]:checked').value,heat:Number($('heat-threshold').value),ndvi:Number($('ndvi-threshold').value)};
  customImage=null;
  $('custom-controls').hidden=screening.mode!=='custom';
  $('heat-value').textContent=`+${format(screening.heat)}°C`; $('ndvi-value').textContent=format(screening.ndvi,2);
  $('screen-badge').textContent=screening.mode==='original'?'Original study screen':'Custom display-grid screen';
  $('screen-description').textContent=screening.mode==='original'?'The original saved mask uses the upper quarter of positive model estimates and source NDVI below 0.25. The archived 16.2 km² total is unchanged.':'Custom screening changes the shortlist only. Rounded display values may classify cells differently from the full-precision source analysis.';
  const x=A.screenSummary(grid,screening);
  $('screen-summary').textContent=x.valid?`${percent(x.percent)}% (${x.flagged.toLocaleString()} of ${x.valid.toLocaleString()} valid display cells) meet these criteria.${x.flagged?'':' No matches. Try a lower heat threshold or a higher vegetation limit.'}`:'No valid display cells are available.';
  if(selectedLocation) inspect(selectedLocation.lat,selectedLocation.lon,{name:selectedLocation.name,source:selectedLocation.source});
  setMode('priority'); renderComparisons();
}
function renderBrief() {
  const rows=A.reportRows(grid,comparisons,screening,study.prediction_date);
  $('brief-empty').hidden=rows.length>0; $('brief-preview').hidden=!rows.length;
  $('print-brief').disabled=!rows.length; $('download-csv').disabled=!rows.length;
  if(!rows.length) { $('brief-preview').replaceChildren(); return; }
  const items=rows.map((r,i)=>`<article class="brief-area"><h4>${i+1}. ${escapeHTML(r.location)}</h4><p>${format(r.latitude,5)}, ${format(r.longitude,5)} · 300 m radius</p>${summaryMarkup(A.summarizeCircle(grid,comparisons[i],screening))}<p><strong>Notes:</strong> ${escapeHTML(r.notes || '________________________________________________')}</p>${r.source_url?`<p class="print-source">Place source: ${escapeHTML(r.source_url)}</p>`:''}</article>`).join('');
  $('brief-preview').innerHTML=`<div class="brief-header"><h3>Strata · field-review brief</h3><p>Acquisition: ${escapeHTML(dateText())} · Historical surface temperature</p><p>Screen: ${escapeHTML(A.screenLabel(screening))}</p><p>Selected map layer: ${escapeHTML(document.querySelector('.mode.active').textContent)}</p></div><p class="brief-warning">Exploratory screening, not a planting recommendation. Temperatures are degrees above or below the image median surface temperature, not air temperature. Values come from a rounded display grid; thermal observations have approximately 100 m native resolution. No cooling effect or emissions reduction is established.</p><div class="brief-areas">${items}</div><div class="field-checklist"><h4>Check on the ground before proposing a project</h4><ul>${['Existing shade and the hours people use the space','Paved surfaces and available planting space','Property ownership, permissions and underground utilities','Water access, irrigation and long-term maintenance','Community priorities and who uses the space','Feasibility of greening, shade structures or roof measures—assess, do not assume'].map(s=>`<li><span aria-hidden="true">□</span> ${s}</li>`).join('')}</ul><p>Site visit date: ____________________ &nbsp; Reviewer: ____________________</p><p>Current conditions / next steps: ____________________________________________________</p></div>`;
}
function renderCaseStudy() {
  const market=places.find(p=>p.id==='san-pedro'),park=places.find(p=>p.id==='guadalupe');
  const a=A.summarizeCircle(grid,market),b=A.summarizeCircle(grid,park);
  $('case-results').textContent=a.eligible&&b.eligible?`Satellite findings (${dateText()}, 300 m circles): the market vicinity averaged ${signed(a.observed)} observed / ${signed(a.predicted)} modeled; the visitor-center vicinity averaged ${signed(b.observed)} observed / ${signed(b.predicted)} modeled. Average NDVI was ${format(a.ndvi,2)} and ${format(b.ndvi,2)}, respectively. These are actual display-grid summaries, not an assumption that a shopping area must be hotter.`:'One case-study area has insufficient coverage; area findings are withheld.';
}
function initMap() {
  map=L.map('map',{preferCanvas:true,scrollWheelZoom:false,zoomControl:true,keyboard:true});
  comparisonCircles=L.featureGroup().addTo(map);
  const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors · Landsat / USGS'}).addTo(map);
  let tileFailed=false;
  tiles.on('tileerror',()=>{tileFailed=true;$('basemap-status').hidden=false;});
  tiles.on('load',()=>{if(!tileFailed)$('basemap-status').hidden=true;});
  map.on('moveend',()=>{$('map-view-status').textContent=`Map view center ${format(map.getCenter().lat,5)}, ${format(map.getCenter().lng,5)}; zoom ${map.getZoom()}.`;});
  resetMap(); setMode(activeMode);
  map.on('click',e=>inspect(e.latlng.lat,e.latlng.lng));
  inspect(places[0].lat,places[0].lon,places[0]);
  if(slides[currentSlide].id==='map-section') requestAnimationFrame(()=>map.invalidateSize());
}
function bindExplorer() {
  $('place-search').addEventListener('input',renderPlaces);
  $('place-list').addEventListener('click',e=>{ const button=e.target.closest('[data-place]'); if(!button)return;const p=places.find(p=>p.id===button.dataset.place); inspect(p.lat,p.lon,p,true); announce(`${p.name} selected. Use Compare this area to add its surroundings.`); });
  document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{setMode(b.dataset.mode);renderBrief();}));
  $('map-reset').addEventListener('click',resetMap);
  $('compare-add').addEventListener('click',addComparison);
  $('coordinate-form').addEventListener('submit',e=>{e.preventDefault();const lat=Number($('latitude').value),lon=Number($('longitude').value); if(!A.cellForLocation(grid,lat,lon)){$('coordinate-message').textContent='Outside the study area. Choose latitude/longitude inside the colored footprint.';return;}inspect(lat,lon,null,true);$('coordinate-message').textContent='Location selected. Compare its 300 m surroundings or inspect the point values.';});
  $('comparison-cards').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;const index=comparisons.findIndex(p=>p.id===Number(b.dataset.remove));const removed=comparisons[index];rememberComparisons();comparisons.splice(index,1);renderComparisons();$('comparison-undo').focus();announce(`${removed.name} removed.`);});
  $('comparison-cards').addEventListener('input',e=>{if(!e.target.matches('[data-notes]'))return; comparisons.find(p=>p.id===Number(e.target.dataset.notes)).notes=e.target.value;renderBrief();});
  $('comparison-reset').addEventListener('click',()=>{rememberComparisons();comparisons=[];renderComparisons();$('comparison-undo').focus();announce('All comparisons cleared. Use Undo selection change to restore them.');});
  $('comparison-undo').addEventListener('click',()=>{if(comparisonUndo===null)return;const current=comparisons;comparisons=comparisonUndo.map(p=>({...p,notes:current.find(x=>x.id===p.id)?.notes ?? p.notes}));comparisonUndo=null;renderComparisons();$('compare-add').disabled?$('comparison-reset').focus():$('compare-add').focus();announce('Previous comparison restored.');});
  document.querySelectorAll('input[name="screen-method"]').forEach(r=>r.addEventListener('change',updateScreen));
  ['heat-threshold','ndvi-threshold'].forEach(id=>$(id).addEventListener('input',updateScreen));
  $('screen-reset').addEventListener('click',()=>{document.querySelector('input[value="original"]').checked=true;$('heat-threshold').value=1;$('ndvi-threshold').value=.25;updateScreen();});
  $('case-load').addEventListener('click',()=>{rememberComparisons();comparisons=places.filter(p=>['san-pedro','guadalupe'].includes(p.id)).map(p=>({...p,id:nextAreaId++,notes:''}));renderComparisons();savedMapView=null;showSlide(slides.findIndex(s=>s.id==='map-section'));map.fitBounds(comparisonCircles.getBounds(),{padding:[45,45],animate:false});announce('Case study loaded into comparison. Previous comparison selections were replaced.');});
  $('print-brief').addEventListener('click',()=>{renderBrief();document.body.classList.add('printing-brief');window.print();});
  window.addEventListener('afterprint',()=>document.body.classList.remove('printing-brief'));
  $('download-csv').addEventListener('click',()=>{const content=A.toCSV(A.reportRows(grid,comparisons,screening,study.prediction_date));if(!content)return;const url=URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`strata-field-review-${study.prediction_date}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Field-review CSV downloaded.');});
  $('retry-load').addEventListener('click',loadData);
}
async function loadData() {
  $('load-error').hidden=true; $('data-status').hidden=false;
  $('data-status').textContent='Loading satellite observations and places…'; $('explorer-controls').disabled=true;
  try {
    [study,grid,places]=await Promise.all(['heat/study.json','heat/grid.json','places.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error(`Could not load ${url} (HTTP ${r.status}).`);return r.json();}));
    A.validateGrid(grid);
    if(!Array.isArray(places)||places.length!==3||!['san-pedro','sjsu','guadalupe'].every(id=>places.some(p=>p.id===id&&typeof p.name==='string'&&/^https:\/\//.test(p.source)&&A.cellForLocation(grid,p.lat,p.lon))))throw Error('Featured place records are incomplete.');
    chartResults(); renderPlaces(); initMap(); renderComparisons(); renderCaseStudy();
    const x=A.screenSummary(grid,screening); $('screen-summary').textContent=`${format(x.percent)}% of ${x.valid.toLocaleString()} valid display cells meet the original saved screen. The archived source-grid total remains 16.2 km².`;
    $('explorer-controls').disabled=false; $('case-load').disabled=false;
    $('data-status').hidden=true;
  } catch(error) {
    if(map){map.remove();map=null;}
    $('data-status').textContent='Satellite evidence is unavailable. Retry loading before exploring or exporting.';
    $('load-error').hidden=false; $('load-error-message').textContent=`${error.message} Your original study files have not been changed.`;
    $('case-load').disabled=true; $('print-brief').disabled=true; $('download-csv').disabled=true;
    $('ridge-comparison').textContent='Evaluation data is unavailable. Retry loading data.';
    $('error-chart').textContent='Evaluation data could not load.'; $('hotspot-chart').textContent='Evaluation data could not load.';
    $('case-results').textContent='Case-study evidence could not load. No findings are shown.';
  }
}
bindNavigation(); bindExplorer(); loadData();
