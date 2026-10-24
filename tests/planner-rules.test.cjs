const test = require('node:test');
const assert = require('node:assert/strict');
const {recommendPlan} = require('../web/planner-rules.js');

const confirmed = {
  urgency: 'semester', shade: 'yes', space: 'yes', water: 'yes',
  maintenance: 'yes', resources: 'yes'
};

test('unconfirmed site conditions stay in confirmation states', () => {
  const plan = recommendPlan({urgency: 'semester', shade: 'unknown', space: 'unknown', water: 'unknown', maintenance: 'unknown', resources: 'unknown'});
  assert.equal(plan.nearTerm.status, 'confirm');
  assert.match(plan.nearTerm.title, /Map and verify/);
  assert.equal(plan.future.status, 'confirm');
  assert.match(plan.future.explanation, /not confirmed/);
});

test('unset urgency is shown as unset rather than silently assumed', () => {
  const plan = recommendPlan({urgency: 'unknown', shade: 'unknown', space: 'unknown', water: 'unknown', maintenance: 'unknown', resources: 'unknown'});
  assert.equal(plan.nearTerm.timing, 'Timing not set');
  assert.match(plan.nearTerm.nextStep, /Set the timeline/);
});

test('tree planting fits stated assumptions only when every gate is confirmed', () => {
  const plan = recommendPlan(confirmed);
  assert.equal(plan.nearTerm.status, 'fit');
  assert.equal(plan.future.status, 'fit');
  assert.match(plan.future.explanation, /not approval to plant/);
  assert.equal(plan.future.reasons.length, 4);
});

test('space, water, maintenance, or resources constraints defer tree planting', () => {
  const blockedAnswers = [
    {...confirmed, space: 'no'},
    {...confirmed, water: 'no'},
    {...confirmed, maintenance: 'limited'},
    {...confirmed, resources: 'limited'}
  ];
  for (const answers of blockedAnswers) {
    const plan = recommendPlan(answers);
    assert.equal(plan.future.status, 'blocked');
    assert.match(plan.future.explanation, /Do not select tree planting/);
  }
});

test('limited resources do not produce a temporary structure recommendation', () => {
  const plan = recommendPlan({...confirmed, shade: 'no', resources: 'limited'});
  assert.equal(plan.nearTerm.status, 'blocked');
  assert.match(plan.nearTerm.explanation, /will not presume a structure can be funded/);
});

test('confirmed existing shade supports a schedule action even with limited resources', () => {
  const plan = recommendPlan({...confirmed, shade: 'yes', resources: 'limited'});
  assert.equal(plan.nearTerm.status, 'fit');
  assert.match(plan.nearTerm.title, /Use confirmed shade/);
  assert.equal(plan.future.status, 'blocked');
});

test('urgency changes near-term timing and recommendation language', () => {
  const urgent = recommendPlan(confirmed);
  const later = recommendPlan({...confirmed, urgency: 'later'});
  assert.equal(urgent.nearTerm.timing, 'This semester');
  assert.equal(later.nearTerm.timing, 'Prepare for next school year');
  assert.notEqual(urgent.nearTerm.title, later.nearTerm.title);
});

test('limited identified project resources need scope confirmation instead of being treated as funded', () => {
  const plan = recommendPlan({...confirmed, resources: 'some'});
  assert.equal(plan.future.status, 'confirm');
  assert.match(plan.future.explanation, /scope is not confirmed/);
});
