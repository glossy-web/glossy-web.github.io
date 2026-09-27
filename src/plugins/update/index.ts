import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec } from '@/core/plugin';
import { d, eventView, groupBy, text, withBase, type EventRow } from '../common';

const WU = 'Microsoft-Windows-WindowsUpdateClient';
const SOURCES: SourceSpec[] = [{ channel: 'System', provider: WU, ids: [19, 20, 43, 44] }];

const LABELS: Record<number, string> = {
  19: 'Installed',
  20: 'Installation failed',
  43: 'Installation started',
  44: 'Download started',
};

export interface UpdateRow extends EventRow {
  action: string;
  kb: string;
  title: string;
  error: string;
}

export const kbOf = (title: string) => /KB\d{6,8}/i.exec(title)?.[0].toUpperCase() ?? '';

function toRow(e: EvtxEvent): UpdateRow {
  const title = d(e, 'updateTitle');
  return { event: e, action: LABELS[e.eventId] ?? String(e.eventId), kb: kbOf(title), title, error: d(e, 'errorCode') };
}

const eventColumns: Column<UpdateRow>[] = withBase<UpdateRow>([
  text('action', 'Action', r => r.action, { size: 170, facet: true, tone: r => (r.event.eventId === 20 ? 'danger' : r.event.eventId === 19 ? 'success' : undefined) }),
  text('kb', 'KB', r => r.kb, { size: 110 }),
  text('title', 'Update', r => r.title, { size: 560 }),
  text('error', 'Error code', r => r.error, { size: 110, kind: 'mono' }),
]);

interface UpdateSummary {
  kb: string;
  title: string;
  computer: string;
  installed: number;
  failures: number;
  firstSeen: number;
  sample: EvtxEvent;
}

const summaryColumns: Column<UpdateSummary>[] = [
  text('kb', 'KB', r => r.kb, { size: 110 }),
  text('title', 'Update', r => r.title, { size: 520 }),
  text('computer', 'Computer', r => r.computer, { size: 150, facet: true }),
  { id: 'firstSeen', label: 'First seen', kind: 'time', value: r => r.firstSeen, size: 230 },
  { id: 'installed', label: 'Installed', kind: 'time', value: r => r.installed, size: 230 },
  { id: 'failures', label: 'Failures', kind: 'number', value: r => r.failures, size: 90, tone: r => (r.failures ? 'danger' : undefined) },
];

export const update: Plugin = {
  name: 'update',
  label: 'Windows Update',
  category: 'System',
  icon: 'refresh-cw',
  description: 'Windows Update client downloads, installs and failures from the System log, with the KB number taken from the update title.',
  sources: SOURCES,
  analyze(ctx) {
    const rows = ctx.select(SOURCES).map(toRow);
    const byUpdate = groupBy(rows, r => `${r.event.computer}\u0001${d(r.event, 'updateGuid') || r.title}`);
    const updates: UpdateSummary[] = [...byUpdate.values()].map(list => {
      const installed = [...list].reverse().find(r => r.event.eventId === 19);
      return {
        kb: list[0]!.kb,
        title: list[0]!.title,
        computer: list[0]!.event.computer,
        firstSeen: list[0]!.event.ts,
        installed: installed?.event.ts ?? NaN,
        failures: list.filter(r => r.event.eventId === 20).length,
        sample: (installed ?? list[0]!).event,
      };
    });
    const installs = rows.filter(r => r.event.eventId === 19);
    const failures = rows.filter(r => r.event.eventId === 20);
    return {
      stats: [
        { label: 'Installed', value: installs.length },
        { label: 'Failed', value: failures.length, tone: failures.length ? 'danger' : undefined },
        { label: 'Distinct updates', value: updates.length },
        { label: 'Never installed', value: updates.filter(u => !Number.isFinite(u.installed)).length },
      ],
      charts: [
        {
          kind: 'timeline',
          title: 'Update installs',
          target: { view: 'events' },
          series: [
            { name: 'Installed', ts: installs.map(r => r.event.ts) },
            { name: 'Failed', ts: failures.map(r => r.event.ts) },
          ],
        },
      ],
      views: [
        {
          ...eventView('events', 'Events', rows, eventColumns),
          timeline: r => (r.event.eventId === 19 || r.event.eventId === 20 ? { title: `Update ${r.action.toLowerCase()}: ${r.kb || r.title}`, detail: [r.title, r.error && `Error ${r.error}`].filter(Boolean).join(' · ') } : undefined),
        },
        { id: 'updates', label: 'Updates', rows: updates, columns: summaryColumns, event: r => r.sample, sort: { id: 'firstSeen', desc: true } },
      ],
      notes: [],
    };
  },
};
