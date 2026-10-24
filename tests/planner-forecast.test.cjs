const test = require('node:test');
const assert = require('node:assert/strict');
require('../web/planner-forecast.js');
const forecast = globalThis.StrataForecast;

function storageStub(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
}

test('daily CalHeatScore query is ZIP-specific and requests all seven scores without geometry', () => {
  const url = new URL(forecast.makeQueryUrl('94568'));
  assert.match(url.searchParams.get('where'), /ZIP_CODE='94568'/);
  assert.match(url.searchParams.get('outFields'), /CHS_Day_6/);
  assert.equal(url.searchParams.get('returnGeometry'), 'false');
  assert.throws(() => forecast.makeQueryUrl('bad'), /five-digit/);
});

test('ArcGIS string scores are normalized and nulls stay unavailable', () => {
  const actual = forecast.normalizeForecast({ZIP_CODE: '94568', DATE: '2026-10-23', CHS_Day_0: '2', CHS_Day_1: null, CHS_Day_2: '0', CHS_Day_3: '4', CHS_Day_4: '1', CHS_Day_5: '3', CHS_Day_6: '0'}, '94568');
  assert.deepEqual(actual, {zip: '94568', date: '2026-10-23', days: [2, null, 0, 4, 1, 3, 0]});
  assert.throws(() => forecast.normalizeForecast({ZIP_CODE: '94568', DATE: '2026-10-23', CHS_Day_0: '5'}, '94568'), /invalid score/);
  assert.throws(() => forecast.normalizeForecast({ZIP_CODE: '95814', DATE: '2026-10-23'}, '94568'), /different ZIP/);
});

test('cache is reused during the day and refreshed after the official 8:00 a.m. Pacific update', () => {
  const storage = storageStub();
  const old = {forecast: {zip: '94568', date: '2026-10-22', days: [0, 0, 0, 0, 0, 0, 0]}, fetchedAt: '2026-10-22T18:00:00.000Z'};
  storage.setItem('strata-daily-zip-forecast-v1', JSON.stringify({'94568': old}));
  assert.equal(forecast.isCacheFresh(old, new Date('2026-10-23T15:00:00.000Z')), false);
  const beforeFinalUpdate = {forecast: {zip: '94568', date: '2026-10-23', days: [0, 0, 0, 0, 0, 0, 0]}, fetchedAt: '2026-10-23T14:00:00.000Z'};
  assert.equal(forecast.isCacheFresh(beforeFinalUpdate, new Date('2026-10-23T14:30:00.000Z')), true);
  assert.equal(forecast.isCacheFresh(beforeFinalUpdate, new Date('2026-10-23T16:30:00.000Z')), false);
  const afterFinalUpdate = {...beforeFinalUpdate, fetchedAt: '2026-10-23T16:15:00.000Z'};
  assert.equal(forecast.isCacheFresh(afterFinalUpdate, new Date('2026-10-23T16:30:00.000Z')), true);
});

test('live response errors are surfaced and an older-dated response is never made current', async () => {
  const fetchImpl = async () => ({ok: true, json: async () => ({features: [{attributes: {ZIP_CODE: '94568', DATE: '2026-10-22', CHS_Day_0: '0'}}]})});
  const actual = await forecast.fetchForecast('94568', fetchImpl);
  assert.equal(actual.date, '2026-10-22');
  assert.equal(forecast.isCacheFresh({forecast: actual, fetchedAt: '2026-10-23T17:00:00.000Z'}, new Date('2026-10-23T18:00:00.000Z')), false);
  await assert.rejects(forecast.fetchForecast('94568', async () => ({ok: true, json: async () => ({error: {message: 'service paused'}})})), /service paused/);
});

test('fresh same-day ZIP data avoids another request', async () => {
  const storage = storageStub();
  storage.setItem('strata-daily-zip-forecast-v1', JSON.stringify({'94568': {
    forecast: {zip: '94568', date: '2026-10-23', days: [1, 0, 0, 0, 0, 0, 0]},
    fetchedAt: '2026-10-23T16:20:00.000Z'
  }}));
  const actual = await forecast.getForecast('94568', {storage, now: new Date('2026-10-23T17:00:00.000Z'), fetchImpl: async () => { throw new Error('should use cache'); }});
  assert.equal(actual.date, '2026-10-23');
});

test('old cached ZIP forecasts are replaced by today’s live response', async () => {
  const storage = storageStub();
  storage.setItem('strata-daily-zip-forecast-v1', JSON.stringify({'94568': {
    forecast: {zip: '94568', date: '2026-10-22', days: [0, 0, 0, 0, 0, 0, 0]},
    fetchedAt: '2026-10-22T18:00:00.000Z'
  }}));
  const actual = await forecast.getForecast('94568', {
    storage,
    now: new Date('2026-10-23T17:00:00.000Z'),
    fetchImpl: async () => ({ok: true, json: async () => ({features: [{attributes: {
      ZIP_CODE: '94568', DATE: '2026-10-23', CHS_Day_0: '1', CHS_Day_1: '1', CHS_Day_2: '0',
      CHS_Day_3: '0', CHS_Day_4: '0', CHS_Day_5: '0', CHS_Day_6: '0'
    }}]})})
  });
  assert.equal(actual.date, '2026-10-23');
  const cache = JSON.parse(storage.getItem('strata-daily-zip-forecast-v1'));
  assert.deepEqual(cache['94568'].forecast.days, [1, 1, 0, 0, 0, 0, 0]);
});
