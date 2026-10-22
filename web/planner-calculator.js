(() => {
  'use strict';
  const LIMITS = {students: 100000, minutes: 600, capacity: 100000};

  function calculateOpportunity({attendingStudents, activityMinutes, distinctCapacity}) {
    const raw = [attendingStudents, activityMinutes, distinctCapacity].map((value) => String(value ?? '').trim());
    if (raw.some((value) => value === '')) return {valid: false, message: 'Enter attendance, activity duration, and distinct shaded capacity to see a hypothetical estimate.'};
    if (raw.some((value) => !/^\d+$/.test(value))) return {valid: false, message: 'Use whole, non-negative student counts and whole activity minutes.'};
    const [students, minutes, capacity] = raw.map(Number);
    if (!Number.isSafeInteger(students) || students > LIMITS.students) return {valid: false, message: `Attendance must be between 0 and ${LIMITS.students.toLocaleString()}.`};
    if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > LIMITS.minutes) return {valid: false, message: `Activity duration must be between 1 and ${LIMITS.minutes} minutes.`};
    if (!Number.isSafeInteger(capacity) || capacity > LIMITS.capacity) return {valid: false, message: `Distinct shaded capacity must be between 0 and ${LIMITS.capacity.toLocaleString()}.`};
    const studentsServed = Math.min(students, capacity);
    return {
      valid: true,
      attendance: students,
      activityMinutes: minutes,
      distinctCapacity: capacity,
      studentsServed,
      studentMinutes: studentsServed * minutes,
      capacityCapped: capacity > students
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = {calculateOpportunity};
  if (typeof window !== 'undefined') window.StrataPlannerCalculator = {calculateOpportunity};
})();
