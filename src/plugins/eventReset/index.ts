import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec, Tone } from '@/core/plugin';
import { account } from '@/core/format';
import { messageCode } from '@/core/lookups';
import { d, EVENTLOG, eventView, SECURITY, text, withBase, type EventRow } from '../common';

const SOURCES: SourceSpec[] = [
  { channel: 'Security', provider: EVENTLOG, ids: [1100, 1102, 1104, 1105] },
  { channel: 'System', provider: EVENTLOG, ids: [104] },
  { channel: 'Security', provider: SECURITY, ids: [4719] },
];

export interface ResetRow extends EventRow {
  action: string;
  log: string;
  by: string;
  detail: string;
  severity: Tone | undefined;
}

function toRow(e: EvtxEvent): ResetRow {
  const by = account(e.data['SubjectDomainName'], e.data['SubjectUserName']);
  switch (e.eventId) {
    case 1102:
      return { event: e, action: 'Security log cleared', log: 'Security', by, detail: d(e, 'SubjectLogonId') && `Logon ID ${d(e, 'SubjectLogonId')}`, severity: 'danger' };
    case 104:
      return { event: e, action: 'Log cleared', log: d(e, 'Channel'), by, detail: d(e, 'BackupPath') && `Backup: ${d(e, 'BackupPath')}`, severity: 'danger' };
    case 1100:
      return { event: e, action: 'Event logging service shut down', log: 'Security', by: '', detail: '', severity: undefined };
    case 1104:
      return { event: e, action: 'Security log is full', log: 'Security', by: '', detail: 'New events are being dropped', severity: 'warning' };
    case 1105:
      return { event: e, action: 'Log automatically backed up', log: d(e, 'Channel') || 'Security', by: '', detail: d(e, 'BackupPath'), severity: undefined };
    default:
      return {
        event: e,
        action: 'Audit policy changed',
        log: 'Security',
        by,
        detail: [d(e, 'SubcategoryGuid') && `Subcategory ${d(e, 'SubcategoryGuid')}`, messageCode(d(e, 'AuditPolicyChanges'))].filter(Boolean).join(': '),
        severity: messageCode(d(e, 'AuditPolicyChanges')).includes('removed') ? 'warning' : undefined,
      };
  }
}

const eventColumns: Column<ResetRow>[] = withBase<ResetRow>([
  text('action', 'Action', r => r.action, { size: 240, facet: true, tone: r => r.severity }),
  text('log', 'Log', r => r.log, { size: 200, facet: true }),
  text('by', 'By', r => r.by, { size: 200, facet: true }),
  text('detail', 'Detail', r => r.detail, { size: 420 }),
]);

interface GapRow {
  file: string;
  computers: string;
  channels: string;
  from: number;
  to: number;
  count: number;
}

const gapColumns: Column<GapRow>[] = [
  text('file', 'File', r => r.file, { size: 220, facet: true }),
  text('channels', 'Channel', r => r.channels, { size: 200 }),
  text('computers', 'Computer', r => r.computers, { size: 180 }),
  { id: 'from', label: 'Missing from', kind: 'number', value: r => r.from, size: 120 },
  { id: 'to', label: 'Missing to', kind: 'number', value: r => r.to, size: 120 },
  { id: 'count', label: 'Records', kind: 'number', value: r => r.count, size: 100, tone: () => 'warning' },
];

export const eventReset: Plugin = {
  name: 'eventReset',
  label: 'Log Clearing & Tampering',
  category: 'System',
  icon: 'eraser',
  description:
    'Cleared logs (1102, 104), logging stopped or full (1100, 1104) and audit policy changes (4719), plus gaps in record numbering found while loading the files.',
  sources: SOURCES,
  options: [{ id: 'showShutdown', label: 'Show logging service shutdowns (1100, normal at every shutdown)', default: false }],
  analyze(ctx, opts) {
    const rows = ctx
      .select(SOURCES)
      .map(toRow)
      .filter(r => opts['showShutdown'] || r.event.eventId !== 1100);
    const gaps: GapRow[] = [];
    for (const file of ctx.files()) {
      for (const g of file.gaps)
        gaps.push({ file: file.name, computers: file.computers.join(', '), channels: file.channels.join(', '), from: g.from, to: g.to, count: g.to - g.from + 1 });
    }
    const clears = rows.filter(r => r.event.eventId === 1102 || r.event.eventId === 104);
    const policy = rows.filter(r => r.event.eventId === 4719);
    return {
      stats: [
        { label: 'Log clears', value: clears.length, tone: clears.length ? 'danger' : undefined },
        { label: 'Audit policy changes', value: policy.length, tone: policy.length ? 'warning' : undefined },
        { label: 'Security log full', value: rows.filter(r => r.event.eventId === 1104).length },
        { label: 'Missing records (all files)', value: gaps.reduce((n, g) => n + g.count, 0), tone: gaps.length ? 'warning' : undefined },
      ],
      charts: [],
      views: [
        eventView('events', 'Events', rows, eventColumns),
        { id: 'gaps', label: 'Record number gaps', rows: gaps, columns: gapColumns, sort: { id: 'count', desc: true } },
      ],
      notes: gaps.length
        ? [{ tone: 'info', text: 'Gaps are holes in a file’s own record numbering. They appear when records were removed selectively, when a chunk is damaged, or when a file was copied only in part.' }]
        : [],
    };
  },
};
