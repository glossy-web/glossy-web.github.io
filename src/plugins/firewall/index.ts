import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, PluginContext, SourceSpec, Tone } from '@/core/plugin';
import { d, eventView, groupBy, pick, text, withBase, type EventRow } from '../common';

const FW = 'Microsoft-Windows-Windows Firewall With Advanced Security';

/** Windows 10 IDs and their Windows 11 equivalents. */
const KIND: Record<number, Kind> = {
  2004: 'added', 2071: 'added', 2097: 'added',
  2005: 'modified', 2073: 'modified', 2099: 'modified',
  2006: 'deleted', 2052: 'deleted',
  2033: 'allDeleted', 2059: 'allDeleted',
  2032: 'reset', 2060: 'reset',
  2003: 'profileSetting', 2082: 'profileSetting',
  2002: 'globalSetting', 2083: 'globalSetting',
  2008: 'policy', 2009: 'policyFailed',
  2010: 'interfaceProfile',
};

type Kind = 'added' | 'modified' | 'deleted' | 'allDeleted' | 'reset' | 'profileSetting' | 'globalSetting' | 'policy' | 'policyFailed' | 'interfaceProfile';

const LABELS: Record<Kind, string> = {
  added: 'Rule added',
  modified: 'Rule modified',
  deleted: 'Rule deleted',
  allDeleted: 'All rules deleted',
  reset: 'Configuration reset to defaults',
  profileSetting: 'Profile setting changed',
  globalSetting: 'Global setting changed',
  policy: 'Group Policy settings changed',
  policyFailed: 'Group Policy settings failed to load',
  interfaceProfile: 'Network profile changed on interface',
};

const SOURCES: SourceSpec[] = [
  { channel: 'Microsoft-Windows-Windows Firewall With Advanced Security/Firewall', provider: FW, ids: Object.keys(KIND).map(Number) },
];

const DIRECTION: Record<string, string> = { '1': 'Inbound', '2': 'Outbound' };
const ACTION: Record<string, string> = { '2': 'Block', '3': 'Allow', '1': 'Allow (bypass)' };
const PROTOCOL: Record<string, string> = { '1': 'ICMPv4', '6': 'TCP', '17': 'UDP', '58': 'ICMPv6', '256': 'Any' };

export function profiles(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || v === '') return v;
  if ((n & 0x7) === 0x7 || n === 0x7fffffff) return 'All';
  return [n & 1 ? 'Domain' : '', n & 2 ? 'Private' : '', n & 4 ? 'Public' : ''].filter(Boolean).join(', ') || v;
}

/** SettingValue is a little-endian DWORD rendered as hex ("01000000") or a plain number. */
export function settingNumber(v: string): number {
  if (/^[0-9a-f]{8}$/i.test(v)) return parseInt(v.slice(6, 8) + v.slice(4, 6) + v.slice(2, 4) + v.slice(0, 2), 16);
  return Number(v);
}

export interface FirewallRow extends EventRow {
  kind: Kind;
  action: string;
  rule: string;
  ruleId: string;
  direction: string;
  verdict: string;
  protocol: string;
  ports: string;
  program: string;
  profiles: string;
  by: string;
  detail: string;
  disablesFirewall: boolean;
}

function toRow(e: EvtxEvent, ctx: PluginContext): FirewallRow {
  const kind = KIND[e.eventId]!;
  const local = pick(e, 'LocalPorts');
  const remote = pick(e, 'RemotePorts');
  const row: FirewallRow = {
    event: e,
    kind,
    action: LABELS[kind],
    rule: pick(e, 'RuleName'),
    ruleId: pick(e, 'RuleId'),
    direction: DIRECTION[d(e, 'Direction')] ?? d(e, 'Direction'),
    verdict: ACTION[d(e, 'Action')] ?? d(e, 'Action'),
    protocol: PROTOCOL[d(e, 'Protocol')] ?? d(e, 'Protocol'),
    ports: [local && `local ${local}`, remote && `remote ${remote}`].filter(Boolean).join(', '),
    program: pick(e, 'ApplicationPath', 'ServiceName'),
    profiles: profiles(d(e, 'Profiles')),
    by: [ctx.sidName(d(e, 'ModifyingUser')) || d(e, 'ModifyingUser'), d(e, 'ModifyingApplication')].filter(Boolean).join(' · '),
    detail: '',
    disablesFirewall: false,
  };
  if (kind === 'profileSetting' || kind === 'globalSetting') {
    const type = d(e, 'SettingType');
    const value = d(e, 'SettingValueString') || d(e, 'SettingValue');
    // FW_PROFILE_CONFIG_ENABLE_FW = 1
    row.disablesFirewall = kind === 'profileSetting' && type === '1' && settingNumber(d(e, 'SettingValue')) === 0;
    row.detail = row.disablesFirewall ? 'Firewall turned OFF' : type === '1' ? 'Firewall turned on' : `Setting ${type} = ${value}`;
  } else if (kind === 'interfaceProfile') {
    row.detail = `${d(e, 'InterfaceName')}: ${profiles(d(e, 'OldProfile'))} → ${profiles(d(e, 'NewProfile'))}`;
  } else if (kind === 'policyFailed') {
    row.detail = pick(e, 'ErrorCode', 'Reason');
  }
  return row;
}

function tone(r: FirewallRow): Tone | undefined {
  if (r.disablesFirewall || r.kind === 'allDeleted' || r.kind === 'reset') return 'danger';
  if (r.kind === 'added' && r.direction === 'Inbound' && r.verdict.startsWith('Allow')) return 'warning';
  return undefined;
}

