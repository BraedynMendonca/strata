const test = require('node:test');
const assert = require('node:assert/strict');
const {toCSV} = require('../web/planner-exports.js');

test('quotes CSV values, doubles quotes, and neutralizes formula-leading text', () => {
  const csv = toCSV([['name', 'note', 'injection'], ['School, A', 'said "hello"', '  =1+1']]);
  assert.equal(csv, '"name","note","injection"\r\n"School, A","said ""hello""","\'  =1+1"');
});

test('keeps empty and plain values as quoted strings', () => {
  assert.equal(toCSV([['field', 'value'], ['empty', ''], ['text', 'shade']]), '"field","value"\r\n"empty",""\r\n"text","shade"');
});
