const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../web/planner-comparison.js');

test('statewide canopy summary excludes missing and invalid source values', () => {
  const summary = create([
    {studentZoneCanopyPct: 0}, {studentZoneCanopyPct: 5}, {studentZoneCanopyPct: 9.9},
    {studentZoneCanopyPct: 10}, {studentZoneCanopyPct: 25}, {studentZoneCanopyPct: null},
    {studentZoneCanopyPct: -999}, {studentZoneCanopyPct: 101}
  ]);
  assert.equal(summary.reported, 5);
  assert.equal(summary.belowThreshold, 3);
  assert.equal(summary.belowThresholdPercent, 60);
});

test('campus comparison counts strictly lower values and reports ties separately', () => {
  const summary = create([0, 5, 5, 10, 20].map((studentZoneCanopyPct) => ({studentZoneCanopyPct})));
  assert.deepEqual(summary.compare(5), {lower: 1, equal: 2, reported: 5, percentLower: 20});
  assert.deepEqual(summary.compare(0), {lower: 0, equal: 1, reported: 5, percentLower: 0});
  assert.equal(summary.compare(null), null);
});

test('empty canopy evidence does not produce a fabricated percentage', () => {
  const summary = create([{studentZoneCanopyPct: null}]);
  assert.equal(summary.belowThresholdPercent, null);
  assert.equal(summary.compare(12), null);
});

test('published California campus layer yields the statewide canopy benchmark shown in the app', () => {
  const campuses = require('../web/planner/campuses.json').campuses;
  const summary = create(campuses);
  assert.equal(campuses.length, 8380);
  assert.equal(summary.reported, 8290);
  assert.equal(summary.belowThreshold, 5712);
  assert.equal(Math.round(summary.belowThresholdPercent), 69);
});
