import type { EvtxEvent } from '@/core/evtx/types';
import { levelName } from '@/core/evtx/types';
import type { Column, Plugin } from '@/core/plugin';
import { summarize } from '../showAll';

export const starred: Plugin = {
  name: 'starred',
  label: 'Starred',
  category: 'All',
  icon: 'star',
  description:
    'Events you starred in any module, with your notes. Stars are kept in this browser and come back when the same logs are loaded again. Export the table as a report to hand the findings on.',
  sources: [],
  analyze(ctx) {
    const events = ctx.all().filter(e => ctx.starred(e));
    const note = (e: EvtxEvent) => ctx.starred(e)?.note ?? '';
    const columns: Column<EvtxEvent>[] = [
      { id: 'time', label: 'Time', kind: 'time', value: e => e.ts, size: 230 },
      { id: 'note', label: 'Note', value: note, size: 280 },
      { id: 'level', label: 'Level', value: e => levelName(e.level), size: 90, facet: true, hidden: true },
      { id: 'channel', label: 'Channel', value: e => e.channel, size: 180, facet: true },
      { id: 'eventId', label: 'Event ID', kind: 'number', value: e => e.eventId, size: 80, facet: true },
      { id: 'computer', label: 'Computer', value: e => e.computer, size: 150, facet: true },
      { id: 'summary', label: 'Event data', value: e => summarize(e), size: 480 },
      { id: 'provider', label: 'Provider', value: e => e.provider, size: 220, facet: true, hidden: true },
    ];
    return {
      stats: [
        { label: 'Starred events', value: events.length },
        { label: 'With notes', value: events.filter(e => note(e)).length },
        { label: 'Computers', value: new Set(events.map(e => e.computer)).size },
      ],
      charts: [],
      views: [{ id: 'events', label: 'Starred', rows: events, columns, event: e => e, sort: { id: 'time' } }],
      notes: events.length ? [] : [{ tone: 'info', text: 'Nothing is starred yet. Star an event from its detail panel, the star column of any table, or the S key on a selected row.' }],
    };
  },
};
