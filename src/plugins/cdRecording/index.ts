import type { Column, Plugin, SourceSpec } from '@/core/plugin';
import { eventView, pick, text, withBase, type EventRow } from '../common';

const SOURCES: SourceSpec[] = [{ channel: 'System', provider: 'cdrom', ids: [133] }];

interface DiscRow extends EventRow {
  device: string;
}

const columns: Column<DiscRow>[] = withBase<DiscRow>([text('device', 'Device', r => r.device, { size: 300, facet: true })]);

export const cdRecording: Plugin = {
  name: 'cdRecording',
  label: 'CD/DVD Recording',
  category: 'Hardware',
  icon: 'disc',
  description:
    'Optical drive events from the classic cdrom driver (System, event 133), used by the original Glossy research (KDFS 2017) as the trace left by writing a disc. Corroborate with file system and shell artifacts.',
  sources: SOURCES,
  analyze(ctx) {
    const rows: DiscRow[] = ctx.select(SOURCES).map(e => ({ event: e, device: e.list[0] ?? pick(e, 'DeviceName') }));
    return {
      stats: [
        { label: 'Events', value: rows.length },
        { label: 'Drives', value: new Set(rows.map(r => r.device)).size },
      ],
      charts: rows.length ? [{ kind: 'timeline', title: 'Optical drive events', series: [{ name: 'cdrom 133', ts: rows.map(r => r.event.ts) }] }] : [],
      views: [eventView('events', 'Events', rows, columns)],
      notes: [],
    };
  },
};
