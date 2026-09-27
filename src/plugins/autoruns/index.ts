import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec, Tone } from '@/core/plugin';
import { account, xmlElements } from '@/core/format';
import { messageCode } from '@/core/lookups';
import { d, eventView, groupBy, SECURITY, text, withBase, type EventRow } from '../common';

const TS = 'Microsoft-Windows-TaskScheduler';
const SYSMON = 'Microsoft-Windows-Sysmon';
const WMI = 'Microsoft-Windows-WMI-Activity';

const SOURCES: SourceSpec[] = [
  { channel: 'Microsoft-Windows-TaskScheduler/Operational', provider: TS, ids: [106, 140, 141, 142, 200, 201, 129], offByDefault: true },
  { channel: 'Security', provider: SECURITY, ids: [4698, 4699, 4700, 4701, 4702, 4657, 4663] },
  { channel: 'Microsoft-Windows-Sysmon/Operational', provider: SYSMON, ids: [13], offByDefault: true },
  { channel: 'Microsoft-Windows-WMI-Activity/Operational', provider: WMI, ids: [5861] },
];

/** Registry locations that start programs automatically (value names under these keys). */
const AUTOSTART_KEYS: [RegExp, string][] = [
  [/\\CurrentVersion\\(Run|RunOnce|RunOnceEx|RunServices|RunServicesOnce)(\\|$)/i, 'Run key'],
  [/\\Policies\\Explorer\\Run(\\|$)/i, 'Policy Run key'],
  [/\\Winlogon(\\|$)/i, 'Winlogon'],
  [/\\Browser Helper Objects(\\|$)/i, 'Browser Helper Object'],
  [/\\Internet Explorer\\(UrlSearchHooks|Toolbar|Extensions)(\\|$)/i, 'Internet Explorer extension'],
  [/\\Terminal Server\\Wds\\rdpwd(\\|$)/i, 'RDP startup program'],
  [/\\Image File Execution Options\\/i, 'Image File Execution Options'],
];

const WINLOGON_VALUES = /^(Userinit|Shell|Taskman|AppSetup)$/i;

function autostartKind(key: string, valueName: string): string {
  for (const [re, kind] of AUTOSTART_KEYS) {
    if (!re.test(key)) continue;
    if (kind === 'Winlogon' && !WINLOGON_VALUES.test(valueName)) return '';
    if (kind === 'Image File Execution Options' && !/^(Debugger|GlobalFlag)$/i.test(valueName)) return '';
    return kind;
  }
  return '';
}

const STARTUP_FOLDER = /\\Start Menu\\Programs\\Startup\\/i;

const TASK_LABELS: Record<number, string> = {
  106: 'Task registered',
  140: 'Task updated',
  141: 'Task deleted',
  142: 'Task disabled',
  200: 'Task action started',
  201: 'Task action completed',
  129: 'Task process created',
  4698: 'Task created',
  4699: 'Task deleted',
  4700: 'Task enabled',
  4701: 'Task disabled',
  4702: 'Task updated',
};

const RUNS = new Set([200, 201, 129]);

export interface AutorunRow extends EventRow {
  mechanism: 'Scheduled task' | 'Registry' | 'Startup folder' | 'WMI subscription';
  action: string;
  name: string;
  command: string;
  user: string;
  process: string;
}

/** Commands of the Exec actions in a task definition. */
export function taskCommands(xml: string): string {
  const commands = xmlElements(xml, 'Command');
  const args = xmlElements(xml, 'Arguments');
  return commands.map((c, i) => [c, args[i]].filter(Boolean).join(' ')).join(' ; ');
}

function toRow(e: EvtxEvent): AutorunRow | null {
  const p = e.provider.toLowerCase();
  if (p === TS.toLowerCase()) {
    return {
      event: e,
      mechanism: 'Scheduled task',
      action: TASK_LABELS[e.eventId]!,
      name: d(e, 'TaskName'),
      command: d(e, 'ActionName') || d(e, 'Path'),
      user: d(e, 'UserContext') || d(e, 'UserName'),
      process: e.eventId === 129 ? d(e, 'ProcessID') && `PID ${d(e, 'ProcessID')}` : '',
    };
  }
  if (p === WMI.toLowerCase()) {
    return { event: e, mechanism: 'WMI subscription', action: 'Permanent event consumer registered', name: d(e, 'Namespace') || d(e, 'ESS'), command: d(e, 'CONSUMER') || d(e, 'Consumer') || d(e, 'PossibleCause'), user: '', process: '' };
  }
  if (p === SYSMON.toLowerCase()) {
    const target = d(e, 'TargetObject');
    const slash = target.lastIndexOf('\\');
    const kind = autostartKind(target.slice(0, slash), target.slice(slash + 1));
    if (!kind) return null;
    return { event: e, mechanism: 'Registry', action: `${kind} set (Sysmon)`, name: target, command: d(e, 'Details'), user: d(e, 'User'), process: d(e, 'Image') };
  }
  const by = account(e.data['SubjectDomainName'], e.data['SubjectUserName']);
  if (e.eventId === 4657) {
    const key = d(e, 'ObjectName');
    const valueName = d(e, 'ObjectValueName');
    const kind = autostartKind(key, valueName);
    if (!kind) return null;
    return {
      event: e,
      mechanism: 'Registry',
      action: `${kind}: ${messageCode(d(e, 'OperationType')) || 'value changed'}`,
      name: `${key}\\${valueName}`,
      command: d(e, 'NewValue') || d(e, 'OldValue'),
      user: by,
      process: d(e, 'ProcessName'),
    };
  }
  if (e.eventId === 4663) {
    const path = d(e, 'ObjectName');
    const mask = parseInt(d(e, 'AccessMask') || '0', 16);
    // WriteData/AddFile (0x2) on a file under a Startup folder.
    if (!STARTUP_FOLDER.test(path) || !(mask & 0x2)) return null;
    return { event: e, mechanism: 'Startup folder', action: 'File written to Startup folder', name: path, command: '', user: by, process: d(e, 'ProcessName') };
  }
  // 4698-4702 carry the full task XML.
  return {
    event: e,
    mechanism: 'Scheduled task',
    action: TASK_LABELS[e.eventId]!,
    name: d(e, 'TaskName'),
    command: taskCommands(d(e, 'TaskContent') || d(e, 'TaskContentNew')),
    user: by,
    process: '',
  };
}

