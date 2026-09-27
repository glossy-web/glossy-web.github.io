import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, Tone } from '@/core/plugin';
import { account, countBy, ipScope, ranking } from '@/core/format';
import { failureReason, isNoiseAccount, logonTypeName, messageCode } from '@/core/lookups';
import { formatDuration } from '@/core/time';
import { d, eventView, groupBy, SECURITY, text, withBase, type EventRow } from '../common';

const LABELS: Record<number, string> = {
  4624: 'Logon',
  4625: 'Logon failed',
  4634: 'Logoff',
  4647: 'User-initiated logoff',
  4648: 'Logon with explicit credentials',
  4778: 'Session reconnected',
  4779: 'Session disconnected',
  4800: 'Workstation locked',
  4801: 'Workstation unlocked',
};

export interface LogonRow extends EventRow {
  action: string;
  user: string;
  sid: string;
  logonType: string;
  sourceIp: string;
  workstation: string;
  auth: string;
  logonId: string;
  process: string;
  admin: boolean;
  elevated: string;
  failure: string;
  target: string;
}

const key = (e: EvtxEvent, logonId: string) => `${e.computer}\u0001${logonId}`;

function toRow(e: EvtxEvent, admins: Set<string>): LogonRow {
  const row: LogonRow = {
    event: e,
    action: LABELS[e.eventId] ?? String(e.eventId),
    user: account(e.data['TargetDomainName'], e.data['TargetUserName']),
    sid: d(e, 'TargetUserSid'),
    logonType: logonTypeName(d(e, 'LogonType')),
    sourceIp: d(e, 'IpAddress'),
    workstation: d(e, 'WorkstationName'),
    auth: [d(e, 'AuthenticationPackageName'), d(e, 'LmPackageName')].filter(Boolean).join(' / '),
    logonId: d(e, 'TargetLogonId'),
    process: d(e, 'ProcessName'),
    admin: false,
    elevated: messageCode(d(e, 'ElevatedToken')),
    failure: '',
    target: '',
  };
  switch (e.eventId) {
    case 4624:
      row.admin = admins.has(key(e, row.logonId));
      break;
    case 4625:
      row.failure = failureReason(e.data['Status'], e.data['SubStatus']);
      break;
    case 4648:
      row.user = account(e.data['SubjectDomainName'], e.data['SubjectUserName']);
      row.sid = d(e, 'SubjectUserSid');
      row.logonId = d(e, 'SubjectLogonId');
      row.target = [account(e.data['TargetDomainName'], e.data['TargetUserName']), d(e, 'TargetServerName')].filter(Boolean).join(' @ ');
      break;
    case 4778:
    case 4779:
      row.user = account(e.data['AccountDomain'], e.data['AccountName']);
      row.sourceIp = d(e, 'ClientAddress');
      row.workstation = d(e, 'ClientName');
      row.logonId = d(e, 'LogonID');
      row.target = d(e, 'SessionName');
      break;
  }
  return row;
}

function isNoise(r: LogonRow): boolean {
  const e = r.event;
  if (e.eventId === 4648) return isNoiseAccount(e.data['SubjectUserName'] ?? '', r.sid);
  if (e.eventId === 4778 || e.eventId === 4779) return false;
  const type = Number(e.data['LogonType']);
  if (type === 0 || type === 5) return true;
  return isNoiseAccount(e.data['TargetUserName'] ?? '', r.sid);
}

function tone(r: LogonRow): Tone | undefined {
  if (r.event.eventId === 4625) return 'danger';
  if (r.admin) return 'warning';
  return undefined;
}

