import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec } from '@/core/plugin';
import { account } from '@/core/format';
import { parseSystemTime } from '@/core/normalize';
import { formatDuration } from '@/core/time';
import { d, eventView, text, withBase, SECURITY, type EventRow } from '../common';

const KG = 'Microsoft-Windows-Kernel-General';

const SOURCES: SourceSpec[] = [
  { channel: 'Security', provider: SECURITY, ids: [4616] },
  { channel: 'System', provider: KG, ids: [1] },
];

export interface TimeRow extends EventRow {
  source: string;
  previous: number;
  next: number;
  delta: number;
  by: string;
  process: string;
  reason: string;
}

function toRow(e: EvtxEvent): TimeRow {
  if (e.eventId === 4616) {
    const previous = parseSystemTime(d(e, 'PreviousTime'));
    const next = parseSystemTime(d(e, 'NewTime'));
    return {
      event: e,
      source: 'Security 4616',
      previous,
      next,
      delta: next - previous,
      by: account(e.data['SubjectDomainName'], e.data['SubjectUserName']),
      process: d(e, 'ProcessName'),
      reason: '',
    };
  }
  const previous = parseSystemTime(d(e, 'OldTime'));
  const next = parseSystemTime(d(e, 'NewTime'));
  return { event: e, source: 'System (Kernel-General 1)', previous, next, delta: next - previous, by: '', process: '', reason: d(e, 'Reason') && `Reason ${d(e, 'Reason')}` };
}

const eventColumns: Column<TimeRow>[] = withBase<TimeRow>([
  text('source', 'Source', r => r.source, { size: 190, facet: true }),
  { id: 'previous', label: 'Previous time', kind: 'time', value: r => r.previous, size: 190 },
  { id: 'next', label: 'New time', kind: 'time', value: r => r.next, size: 190 },
  {
    id: 'delta',
    label: 'Change',
    kind: 'number',
    value: r => r.delta,
    text: r => (Number.isFinite(r.delta) ? `${r.delta >= 0 ? '+' : ''}${formatDuration(r.delta)}` : ''),
    size: 150,
    tone: r => (Math.abs(r.delta) >= 3600000 ? 'danger' : Math.abs(r.delta) >= 60000 ? 'warning' : undefined),
  },
  text('by', 'Changed by', r => r.by, { size: 190, facet: true }),
  text('process', 'Process', r => r.process, { size: 280, facet: true }),
  text('reason', 'Reason / detail', r => r.reason, { size: 200 }),
]);

export const timeChange: Plugin = {
  name: 'timeChange',
  label: 'Time Change',
  category: 'System',
  icon: 'clock-history',
  description:
    'System clock changes with the size of the jump. Security 4616 names the account and process that changed the time; large or backward jumps can indicate timestamp tampering and affect every other timeline.',
  sources: SOURCES,
  options: [{ id: 'hideSmall', label: 'Hide adjustments under 1 second (clock sync)', default: true }],
  analyze(ctx, opts) {
    const all = ctx.select(SOURCES).map(toRow);
    const rows = opts['hideSmall'] ? all.filter(r => !Number.isFinite(r.delta) || Math.abs(r.delta) >= 1000) : all;
    const forward = rows.filter(r => r.delta > 0).sort((a, b) => b.delta - a.delta)[0];
    const backward = rows.filter(r => r.delta < 0).sort((a, b) => a.delta - b.delta)[0];
    const big = rows.filter(r => Math.abs(r.delta) >= 3600000).length;
    return {
      stats: [
        { label: 'Time changes', value: rows.length },
        { label: 'Changes of 1 hour or more', value: big, tone: big ? 'danger' : undefined },
        { label: 'Largest jump forward', value: forward ? formatDuration(forward.delta) : '–' },
        { label: 'Largest jump backward', value: backward ? formatDuration(-backward.delta) : '–', tone: backward && backward.delta <= -60000 ? 'warning' : undefined },
      ],
      charts: [],
      views: [eventView('events', 'Changes', rows, eventColumns)],
      notes:
        opts['hideSmall'] && all.length > rows.length
          ? [{ tone: 'info', text: `${(all.length - rows.length).toLocaleString()} adjustments under one second (time synchronization) are hidden.` }]
          : [],
    };
  },
};
