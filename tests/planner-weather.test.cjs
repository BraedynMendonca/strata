const test = require('node:test');
const assert = require('node:assert/strict');
const weather = require('../web/planner-weather.js');

const sample = {
  timezone: 'America/Los_Angeles', latitude: 37.7, longitude: -121.9,
  daily: {
    time: ['2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27','2026-10-28','2026-10-29'],
    temperature_2m_max: [78, 81, 84, 76, 73, 79, 82]
  }
};

test('weather request uses the selected campus coordinates and daily highs in Fahrenheit', () => {
  const url = new URL(weather.makeQueryUrl(37.7, -121.9));
  assert.equal(url.searchParams.get('latitude'), '37.7');
  assert.equal(url.searchParams.get('longitude'), '-121.9');
  assert.equal(url.searchParams.get('daily'), 'temperature_2m_max');
  assert.equal(url.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.equal(url.searchParams.get('forecast_days'), '7');
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.throws(() => weather.makeQueryUrl(92, -121.9), /latitude/);
  assert.throws(() => weather.makeQueryUrl(37.7, -181), /longitude/);
});

test('normalizes seven location-specific forecast highs and preserves unavailable values', () => {
  const normalized = weather.normalizeWeather({...sample, daily: {...sample.daily, temperature_2m_max: [78, null, 84, 76, 73, 79, 82]}});
  assert.equal(normalized.timezone, 'America/Los_Angeles');
  assert.deepEqual(normalized.highs, [78, null, 84, 76, 73, 79, 82]);
  assert.equal(normalized.dates.length, 7);
});

test('rejects incomplete or invalid forecast responses instead of showing fabricated values', () => {
  assert.throws(() => weather.normalizeWeather({daily: {time: [], temperature_2m_max: []}}), /complete seven-day/);
  assert.throws(() => weather.normalizeWeather({...sample, daily: {...sample.daily, time: ['bad', ...sample.daily.time.slice(1)]}}), /invalid forecast date/);
  assert.throws(() => weather.normalizeWeather({...sample, daily: {...sample.daily, temperature_2m_max: [78, 81, 'hot', 76, 73, 79, 82]}}), /invalid forecast temperature/);
});

test('fetches fresh data and surfaces service errors', async () => {
  let requestedUrl;
  let options;
  const result = await weather.fetchWeather(37.7, -121.9, async (url, requestOptions) => {
    requestedUrl = url; options = requestOptions;
    return {ok: true, json: async () => sample};
  });
  assert.equal(result.highs[2], 84);
  assert.match(requestedUrl, /api\.open-meteo\.com/);
  assert.equal(options.cache, 'no-store');
  await assert.rejects(weather.fetchWeather(37.7, -121.9, async () => ({ok: false, status: 503})), /HTTP 503/);
  await assert.rejects(weather.fetchWeather(37.7, -121.9, async () => ({ok: true, json: async () => ({error: true, reason: 'paused'})})), /paused/);
});
