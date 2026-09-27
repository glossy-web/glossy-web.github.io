import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec } from '@/core/plugin';
import { account, basename, isUserWritablePath, pid, ranking } from '@/core/format';
import { messageCode } from '@/core/lookups';
import { d, eventView, groupBy, SECURITY, text, withBase, type EventRow } from '../common';

const SYSMON = 'Microsoft-Windows-Sysmon';
const AE = 'Microsoft-Windows-Application-Experience';

const SOURCES: SourceSpec[] = [
  { channel: 'Security', provider: SECURITY, ids: [4688, 4689] },
  { channel: 'Microsoft-Windows-Sysmon/Operational', provider: SYSMON, ids: [1, 5], offByDefault: true },
  { channel: 'Microsoft-Windows-Application-Experience/Program-Telemetry', provider: AE, ids: [500] },
];

const INTEGRITY: Record<string, string> = {
  'S-1-16-4096': 'Low',
  'S-1-16-8192': 'Medium',
  'S-1-16-8448': 'Medium Plus',
  'S-1-16-12288': 'High',
  'S-1-16-16384': 'System',
};

const num = (v: string) => (v === '' ? -1 : Number(v));


export interface ProcessRow extends EventRow {
  action: 'Created' | 'Terminated' | 'Compatibility fix applied';
  image: string;
  pid: string;
  parent: string;
  parentInferred: boolean;
  ppid: string;
  commandLine: string;
  user: string;
  integrity: string;
  hashes: string;
  source: string;
}

/**
 * Walks events in time order, keeping the processes alive per computer so a 4688
 * without ParentProcessName (before Windows 10) gets its parent from the matching
 * earlier creation; a 4689 frees the PID for reuse.
 */
function toRows(events: EvtxEvent[]): ProcessRow[] {
  const alive = new Map<string, string>();
  const rows: ProcessRow[] = [];
  for (const e of events) {
    const base = { event: e, parent: '', parentInferred: false, ppid: '', commandLine: '', user: '', integrity: '', hashes: '', pid: '', image: '' };
    if (e.provider.toLowerCase() === SYSMON.toLowerCase()) {
      if (e.eventId === 1) {
        rows.push({
          ...base,
          action: 'Created',
          image: d(e, 'Image'),
          pid: d(e, 'ProcessId'),
          parent: d(e, 'ParentImage'),
          ppid: d(e, 'ParentProcessId'),
          commandLine: d(e, 'CommandLine'),
          user: d(e, 'User'),
          integrity: d(e, 'IntegrityLevel'),
          hashes: d(e, 'Hashes'),
          source: 'Sysmon 1',
        });
      } else {
        rows.push({ ...base, action: 'Terminated', image: d(e, 'Image'), pid: d(e, 'ProcessId'), source: 'Sysmon 5' });
      }
      continue;
    }
    if (e.eventId === 500) {
      rows.push({ ...base, action: 'Compatibility fix applied', image: d(e, 'ExePath'), pid: pid(d(e, 'ProcessId')), commandLine: d(e, 'FixName'), source: 'Application-Experience 500' });
      continue;
    }
    if (e.eventId === 4688) {
      const image = d(e, 'NewProcessName');
      const newPid = pid(d(e, 'NewProcessId'));
      const parentPid = pid(d(e, 'ProcessId'));
      const key = (p: string) => `${e.computer}\u0001${p}`;
      const logged = d(e, 'ParentProcessName');
      const inferred = logged ? '' : alive.get(key(parentPid)) ?? '';
      alive.set(key(newPid), image);
      const target = account(e.data['TargetDomainName'], e.data['TargetUserName']);
      rows.push({
        ...base,
        action: 'Created',
        image,
        pid: newPid,
        parent: logged || inferred,
        parentInferred: !logged && !!inferred,
        ppid: parentPid,
        commandLine: d(e, 'CommandLine'),
        user: target || account(e.data['SubjectDomainName'], e.data['SubjectUserName']),
        integrity: INTEGRITY[d(e, 'MandatoryLabel')] ?? messageCode(d(e, 'TokenElevationType')),
        source: 'Security 4688',
      });
    } else {
      const p = pid(d(e, 'ProcessId'));
      alive.delete(`${e.computer}\u0001${p}`);
      rows.push({ ...base, action: 'Terminated', image: d(e, 'ProcessName'), pid: p, user: account(e.data['SubjectDomainName'], e.data['SubjectUserName']), source: 'Security 4689' });
    }
  }
  return rows;
}