const eventColumns: Column<LogonRow>[] = withBase<LogonRow>([
  text('action', 'Action', r => r.action, { size: 170, facet: true, tone }),
  text('user', 'Account', r => r.user, { size: 200 }),
  text('logonType', 'Logon type', r => r.logonType, { size: 150, facet: true }),
  text('sourceIp', 'Source IP', r => r.sourceIp, { size: 130 }),
  text('workstation', 'Workstation', r => r.workstation, { size: 130 }),
  text('admin', 'Admin', r => (r.admin ? 'Yes' : ''), { size: 70, facet: true }),
  text('failure', 'Failure reason', r => r.failure, { size: 230, facet: true }),
  text('target', 'Target / session', r => r.target, { size: 200 }),
  text('auth', 'Auth package', r => r.auth, { size: 120, facet: true }),
  text('process', 'Process', r => r.process, { size: 220, hidden: true }),
  text('logonId', 'Logon ID', r => r.logonId, { size: 110, kind: 'mono', hidden: true }),
  text('elevated', 'Elevated token', r => r.elevated, { size: 100, hidden: true }),
  text('sid', 'SID', r => r.sid, { size: 200, kind: 'mono', hidden: true }),
]);

interface SessionRow extends EventRow {
  end: EvtxEvent | null;
  user: string;
  logonType: string;
  sourceIp: string;
  admin: boolean;
  logonId: string;
}

const sessionColumns: Column<SessionRow>[] = withBase<SessionRow>([
  { id: 'end', label: 'Logoff', kind: 'time', value: r => r.end?.ts ?? NaN, size: 230 },
  { id: 'duration', label: 'Duration', kind: 'number', value: r => (r.end ? r.end.ts - r.event.ts : NaN), text: r => (r.end ? formatDuration(r.end.ts - r.event.ts) : 'no logoff recorded'), size: 140 },
  text('user', 'Account', r => r.user, { size: 200 }),
  text('logonType', 'Logon type', r => r.logonType, { size: 150, facet: true }),
  text('sourceIp', 'Source IP', r => r.sourceIp, { size: 130 }),
  text('admin', 'Admin', r => (r.admin ? 'Yes' : ''), { size: 70, facet: true }),
  text('logonId', 'Logon ID', r => r.logonId, { size: 110, kind: 'mono' }),
]);

interface FailureRow {
  source: string;
  user: string;
  count: number;
  first: number;
  last: number;
  reasons: string;
  types: string;
  sample: EvtxEvent;
}

const failureColumns: Column<FailureRow>[] = [
  text('source', 'Source IP / workstation', r => r.source, { size: 200 }),
  text('user', 'Account', r => r.user, { size: 200 }),
  { id: 'count', label: 'Failures', kind: 'number', value: r => r.count, size: 90, tone: r => (r.count >= 10 ? 'danger' : undefined) },
  { id: 'first', label: 'First', kind: 'time', value: r => r.first, size: 230 },
  { id: 'last', label: 'Last', kind: 'time', value: r => r.last, size: 230 },
  text('reasons', 'Reasons', r => r.reasons, { size: 320 }),
  text('types', 'Logon types', r => r.types, { size: 160 }),
];

