(() => {
  'use strict';
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  function toCSV(rows) {
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = {toCSV};
  if (typeof window !== 'undefined') window.StrataPlannerExports = {toCSV};
})();
