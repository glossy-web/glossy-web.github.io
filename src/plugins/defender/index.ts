import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec, Tone } from '@/core/plugin';
import { d, eventView, groupBy, text, withBase, type EventRow } from '../common';

const WD = 'Microsoft-Windows-Windows Defender';

const DETECTION_IDS = [1006, 1007, 1008, 1015, 1116, 1117, 1118, 1119];
const PROTECTION_IDS = [1009, 1013, 5001, 5004, 5007, 5010, 5012, 5013];

const SOURCES: SourceSpec[] = [{ channel: 'Microsoft-Windows-Windows Defender/Operational', provider: WD, ids: [...DETECTION_IDS, ...PROTECTION_IDS] }];

const LABELS: Record<number, string> = {
  1006: 'Malware detected (legacy)',
  1007: 'Action taken (legacy)',
  1008: 'Action failed (legacy)',
  1015: 'Suspicious behavior detected',
  1116: 'Malware detected',
  1117: 'Action taken',
  1118: 'Action failed',
  1119: 'Action failed critically',
  1009: 'Item restored from quarantine',
  1013: 'Detection history deleted',
  5001: 'Real-time protection disabled',
  5004: 'Real-time protection configuration changed',
  5007: 'Configuration changed',
  5010: 'Malware and spyware scanning disabled',
  5012: 'Virus scanning disabled',
  5013: 'Tamper protection blocked a change',
};

/**
 * Older logs keep "%%NNN" references instead of names; the IDs next to them are stable.
 * Quarantine (2) and not applicable (9) were verified against paired samples; the rest
 * follow Microsoft's list of Defender actions.
 */
const ACTIONS: Record<string, string> = { '1': 'Clean', '2': 'Quarantine', '3': 'Remove', '6': 'Allow', '8': 'User defined', '9': 'No action', '10': 'Block' };

function named(e: EvtxEvent, nameField: string, idField: string, table: Record<string, string> = {}): string {
  const name = d(e, nameField);
  if (name && !name.startsWith('%%')) return name;
  const id = d(e, idField);
  return table[id] ?? (id ? `${idField.replace(' ID', '')} ${id}` : '');
}

/** "file:_C:\a.exe;process:_pid:1234,ProcessStart:…" → "C:\a.exe · pid:1234,ProcessStart:…" */
export function detectionPaths(path: string): string {
  return path
    .split(';')
    .map(p => p.replace(/^[a-z]+:_/i, '').trim())
    .filter(Boolean)
    .join(' · ');
}

// ---------------------------------------------------------------- detections

interface DetectionRow extends EventRow {
  action: string;
  threat: string;
  severity: string;
  category: string;
  paths: string;
  process: string;
  user: string;
  outcome: string;
  source: string;
}

function detectionRow(e: EvtxEvent): DetectionRow {
  const outcome =
    e.eventId === 1117 || e.eventId === 1007
      ? named(e, 'Action Name', 'Action ID', ACTIONS)
      : e.eventId === 1118 || e.eventId === 1119 || e.eventId === 1008
        ? [named(e, 'Action Name', 'Action ID', ACTIONS), d(e, 'Error Description')].filter(Boolean).join(': ')
        : '';
  return {
    event: e,
    action: LABELS[e.eventId] ?? String(e.eventId),
    threat: d(e, 'Threat Name'),
    severity: d(e, 'Severity Name'),
    category: d(e, 'Category Name'),
    paths: detectionPaths(d(e, 'Path')),
    process: d(e, 'Process Name'),
    user: d(e, 'Detection User'),
    outcome,
    source: named(e, 'Source Name', 'Source ID', { '3': 'Real-Time Protection' }),
  };
}

function detectionTone(r: DetectionRow): Tone | undefined {
  if ([1008, 1118, 1119].includes(r.event.eventId)) return 'danger';
  if (/severe|high/i.test(r.severity)) return 'danger';
  return 'warning';
}

