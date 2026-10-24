(() => {
  'use strict';

  const labels = {
    space: {yes: 'Planting space is marked for school review', no: 'No suitable planting space was identified', unknown: 'Planting space is not confirmed'},
    water: {yes: 'Establishment watering is marked available', no: 'Establishment watering is not available', limited: 'Establishment watering is limited', unknown: 'Establishment watering is not confirmed'},
    maintenance: {yes: 'Maintenance support is marked available', no: 'Maintenance support is not available', limited: 'Maintenance support is limited or unassigned', unknown: 'Maintenance support is not confirmed'},
    resources: {yes: 'Resources are marked adequate for this scope', some: 'Some resources are identified; scope is not confirmed', limited: 'Resources are very limited', unknown: 'Resources are not confirmed'}
  };

  function statusForTree(answers) {
    const checks = [
      {key: 'space', value: answers.space},
      {key: 'water', value: answers.water},
      {key: 'maintenance', value: answers.maintenance},
      {key: 'resources', value: answers.resources}
    ];
    const blockers = checks.filter(({value}) => ['no', 'limited'].includes(value));
    const unknowns = checks.filter(({value}) => value === 'unknown' || value === 'some');
    const reasons = checks.map(({key, value}) => labels[key][value] || labels[key].unknown);
    if (blockers.length) {
      const blockedLabels = blockers.map(({key, value}) => labels[key][value]);
      return {status: 'blocked', reasons, explanation: `${blockedLabels.join('; ')}. Do not select tree planting as an implementation candidate until this changes.`};
    }
    if (unknowns.length) {
      const missingLabels = unknowns.map(({key, value}) => labels[key][value]);
      return {status: 'confirm', reasons, explanation: `${missingLabels.join('; ')}. Confirm these conditions before treating tree planting as feasible.`};
    }
    return {status: 'fit', reasons, explanation: 'All four planning gates are marked available. This is a candidate for school and facilities review, not approval to plant.'};
  }

  function recommendPlan(answers) {
    const urgent = answers.urgency === 'semester';
    const planningAhead = answers.urgency === 'later';
    const timing = urgent ? 'This semester' : planningAhead ? 'Prepare for next school year' : 'Timing not set';
    let nearTerm;
    if (answers.shade === 'yes') {
      nearTerm = {
        status: 'fit',
        title: urgent ? 'Use confirmed shade for an upcoming student activity' : planningAhead ? 'Pilot activity scheduling in confirmed shade' : 'Set timing for activities in confirmed shade',
        explanation: 'You marked usable shade as confirmed. A schedule or location change can make use of it without assuming new shade or construction.',
        nextStep: 'Ask the school team to verify access times, student needs, and who can supervise.'
      };
    } else if (answers.shade === 'unknown') {
      nearTerm = {
        status: 'confirm',
        title: 'Map and verify usable shade before choosing an activity area',
        explanation: 'Usable shade is not confirmed, so the plan does not assume that existing canopy can support student activity.',
        nextStep: urgent ? 'Request a school-supervised shade walk soon; do not label a location usable until checked.' : planningAhead ? 'Add a school-supervised shade walk to the planning checklist.' : 'Set the timeline with the school team and arrange a supervised shade walk.'
      };
    } else if (answers.resources === 'limited') {
      nearTerm = {
        status: 'blocked',
        title: 'Do not scope a new shade structure under the current resource limit',
        explanation: 'No usable shade is identified and resources are marked very limited. This planner will not presume a structure can be funded.',
        nextStep: 'Ask the school team to identify an approved indoor or already-shaded alternative, or revisit scope when resources change.'
      };
    } else {
      nearTerm = {
        status: 'confirm',
        title: 'Ask facilities to review a temporary shade option',
        explanation: 'No usable shade is identified. A temporary structure is only a concept for review; this tool does not assume it is safe, affordable, or allowed.',
        nextStep: answers.resources === 'yes' ? 'Confirm location, accessibility, safety, budget, and facilities approval before selecting a structure.' : 'Confirm funding, location, accessibility, safety, and facilities approval before selecting a structure.'
      };
    }

    const tree = statusForTree(answers);
    const future = {
      status: tree.status,
      title: tree.status === 'fit' ? 'Develop a school-reviewed tree planting proposal' : tree.status === 'blocked' ? 'Defer tree planting until a blocked condition changes' : 'Confirm tree-site and care conditions before proposing planting',
      explanation: tree.explanation,
      nextStep: tree.status === 'fit' ? 'Have school facilities review the proposed sites, species, utilities, accessibility, water plan, maintenance ownership, and funding.' : 'Record which condition must change or be verified, then reassess before proposing tree installation.',
      reasons: tree.reasons
    };

    return {
      nearTerm: {...nearTerm, timing},
      future,
      assumptions: 'Every answer is a user-provided planning assumption. No field conditions, measured cooling, or school approvals are inferred.'
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = {recommendPlan};
  if (typeof window !== 'undefined') window.StrataPlannerRules = {recommendPlan};
})();
