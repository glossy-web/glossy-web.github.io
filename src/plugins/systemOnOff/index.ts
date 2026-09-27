import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec, Tone } from '@/core/plugin';
import { filetimeToMs, formatDuration } from '@/core/time';
import { d, eventView, groupBy, lastAtOrBefore, text, withBase, type EventRow } from '../common';

const KG = 'Microsoft-Windows-Kernel-General';
const KP = 'Microsoft-Windows-Kernel-Power';
const PT = 'Microsoft-Windows-Power-Troubleshooter';

const SOURCES: SourceSpec[] = [
  { channel: 'System', provider: KG, ids: [12, 13] },
  { channel: 'System', provider: 'EventLog', ids: [6005, 6006, 6008, 6009, 6013] },
  { channel: 'System', provider: KP, ids: [41, 42, 107, 109] },
  { channel: 'System', provider: PT, ids: [1] },
  { channel: 'System', provider: 'User32', ids: [1074] },
];

type Kind = 'boot' | 'shutdown' | 'unexpected' | 'sleep' | 'wake' | 'info';

export interface PowerRow extends EventRow {
  action: string;
  kind: Kind;
  detail: string;
}

function classify(e: EvtxEvent): PowerRow {
  const p = e.provider.toLowerCase();
  const row = (action: string, kind: Kind, detail = ''): PowerRow => ({ event: e, action, kind, detail });
  if (p === KG.toLowerCase()) {
    if (e.eventId === 12) {
      const mode = d(e, 'BootMode');
      const version = [d(e, 'MajorVersion'), d(e, 'MinorVersion'), d(e, 'BuildVersion')].filter(Boolean).join('.');
      const safe = mode === '1' ? 'Safe mode' : mode && mode !== '0' ? `BootMode ${mode}` : '';
      return row('Operating system started', 'boot', [safe, version && `Windows ${version}`].filter(Boolean).join(' · '));
    }
    return row('Operating system shutdown', 'shutdown', d(e, 'StopTime') && `StopTime ${d(e, 'StopTime')}`);
  }
  if (p === 'eventlog') {
    switch (e.eventId) {
      case 6005:
        return row('Event log service started', 'info');
      case 6006:
        return row('Event log service stopped', 'info');
      case 6008:
        return row('Previous shutdown was unexpected', 'unexpected', `Previous shutdown at ${e.list.slice(0, 2).filter(Boolean).join(' ')}`);
      case 6009:
        return row('OS version at boot', 'info', e.list.filter(Boolean).join(' '));
      default: {
        const seconds = Number(e.list[4] ?? e.list[0]);
        return row('System uptime reported', 'info', Number.isFinite(seconds) ? `Up ${formatDuration(seconds * 1000)}` : e.list.join(' '));
      }
    }
  }
  if (p === KP.toLowerCase()) {
    switch (e.eventId) {
      case 41: {
        const bug = d(e, 'BugcheckCode');
        const pressed = filetimeToMs(d(e, 'PowerButtonTimestamp'));
        const parts = [
          bug && bug !== '0' ? `Bugcheck 0x${Number(bug).toString(16).toUpperCase()}` : '',
          pressed ? `Power button held at ${new Date(pressed).toISOString()}` : '',
        ];
        return row('Rebooted without clean shutdown', 'unexpected', parts.filter(Boolean).join(' · '));
      }
      case 42:
        return row('Entering sleep', 'sleep', [d(e, 'TargetState') && `TargetState ${d(e, 'TargetState')}`, d(e, 'Reason') && `Reason ${d(e, 'Reason')}`].filter(Boolean).join(' · '));
      case 107:
        return row('Resumed from sleep', 'wake');
      default:
        return row('Kernel shutdown transition', 'info', [d(e, 'ShutdownActionType') && `Action ${d(e, 'ShutdownActionType')}`, d(e, 'ShutdownReason') && `Reason ${d(e, 'ShutdownReason')}`].filter(Boolean).join(' · '));
    }
  }
  if (p === PT.toLowerCase()) {
    return row('Returned from low-power state', 'wake', [d(e, 'SleepTime') && `Sleep ${d(e, 'SleepTime')}`, d(e, 'WakeTime') && `Wake ${d(e, 'WakeTime')}`].filter(Boolean).join(' → '));
  }
  // User32 1074: param1 process, param2 computer, param3 reason, param4 code, param5 type, param6 comment, param7 user
  const detail = [`${d(e, 'param5') || 'Shutdown'} by ${d(e, 'param7') || '?'}`, d(e, 'param1') && `via ${d(e, 'param1')}`, d(e, 'param3'), d(e, 'param6') && `"${d(e, 'param6')}"`]
    .filter(Boolean)
    .join(' · ');
  return row('Shutdown/restart requested', 'info', detail);
}

function tone(r: PowerRow): Tone | undefined {
  if (r.kind === 'unexpected') return 'danger';
  if (r.detail.startsWith('Safe mode')) return 'warning';
  return undefined;
}

