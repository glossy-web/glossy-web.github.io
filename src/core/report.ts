import type { EvtxEvent, SourceFile } from './evtx/types';
import type { Column } from './plugin';
import { cellText } from './tableExport';
import { formatTime } from './time';

export interface ReportInput<R> {
  title: string;
  zone: string;
  /** Visible columns in order. */
  columns: Column<R>[];
  rows: R[];
  event?: (row: R) => EvtxEvent | undefined;
  sources: readonly SourceFile[];
  note?: (e: EvtxEvent) => string | undefined;
  generatedAt: number;
}

/** Log content is attacker-influenced: every value goes through this. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const STYLE = `
body{font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans KR",sans-serif;margin:24px;color:#18181b}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:24px 0 8px}h3{font-size:13px;margin:16px 0 4px}
.meta{color:#71717a;margin:0 0 16px}table{border-collapse:collapse;width:100%;margin:4px 0 8px}
th,td{border:1px solid #e4e4e7;padding:3px 6px;text-align:left;vertical-align:top}th{background:#f4f4f5;font-weight:600}
td{word-break:break-word}.mono{font-family:Consolas,Menlo,monospace;font-size:12px}.note{background:#fef9c3;padding:4px 8px;border-radius:4px}
.event{page-break-inside:avoid;border-top:1px solid #e4e4e7;padding-top:4px}
`;

/**
 * A self-contained HTML report (no scripts, no external resources) of table rows and, for rows
 * tied to an event, the full record with the analyst's note. Times are in the given zone.
 */
export function buildReport<R>(r: ReportInput<R>): string {
  const esc = escapeHtml;
  const header = r.columns.map(c => `<th>${esc(c.label)}</th>`).join('');
  const body = r.rows
    .map((row, i) => `<tr><td>${i + 1}</td>${r.columns.map(c => `<td>${esc(cellText(row, c, r.zone))}</td>`).join('')}</tr>`)
    .join('\n');
  const files = r.sources
    .map(s => `<tr><td>${esc(s.name)}</td><td class="mono">${esc(s.sha256)}</td><td>${s.added.toLocaleString()}</td></tr>`)
    .join('\n');
  const events = r.rows
    .map((row, i) => {
      const e = r.event?.(row);
      if (!e) return '';
      const note = r.note?.(e);
      const data = [...Object.entries(e.data), ...e.list.map((v, j) => [`Data[${j}]`, v] as [string, string])]
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td class="mono">${esc(v)}</td></tr>`)
        .join('');
      return `<div class="event">
<h3>${i + 1}. ${esc(formatTime(e.ts, r.zone))} · Event ${e.eventId} · ${esc(e.provider)}</h3>
${note ? `<p class="note">${esc(note)}</p>` : ''}
<table><tbody>
<tr><th>Computer</th><td>${esc(e.computer)}</td></tr>
<tr><th>Channel</th><td>${esc(e.channel)}</td></tr>
<tr><th>EventRecordID</th><td>${e.recordId}</td></tr>
<tr><th>SystemTime (UTC)</th><td class="mono">${esc(e.time)}</td></tr>
${e.userSid ? `<tr><th>User SID</th><td class="mono">${esc(e.userSid)}</td></tr>` : ''}
${data}
</tbody></table></div>`;
    })
    .filter(Boolean)
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>${STYLE}</style></head>
<body>
<h1>${esc(r.title)}</h1>
<p class="meta">Generated ${esc(formatTime(r.generatedAt, r.zone))} by Glossy · times in ${esc(r.zone)} · ${r.rows.length.toLocaleString()} row(s)</p>
<h2>Source files</h2>
<table><thead><tr><th>File</th><th>SHA-256</th><th>Records</th></tr></thead><tbody>
${files}
</tbody></table>
<h2>Rows</h2>
<table><thead><tr><th>#</th>${header}</tr></thead><tbody>
${body}
</tbody></table>
${events ? `<h2>Records</h2>\n${events}` : ''}
</body></html>
`;
}