const detectionColumns: Column<DetectionRow>[] = withBase<DetectionRow>([
  text('action', 'Action', r => r.action, { size: 200, facet: true, tone: detectionTone }),
  text('threat', 'Threat', r => r.threat, { size: 260, facet: true }),
  text('severity', 'Severity', r => r.severity, { size: 90, facet: true }),
  text('category', 'Category', r => r.category, { size: 110, facet: true }),
  text('paths', 'Path', r => r.paths, { size: 380 }),
  text('process', 'Process', r => r.process, { size: 280 }),
  text('user', 'User', r => r.user, { size: 170, facet: true }),
  text('outcome', 'Outcome', r => r.outcome, { size: 220 }),
  text('source', 'Detected by', r => r.source, { size: 150, facet: true, hidden: true }),
]);

interface ThreatSummary {
  threat: string;
  severity: string;
  computer: string;
  first: number;
  last: number;
  detections: number;
  outcome: string;
  paths: string;
  sample: EvtxEvent;
}

const threatColumns: Column<ThreatSummary>[] = [
  text('threat', 'Threat', r => r.threat, { size: 280 }),
  text('severity', 'Severity', r => r.severity, { size: 90, facet: true }),
  text('computer', 'Computer', r => r.computer, { size: 150, facet: true }),
  { id: 'first', label: 'First', kind: 'time', value: r => r.first, size: 230 },
  { id: 'last', label: 'Last', kind: 'time', value: r => r.last, size: 230 },
  { id: 'detections', label: 'Detections', kind: 'number', value: r => r.detections, size: 90 },
  text('outcome', 'Last outcome', r => r.outcome, { size: 200, tone: r => (!r.outcome || /fail|allow|no action/i.test(r.outcome) ? 'danger' : undefined) }),
  text('paths', 'Paths', r => r.paths, { size: 420 }),
];

function threats(rows: DetectionRow[]): ThreatSummary[] {
  return [...groupBy(rows.filter(r => r.threat), r => `${r.event.computer}\u0001${r.threat}`).values()].map(list => {
    const results = list.filter(r => [1007, 1008, 1117, 1118, 1119].includes(r.event.eventId));
    const last = results[results.length - 1];
    return {
      threat: list[0]!.threat,
      severity: list[0]!.severity,
      computer: list[0]!.event.computer,
      first: list[0]!.event.ts,
      last: list[list.length - 1]!.event.ts,
      detections: list.filter(r => [1006, 1015, 1116].includes(r.event.eventId)).length,
      outcome: last ? (last.event.eventId === 1117 || last.event.eventId === 1007 ? last.outcome : `Failed: ${last.outcome}`) : '',
      paths: [...new Set(list.map(r => r.paths).filter(Boolean))].join(' | '),
      sample: list[0]!.event,
    };
  });
}

// ---------------------------------------------------------------- protection changes

/** Settings that switch a protection off when set to 1. */
const DISABLING = /\\(DisableRealtimeMonitoring|DisableBehaviorMonitoring|DisableIOAVProtection|DisableScriptScanning|DisableOnAccessProtection|DisableAntiSpyware|DisableAntiVirus|DisableBlockAtFirstSeen|DisableArchiveScanning|DisableIntrusionPreventionSystem) = 0x1\b/i;
const EXCLUSION = /\\Exclusions\\(Paths|Extensions|Processes|IpAddresses|TemporaryPaths)\\(.+?) = /i;

interface ProtectionRow extends EventRow {
  action: string;
  change: string;
  setting: string;
  previous: string;
  current: string;
  risk: '' | 'Protection disabled' | 'Exclusion added' | 'Exclusion removed' | 'Blocked by tamper protection';
}

function protectionRow(e: EvtxEvent): ProtectionRow {
  const base: ProtectionRow = { event: e, action: LABELS[e.eventId] ?? String(e.eventId), change: '', setting: '', previous: '', current: '', risk: '' };
  if (e.eventId === 5001 || e.eventId === 5010 || e.eventId === 5012) return { ...base, risk: 'Protection disabled' };
  if (e.eventId === 5013) return { ...base, risk: 'Blocked by tamper protection', setting: d(e, 'Value') || d(e, 'Changed Type') };
  if (e.eventId !== 5007) return base;
  const previous = d(e, 'Old Value');
  const current = d(e, 'New Value');
  const setting = (current || previous).replace(/ = .*$/, '');
  const added = EXCLUSION.exec(current);
  const removed = !added && EXCLUSION.exec(previous);
  if (added) return { ...base, previous, current, setting, risk: 'Exclusion added', change: `${added[1]}: ${added[2]}` };
  if (removed) return { ...base, previous, current, setting, risk: 'Exclusion removed', change: `${removed[1]}: ${removed[2]}` };
  if (DISABLING.test(current)) return { ...base, previous, current, setting, risk: 'Protection disabled', change: setting.split('\\').pop() ?? setting };
  return { ...base, previous, current, setting, change: setting.split('\\').pop() ?? setting };
}

