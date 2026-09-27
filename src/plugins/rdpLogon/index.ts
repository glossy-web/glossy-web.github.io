import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec } from '@/core/plugin';
import { account, ipScope, splitHostPort } from '@/core/format';
import { failureReason, isNoiseAccount } from '@/core/lookups';
import { formatDuration } from '@/core/time';
import { d, eventView, groupBy, SECURITY, text, withBase, type EventRow } from '../common';

const LSM = 'Microsoft-Windows-TerminalServices-LocalSessionManager';
const RCM = 'Microsoft-Windows-TerminalServices-RemoteConnectionManager';
const CORE = 'Microsoft-Windows-RemoteDesktopServices-RdpCoreTS';
const CLIENT = 'Microsoft-Windows-TerminalServices-ClientActiveXCore';

const SOURCES: SourceSpec[] = [
  { channel: 'Microsoft-Windows-RemoteDesktopServices-RdpCoreTS/Operational', provider: CORE, ids: [131] },
  { channel: 'Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational', provider: RCM, ids: [1149] },
  { channel: 'Security', provider: SECURITY, ids: [4624, 4625, 4778, 4779] },
  { channel: 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational', provider: LSM, ids: [21, 22, 23, 24, 25, 39, 40] },
  { channel: 'Microsoft-Windows-TerminalServices-RDPClient/Operational', provider: CLIENT, ids: [1024, 1102] },
];

/** LSM 40 disconnect reason codes. */
const DISCONNECT_REASON: Record<string, string> = {
  '0': 'No additional information',
  '5': 'Replaced by a new connection',
  '11': 'Disconnected by the user',
  '12': 'Logged off by the user',
};

export interface RdpRow extends EventRow {
  direction: 'Inbound' | 'Outbound';
  stage: string;
  user: string;
  address: string;
  session: string;
  detail: string;
}

const REMOTE_TYPES = new Set(['10', '12']);

function toRow(e: EvtxEvent): RdpRow | null {
  const base = { event: e, direction: 'Inbound' as const, user: '', address: '', session: '', detail: '' };
  const p = e.provider.toLowerCase();
  if (p === LSM.toLowerCase()) {
    const stage: Record<number, string> = {
      21: 'Session logon',
      22: 'Shell start',
      23: 'Session logoff',
      24: 'Session disconnected',
      25: 'Session reconnected',
      39: 'Disconnected by another session',
      40: 'Session disconnected (reason)',
    };
    const detail =
      e.eventId === 40 ? DISCONNECT_REASON[d(e, 'Reason')] ?? `Reason ${d(e, 'Reason')}` : e.eventId === 39 ? `By session ${d(e, 'Source')}` : '';
    return { ...base, stage: stage[e.eventId]!, user: d(e, 'User'), address: d(e, 'Address'), session: d(e, 'SessionID') || d(e, 'Session') || d(e, 'TargetSession'), detail };
  }
  if (p === RCM.toLowerCase()) {
    return { ...base, stage: 'Network authentication succeeded', user: account(e.data['Param2'], e.data['Param1']), address: d(e, 'Param3') };
  }
  if (p === CORE.toLowerCase()) {
    return { ...base, stage: 'TCP connection accepted', address: splitHostPort(d(e, 'ClientIP')).ip, detail: d(e, 'ConnType') };
  }
  if (p === CLIENT.toLowerCase()) {
    return {
      ...base,
      direction: 'Outbound',
      stage: e.eventId === 1024 ? 'Outbound connection attempt' : 'Outbound connection (multi-transport)',
      address: d(e, 'Value'),
    };
  }
  // Security log: only RemoteInteractive logons and RDP session reconnect/disconnect.
  if (e.eventId === 4624 || e.eventId === 4625) {
    if (!REMOTE_TYPES.has(d(e, 'LogonType'))) return null;
    return {
      ...base,
      stage: e.eventId === 4624 ? 'Logon (RemoteInteractive)' : 'Logon failed (RemoteInteractive)',
      user: account(e.data['TargetDomainName'], e.data['TargetUserName']),
      address: d(e, 'IpAddress'),
      session: d(e, 'TargetLogonId'),
      detail: e.eventId === 4625 ? failureReason(e.data['Status'], e.data['SubStatus']) : d(e, 'WorkstationName'),
    };
  }
  if (e.eventId === 4778 || e.eventId === 4779) {
    return {
      ...base,
      stage: e.eventId === 4778 ? 'Session reconnected (Security)' : 'Session disconnected (Security)',
      user: account(e.data['AccountDomain'], e.data['AccountName']),
      address: d(e, 'ClientAddress'),
      session: d(e, 'SessionName'),
      detail: d(e, 'ClientName'),
    };
  }
  return null;
}

const isLocal = (r: RdpRow) => r.address.toUpperCase() === 'LOCAL';

const eventColumns: Column<RdpRow>[] = withBase<RdpRow>([
  text('direction', 'Direction', r => r.direction, { size: 90, facet: true }),
  text('stage', 'Stage', r => r.stage, { size: 230, facet: true, tone: r => (r.stage.startsWith('Logon failed') ? 'danger' : undefined) }),
  text('user', 'Account', r => r.user, { size: 190 }),
  text('address', 'Address', r => r.address, { size: 140 }),
  text('scope', 'IP scope', r => ipScope(r.address), { size: 90, facet: true, tone: r => (ipScope(r.address) === 'public' ? 'warning' : undefined) }),
  text('session', 'Session', r => r.session, { size: 110 }),
  text('detail', 'Detail', r => r.detail, { size: 220 }),
]);

interface SourceRow {
  address: string;
  scope: string;
  first: number;
  last: number;
  auth: number;
  logons: number;
  failures: number;
  users: string;
  sample: EvtxEvent;
}

const sourceColumns: Column<SourceRow>[] = [
  text('address', 'Source address', r => r.address, { size: 160 }),
  text('scope', 'Scope', r => r.scope, { size: 90, facet: true, tone: r => (r.scope === 'public' ? 'warning' : undefined) }),
  { id: 'first', label: 'First seen', kind: 'time', value: r => r.first, size: 190 },
  { id: 'last', label: 'Last seen', kind: 'time', value: r => r.last, size: 190 },
  { id: 'auth', label: 'Authenticated (1149)', kind: 'number', value: r => r.auth, size: 130 },
  { id: 'logons', label: 'Session logons', kind: 'number', value: r => r.logons, size: 120 },
  { id: 'failures', label: 'Failures', kind: 'number', value: r => r.failures, size: 90, tone: r => (r.failures ? 'danger' : undefined) },
  text('users', 'Accounts', r => r.users, { size: 280 }),
];

interface SessionRow extends EventRow {
  end: EvtxEvent | null;
  user: string;
  address: string;
  session: string;
  disconnects: number;
  reconnects: number;
}

const sessionColumns: Column<SessionRow>[] = withBase<SessionRow>([
  { id: 'end', label: 'Logoff', kind: 'time', value: r => r.end?.ts ?? NaN, size: 190 },
  { id: 'duration', label: 'Duration', kind: 'number', value: r => (r.end ? r.end.ts - r.event.ts : NaN), text: r => (r.end ? formatDuration(r.end.ts - r.event.ts) : 'no logoff recorded'), size: 140 },
  text('user', 'Account', r => r.user, { size: 190 }),
  text('address', 'Address', r => r.address, { size: 140 }),
  text('session', 'Session ID', r => r.session, { size: 90 }),
  { id: 'disconnects', label: 'Disconnects', kind: 'number', value: r => r.disconnects, size: 100 },
  { id: 'reconnects', label: 'Reconnects', kind: 'number', value: r => r.reconnects, size: 100 },
]);

/** Rebuilds sessions from LSM events: 21 opens, 24/25 count, 23 closes (per computer and session ID). */
function sessions(rows: RdpRow[]): SessionRow[] {
  const out: SessionRow[] = [];
  const lsm = rows.filter(r => r.event.provider.toLowerCase() === LSM.toLowerCase());
  for (const list of groupBy(lsm, r => `${r.event.computer}\u0001${r.session}`).values()) {
    let open: SessionRow | null = null;
    for (const r of list) {
      if (r.event.eventId === 21) {
        if (open) out.push(open);
        open = { event: r.event, end: null, user: r.user, address: r.address, session: r.session, disconnects: 0, reconnects: 0 };
      } else if (open && r.event.eventId === 24) open.disconnects++;
      else if (open && r.event.eventId === 25) open.reconnects++;
      else if (open && r.event.eventId === 23) {
        open.end = r.event;
        out.push(open);
        open = null;
      }
    }
    if (open) out.push(open);
  }
  return out;
}

export const rdpLogon: Plugin = {
  name: 'rdpLogon',
  label: 'RDP',
  category: 'Account',
  icon: 'display',
  description:
    'Remote Desktop, inbound (131 connection → 1149 authentication → 4624 type 10 → LSM 21/22, 24/25, 23) and outbound (RDP client 1024/1102). IP scope is classified locally; no lookups leave the browser.',
  sources: SOURCES,
  options: [{ id: 'hideLocal', label: 'Hide console (LOCAL) sessions', default: true }],
  analyze(ctx, opts) {
    const all = ctx
      .select(SOURCES)
      .map(toRow)
      .filter((r): r is RdpRow => r !== null);
    const rows = opts['hideLocal'] ? all.filter(r => !isLocal(r)) : all;
    const inbound = rows.filter(r => r.direction === 'Inbound');

    const bySource = groupBy(
      inbound.filter(r => r.address && !isLocal(r)),
      r => r.address,
    );
    const sourceRows: SourceRow[] = [...bySource].map(([address, list]) => ({
      address,
      scope: ipScope(address),
      first: list[0]!.event.ts,
      last: list[list.length - 1]!.event.ts,
      auth: list.filter(r => r.event.eventId === 1149).length,
      logons: list.filter(r => r.event.eventId === 21 || r.event.eventId === 4624).length,
      failures: list.filter(r => r.event.eventId === 4625).length,
      users: [...new Set(list.map(r => r.user).filter(u => u && !isNoiseAccount(u.split('\\').pop() ?? '')))].join(', '),
      sample: list[0]!.event,
    }));

    const failures = inbound.filter(r => r.event.eventId === 4625);
    const outbound = rows.filter(r => r.direction === 'Outbound');
    const publicSources = sourceRows.filter(s => s.scope === 'public');

    return {
      stats: [
        { label: 'Authenticated (1149)', value: inbound.filter(r => r.event.eventId === 1149).length },
        { label: 'Session logons (21)', value: inbound.filter(r => r.event.eventId === 21).length },
        { label: 'Failed RDP logons', value: failures.length, tone: failures.length ? 'danger' : undefined },
        { label: 'Source addresses', value: sourceRows.length },
        { label: 'Public sources', value: publicSources.length, tone: publicSources.length ? 'warning' : undefined },
        { label: 'Outbound targets', value: new Set(outbound.map(r => r.address)).size },
      ],
      charts: [
        {
          kind: 'clock',
          title: 'RDP activity by time of day',
          series: [
            { name: 'Inbound logon', ts: inbound.filter(r => [21, 1149, 4624].includes(r.event.eventId)).map(r => r.event.ts) },
            { name: 'Failed logon', ts: failures.map(r => r.event.ts) },
            { name: 'Outbound', ts: outbound.filter(r => r.event.eventId === 1024).map(r => r.event.ts) },
          ],
        },
      ],
      views: [
        eventView('events', 'Events', rows, eventColumns),
        eventView('sessions', 'Sessions', sessions(rows), sessionColumns),
        { id: 'sources', label: 'Source addresses', rows: sourceRows, columns: sourceColumns, event: r => r.sample, sort: { id: 'last', desc: true } },
      ],
      notes: [],
    };
  },
};
