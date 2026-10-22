(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canopyColor = (value) => value == null ? '#8d9991' : value < 10 ? '#c47737' : value < 25 ? '#a9a34e' : '#448a5c';
  const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const state = {campuses: [], selectedId: null, campusLayer: null, countyLayer: null, markers: new Map(), sources: null};

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
    const zoom = map.getZoom();
    state.countyLayer.clearLayers(); state.campusLayer.clearLayers(); state.markers.clear();
    if (zoom < 6) {
      for (const county of state.counties) {
        const radius = Math.max(13, Math.min(24, 10 + Math.sqrt(county.count) * 1.45));
        const icon = L.divIcon({className: '', html: `<span class="county-marker" style="width:${radius * 2}px;height:${radius * 2}px">${county.count}</span>`, iconSize: [radius * 2, radius * 2], iconAnchor: [radius, radius]});
        const marker = L.marker([county.lat, county.lon], {icon, title: `${county.name} County: ${county.count} campuses`});
        marker.bindTooltip(`${county.name} County · ${county.count} campuses`);
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
      marker.bindTooltip(`${school.name} · ${school.city}`);
      marker.on('click', () => selectSchool(school));
      marker.addTo(state.campusLayer); state.markers.set(school.id, marker);
    }
    $('map-heading').textContent = `${schools.length.toLocaleString()} campuses in this map view`;
  }
  map.on('zoomend moveend', renderMap);
  $('map-reset').addEventListener('click', () => map.setView([37.15, -119.6], 5));

  function selectSchool(school) {
    state.selectedId = school.id;
    $('evidence').hidden = false;
    $('evidence-title').textContent = school.name;
    $('school-location').textContent = [school.city, school.county ? `${school.county} County` : '', school.district].filter(Boolean).join(' · ');
    $('student-canopy').textContent = school.studentZoneCanopyPct == null ? 'Not reported' : `${school.studentZoneCanopyPct}%`;
    $('property-canopy').textContent = school.propertyCanopyPct == null ? 'Not reported' : `${school.propertyCanopyPct}%`;
    renderForecast(school);
    const marker = state.markers.get(school.id);
    if (marker) marker.setStyle({radius: 7, weight: 2});
    $('school-results').querySelectorAll('.result').forEach((button) => button.setAttribute('aria-current', button.dataset.id === school.id ? 'true' : 'false'));
    $('search-status').textContent = `Selected ${school.name}, ${school.city}, ${school.county} County.`;
    if (window.innerWidth < 760) $('evidence').scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function renderForecast(school) {
    const forecast = school.heatForecast;
    $('heat-zip').textContent = forecast?.zip || 'unavailable';
    const holder = $('forecast-days'); holder.replaceChildren();
    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
    const expired = !forecast?.date || forecast.date < today;
    if (!forecast || expired || !Array.isArray(forecast.days)) {
      $('forecast-title').textContent = expired ? 'Forecast unavailable or expired' : 'Forecast unavailable';
      $('forecast-status').textContent = expired && forecast?.date ? `The saved ZIP forecast began ${forecast.date} and is no longer current. Refresh source data to see a new forecast.` : 'No current ZIP forecast is available for this campus.';
      $('forecast-status').hidden = false; return;
    }
    $('forecast-title').textContent = 'Daily heat-health forecast';
    $('forecast-status').textContent = `Daily community ZIP forecast · snapshot ${forecast.date}. Values are forecast categories, not measured temperatures.`;
    $('forecast-status').hidden = false;
    const start = new Date(`${forecast.date}T12:00:00Z`);
    forecast.days.forEach((score, index) => {
      const day = new Date(start); day.setUTCDate(day.getUTCDate() + index);
      const label = new Intl.DateTimeFormat('en-US', {weekday: 'short', timeZone: 'UTC'}).format(day);
      const box = document.createElement('div'); box.className = `forecast-day${score == null ? ' unavailable' : ''}`;
      const name = document.createElement('span'); name.textContent = label;
      const value = document.createElement('strong'); value.textContent = score == null ? 'N/A' : `Level ${score}`;
      box.append(name, value); holder.append(box);
    });
  }

  function renderResults(query) {
    const target = $('school-results'); target.replaceChildren();
    const q = normalize(query);
    if (q.length < 2) { $('search-note').textContent = 'Type at least 2 letters to find a campus.'; return; }
    const matches = [];
    for (const school of state.campuses) {
      const searchable = normalize(`${school.name} ${school.city} ${school.county} ${school.district}`);
      if (searchable.includes(q)) { matches.push(school); if (matches.length === 50) break; }
    }
    $('search-note').textContent = matches.length ? `Showing ${matches.length === 50 ? 'first 50' : matches.length} matching campuses. Select one for evidence.` : 'No schools found. Try a city, county, district, or a shorter name.';
    $('search-status').textContent = matches.length ? `${matches.length} matching campuses shown.` : 'No matching campuses.';
    for (const school of matches) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'result'; button.dataset.id = school.id; button.setAttribute('aria-current', school.id === state.selectedId ? 'true' : 'false');
      const title = document.createElement('strong'); title.textContent = school.name;
      const detail = document.createElement('span'); detail.textContent = [school.city, school.county ? `${school.county} County` : '', school.district].filter(Boolean).join(' · ');
      button.append(title, detail); button.addEventListener('click', () => {
        selectSchool(school); map.setView([school.coordinates[1], school.coordinates[0]], 11);
      }); target.append(button);
    }
  }
  $('school-search').addEventListener('input', (event) => renderResults(event.target.value));
  $('clear-selection').addEventListener('click', () => { state.selectedId = null; $('evidence').hidden = true; renderMap(); $('school-search').focus(); });

  async function load() {
    try {
      const [campusesResponse, sourcesResponse] = await Promise.all([fetch('planner/campuses.json'), fetch('planner/sources.json')]);
      if (!campusesResponse.ok || !sourcesResponse.ok) throw new Error('School dataset is unavailable.');
      const [campusesData, sources] = await Promise.all([campusesResponse.json(), sourcesResponse.json()]);
      if (!Array.isArray(campusesData.campuses) || campusesData.campuses.length === 0) throw new Error('School dataset is empty.');
      state.campuses = campusesData.campuses; state.sources = sources; state.counties = countyGroups();
      $('campus-total').textContent = state.campuses.length.toLocaleString();
      renderMap();
    } catch (error) {
      $('campus-total').textContent = '—';
      $('search-note').textContent = `${error.message} School search is unavailable; use the San José research link above.`;
      $('search-status').textContent = error.message;
    }
  }
  load();
})();
