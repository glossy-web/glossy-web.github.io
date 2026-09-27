import type { EvtxEvent } from './evtx/types';
import type { Column } from './plugin';
import { toCsv } from './csv';
import { formatIso, formatTime, UTC } from './time';

/** What is on screen: visible columns in order, filtered and sorted rows. */
export interface TableSnapshot<R> {
  columns: Column<R>[];
  rows: R[];
  event?: (row: R) => EvtxEvent | undefined;
  /** Name of the file an event was read from. */
  sourceName: (e: EvtxEvent) => string;
}

/** Cell text as the table shows it (time columns in the given zone). */
export function cellText<R>(row: R, col: Column<R>, zone: string): string {
  const value = col.value(row);
  if (col.kind === 'time') return typeof value === 'number' ? formatTime(value, zone) : '';
  if (col.text) return col.text(row);
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Fields that let every exported row be traced back to its record. Column ids match the
 * standard columns so a view that already shows one is not exported twice; JSONL names
 * follow plaso's Windows EVTX fields, which Timesketch users already query.
 */
const TRACE: { id: string; csv: string; jsonl: string; get: (e: EvtxEvent, sourceName: (e: EvtxEvent) => string) => string | number }[] = [
  { id: 'computer', csv: 'Computer', jsonl: 'computer_name', get: e => e.computer },
  { id: 'channel', csv: 'Channel', jsonl: 'channel', get: e => e.channel },
  { id: 'provider', csv: 'Provider', jsonl: 'source_name', get: e => e.provider },
  { id: 'eventId', csv: 'EventID', jsonl: 'event_identifier', get: e => e.eventId },
  { id: 'recordId', csv: 'EventRecordID', jsonl: 'record_number', get: e => e.recordId },
  { id: 'sourceFile', csv: 'SourceFile', jsonl: 'evtx_file', get: (e, sourceName) => sourceName(e) },
];

/** CSV of the snapshot; times as ISO 8601 with the zone's offset, plus trace columns not already shown. */
export function tableToCsv<R>(t: TableSnapshot<R>, zone: string): string {
  const shown = new Set(t.columns.map(c => c.id));
  const trace = t.event ? TRACE.filter(f => !shown.has(f.id)) : [];
  const header = [...t.columns.map(c => (c.kind === 'time' ? `${c.label} (${zone === UTC ? 'UTC' : zone})` : c.label)), ...trace.map(f => f.csv)];
  const body = t.rows.map(row => {
    const out = t.columns.map(c => {
      const v = c.value(row);
      return c.kind === 'time' ? (typeof v === 'number' ? formatIso(v, zone) : '') : cellText(row, c, zone);
    });
    const e = t.event?.(row);
    for (const f of trace) out.push(e ? String(f.get(e, t.sourceName)) : '');
    return out;
  });
  return toCsv(header, body);
}

const snake = (id: string) => id.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
const isoUtc = (ts: number) => new Date(ts).toISOString().replace('Z', '+00:00');

/**
 * Timesketch JSONL: one line per row with the mandatory `message`, `datetime` (ISO 8601)
 * and `timestamp_desc`, plus `timestamp` in microseconds. A row's time is its first
 * time column that has a value, and `timestamp_desc` names that column. Times are UTC.
 * `message` joins the other visible cells as "Label: value", like Hayabusa's Details.
 * Rows without any time are left out; the count is returned.
 */
export function tableToJsonl<R>(t: TableSnapshot<R>, timeColumns: Column<R>[], dataType: string): { text: string; skipped: number } {
  const trace = t.event ? TRACE : [];
  const traced = new Set(trace.map(f => f.id));
  const fields = t.columns.filter(c => c.kind !== 'time' && !traced.has(c.id));
  const lines: string[] = [];
  let skipped = 0;
  for (const row of t.rows) {
    const primary = timeColumns.find(c => Number.isFinite(c.value(row)));
    if (!primary) {
      skipped++;
      continue;
    }
    const ts = primary.value(row) as number;
    const out: Record<string, string | number> = {
      message: fields
        .map(c => [c.label, cellText(row, c, UTC)])
        .filter(([, v]) => v)
        .map(([label, v]) => `${label}: ${v}`)
        .join(' | '),
      datetime: isoUtc(ts),
      timestamp: Math.round(ts * 1000),
      timestamp_desc: primary.label === 'Time' ? 'Event Time' : primary.label,
      data_type: dataType,
    };
    for (const c of t.columns) {
      if (traced.has(c.id)) continue;
      const name = snake(c.id);
      if (c.kind === 'time') {
        const v = c.value(row);
        if (c !== primary && typeof v === 'number' && Number.isFinite(v)) out[name] = isoUtc(v);
      } else {
        const v = cellText(row, c, UTC);
        if (v) out[name] = v;
      }
    }
    const e = t.event?.(row);
    if (e) for (const f of trace) out[f.jsonl] = f.get(e, t.sourceName);
    lines.push(JSON.stringify(out));
  }
  return { text: lines.length ? lines.join('\n') + '\n' : '', skipped };
}
