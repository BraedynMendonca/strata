(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const DRAFT_KEY = 'strata-school-planner-draft-v1';
  const canopyColor = (value) => value == null ? '#8d9991' : value < 10 ? '#c47737' : value < 25 ? '#a9a34e' : '#448a5c';
  const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const state = {campuses: [], selectedId: null, campusLayer: null, countyLayer: null, markers: new Map(), sources: null, canopySummary: null, currentPlan: null, restoringDraft: false};

  const map = L.map('campus-map', {preferCanvas: true, scrollWheelZoom: false}).setView([37.15, -119.6], 5);
  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  tiles.on('tileerror', () => { $('basemap-status').hidden = false; });
  const canvas = L.canvas({padding: 0.5});
  state.countyLayer = L.layerGroup().addTo(map);
  state.campusLayer = L.layerGroup().addTo(map);

  function countyGroups() {
    const groups = new Map();
    for (const school of state.campuses) {
      if (!groups.has(school.county)) groups.set(school.county, {name: school.county, count: 0, lat: 0, lon: 0});
      const group = groups.get(school.county); group.count++; group.lat += school.coordinates[1]; group.lon += school.coordinates[0];
    }
    return [...groups.values()].map((group) => ({...group, lat: group.lat / group.count, lon: group.lon / group.count}));
  }

  function renderMap() {
    if (!state.campuses.length) return;
    const zoom = map.getZoom();
    state.countyLayer.clearLayers(); state.campusLayer.clearLayers(); state.markers.clear();
    if (zoom < 6) {
      for (const county of state.counties) {
        const radius = Math.max(9, Math.min(17, 7 + Math.sqrt(county.count) * .32));
        const icon = L.divIcon({className: '', html: `<span class="county-marker" style="width:${radius * 2}px;height:${radius * 2}px">${county.count}</span>`, iconSize: [radius * 2, radius * 2], iconAnchor: [radius, radius]});
        const marker = L.marker([county.lat, county.lon], {icon, title: `${county.name} County: ${county.count} campuses`});
        marker.bindTooltip(`${county.name} County: ${county.count} campuses`);
        marker.on('click', () => map.setView([county.lat, county.lon], 7));
        state.countyLayer.addLayer(marker);
      }
      $('map-heading').textContent = 'Explore California';
      return;
    }
    const bounds = map.getBounds().pad(0.16);
    const schools = state.campuses.filter((school) => bounds.contains([school.coordinates[1], school.coordinates[0]]));
    for (const school of schools) {
      const marker = L.circleMarker([school.coordinates[1], school.coordinates[0]], {renderer: canvas, radius: state.selectedId === school.id ? 7 : 3.5, color: '#fff', weight: state.selectedId === school.id ? 2 : 0.8, fillColor: canopyColor(school.studentZoneCanopyPct), fillOpacity: .85, className: state.selectedId === school.id ? 'campus-marker selected' : 'campus-marker'});
      marker.bindTooltip(`${school.name}, ${school.city}`);
      marker.on('click', () => selectSchool(school));
      marker.addTo(state.campusLayer); state.markers.set(school.id, marker);
    }
    $('map-heading').textContent = `${schools.length.toLocaleString()} campuses in this map view`;
  }
  map.on('zoomend moveend', renderMap);
  $('map-reset').addEventListener('click', () => map.setView([37.15, -119.6], 5));

  function resetConstraintValues() {
    $('urgency').value = 'unknown';
    $('existing-shade').value = 'unknown'; $('planting-space').value = 'unknown';
    $('watering').value = 'unknown'; $('maintenance').value = 'unknown'; $('resources').value = 'unknown';
  }

  function selectSchool(school) {
    if (state.selectedId !== school.id) {
      resetConstraintValues();
      for (const id of ['calc-students', 'calc-minutes', 'calc-near-capacity', 'calc-future-capacity']) $(id).value = '';
      $('proposal-notes').value = '';
      state.currentPlan = null;
    }
    state.selectedId = school.id;
    $('planner').hidden = true;
    $('start-planning').setAttribute('aria-expanded', 'false');
    $('evidence').hidden = false;
    $('evidence-title').textContent = school.name;
    $('school-location').textContent = [school.city, school.county ? `${school.county} County` : '', school.district].filter(Boolean).join(', ');
    $('student-canopy').textContent = school.studentZoneCanopyPct == null ? 'Not reported' : `${school.studentZoneCanopyPct}%`;
    $('property-canopy').textContent = school.propertyCanopyPct == null ? 'Not reported' : `${school.propertyCanopyPct}%`;
    for (const [id, value] of [['student-canopy-fill', school.studentZoneCanopyPct], ['property-canopy-fill', school.propertyCanopyPct]]) {
      $(id).parentElement.hidden = value == null;
      $(id).parentElement.parentElement.classList.toggle('canopy-missing', value == null);
      $(id).style.width = `${Math.max(0, Math.min(100, value ?? 0))}%`;
    }
    renderCanopyComparison(school);
    const marker = state.markers.get(school.id);
    if (marker) marker.setStyle({radius: 7, weight: 2});
    $('school-results').querySelectorAll('.result').forEach((button) => button.setAttribute('aria-current', button.dataset.id === school.id ? 'true' : 'false'));
    $('search-status').textContent = `Selected ${school.name}, ${school.city}, ${school.county} County.`;
    renderCalculator(); renderPlan(); renderProposal(); saveDraft();
    if (!state.restoringDraft) {
      $('evidence').scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
      $('evidence-title').focus({preventScroll: true});
    }
  }

  function renderCanopyComparison(school) {
    const result = state.canopySummary?.compare(school.studentZoneCanopyPct);
    if (!result) {
      $('canopy-comparison').textContent = 'Student-use canopy is not reported for this campus, so a statewide comparison is unavailable.';
      return;
    }
    const lowerPercent = Math.round(result.percentLower);
    $('canopy-comparison').textContent = `${school.studentZoneCanopyPct}% student-use canopy. ${result.lower.toLocaleString()} of ${result.reported.toLocaleString()} reporting campuses have less; ${result.equal.toLocaleString()} share this value (${lowerPercent}% have less).`;
  }

  function renderResults(query) {
    const target = $('school-results'); target.replaceChildren(); target.classList.remove('has-results');
    const q = normalize(query);
    $('search-empty').hidden = q.length >= 2;
    if (q.length < 2) { $('search-note').textContent = q.length ? 'Keep typing to find a campus.' : `Search all ${state.campuses.length.toLocaleString()} campuses by name or location.`; $('search-status').textContent = ''; return; }
    const matches = [];
    for (const school of state.campuses) {
      const searchable = normalize(`${school.name} ${school.city} ${school.county} ${school.district}`);
      if (searchable.includes(q)) { matches.push(school); if (matches.length === 50) break; }
    }
    $('school-results').classList.toggle('has-results', matches.length > 0);
    $('search-note').textContent = matches.length ? `Showing ${matches.length === 50 ? 'first 50' : matches.length} matching ${matches.length === 1 ? 'campus' : 'campuses'}. Select one for evidence.` : 'No schools found. Try a city, county, district, or a shorter name.';
    $('search-status').textContent = matches.length ? `${matches.length} matching campuses shown.` : 'No matching campuses.';
    for (const school of matches) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'result'; button.dataset.id = school.id; button.setAttribute('aria-current', school.id === state.selectedId ? 'true' : 'false');
      const title = document.createElement('strong'); title.textContent = school.name;
      const detail = document.createElement('span'); detail.textContent = [school.city, school.county ? `${school.county} County` : '', school.district].filter(Boolean).join(', ');
      button.append(title, detail); button.addEventListener('click', () => {
        selectSchool(school); map.setView([school.coordinates[1], school.coordinates[0]], 11);
      }); target.append(button);
    }
  }
  $('school-search').addEventListener('input', (event) => renderResults(event.target.value));
  document.querySelectorAll('[data-search]').forEach((button) => button.addEventListener('click', () => {
    $('school-search').value = button.dataset.search; renderResults(button.dataset.search); $('school-search').focus();
  }));
  $('clear-selection').addEventListener('click', () => clearDraft());

  const statusLabels = {fit: 'Fits your stated assumptions', confirm: 'Needs confirmation', blocked: 'Not a fit under current answers'};
  function recommendationCard(stage, recommendation) {
    const card = document.createElement('article'); card.className = `recommendation status-${recommendation.status}`;
    const header = document.createElement('div'); header.className = 'recommendation-header';
    const stageName = document.createElement('p'); stageName.className = 'card-kicker'; stageName.textContent = stage;
    const badge = document.createElement('span'); badge.className = `status-badge status-badge-${recommendation.status}`; badge.textContent = statusLabels[recommendation.status];
    header.append(stageName, badge);
    const title = document.createElement('h3'); title.textContent = recommendation.title;
    const timing = document.createElement('p'); timing.className = 'recommendation-timing'; timing.textContent = recommendation.timing || 'Longer-term canopy';
    const explanation = document.createElement('p'); explanation.className = 'recommendation-explanation'; explanation.textContent = recommendation.explanation;
    card.append(header, title, timing, explanation);
    if (recommendation.reasons?.length) {
      const summary = document.createElement('p'); summary.className = 'gate-title'; summary.textContent = 'Planning gates'; card.append(summary);
      const gates = document.createElement('ul'); gates.className = 'gate-list';
      for (const reason of recommendation.reasons) { const item = document.createElement('li'); item.textContent = reason; gates.append(item); }
      card.append(gates);
    }
    const next = document.createElement('p'); next.className = 'recommendation-next';
    const label = document.createElement('strong'); label.textContent = 'School review: ';
    const copy = document.createElement('span'); copy.textContent = recommendation.nextStep;
    next.append(label, copy); card.append(next);
    return card;
  }

  function renderPlan() {
    const answers = {
      urgency: $('urgency').value,
      shade: $('existing-shade').value,
      space: $('planting-space').value,
      water: $('watering').value,
      maintenance: $('maintenance').value,
      resources: $('resources').value
    };
    const plan = window.StrataPlannerRules.recommendPlan(answers);
    state.currentPlan = plan; state.answers = answers;
    const results = $('plan-results'); results.replaceChildren();
    const intro = document.createElement('p'); intro.className = 'plan-for';
    const school = state.campuses.find((entry) => entry.id === state.selectedId);
    intro.textContent = `Planning candidates for ${school?.name || 'selected campus'}, based on your answers above`;
    const stages = document.createElement('div'); stages.className = 'plan-stages';
    stages.append(recommendationCard('NEAR-TERM SHADE', plan.nearTerm), recommendationCard('FUTURE CANOPY', plan.future));
    const assumptions = document.createElement('p'); assumptions.className = 'assumption-note'; assumptions.textContent = plan.assumptions;
    results.append(intro, stages, assumptions);
    renderProposal();
  }

  $('start-planning').addEventListener('click', () => {
    $('planner').hidden = false; $('start-planning').setAttribute('aria-expanded', 'true'); renderPlan();
    saveDraft();
    $('planner').scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
    $('planner-title').focus({preventScroll: true});
  });
  for (const id of ['urgency', 'existing-shade', 'planting-space', 'watering', 'maintenance', 'resources']) {
    $(id).addEventListener('change', () => { renderPlan(); saveDraft(); });
  }
  $('reset-constraints').addEventListener('click', () => {
    resetConstraintValues();
    renderPlan(); saveDraft(); $('urgency').focus();
  });

  const answerLabels = {urgency: 'Urgency', shade: 'Usable shade confirmed', space: 'Tree planting space', water: 'Establishment watering', maintenance: 'Maintenance support', resources: 'Resources'};
  const answerValueLabels = {unknown: 'Not confirmed / not set', yes: 'Yes, confirmed', no: 'No', limited: 'Limited', some: 'Some resources identified', semester: 'This semester', later: 'Planning ahead'};
  const calculatorInputs = ['calc-students', 'calc-minutes', 'calc-near-capacity', 'calc-future-capacity'];

  function getCalculations() {
    const shared = {attendingStudents: $('calc-students').value, activityMinutes: $('calc-minutes').value};
    return {
      near: window.StrataPlannerCalculator.calculateOpportunity({...shared, distinctCapacity: $('calc-near-capacity').value}),
      future: window.StrataPlannerCalculator.calculateOpportunity({...shared, distinctCapacity: $('calc-future-capacity').value})
    };
  }

  function renderOneEstimate(horizon, estimate, result, capacityValue) {
    $(`${horizon}-estimate`).textContent = result.valid ? `${result.studentMinutes.toLocaleString()} student-minutes` : 'Add your assumptions';
    const note = result.valid
      ? `${result.studentsServed.toLocaleString()} of ${result.attendance.toLocaleString()} students × ${result.activityMinutes} minutes${result.capacityCapped ? ' · capacity capped at attendance' : ''}. Hypothetical planning estimate.`
      : (capacityValue.trim() ? result.message : 'Enter a distinct shaded capacity you can support; this is never inferred from canopy.');
    $(`${horizon}-estimate-note`).textContent = note;
  }

  function renderCalculator() {
    if (!state.selectedId) return;
    const calculations = getCalculations();
    renderOneEstimate('near', $('near-estimate'), calculations.near, $('calc-near-capacity').value);
    renderOneEstimate('future', $('future-estimate'), calculations.future, $('calc-future-capacity').value);
    renderProposal();
  }

  function sourceRows() {
    const sources = state.sources || {};
    return [
      ['Campus canopy dataset', sources.campuses?.name || 'Not available', sources.campuses?.studyVintage || 'Study vintage unknown', sources.campuses?.studyUrl || sources.campuses?.serviceUrl || ''],
      ['Statewide canopy benchmark', 'Strata calculation from reported student-use canopy values', `${state.canopySummary?.belowThreshold.toLocaleString() || 0} of ${state.canopySummary?.reported.toLocaleString() || 0} reporting campuses have under 10% student-use canopy`, sources.campuses?.studyUrl || '']
    ];
  }

  function buildProposal() {
    const school = state.campuses.find((entry) => entry.id === state.selectedId);
    if (!school || !state.currentPlan) return null;
    const answers = state.answers || {};
    const calculations = getCalculations();
    return {school, answers, plan: state.currentPlan, calculations, notes: $('proposal-notes').value.trim()};
  }

  function appendText(parent, tag, content, className) {
    const element = document.createElement(tag); element.textContent = content;
    if (className) element.className = className;
    parent.append(element); return element;
  }

  function renderProposal() {
    const proposal = buildProposal();
    const holder = $('proposal-print');
    if (!proposal) { holder.replaceChildren(); holder.hidden = true; return; }
    holder.hidden = true; holder.replaceChildren();
    const school = proposal.school;
    appendText(holder, 'p', 'STRATA · SCHOOL COOLING PLANNER', 'print-kicker');
    appendText(holder, 'h2', 'Shade this semester. Canopy for the future.');
    appendText(holder, 'p', `${school.name} · ${[school.city, school.county ? `${school.county} County` : '', school.district].filter(Boolean).join(', ')} · Proposal prepared ${new Date().toLocaleDateString()}`);
    appendText(holder, 'p', 'This proposal combines public source facts with team-entered assumptions. It is a planning conversation starter and does not document field observations or approvals.');
    appendText(holder, 'h3', 'What the public evidence says');
    const canopy = document.createElement('ul');
    canopy.append(document.createElement('li'), document.createElement('li'));
    canopy.children[0].textContent = `Student-use area canopy, 2024 study layer: ${school.studentZoneCanopyPct == null ? 'not reported' : `${school.studentZoneCanopyPct}%`}.`;
    canopy.children[1].textContent = `Whole-property canopy, 2024 study layer: ${school.propertyCanopyPct == null ? 'not reported' : `${school.propertyCanopyPct}%`}. The footprints are distinct and cannot be subtracted to infer usable shade.`;
    holder.append(canopy);
    const comparison = state.canopySummary?.compare(school.studentZoneCanopyPct);
    appendText(holder, 'p', comparison ? `Statewide canopy context: ${state.canopySummary.belowThreshold.toLocaleString()} of ${state.canopySummary.reported.toLocaleString()} campuses with reported student-use canopy are below 10%. This campus has more reported canopy than ${comparison.lower.toLocaleString()} campuses; ${comparison.equal.toLocaleString()} share its value.` : 'Statewide canopy comparison: unavailable because this campus has no reported student-use canopy value.');
    appendText(holder, 'h3', 'Team-confirmed planning assumptions');
    const assumptions = document.createElement('ul');
    for (const [key, label] of Object.entries(answerLabels)) {
      const item = document.createElement('li'); item.textContent = `${label}: ${answerValueLabels[proposal.answers[key]] || proposal.answers[key] || 'Not confirmed'}.`; assumptions.append(item);
    }
    holder.append(assumptions);
    appendText(holder, 'h3', 'Two-stage proposal');
    const stages = document.createElement('ul');
    for (const [name, recommendation] of [['Near-term shade', proposal.plan.nearTerm], ['Future canopy', proposal.plan.future]]) {
      const item = document.createElement('li');
      item.textContent = `${name}: ${recommendation.title} — ${statusLabels[recommendation.status]}. ${recommendation.explanation} School review: ${recommendation.nextStep}${recommendation.reasons?.length ? ` Planning gates: ${recommendation.reasons.join('; ')}` : ''}`;
      stages.append(item);
    }
    holder.append(stages);
    appendText(holder, 'h3', 'Optional shade-opportunity estimates');
    appendText(holder, 'p', 'Hypothetical planning estimates use min(students present, distinct shaded capacity) × activity minutes. Near-term and future horizons are separate and are not added together. No capacity is inferred from canopy.');
    const calcList = document.createElement('ul');
    for (const [label, result] of [['Near-term', proposal.calculations.near], ['Future', proposal.calculations.future]]) {
      const item = document.createElement('li'); item.textContent = result.valid ? `${label}: ${result.studentMinutes.toLocaleString()} student-minutes (${result.studentsServed} students × ${result.activityMinutes} minutes; distinct capacity ${result.distinctCapacity}).` : `${label}: estimate not provided.`; calcList.append(item);
    }
    holder.append(calcList);
    if (proposal.notes) { appendText(holder, 'h3', 'Team notes and questions'); appendText(holder, 'p', proposal.notes); }
    appendText(holder, 'h3', 'Sources and limits');
    const sourceList = document.createElement('ul');
    for (const [label, title, vintage, url] of sourceRows()) {
      const item = document.createElement('li'); item.className = 'print-source'; item.textContent = `${label}: ${title}. ${vintage}. ${url}`; sourceList.append(item);
    }
    holder.append(sourceList);
    appendText(holder, 'p', 'No field observations, participant results, measured cooling, health benefits, or emissions savings are reported. Trees, shade locations, structures, and schedule changes need appropriate school confirmation and review.');
    holder.hidden = false;
  }

  function saveDraft() {
    if (state.restoringDraft) return;
    if (!state.selectedId) return;
    try {
      const draft = {version: 1, savedAt: new Date().toISOString(), campusId: state.selectedId, plannerOpen: !$('planner').hidden,
        answers: Object.fromEntries(['urgency','existing-shade','planting-space','watering','maintenance','resources'].map((id) => [id, $(id).value])),
        calculator: Object.fromEntries(calculatorInputs.map((id) => [id, $(id).value])), notes: $('proposal-notes').value};
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      $('draft-status').textContent = 'Draft saved on this device. It is not uploaded.';
    } catch {
      $('draft-status').textContent = 'This browser could not save the draft. You can still download the proposal or CSV.';
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    state.restoringDraft = true; state.selectedId = null; state.currentPlan = null;
    resetConstraintValues(); for (const id of calculatorInputs) $(id).value = ''; $('proposal-notes').value = '';
    $('evidence').hidden = true; $('planner').hidden = true; $('start-planning').setAttribute('aria-expanded', 'false');
    $('proposal-print').replaceChildren(); $('proposal-print').hidden = true;
    for (const id of ['near-estimate', 'future-estimate']) $(id).textContent = 'Add your assumptions';
    for (const id of ['near-estimate-note', 'future-estimate-note']) $(id).textContent = 'Hypothetical planning estimate; no field capacity is known.';
    $('draft-status').textContent = 'Saved draft cleared from this device.';
    state.restoringDraft = false; renderMap(); renderResults($('school-search').value); $('school-search').focus();
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!draft || draft.version !== 1) return;
      const school = state.campuses.find((entry) => entry.id === draft.campusId);
      if (!school) { localStorage.removeItem(DRAFT_KEY); return; }
      state.restoringDraft = true;
      selectSchool(school);
      const allowedAnswers = {urgency:['unknown','semester','later'], 'existing-shade':['unknown','yes','no'], 'planting-space':['unknown','yes','no'], watering:['unknown','yes','limited','no'], maintenance:['unknown','yes','limited','no'], resources:['unknown','limited','some','yes']};
      for (const [id, value] of Object.entries(draft.answers || {})) if (allowedAnswers[id]?.includes(value)) $(id).value = value;
      for (const id of calculatorInputs) { const value = draft.calculator?.[id]; if (value === '' || (typeof value === 'string' && /^\d{1,6}$/.test(value))) $(id).value = value; }
      $('proposal-notes').value = typeof draft.notes === 'string' ? draft.notes.slice(0, 1200) : '';
      if (draft.plannerOpen === true) $('planner').hidden = false;
      $('start-planning').setAttribute('aria-expanded', String(!$('planner').hidden));
      if (!$('planner').hidden) renderPlan();
      renderCalculator(); renderProposal();
      $('draft-status').textContent = `Draft restored from this device${draft.savedAt ? ` · saved ${new Date(draft.savedAt).toLocaleString()}` : ''}.`;
      state.restoringDraft = false;
    } catch {
      state.restoringDraft = false;
      $('draft-status').textContent = 'A saved draft could not be read. Clear it and start again.';
    }
  }

  function downloadFile(name, contents, type) {
    const url = URL.createObjectURL(new Blob([contents], {type}));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCSV() {
    const proposal = buildProposal(); if (!proposal) return;
    const {school, answers, plan, calculations} = proposal;
    const rows = [['section','field','value','source_or_definition'],
      ['campus','name',school.name,'Public campus source record'],
      ['campus','location',[school.city, school.county, school.district].filter(Boolean).join(', '),'Public campus source record'],
      ['source fact','student-use area canopy',school.studentZoneCanopyPct == null ? 'Not reported' : `${school.studentZoneCanopyPct}%`,'2024 study layer; imagery acquisition date unspecified'],
      ['source fact','whole-property canopy',school.propertyCanopyPct == null ? 'Not reported' : `${school.propertyCanopyPct}%`,'2024 study layer; distinct footprint, not subtractable for usable shade'],
      ['derived metric','California campuses under 10% student-use canopy',`${state.canopySummary?.belowThreshold ?? 'Unavailable'} of ${state.canopySummary?.reported ?? 'Unavailable'}`, 'Calculated from valid 2024 study records; missing values excluded'],
      ['derived metric','campuses with less student-use canopy',state.canopySummary?.compare(school.studentZoneCanopyPct)?.lower ?? 'Unavailable', 'Strictly lower reported values in the California campus dataset; ties reported separately']];
    for (const [key, label] of Object.entries(answerLabels)) rows.push(['user assumption',label,answerValueLabels[answers[key]] || answers[key] || 'Not confirmed','Entered by team for this campus']);
    for (const [label, recommendation] of [['near-term',plan.nearTerm],['future',plan.future]]) {
      rows.push(['recommendation',`${label} action`,recommendation.title,'Explainable planning candidate; school approval required']);
      rows.push(['recommendation',`${label} status`,statusLabels[recommendation.status],recommendation.explanation]);
      rows.push(['recommendation',`${label} review`,recommendation.nextStep,(recommendation.reasons || []).join('; ')]);
    }
    rows.push(['calculator','students present',$('calc-students').value || 'Not provided','User-entered attendance']);
    rows.push(['calculator','activity duration minutes',$('calc-minutes').value || 'Not provided','User-entered activity duration']);
    for (const [label, result] of [['near-term',calculations.near],['future',calculations.future]]) {
      rows.push(['hypothetical estimate',`${label} distinct shaded capacity`,result.valid ? result.distinctCapacity : 'Not provided','User-entered; never inferred from canopy']);
      rows.push(['hypothetical estimate',`${label} student-minutes`,result.valid ? result.studentMinutes : 'Not calculated','min(students present, distinct capacity) × activity minutes']);
    }
    rows.push(['boundary','horizons','Separate; not additive','No measured cooling, health, or emissions result']);
    rows.push(['team note','notes',proposal.notes || 'None','User-entered note']);
    for (const [label, title, vintage, url] of sourceRows()) rows.push(['source',label,title,`${vintage} · ${url}`]);
    rows.push(['provenance','snapshot retrieved',state.sources?.retrievedAt || 'Unknown','Source metadata']);
    downloadFile('strata-school-proposal.csv', window.StrataPlannerExports.toCSV(rows), 'text/csv;charset=utf-8');
  }

  for (const id of calculatorInputs) $(id).addEventListener('input', () => { renderCalculator(); saveDraft(); });
  $('proposal-notes').addEventListener('input', saveDraft);
  $('print-proposal').addEventListener('click', () => { renderProposal(); window.print(); });
  $('download-csv').addEventListener('click', downloadCSV);
  $('clear-draft').addEventListener('click', clearDraft);

  document.querySelectorAll('a[href="#explore"]').forEach((link) => link.addEventListener('click', () => $('school-search').focus({preventScroll: true})));
  $('retry-data').addEventListener('click', load);
  async function load() {
    $('search-error').hidden = true;
    $('search-empty').hidden = false;
    $('school-search').disabled = true;
    document.querySelectorAll('[data-search]').forEach((button) => { button.disabled = true; });
    $('search-note').textContent = 'Loading school records…';
    try {
      const [campusesResponse, sourcesResponse] = await Promise.all([fetch('planner/campuses.json'), fetch('planner/sources.json')]);
      if (!campusesResponse.ok || !sourcesResponse.ok) throw new Error('School dataset is unavailable.');
      const [campusesData, sources] = await Promise.all([campusesResponse.json(), sourcesResponse.json()]);
      if (!Array.isArray(campusesData.campuses) || campusesData.campuses.length === 0) throw new Error('School dataset is empty.');
      state.campuses = campusesData.campuses; state.sources = sources; state.counties = countyGroups();
      state.canopySummary = window.StrataCanopyComparison.create(state.campuses);
      $('statewide-low-canopy').textContent = `${Math.round(state.canopySummary.belowThresholdPercent)}%`;
      $('campus-total').textContent = state.campuses.length.toLocaleString();
      $('school-search').disabled = false;
      document.querySelectorAll('[data-search]').forEach((button) => { button.disabled = false; });
      renderResults($('school-search').value);
      renderMap();
      restoreDraft();
    } catch (error) {
      $('campus-total').textContent = '—';
      $('search-empty').hidden = true;
      $('search-error').hidden = false;
      $('search-error-message').textContent = 'School records couldn’t be loaded. Try again, or explore the San José research.';
      $('search-note').textContent = 'School search is temporarily unavailable.';
      $('search-status').textContent = error.message;
    }
  }
  load();
})();