const eventColumns: Column<PowerRow>[] = withBase<PowerRow>([
  text('action', 'Action', r => r.action, { size: 260, facet: true, tone }),
  text('detail', 'Detail', r => r.detail, { size: 480 }),
]);

interface SessionRow extends EventRow {
  end: number;
  how: 'Clean shutdown' | 'Unexpected (no shutdown recorded)' | 'Still running at end of log';
  safeMode: boolean;
}

const sessionColumns: Column<SessionRow>[] = withBase<SessionRow>([
  { id: 'end', label: 'Shutdown', kind: 'time', value: r => r.end, size: 230 },
  { id: 'uptime', label: 'Uptime', kind: 'number', value: r => r.end - r.event.ts, text: r => (Number.isFinite(r.end) ? formatDuration(r.end - r.event.ts) : ''), size: 130 },
  text('how', 'Ended', r => r.how, { size: 250, facet: true, tone: r => (r.how.startsWith('Unexpected') ? 'danger' : undefined) }),
  text('safe', 'Safe mode', r => (r.safeMode ? 'Yes' : ''), { size: 90, facet: true }),
]);

/**
 * Boot sessions per computer from Kernel-General 12/13 (EventLog 6005/6006 when those are absent).
 * A boot that follows a boot without a shutdown ends the earlier session "unexpectedly", at the
 * last event of any kind logged by that computer before the new boot (as the original Glossy did).
 */
function sessions(rows: PowerRow[], everything: readonly EvtxEvent[]): SessionRow[] {
  const out: SessionRow[] = [];
  for (const [computer, list] of groupBy(rows, r => r.event.computer)) {
    const hasKg = list.some(r => r.event.provider === KG);
    const marks = list.filter(r =>
      hasKg ? r.event.provider === KG : r.event.provider.toLowerCase() === 'eventlog' && (r.event.eventId === 6005 || r.event.eventId === 6006),
    );
    const own = everything.filter(e => e.computer === computer);
    let open: SessionRow | null = null;
    for (const r of marks) {
      const isBoot = r.event.eventId === 12 || r.event.eventId === 6005;
      if (isBoot) {
        if (open) {
          const i = lastAtOrBefore(own, r.event.ts - 1);
          open.end = i >= 0 ? own[i]!.ts : NaN;
          open.how = 'Unexpected (no shutdown recorded)';
          out.push(open);
        }
        open = { event: r.event, end: NaN, how: 'Still running at end of log', safeMode: r.detail.startsWith('Safe mode') };
      } else if (open) {
        open.end = r.event.ts;
        open.how = 'Clean shutdown';
        out.push(open);
        open = null;
      }
    }
    if (open) {
      open.end = own[own.length - 1]?.ts ?? NaN;
      out.push(open);
    }
  }
  return out;
}

export const systemOnOff: Plugin = {
  name: 'systemOnOff',
  label: 'System On/Off',
  category: 'System',
  icon: 'power',
  description:
    'Boots, shutdowns, crashes, sleep and resume from the System log, plus who requested a shutdown (User32 1074). Boot sessions show uptime and flag sessions that ended without a shutdown record.',
  sources: SOURCES,
  analyze(ctx) {
    const rows = ctx.select(SOURCES).map(classify);
    const boots = rows.filter(r => r.kind === 'boot');
    const shutdowns = rows.filter(r => r.kind === 'shutdown');
    const sessionRows = sessions(rows, ctx.all());
    const unexpected = sessionRows.filter(s => s.how.startsWith('Unexpected')).length;
    return {
      stats: [
        { label: 'Boots', value: boots.length },
        { label: 'Shutdowns', value: shutdowns.length },
        { label: 'Unexpected shutdowns', value: unexpected, tone: unexpected ? 'danger' : undefined },
        { label: 'Safe mode boots', value: boots.filter(r => r.detail.startsWith('Safe mode')).length, tone: boots.some(r => r.detail.startsWith('Safe mode')) ? 'warning' : undefined },
        { label: 'Sleeps', value: rows.filter(r => r.kind === 'sleep').length },
        { label: 'Shutdown requests', value: rows.filter(r => r.event.eventId === 1074).length },
      ],
      charts: [
        {
          kind: 'clock',
          title: 'Power events by time of day',
          series: [
            { name: 'Boot', ts: boots.map(r => r.event.ts) },
            { name: 'Shutdown', ts: shutdowns.map(r => r.event.ts) },
            { name: 'Unexpected', ts: rows.filter(r => r.kind === 'unexpected').map(r => r.event.ts) },
          ],
        },
      ],
      views: [
        { ...eventView('events', 'Events', rows, eventColumns), timeline: r => ({ title: r.action, detail: r.detail, tone: tone(r) }) },
        eventView('sessions', 'Boot sessions', sessionRows, sessionColumns),
      ],
      notes: [],
    };
  },
};
