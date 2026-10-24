const test = require('node:test');
const assert = require('node:assert/strict');
const {calculateOpportunity} = require('../web/planner-calculator.js');

test('caps estimated served students at attendance', () => {
  assert.deepEqual(calculateOpportunity({attendingStudents: '80', activityMinutes: '20', distinctCapacity: '125'}), {
    valid: true, attendance: 80, activityMinutes: 20, distinctCapacity: 125, studentsServed: 80, studentMinutes: 1600, capacityCapped: true
  });
});

test('uses user-entered capacity when it is below attendance', () => {
  const result = calculateOpportunity({attendingStudents: '120', activityMinutes: '25', distinctCapacity: '36'});
  assert.equal(result.studentsServed, 36);
  assert.equal(result.studentMinutes, 900);
  assert.equal(result.capacityCapped, false);
});

test('calculates each horizon independently and does not aggregate', () => {
  const near = calculateOpportunity({attendingStudents: '100', activityMinutes: '30', distinctCapacity: '25'});
  const future = calculateOpportunity({attendingStudents: '100', activityMinutes: '30', distinctCapacity: '100'});
  assert.equal(near.studentMinutes, 750);
  assert.equal(future.studentMinutes, 3000);
  assert.equal('total' in near, false);
  assert.equal('total' in future, false);
});

test('rejects blank, fractional, negative, and out-of-range inputs', () => {
  for (const input of [
    {attendingStudents: '', activityMinutes: '20', distinctCapacity: '30'},
    {attendingStudents: '12.5', activityMinutes: '20', distinctCapacity: '30'},
    {attendingStudents: '-1', activityMinutes: '20', distinctCapacity: '30'},
    {attendingStudents: '10', activityMinutes: '601', distinctCapacity: '30'},
    {attendingStudents: '10', activityMinutes: '20', distinctCapacity: '100001'}
  ]) assert.equal(calculateOpportunity(input).valid, false);
});
