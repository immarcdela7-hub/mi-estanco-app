// Minimal, correct CSV parse/stringify (RFC-4180-ish): quoted fields, doubled
// quotes, commas and newlines inside quotes. Shared by the scraper and builder.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, ''); // strip BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // ignore; handled by \n
    } else field += c;
  }
  // last field/row (if file doesn't end with newline)
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { columns: [], records: [] };
  const columns = rows[0];
  const records = rows.slice(1)
    .filter((r) => r.length && !(r.length === 1 && r[0] === ''))
    .map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ''])));
  return { columns, records };
}

function cell(v) {
  return '"' + (v ?? '').toString().replace(/"/g, '""') + '"';
}

export function stringifyCsv(columns, records) {
  const lines = [columns.map(cell).join(',')];
  for (const r of records) lines.push(columns.map((c) => cell(r[c])).join(','));
  return lines.join('\n') + '\n';
}