function tone(r: AutorunRow): Tone | undefined {
  if (r.mechanism === 'WMI subscription') return 'danger';
  if (r.event.eventId === 4698 || r.event.eventId === 106 || r.mechanism !== 'Scheduled task') return 'warning';
  return undefined;
}

const eventColumns: Column<AutorunRow>[] = withBase<AutorunRow>([
  text('mechanism', 'Mechanism', r => r.mechanism, { size: 140, facet: true }),
  text('action', 'Action', r => r.action, { size: 240, facet: true, tone }),
  text('name', 'Task / key / file', r => r.name, { size: 360 }),
  text('command', 'Command / value', r => r.command, { size: 380, kind: 'mono' }),
  text('user', 'User', r => r.user, { size: 180, facet: true }),
  text('process', 'Process', r => r.process, { size: 240 }),
]);

interface TaskSummary {
  name: string;
  computer: string;
  created: number;
  updated: number;
  deleted: number;
  runs: number;
  lastRun: number;
  commands: string;
  sample: EvtxEvent;
}

const taskColumns: Column<TaskSummary>[] = [
  text('name', 'Task', r => r.name, { size: 320 }),
  text('computer', 'Computer', r => r.computer, { size: 150, facet: true }),
  { id: 'created', label: 'Registered', kind: 'time', value: r => r.created, size: 190 },
  { id: 'updated', label: 'Last updated', kind: 'time', value: r => r.updated, size: 190 },
  { id: 'deleted', label: 'Deleted', kind: 'time', value: r => r.deleted, size: 190, tone: r => (Number.isFinite(r.deleted) ? 'warning' : undefined) },
  { id: 'runs', label: 'Runs', kind: 'number', value: r => r.runs, size: 70 },
  { id: 'lastRun', label: 'Last run', kind: 'time', value: r => r.lastRun, size: 190 },
  text('commands', 'Commands', r => r.commands, { size: 380, kind: 'mono' }),
];

function taskSummaries(rows: AutorunRow[]): TaskSummary[] {
  const tasks = rows.filter(r => r.mechanism === 'Scheduled task' && r.name);
  return [...groupBy(tasks, r => `${r.event.computer}\u0001${r.name.toLowerCase()}`).values()].map(list => {
    const last = (ids: number[]) => [...list].reverse().find(r => ids.includes(r.event.eventId))?.event.ts ?? NaN;
    return {
      name: list[0]!.name,
      computer: list[0]!.event.computer,
      created: last([106, 4698]),
      updated: last([140, 4702]),
      deleted: last([141, 4699]),
      runs: list.filter(r => r.event.eventId === 200).length,
      lastRun: last([200, 129]),
      commands: [...new Set(list.map(r => r.command).filter(Boolean))].join(' ; '),
      sample: list[0]!.event,
    };
  });
}

export const autoruns: Plugin = {
  name: 'autoruns',
  label: 'Autoruns & Persistence',
  category: 'System',
  icon: 'play-circle',
  description:
    'Scheduled tasks (Task Scheduler log and Security 4698–4702 with the task command), autostart registry values (4657 with a SACL, or Sysmon 13), files written to Startup folders (4663) and WMI event consumers (5861).',
  sources: SOURCES,
  options: [
    { id: 'showRuns', label: 'Show task runs (200/201/129)', default: false },
    { id: 'hideBuiltin', label: 'Hide \\Microsoft\\ tasks', default: false },
  ],
  analyze(ctx, opts) {
    const all = ctx
      .select(SOURCES)
      .map(toRow)
      .filter((r): r is AutorunRow => r !== null);
    const builtin = (r: AutorunRow) => r.mechanism === 'Scheduled task' && /^\\Microsoft\\/i.test(r.name);
    const visible = opts['hideBuiltin'] ? all.filter(r => !builtin(r)) : all;
    const rows = opts['showRuns'] ? visible : visible.filter(r => !RUNS.has(r.event.eventId));
    const created = all.filter(r => r.event.eventId === 106 || r.event.eventId === 4698);
    return {
      stats: [
        { label: 'Tasks registered', value: created.length, tone: created.length ? 'warning' : undefined },
        { label: 'Tasks deleted', value: all.filter(r => r.event.eventId === 141 || r.event.eventId === 4699).length },
        { label: 'Autostart registry changes', value: all.filter(r => r.mechanism === 'Registry').length },
        { label: 'Startup folder writes', value: all.filter(r => r.mechanism === 'Startup folder').length },
        { label: 'WMI consumers', value: all.filter(r => r.mechanism === 'WMI subscription').length },
      ],
      charts: [],
      views: [
        eventView('events', 'Events', rows, eventColumns),
        { id: 'tasks', label: 'Tasks', rows: taskSummaries(visible), columns: taskColumns, event: r => r.sample, sort: { id: 'created', desc: true } },
      ],
      notes: [],
    };
  },
};
