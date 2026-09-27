import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, PluginContext, Tone } from '@/core/plugin';
import { account, clean } from '@/core/format';
import { isNoiseAccount } from '@/core/lookups';
import { d, eventView, groupBy, SECURITY, text, withBase, type EventRow } from '../common';

const LABELS: Record<number, string> = {
  4720: 'User account created',
  4722: 'User account enabled',
  4723: 'Password change attempted',
  4724: 'Password reset attempted',
  4725: 'User account disabled',
  4726: 'User account deleted',
  4738: 'User account changed',
  4740: 'User account locked out',
  4767: 'User account unlocked',
  4781: 'Account name changed',
  4728: 'Member added to global group',
  4729: 'Member removed from global group',
  4732: 'Member added to local group',
  4733: 'Member removed from local group',
  4756: 'Member added to universal group',
  4757: 'Member removed from universal group',
  4731: 'Local group created',
  4734: 'Local group deleted',
  4735: 'Local group changed',
  4798: "User's local group membership enumerated",
  4799: 'Local group membership enumerated',
};

const MEMBERSHIP = new Set([4728, 4729, 4732, 4733, 4756, 4757]);
const ADDED = new Set([4728, 4732, 4756]);
const GROUP_EVENTS = new Set([4731, 4734, 4735, 4799]);
const ENUMERATION = new Set([4798, 4799]);

/** Groups whose membership grants administrative control. */
function privilegedGroup(name: string, sid: string): boolean {
  if (/^S-1-5-32-(544|548|549|551|555)$/.test(sid) || /-(512|518|519|520)$/.test(sid)) return true;
  return /admin|domain admins|enterprise admins|backup operators|remote desktop users/i.test(name);
}

