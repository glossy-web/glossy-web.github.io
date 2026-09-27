import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec } from '@/core/plugin';
import { account, isUserWritablePath } from '@/core/format';
import { d, eventView, groupBy, SECURITY, text, withBase, type EventRow } from '../common';

const SCM = 'Service Control Manager';

const SOURCES: SourceSpec[] = [
  { channel: 'System', provider: SCM, ids: [7045, 7034, 7035, 7036, 7040] },
  { channel: 'Security', provider: SECURITY, ids: [4697] },
];

const START_TYPES: Record<string, string> = { '0': 'boot start', '1': 'system start', '2': 'auto start', '3': 'demand start', '4': 'disabled' };

/**
 * Image paths typical of malicious service installs (PsExec-style remote execution,
 * Cobalt Strike/Metasploit service payloads, living-off-the-land binaries). A match is
 * a lead to check, not a verdict.
 */
const SUSPICIOUS: [RegExp, string][] = [
  [/%comspec%|cmd(\.exe)?["']?\s+\/[ckr]/i, 'command shell'],
  [/powershell|pwsh/i, 'PowerShell'],
  [/\s-(e|en|enc|encodedcommand)\s/i, 'encoded command'],
  [/\b(mshta|rundll32|regsvr32|wscript|cscript|certutil|bitsadmin)\b/i, 'LOLBin'],
  [/^["']?\\\\|\\\\[^\\]+\\(admin|c|ipc)\$/i, 'network path'],
];

export function suspicion(path: string): string {
  const reasons = SUSPICIOUS.filter(([re]) => re.test(path)).map(([, why]) => why);
  if (isUserWritablePath(path)) reasons.push('user-writable location');
  return reasons.join(', ');
}

export interface ServiceRow extends EventRow {
  action: string;
  service: string;
  image: string;
  account: string;
  startType: string;
  detail: string;
  flags: string;
}

function toRow(e: EvtxEvent): ServiceRow {
  const base = { event: e, service: d(e, 'param1'), image: '', account: '', startType: '', detail: '', flags: '' };
  switch (e.eventId) {
    case 7045: {
      const image = d(e, 'ImagePath');
      return { ...base, action: 'Service installed', service: d(e, 'ServiceName'), image, account: d(e, 'AccountName'), startType: d(e, 'StartType'), detail: d(e, 'ServiceType'), flags: suspicion(image) };
    }
    case 4697: {
      const image = d(e, 'ServiceFileName');
      const start = d(e, 'ServiceStartType');
      return {
        ...base,
        action: 'Service installed (Security)',
        service: d(e, 'ServiceName'),
        image,
        account: d(e, 'ServiceAccount'),
        startType: START_TYPES[start] ?? start,
        detail: `By ${account(e.data['SubjectDomainName'], e.data['SubjectUserName'])}`,
        flags: suspicion(image),
      };
    }
    case 7036:
      return { ...base, action: 'State changed', detail: d(e, 'param2') };
    case 7040:
      return { ...base, action: 'Start type changed', startType: d(e, 'param3'), detail: `${d(e, 'param2')} → ${d(e, 'param3')}${d(e, 'param4') ? ` (key ${d(e, 'param4')})` : ''}` };
    case 7034:
      return { ...base, action: 'Terminated unexpectedly', detail: d(e, 'param2') && `${d(e, 'param2')} time(s)` };
    default:
      return { ...base, action: 'Control sent', detail: d(e, 'param2') };
  }
}

const eventColumns: Column<ServiceRow>[] = withBase<ServiceRow>([
  text('action', 'Action', r => r.action, { size: 200, facet: true, tone: r => (r.flags ? 'danger' : r.action.startsWith('Service installed') ? 'warning' : undefined) }),
  text('service', 'Service', r => r.service, { size: 220 }),
  text('image', 'Image path', r => r.image, { size: 380, kind: 'mono' }),
  text('flags', 'Flags', r => r.flags, { size: 180, facet: true, tone: r => (r.flags ? 'danger' : undefined) }),
  text('account', 'Account', r => r.account, { size: 160, facet: true }),
  text('startType', 'Start type', r => r.startType, { size: 120, facet: true }),
  text('detail', 'Detail', r => r.detail, { size: 240 }),
]);

interface ServiceSummary {
  service: string;
  computer: string;
  installed: number;
  image: string;
  account: string;
  startType: string;
  lastState: string;
  lastStateAt: number;
  crashes: number;
  flags: string;
  sample: EvtxEvent;
}

const summaryColumns: Column<ServiceSummary>[] = [
  text('service', 'Service', r => r.service, { size: 220 }),
  text('computer', 'Computer', r => r.computer, { size: 150, facet: true }),
  { id: 'installed', label: 'Installed', kind: 'time', value: r => r.installed, size: 190 },
  text('image', 'Image path', r => r.image, { size: 380, kind: 'mono' }),
  text('flags', 'Flags', r => r.flags, { size: 160, facet: true, tone: r => (r.flags ? 'danger' : undefined) }),
  text('account', 'Account', r => r.account, { size: 150 }),
  text('startType', 'Start type', r => r.startType, { size: 120, facet: true }),
  text('lastState', 'Last state', r => r.lastState, { size: 100, facet: true }),
  { id: 'lastStateAt', label: 'State since', kind: 'time', value: r => r.lastStateAt, size: 190 },
  { id: 'crashes', label: 'Crashes', kind: 'number', value: r => r.crashes, size: 80 },
];

function summaries(rows: ServiceRow[]): ServiceSummary[] {
  return [...groupBy(rows, r => `${r.event.computer}\u0001${r.service.toLowerCase()}`).values()]
    .filter(list => list[0]!.service)
    .map(list => {
      const install = list.find(r => r.event.eventId === 7045 || r.event.eventId === 4697);
      const state = [...list].reverse().find(r => r.event.eventId === 7036);
      const start = [...list].reverse().find(r => r.startType);
      return {
        service: list[0]!.service,
        computer: list[0]!.event.computer,
        installed: install?.event.ts ?? NaN,
        image: install?.image ?? '',
        account: install?.account ?? '',
        startType: start?.startType ?? '',
        lastState: state?.detail ?? '',
        lastStateAt: state?.event.ts ?? NaN,
        crashes: list.filter(r => r.event.eventId === 7034).length,
        flags: install?.flags ?? '',
        sample: (install ?? list[0]!).event,
      };
    });
}

export const services: Plugin = {
  name: 'services',
  label: 'Services',
  category: 'System',
  icon: 'gear-wide-connected',
  description:
    'Service installs (7045, 4697) with image path and account, start-type changes, crashes and state changes. Image paths typical of remote execution tools and payloads are flagged for review.',
  sources: SOURCES,
  options: [{ id: 'showStates', label: 'Show start/stop state changes (7036)', default: false }],
  analyze(ctx, opts) {
    const all = ctx.select(SOURCES).map(toRow);
    const rows = opts['showStates'] ? all : all.filter(r => r.event.eventId !== 7036);
    const installs = all.filter(r => r.event.eventId === 7045 || r.event.eventId === 4697);
    const flagged = installs.filter(r => r.flags);
    return {
      stats: [
        { label: 'Service installs', value: installs.length, tone: installs.length ? 'warning' : undefined },
        { label: 'Flagged installs', value: flagged.length, tone: flagged.length ? 'danger' : undefined },
        { label: 'Start type changes', value: all.filter(r => r.event.eventId === 7040).length },
        { label: 'Crashes', value: all.filter(r => r.event.eventId === 7034).length },
        { label: 'Services seen', value: new Set(all.map(r => r.service.toLowerCase()).filter(Boolean)).size },
      ],
      charts: [{ kind: 'timeline', title: 'Service installs over time', series: [{ name: 'Installs', ts: installs.map(r => r.event.ts) }] }],
      views: [
        eventView('events', 'Events', rows, eventColumns),
        { id: 'services', label: 'Services', rows: summaries(all), columns: summaryColumns, event: r => r.sample, sort: { id: 'installed', desc: true } },
      ],
      notes: [],
    };
  },
};