const eventColumns: Column<FirewallRow>[] = withBase<FirewallRow>([
  text('action', 'Action', r => r.action, { size: 220, facet: true, tone }),
  text('rule', 'Rule', r => r.rule, { size: 240 }),
  text('direction', 'Direction', r => r.direction, { size: 90, facet: true }),
  text('verdict', 'Allow/Block', r => r.verdict, { size: 100, facet: true }),
  text('protocol', 'Protocol', r => r.protocol, { size: 80, facet: true }),
  text('ports', 'Ports', r => r.ports, { size: 160 }),
  text('program', 'Program / service', r => r.program, { size: 300 }),
  text('profiles', 'Profiles', r => r.profiles, { size: 130, facet: true }),
  text('detail', 'Detail', r => r.detail, { size: 220, tone: r => (r.disablesFirewall ? 'danger' : undefined) }),
  text('by', 'Changed by', r => r.by, { size: 280 }),
]);

interface RuleState {
  rule: string;
  computer: string;
  direction: string;
  verdict: string;
  protocol: string;
  ports: string;
  program: string;
  profiles: string;
  status: 'Present' | 'Deleted';
  lastChange: number;
  by: string;
  sample: EvtxEvent;
}

const ruleColumns: Column<RuleState>[] = [
  text('rule', 'Rule', r => r.rule, { size: 260 }),
  text('computer', 'Computer', r => r.computer, { size: 150, facet: true }),
  text('status', 'Status', r => r.status, { size: 90, facet: true, tone: r => (r.status === 'Deleted' ? 'muted' : undefined) }),
  text('direction', 'Direction', r => r.direction, { size: 90, facet: true }),
  text('verdict', 'Allow/Block', r => r.verdict, { size: 100, facet: true }),
  text('protocol', 'Protocol', r => r.protocol, { size: 80, facet: true }),
  text('ports', 'Ports', r => r.ports, { size: 160 }),
  text('program', 'Program / service', r => r.program, { size: 300 }),
  text('profiles', 'Profiles', r => r.profiles, { size: 130 }),
  { id: 'lastChange', label: 'Last change', kind: 'time', value: r => r.lastChange, size: 230 },
  text('by', 'Changed by', r => r.by, { size: 260 }),
];

/** Replays add/modify/delete per rule ID, as the original Glossy did, to show each rule's final state. */
function replay(rows: FirewallRow[]): RuleState[] {
  const out: RuleState[] = [];
  const ruleRows = rows.filter(r => r.ruleId && (r.kind === 'added' || r.kind === 'modified' || r.kind === 'deleted'));
  for (const list of groupBy(ruleRows, r => `${r.event.computer}\u0001${r.ruleId}`).values()) {
    let state: RuleState | null = null;
    for (const r of list) {
      if (r.kind === 'deleted') {
        if (state) Object.assign(state, { status: 'Deleted', lastChange: r.event.ts, by: r.by, sample: r.event });
        else state = { rule: r.rule, computer: r.event.computer, direction: '', verdict: '', protocol: '', ports: '', program: '', profiles: '', status: 'Deleted', lastChange: r.event.ts, by: r.by, sample: r.event };
      } else {
        state = {
          rule: r.rule,
          computer: r.event.computer,
          direction: r.direction,
          verdict: r.verdict,
          protocol: r.protocol,
          ports: r.ports,
          program: r.program,
          profiles: r.profiles,
          status: 'Present',
          lastChange: r.event.ts,
          by: r.by,
          sample: r.event,
        };
      }
    }
    if (state) out.push(state);
  }
  return out;
}

export const firewall: Plugin = {
  name: 'firewall',
  label: 'Firewall',
  category: 'System',
  icon: 'bricks',
  description:
    'Windows Defender Firewall rule and profile changes (Windows 10 and Windows 11 event IDs). Rules are replayed to show their state at the end of the log; disabling the firewall and new inbound allow rules are highlighted.',
  sources: SOURCES,
  analyze(ctx) {
    const rows = ctx.select(SOURCES).map(e => toRow(e, ctx));
    const disabled = rows.filter(r => r.disablesFirewall);
    const inboundAllow = rows.filter(r => r.kind === 'added' && r.direction === 'Inbound' && r.verdict.startsWith('Allow'));
    return {
      stats: [
        { label: 'Rules added', value: rows.filter(r => r.kind === 'added').length },
        { label: 'Inbound allow rules added', value: inboundAllow.length, tone: inboundAllow.length ? 'warning' : undefined },
        { label: 'Rules deleted', value: rows.filter(r => r.kind === 'deleted' || r.kind === 'allDeleted').length },
        { label: 'Firewall turned off', value: disabled.length, tone: disabled.length ? 'danger' : undefined },
      ],
      charts: [],
      views: [
        {
          ...eventView('events', 'Changes', rows, eventColumns),
          timeline: r => ({
            title: `Firewall: ${r.action}${r.rule ? ` (${r.rule})` : ''}`,
            detail: [r.direction, r.verdict, r.protocol, r.ports, r.program, r.profiles, r.detail].filter(Boolean).join(' · '),
            tone: tone(r),
          }),
        },
        { id: 'rules', label: 'Rules (replayed)', rows: replay(rows), columns: ruleColumns, event: r => r.sample, sort: { id: 'lastChange', desc: true } },
      ],
      notes: [{ tone: 'info', text: 'Only rules changed while the log was recording are known here; the full rule set lives in the registry (SYSTEM\\CurrentControlSet\\Services\\SharedAccess).' }],
    };
  },
};
