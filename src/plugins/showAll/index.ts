import type { EvtxEvent } from '@/core/evtx/types';
import { levelName } from '@/core/evtx/types';
import type { Column, Plugin } from '@/core/plugin';
import { ranking } from '@/core/format';

/** Short "key=value" preview of the payload for the grid. */
export function summarize(e: EvtxEvent, max = 6): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(e.data)) {
    if (!v || v === '-') continue;
    parts.push(`${k}=${v}`);
    if (parts.length >= max) break;
  }
  for (const v of e.list) {
    if (parts.length >= max) break;
    if (v) parts.push(v);
  }
  return parts.join('  ·  ').slice(0, 400);
}

const columns: Column<EvtxEvent>[] = [
  { id: 'time', label: 'Time', kind: 'time', value: e => e.ts, size: 230 },
  { id: 'level', label: 'Level', value: e => levelName(e.level), size: 100, facet: true, tone: e => (e.level === 1 || e.level === 2 ? 'danger' : e.level === 3 ? 'warning' : undefined) },
  { id: 'channel', label: 'Channel', value: e => e.channel, size: 200, facet: true },
  { id: 'provider', label: 'Provider', value: e => e.provider, size: 240, facet: true },
  { id: 'eventId', label: 'Event ID', kind: 'number', value: e => e.eventId, size: 80, facet: true },
  { id: 'computer', label: 'Computer', value: e => e.computer, size: 150, facet: true },
  { id: 'summary', label: 'Event data', value: e => summarize(e), size: 520 },
  { id: 'recordId', label: 'Record ID', kind: 'number', value: e => e.recordId, size: 90, hidden: true },
  { id: 'userSid', label: 'User SID', kind: 'mono', value: e => e.userSid, size: 180, hidden: true },
];

export const showAll: Plugin = {
  name: 'showAll',
  label: 'All Events',
  category: 'All',
  icon: 'list-ul',
  description: 'Every loaded record with its key fields. Filter any column, search all columns, open a row for the full record and its XML.',
  sources: [],
  analyze(ctx) {
    const events = ctx.all();
    const severe = events.filter(e => e.level === 1 || e.level === 2);
    const warnings = events.filter(e => e.level === 3);
    return {
      stats: [
        { label: 'Events', value: events.length },
        { label: 'Providers', value: new Set(events.map(e => e.provider)).size },
        { label: 'Event IDs', value: new Set(events.map(e => `${e.provider}/${e.eventId}`)).size },
        { label: 'Critical / Error', value: severe.length, tone: severe.length ? 'danger' : undefined },
        { label: 'Warnings', value: warnings.length },
      ],
      charts: [
        {
          kind: 'timeline',
          title: 'Events over time',
          series: [{ name: 'Events', ts: events.map(e => e.ts) }],
        },
        { kind: 'ranking', title: 'Top channels', items: ranking(events.map(e => e.channel), 10) },
      ],
      views: [{ id: 'events', label: 'Events', rows: events, columns, event: e => e, sort: { id: 'time' } }],
      notes: [],
    };
  },
};
