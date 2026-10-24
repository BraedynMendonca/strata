(function attachStrataCanopyComparison(global) {
  'use strict';

  function validCanopy(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function create(campuses, threshold = 10) {
    const values = campuses.map((campus) => campus.studentZoneCanopyPct).filter(validCanopy).sort((a, b) => a - b);
    let belowThreshold = 0;
    while (belowThreshold < values.length && values[belowThreshold] < threshold) belowThreshold++;

    return {
      reported: values.length,
      belowThreshold,
      belowThresholdPercent: values.length ? belowThreshold / values.length * 100 : null,
      compare(value) {
        if (!validCanopy(value) || !values.length) return null;
        let low = 0;
        let high = values.length;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (values[middle] < value) low = middle + 1;
          else high = middle;
        }
        return {lower: low, equal: values.lastIndexOf(value) - low + 1, reported: values.length, percentLower: low / values.length * 100};
      }
    };
  }

  const api = {create, validCanopy};
  global.StrataCanopyComparison = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