const protectionTone = (r: ProtectionRow): Tone | undefined => (r.risk === 'Protection disabled' || r.risk === 'Exclusion added' ? 'danger' : r.risk ? 'warning' : undefined);

const protectionColumns: Column<ProtectionRow>[] = withBase<ProtectionRow>([
  text('action', 'Action', r => r.action, { size: 260, facet: true }),
  text('risk', 'Assessment', r => r.risk, { size: 200, facet: true, tone: protectionTone }),
  text('change', 'Change', r => r.change, { size: 280 }),
  text('previous', 'Old value', r => r.previous, { size: 360, kind: 'mono' }),
  text('current', 'New value', r => r.current, { size: 360, kind: 'mono' }),
]);

export const defender: Plugin = {
  name: 'defender',
  label: 'Microsoft Defender',
  category: 'System',
  icon: 'shield-exclamation',
  description:
    'Malware detections and the actions taken (1116/1117, failures 1118/1119, legacy 1006–1008, behavior 1015), and changes that weaken protection: real-time protection or scanning disabled, exclusions added (5007), tamper protection blocks and deleted history.',
  sources: SOURCES,
  analyze(ctx) {
    const events = ctx.select(SOURCES);
    const detections = events.filter(e => DETECTION_IDS.includes(e.eventId)).map(detectionRow);
    const protection = events.filter(e => PROTECTION_IDS.includes(e.eventId)).map(protectionRow);
    const threatRows = threats(detections);
    const failed = detections.filter(r => [1008, 1118, 1119].includes(r.event.eventId));
    const weakened = protection.filter(r => r.risk === 'Protection disabled' || r.risk === 'Exclusion added');
    return {
      stats: [
        { label: 'Detections', value: detections.filter(r => [1006, 1015, 1116].includes(r.event.eventId)).length, tone: detections.length ? 'warning' : undefined },
        { label: 'Threats', value: threatRows.length },
        { label: 'Remediation failed', value: failed.length, tone: failed.length ? 'danger' : undefined },
        { label: 'Protection weakened', value: weakened.length, tone: weakened.length ? 'danger' : undefined },
        { label: 'Tamper attempts blocked', value: protection.filter(r => r.event.eventId === 5013).length },
        { label: 'History deleted', value: protection.filter(r => r.event.eventId === 1013).length },
      ],
      charts: [
        {
          kind: 'timeline',
          title: 'Detections and protection changes',
          series: [
            { name: 'Detections', ts: detections.filter(r => [1006, 1015, 1116].includes(r.event.eventId)).map(r => r.event.ts) },
            { name: 'Protection weakened', ts: weakened.map(r => r.event.ts) },
          ],
        },
      ],
      views: [
        {
          ...eventView('detections', 'Detections', detections, detectionColumns),
          timeline: r => ({ title: `Defender: ${r.action}${r.threat ? ` (${r.threat})` : ''}`, detail: [r.paths, r.process, r.outcome].filter(Boolean).join(' · '), users: [r.user], tone: detectionTone(r) }),
        },
        { id: 'threats', label: 'Threats', rows: threatRows, columns: threatColumns, event: r => r.sample, sort: { id: 'last', desc: true } },
        {
          ...eventView('protection', 'Protection changes', protection, protectionColumns),
          timeline: r => ({ title: `Defender: ${r.action}${r.change ? ` (${r.change})` : ''}`, detail: r.risk, tone: protectionTone(r) }),
        },
      ],
      notes: [],
    };
  },
};
