/**
 * CSV for spreadsheets and timeline tools (RFC 4180 quoting, UTF-8 BOM).
 *
 * Log content is attacker-influenced (user names, command lines), so cells that
 * a spreadsheet would evaluate as a formula are prefixed with an apostrophe,
 * following the OWASP CSV injection guidance. Plain numbers and a lone "-" are
 * left as they are.
 */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v) && v !== '-' && !/^[+-]?\d+(\.\d+)?$/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function download(filename: string, content: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