export const logon: Plugin = {
  name: 'logon',
  label: 'Account Logon',
  category: 'Account',
  icon: 'log-in',
  description:
    'Logon, logoff and failed logons from the Security log. Sessions are paired by Logon ID; administrator logons are those with a 4672 (special privileges) for the same Logon ID.',
  sources: [{ channel: 'Security', provider: SECURITY, ids: [4624, 4625, 4634, 4647, 4648, 4672, 4778, 4779, 4800, 4801] }],
  options: [{ id: 'hideNoise', label: 'Hide system, service and machine accounts', default: true }],
  analyze(ctx, opts) {
    const events = ctx.select(this.sources);
    const admins = new Set(events.filter(e => e.eventId === 4672).map(e => key(e, d(e, 'SubjectLogonId'))));
    const all = events.filter(e => e.eventId !== 4672).map(e => toRow(e, admins));
    const rows = opts['hideNoise'] ? all.filter(r => !isNoise(r)) : all;

    const successes = rows.filter(r => r.event.eventId === 4624);
    const failures = rows.filter(r => r.event.eventId === 4625);

    // Pair each logon with the first logoff for the same Logon ID on the same computer.
    const logoffs = groupBy(
      events.filter(e => e.eventId === 4634 || e.eventId === 4647),
      e => key(e, d(e, 'TargetLogonId')),
    );
    const sessions: SessionRow[] = successes.map(r => {
      const candidates = logoffs.get(key(r.event, r.logonId)) ?? [];
      const end = candidates.find(e => e.ts >= r.event.ts) ?? null;
      return { event: r.event, end, user: r.user, logonType: r.logonType, sourceIp: r.sourceIp, admin: r.admin, logonId: r.logonId };
    });

    const bySource = groupBy(failures, r => `${r.sourceIp || r.workstation}\u0001${r.user}`);
    const failureGroups: FailureRow[] = [...bySource.values()].map(list => ({
      source: list[0]!.sourceIp || list[0]!.workstation,
      user: list[0]!.user,
      count: list.length,
      first: list[0]!.event.ts,
      last: list[list.length - 1]!.event.ts,
      reasons: countBy(list, r => r.failure).map(([k, n]) => `${k} ×${n}`).join('; '),
      types: [...new Set(list.map(r => r.logonType))].join(', '),
      sample: list[0]!.event,
    }));

    const publicSources = new Set(rows.filter(r => ipScope(r.sourceIp) === 'public').map(r => r.sourceIp));
    const notes = [];
    if (opts['hideNoise'] && all.length !== rows.length)
      notes.push({ tone: 'info' as const, text: `${(all.length - rows.length).toLocaleString()} events from SYSTEM, service, machine ($) and virtual accounts are hidden.` });
    if (publicSources.size)
      notes.push({ tone: 'warning' as const, text: `Logon activity from ${publicSources.size} public IP address(es): ${[...publicSources].slice(0, 10).join(', ')}` });

    return {
      stats: [
        { label: 'Successful logons', value: successes.length },
        { label: 'Failed logons', value: failures.length, tone: failures.length ? 'danger' : undefined },
        { label: 'Accounts', value: new Set(successes.map(r => r.user.toLowerCase())).size },
        { label: 'Admin logons', value: successes.filter(r => r.admin).length },
        { label: 'Remote interactive (type 10)', value: successes.filter(r => r.event.data['LogonType'] === '10').length },
        { label: 'Explicit credentials (4648)', value: rows.filter(r => r.event.eventId === 4648).length },
      ],
      charts: [
        {
          kind: 'clock',
          title: 'Logon activity by time of day',
          series: [
            { name: 'Logon', ts: successes.map(r => r.event.ts) },
            { name: 'Failed logon', ts: failures.map(r => r.event.ts) },
            { name: 'Logoff', ts: rows.filter(r => r.event.eventId === 4634 || r.event.eventId === 4647).map(r => r.event.ts) },
          ],
        },
        { kind: 'ranking', title: 'Failed logons by reason', items: ranking(failures.map(r => r.failure || '(no status)'), 8) },
      ],
      views: [
        {
          ...eventView('events', 'Events', rows, eventColumns),
          timeline: r =>
            r.event.eventId === 4634 || r.event.eventId === 4647
              ? undefined
              : {
                  title: r.logonType ? `${r.action} (type ${r.logonType})` : r.action,
                  detail: [r.admin && 'Admin', r.failure, r.target && `Target ${r.target}`, r.workstation && `Workstation ${r.workstation}`, r.auth].filter(Boolean).join(' · '),
                  users: [r.user],
                  remote: r.sourceIp,
                  tone: tone(r),
                },
        },
        { ...eventView('sessions', 'Sessions', sessions, sessionColumns) },
        { id: 'failures', label: 'Failures by source', rows: failureGroups, columns: failureColumns, event: r => r.sample, sort: { id: 'count', desc: true } },
      ],
      notes,
    };
  },
};
