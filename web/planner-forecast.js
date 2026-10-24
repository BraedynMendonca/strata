(function attachStrataForecast(global) {
  'use strict';

  const ENDPOINT = 'https://services1.arcgis.com/PCHfdHz4GlDNAhBb/arcgis/rest/services/CalHeatScore_Live_Data_for_API_Use/FeatureServer/0/query';
  const CACHE_KEY = 'strata-daily-zip-forecast-v1';
  const FIELDS = ['ZIP_CODE', 'DATE', ...Array.from({length: 7}, (_, index) => `CHS_Day_${index}`)];
  const FINAL_DAILY_REFRESH_MINUTE = 8 * 60 + 5;

  function pacificParts(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(value);
    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  }

  function pacificDate(value = new Date()) {
    const parts = pacificParts(value);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  function isCacheFresh(entry, now = new Date()) {
    if (!entry?.forecast || !entry.fetchedAt) return false;
    const today = pacificDate(now);
    const fetchedAt = new Date(entry.fetchedAt);
    if (Number.isNaN(fetchedAt.getTime()) || entry.forecast.date !== today || pacificDate(fetchedAt) !== today) return false;
    const current = pacificParts(now);
    const fetched = pacificParts(fetchedAt);
    const currentMinute = current.hour * 60 + current.minute;
    const fetchedMinute = fetched.hour * 60 + fetched.minute;
    return currentMinute < FINAL_DAILY_REFRESH_MINUTE || fetchedMinute >= FINAL_DAILY_REFRESH_MINUTE;
  }

  function makeQueryUrl(zip) {
    const normalized = String(zip ?? '').trim();
    if (!/^\d{5}$/.test(normalized)) throw new Error('A five-digit campus ZIP code is required for the heat forecast.');
    const params = new URLSearchParams({
      where: `ZIP_CODE='${normalized}'`, outFields: FIELDS.join(','), returnGeometry: 'false', f: 'json'
    });
    return `${ENDPOINT}?${params}`;
  }

  function normalizeForecast(attributes, expectedZip) {
    const zip = String(attributes?.ZIP_CODE ?? '').trim();
    const date = String(attributes?.DATE ?? '').trim();
    if (zip !== String(expectedZip) || !/^\d{5}$/.test(zip)) throw new Error('The heat service returned a different ZIP code than requested.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      throw new Error('The heat service returned an invalid forecast date.');
    }
    const days = Array.from({length: 7}, (_, index) => {
      const raw = attributes[`CHS_Day_${index}`];
      if (raw === null || raw === undefined || raw === '') return null;
      const score = Number(raw);
      if (!Number.isInteger(score) || score < 0 || score > 4) throw new Error(`The heat service returned an invalid score for day ${index}.`);
      return score;
    });
    return {zip, date, days};
  }

  function readCache(storage, zip) {
    try {
      const cache = JSON.parse(storage?.getItem(CACHE_KEY) || '{}');
      return cache[zip] || null;
    } catch {
      return null;
    }
  }

  function writeCache(storage, zip, entry) {
    try {
      const cache = JSON.parse(storage?.getItem(CACHE_KEY) || '{}');
      cache[zip] = entry;
      storage?.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Storage can be disabled; live retrieval still works without a cache.
    }
  }

  async function fetchForecast(zip, fetchImpl = global.fetch) {
    const response = await fetchImpl(makeQueryUrl(zip), {headers: {Accept: 'application/json'}});
    if (!response.ok) throw new Error(`The heat service returned HTTP ${response.status}.`);
    const data = await response.json();
    if (data?.error) throw new Error(data.error.message || 'The heat service could not complete the request.');
    if (!Array.isArray(data?.features) || data.features.length !== 1) throw new Error('No current forecast was returned for this ZIP code.');
    return normalizeForecast(data.features[0]?.attributes, zip);
  }

  async function getForecast(zip, options = {}) {
    const normalized = String(zip ?? '').trim();
    let defaultStorage = null;
    if (options.storage === undefined) {
      try { defaultStorage = global.localStorage; } catch { /* Storage may be disabled by the browser. */ }
    }
    const storage = options.storage ?? defaultStorage;
    const now = options.now ?? new Date();
    const cached = readCache(storage, normalized);
    if (isCacheFresh(cached, now)) return cached.forecast;
    const forecast = await fetchForecast(normalized, options.fetchImpl ?? global.fetch);
    writeCache(storage, normalized, {forecast, fetchedAt: now.toISOString()});
    return forecast;
  }

  global.StrataForecast = {pacificDate, isCacheFresh, makeQueryUrl, normalizeForecast, fetchForecast, getForecast};
})(typeof window === 'undefined' ? globalThis : window);