const eventColumns: Column<ProcessRow>[] = withBase<ProcessRow>([
  text('action', 'Action', r => r.action, { size: 110, facet: true }),
  text('image', 'Process', r => r.image, { size: 320, tone: r => (isUserWritablePath(r.image) ? 'warning' : undefined) }),
  { id: 'pid', label: 'PID', kind: 'number', value: r => num(r.pid), text: r => r.pid, size: 70 },
  text('commandLine', 'Command line', r => r.commandLine, { size: 440, kind: 'mono' }),
  text('parent', 'Parent', r => r.parent, { size: 260, tone: r => (r.parentInferred ? 'muted' : undefined) }),
  { id: 'ppid', label: 'PPID', kind: 'number', value: r => num(r.ppid), text: r => r.ppid, size: 70 },
  text('user', 'User', r => r.user, { size: 180, facet: true }),
  text('integrity', 'Integrity / elevation', r => r.integrity, { size: 140, facet: true }),
  text('source', 'Source', r => r.source, { size: 130, facet: true, hidden: true }),
  text('hashes', 'Hashes', r => r.hashes, { size: 300, kind: 'mono', hidden: true }),
]);

interface ImageSummary {
  image: string;
  count: number;
  first: number;
  last: number;
  users: string;
  parents: string;
  sample: EvtxEvent;
}

const imageColumns: Column<ImageSummary>[] = [
  text('image', 'Executable', r => r.image, { size: 380, tone: r => (isUserWritablePath(r.image) ? 'warning' : undefined) }),
  { id: 'count', label: 'Executions', kind: 'number', value: r => r.count, size: 100 },
  { id: 'first', label: 'First', kind: 'time', value: r => r.first, size: 190 },
  { id: 'last', label: 'Last', kind: 'time', value: r => r.last, size: 190 },
  text('users', 'Users', r => r.users, { size: 220 }),
  text('parents', 'Parents', r => r.parents, { size: 320 }),
];

export const processExecution: Plugin = {
  name: 'process',
  label: 'Process Execution',
  category: 'Application',
  icon: 'terminal',
  description:
    'Process creation and termination (Security 4688/4689, Sysmon 1/5) with command lines and parents. Parents missing from older 4688 events are inferred from the process alive under that PID (shown dimmed). The Executables view sorts rarest first, a common hunting technique.',
  sources: SOURCES,
  analyze(ctx) {
    const rows = toRows(ctx.select(SOURCES));
    const created = rows.filter(r => r.action === 'Created');
    const security = created.filter(r => r.source === 'Security 4688');
    const images: ImageSummary[] = [...groupBy(created, r => r.image.toLowerCase()).values()].map(list => ({
      image: list[0]!.image,
      count: list.length,
      first: list[0]!.event.ts,
      last: list[list.length - 1]!.event.ts,
      users: [...new Set(list.map(r => r.user).filter(Boolean))].join(', '),
      parents: [...new Set(list.map(r => basename(r.parent)).filter(Boolean))].join(', '),
      sample: list[0]!.event,
    }));
    const notes = [];
    if (security.length && security.every(r => !('CommandLine' in r.event.data)))
      notes.push({
        tone: 'warning' as const,
        text: 'Security 4688 events carry no command line. Enable "Include command line in process creation events" (Administrative Templates › System › Audit Process Creation) to record it.',
      });
    const writable = created.filter(r => isUserWritablePath(r.image));
    return {
      stats: [
        { label: 'Process creations', value: created.length },
        { label: 'Terminations', value: rows.filter(r => r.action === 'Terminated').length },
        { label: 'Distinct executables', value: images.length },
        { label: 'Run from user-writable paths', value: writable.length, tone: writable.length ? 'warning' : undefined },
      ],
      charts: [{ kind: 'ranking', title: 'Most executed', items: ranking(created.map(r => basename(r.image)), 12) }],
      views: [
        eventView('events', 'Events', rows, eventColumns),
        { id: 'executables', label: 'Executables', rows: images, columns: imageColumns, event: r => r.sample, sort: { id: 'count' } },
      ],
      notes,
    };
  },
};