/** Fields of 4720/4738 that carry a value, as "Name=value" (unchanged fields are "-" or "%%1793"). */
function changedAttributes(e: EvtxEvent): string {
  const skip = new Set(['TargetUserName', 'TargetDomainName', 'TargetSid', 'SubjectUserSid', 'SubjectUserName', 'SubjectDomainName', 'SubjectLogonId', 'PrivilegeList', 'Dummy']);
  return Object.entries(e.data)
    .filter(([k, v]) => !skip.has(k) && v && v !== '-' && v !== '%%1793')
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export interface AccountRow extends EventRow {
  action: string;
  target: string;
  targetSid: string;
  group: string;
  by: string;
  detail: string;
  privileged: boolean;
}

function toRow(e: EvtxEvent, ctx: PluginContext): AccountRow {
  const row: AccountRow = {
    event: e,
    action: LABELS[e.eventId] ?? String(e.eventId),
    target: account(e.data['TargetDomainName'], e.data['TargetUserName']),
    targetSid: d(e, 'TargetSid'),
    group: '',
    by: account(e.data['SubjectDomainName'], e.data['SubjectUserName']),
    detail: '',
    privileged: false,
  };
  if (MEMBERSHIP.has(e.eventId)) {
    row.group = row.target;
    const memberSid = d(e, 'MemberSid');
    row.target = d(e, 'MemberName') || ctx.sidName(memberSid) || memberSid;
    row.targetSid = memberSid;
    row.privileged = ADDED.has(e.eventId) && privilegedGroup(row.group, d(e, 'TargetSid'));
  } else if (GROUP_EVENTS.has(e.eventId)) {
    row.group = row.target;
    row.target = '';
    if (e.eventId === 4799) row.detail = `Caller: ${d(e, 'CallerProcessName')}`;
  }
  switch (e.eventId) {
    case 4720:
    case 4738:
      row.detail = changedAttributes(e);
      break;
    case 4740:
      row.detail = `Caller computer: ${d(e, 'TargetDomainName')}`;
      row.target = d(e, 'TargetUserName');
      break;
    case 4781:
      row.target = account(e.data['TargetDomainName'], e.data['NewTargetUserName']);
      row.detail = `Renamed from ${d(e, 'OldTargetUserName')}`;
      break;
    case 4798:
      row.detail = `Caller: ${d(e, 'CallerProcessName')}`;
      break;
  }
  return row;
}

function tone(r: AccountRow): Tone | undefined {
  if (r.privileged) return 'danger';
  const id = r.event.eventId;
  if (id === 4720 || id === 4726 || id === 4740 || id === 4781) return 'warning';
  return undefined;
}

const eventColumns: Column<AccountRow>[] = withBase<AccountRow>([
  text('action', 'Action', r => r.action, { size: 250, facet: true, tone }),
  text('target', 'Account / member', r => r.target, { size: 220 }),
  text('group', 'Group', r => r.group, { size: 200, facet: true }),
  text('by', 'Changed by', r => r.by, { size: 190, facet: true }),
  text('detail', 'Detail', r => r.detail, { size: 360 }),
  text('sid', 'SID', r => r.targetSid, { size: 220, kind: 'mono', hidden: true }),
]);

interface AccountSummary {
  sid: string;
  name: string;
  created: number;
  deleted: number;
  lastReset: number;
  lastChange: number;
  state: string;
  groupsAdded: string;
  lastLogon: number;
  sample: EvtxEvent;
}

const summaryColumns: Column<AccountSummary>[] = [
  text('name', 'Account', r => r.name, { size: 220 }),
  text('sid', 'SID', r => r.sid, { size: 260, kind: 'mono' }),
  { id: 'created', label: 'Created', kind: 'time', value: r => r.created, size: 190 },
  { id: 'deleted', label: 'Deleted', kind: 'time', value: r => r.deleted, size: 190, tone: r => (Number.isFinite(r.deleted) ? 'danger' : undefined) },
  text('state', 'Last state', r => r.state, { size: 100, facet: true }),
  { id: 'lastReset', label: 'Last password reset', kind: 'time', value: r => r.lastReset, size: 190 },
  { id: 'lastChange', label: 'Last change', kind: 'time', value: r => r.lastChange, size: 190 },
  { id: 'lastLogon', label: 'Last logon (4624)', kind: 'time', value: r => r.lastLogon, size: 190 },
  text('groups', 'Added to groups', r => r.groupsAdded, { size: 260 }),
];

const USER_EVENTS = [4720, 4722, 4723, 4724, 4725, 4726, 4738, 4740, 4767, 4781];
const STATE: Record<number, string> = { 4720: 'Created', 4722: 'Enabled', 4725: 'Disabled', 4726: 'Deleted' };

export const accountManagement: Plugin = {
  name: 'account',
  label: 'Account Management',
  category: 'Account',
  icon: 'person-gear',
  description:
    'Creation, deletion, password resets, lockouts, renames and group membership changes. Additions to administrative groups are highlighted. The Accounts view builds a lifecycle per SID.',
  sources: [{ channel: 'Security', provider: SECURITY, ids: [...USER_EVENTS, 4728, 4729, 4732, 4733, 4756, 4757, 4731, 4734, 4735, 4798, 4799] }],
  options: [{ id: 'hideEnum', label: 'Hide membership enumeration (4798/4799)', default: true }],
  analyze(ctx, opts) {
    const events = ctx.select(this.sources);
    const all = events.map(e => toRow(e, ctx));
    const rows = opts['hideEnum'] ? all.filter(r => !ENUMERATION.has(r.event.eventId)) : all;

    // Last successful non-service logon per user SID.
    const logons = ctx.select([{ provider: SECURITY, ids: [4624] }]);
    const lastLogon = new Map<string, number>();
    for (const e of logons) {
      const type = d(e, 'LogonType');
      if (type === '5' || type === '0' || isNoiseAccount(e.data['TargetUserName'] ?? '')) continue;
      lastLogon.set(d(e, 'TargetUserSid'), e.ts);
    }

    const userRows = all.filter(r => USER_EVENTS.includes(r.event.eventId) || (MEMBERSHIP.has(r.event.eventId) && ADDED.has(r.event.eventId)));
    const summaries: AccountSummary[] = [...groupBy(userRows, r => r.targetSid || r.target).entries()]
      .filter(([k]) => k)
      .map(([sid, list]) => {
        const last = (ids: number[]) => {
          const hit = [...list].reverse().find(r => ids.includes(r.event.eventId));
          return hit ? hit.event.ts : NaN;
        };
        const stateEvent = [...list].reverse().find(r => [4720, 4722, 4725, 4726].includes(r.event.eventId));
        const state = stateEvent ? (STATE[stateEvent.event.eventId] ?? '') : '';
        const named = [...list].reverse().find(r => !MEMBERSHIP.has(r.event.eventId));
        return {
          sid: clean(sid.startsWith('S-') ? sid : ''),
          name: named?.target || list[0]!.target,
          created: last([4720]),
          deleted: last([4726]),
          lastReset: last([4724]),
          lastChange: last([4738, 4781]),
          state,
          groupsAdded: [...new Set(list.filter(r => MEMBERSHIP.has(r.event.eventId)).map(r => r.group))].join(', '),
          lastLogon: lastLogon.get(sid) ?? NaN,
          sample: list[0]!.event,
        };
      });

    const privileged = rows.filter(r => r.privileged);
    return {
      stats: [
        { label: 'Accounts created', value: rows.filter(r => r.event.eventId === 4720).length },
        { label: 'Accounts deleted', value: rows.filter(r => r.event.eventId === 4726).length },
        { label: 'Added to admin groups', value: privileged.length, tone: privileged.length ? 'danger' : undefined },
        { label: 'Password resets', value: rows.filter(r => r.event.eventId === 4724).length },
        { label: 'Lockouts', value: rows.filter(r => r.event.eventId === 4740).length },
      ],
      charts: [],
      views: [
        {
          ...eventView('events', 'Events', rows, eventColumns),
          timeline: r => ({ title: r.action, detail: [r.group && `Group ${r.group}`, r.detail].filter(Boolean).join(' · '), users: [r.target, r.by], tone: tone(r) }),
        },
        { id: 'accounts', label: 'Accounts', rows: summaries, columns: summaryColumns, event: r => r.sample, sort: { id: 'created', desc: true } },
      ],
      notes: opts['hideEnum'] && all.length > rows.length
        ? [{ tone: 'info', text: `${(all.length - rows.length).toLocaleString()} group membership enumeration events (4798/4799) are hidden; enable them to look for account discovery.` }]
        : [],
    };
  },
};
