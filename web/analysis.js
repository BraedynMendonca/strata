/* Pure display-grid calculations. No model inference or intervention estimates. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StrataAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EARTH_M = 6371008.8;
  const RADIUS_M = 300;
  const DEFAULT_SCREEN = Object.freeze({mode: 'original', heat: 1, ndvi: 0.25});
  const rad = d => d * Math.PI / 180;
  function validateGrid(g) {
    if (!g || !Array.isArray(g.bounds) || g.bounds.length !== 4 || !g.bounds.every(Number.isFinite) ||
        !(g.bounds[0] < g.bounds[2] && g.bounds[1] < g.bounds[3]) ||
        !Array.isArray(g.shape) || g.shape.length !== 2 || !g.shape.every(n => Number.isInteger(n) && n > 0)) throw Error('Invalid satellite grid geometry.');
    for (const key of ['predicted_c', 'observed_c', 'ndvi', 'priority']) {
      if (!Array.isArray(g[key]) || g[key].length !== g.shape[0] ||
          g[key].some(row => !Array.isArray(row) || row.length !== g.shape[1])) throw Error('Incomplete satellite grid: ' + key);
    }
    return g;
  }
  function validCell(g, r, c) {
    const p = g.predicted_c[r][c], o = g.observed_c[r][c], n = g.ndvi[r][c];
    return Number.isFinite(p) && Number.isFinite(o) && Number.isFinite(n) && p !== -999 && o !== -999 && n !== -9;
  }
  function cellCenter(g, r, c) {
    const [w, s, e, n] = g.bounds;
    return {lat: n - (r + 0.5) * (n - s) / g.shape[0], lon: w + (c + 0.5) * (e - w) / g.shape[1]};
  }
  function cellForLocation(g, lat, lon) {
    const [w, s, e, n] = g.bounds;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat > n || lat <= s || lon < w || lon >= e) return null;
    return {r: Math.floor((n - lat) / (n - s) * g.shape[0]), c: Math.floor((lon - w) / (e - w) * g.shape[1])};
  }
  function distanceM(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_M * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  function qualifies(g, r, c, screen = DEFAULT_SCREEN) {
    if (!validCell(g, r, c)) return false;
    if (screen.mode === 'original') return g.priority[r][c] === 1;
    // np.round(...).tolist() retains float32 representation noise in the JSON.
    // Compare at the advertised display precision, not e.g. 0.349999994 < 0.35.
    const predicted = Math.round(g.predicted_c[r][c] * 10) / 10;
    const ndvi = Math.round(g.ndvi[r][c] * 100) / 100;
    return predicted > 0 && predicted >= screen.heat && ndvi < screen.ndvi;
  }
  function circleCrossesBoundary(g, center, radius = RADIUS_M) {
    const dLat = radius / EARTH_M * 180 / Math.PI;
    const dLon = Math.asin(Math.min(1, Math.sin(radius / EARTH_M) / Math.cos(rad(center.lat)))) * 180 / Math.PI;
    const [w, s, e, n] = g.bounds;
    return center.lat - dLat < s || center.lat + dLat > n || center.lon - dLon < w || center.lon + dLon > e;
  }
  function summarizeCircle(g, center, screen = DEFAULT_SCREEN, radius = RADIUS_M) {
    let total = 0, valid = 0, flagged = 0, pred = 0, obs = 0, ndvi = 0;
    const [w, s, e, n] = g.bounds, [h, width] = g.shape;
    const dy = radius / EARTH_M * 180 / Math.PI;
    const dx = Math.asin(Math.min(1, Math.sin(radius / EARTH_M) / Math.cos(rad(center.lat)))) * 180 / Math.PI;
    const r0 = Math.max(0, Math.floor((n - center.lat - dy) / (n - s) * h));
    const r1 = Math.min(h - 1, Math.floor((n - center.lat + dy) / (n - s) * h));
    const c0 = Math.max(0, Math.floor((center.lon - dx - w) / (e - w) * width));
    const c1 = Math.min(width - 1, Math.floor((center.lon + dx - w) / (e - w) * width));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (distanceM(center, cellCenter(g, r, c)) > radius) continue;
      total++;
      if (!validCell(g, r, c)) continue;
      valid++; pred += g.predicted_c[r][c]; obs += g.observed_c[r][c]; ndvi += g.ndvi[r][c];
      if (qualifies(g, r, c, screen)) flagged++;
    }
    const coverage = total ? valid / total : 0;
    const crossesBoundary = circleCrossesBoundary(g, center, radius);
    const eligible = !crossesBoundary && total > 0 && coverage >= 0.8;
    const reason = crossesBoundary ? 'The 300 m circle crosses the study boundary.' : coverage < 0.8 ? 'Fewer than 80% of display cells have valid observations.' : '';
    return {radius, total, valid, coverage, crossesBoundary, eligible, reason,
      predicted: eligible ? pred / valid : null, observed: eligible ? obs / valid : null,
      ndvi: eligible ? ndvi / valid : null, flaggedPercent: eligible ? flagged / valid * 100 : null};
  }
  function screenSummary(g, screen = DEFAULT_SCREEN) {
    let valid = 0, flagged = 0;
    for (let r = 0; r < g.shape[0]; r++) for (let c = 0; c < g.shape[1]; c++) {
      if (!validCell(g, r, c)) continue;
      valid++; if (qualifies(g, r, c, screen)) flagged++;
    }
    return {valid, flagged, percent: valid ? flagged / valid * 100 : null};
  }
  function screenLabel(screen) {
    return screen.mode === 'original' ? 'Original study screen: saved mask; upper quartile of positive modeled heat, source NDVI < 0.25' :
      `Custom display-grid screen: modeled anomaly > 0 and >= ${screen.heat.toFixed(1)} C; NDVI < ${screen.ndvi.toFixed(2)}`;
  }
  function reportRows(g, areas, screen, date) {
    return areas.map(area => {
      const x = summarizeCircle(g, area, screen);
      return {location: area.name, latitude: area.lat, longitude: area.lon, acquisition_date: date,
        radius_m: x.radius, mean_modeled_anomaly_c: x.predicted === null ? '' : x.predicted.toFixed(1),
        mean_observed_anomaly_c: x.observed === null ? '' : x.observed.toFixed(1),
        mean_ndvi: x.ndvi === null ? '' : x.ndvi.toFixed(2), qualifying_valid_display_cells_percent: x.flaggedPercent === null ? '' : x.flaggedPercent.toFixed(1),
        coverage_percent_within_grid: (x.coverage * 100).toFixed(1), valid_display_cells: x.valid, total_display_cells_within_grid: x.total,
        crosses_study_boundary: x.crossesBoundary, status: x.eligible ? 'Suitable coverage for area summary' : 'Withheld: ' + x.reason,
        screening_mode: screen.mode, screening_criteria: screenLabel(screen),
        map_resolution_note: 'Rounded display-grid samples; thermal observations approximately 100 m native; not independent samples',
        temperature_reference: 'Degrees above or below acquisition median surface temperature; not air temperature',
        notes: area.notes || '', source_url: area.source || '',
        interpretation: 'Exploratory field review only; no planting feasibility, cooling effect or emissions reduction established'};
    });
  }
  function toCSV(rows) {
    if (!rows.length) return '';
    const keys = Object.keys(rows[0]);
    const quote = value => {
      let s = String(value ?? '');
      // User notes may be opened in spreadsheet software. Prevent formula execution.
      if (/^[\s]*[=+@-]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    return [keys, ...rows.map(row => keys.map(k => row[k]))].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
  }
  return {RADIUS_M, DEFAULT_SCREEN, validateGrid, validCell, cellCenter, cellForLocation, distanceM, circleCrossesBoundary, qualifies, summarizeCircle, screenSummary, screenLabel, reportRows, toCSV};
});
