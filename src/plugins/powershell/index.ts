import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, PluginContext, SourceSpec, Tone } from '@/core/plugin';
import { basename } from '@/core/format';
import { eventView, pick, text, withBase, type EventRow } from '../common';
import { assembleScriptBlocks, decodeEncodedCommand, indicators, keyValues, type ScriptBlock } from './analysis';

const PS = 'Microsoft-Windows-PowerShell';
const CORE = 'PowerShellCore';
const CLASSIC = 'PowerShell';

const SOURCES: SourceSpec[] = [
  { channel: 'Microsoft-Windows-PowerShell/Operational', provider: PS, ids: [4103, 4104, 40961, 40962, 53504] },
  { channel: 'PowerShellCore/Operational', provider: CORE, ids: [4103, 4104] },
  { channel: 'Windows PowerShell', provider: CLASSIC, ids: [400, 403, 600, 800] },
];

const preview = (s: string, n = 300) => s.replace(/\s+/g, ' ').trim().slice(0, n);

// ---------------------------------------------------------------- script blocks (4104)

interface BlockRow extends EventRow {
  block: ScriptBlock;
  user: string;
  indicators: string[];
}

function blockTone(r: BlockRow): Tone | undefined {
  if (r.block.flagged) return 'danger';
  return r.indicators.length ? 'warning' : undefined;
}

const blockColumns: Column<BlockRow>[] = withBase<BlockRow>([
  text('flagged', 'Flagged by PowerShell', r => (r.block.flagged ? 'Yes' : ''), { size: 110, facet: true, tone: r => (r.block.flagged ? 'danger' : undefined) }),
  text('indicators', 'Indicators', r => r.indicators.join(', '), { size: 240, tone: blockTone }),
  text('script', 'Script', r => preview(r.block.text), { size: 520, kind: 'mono' }),
  { id: 'parts', label: 'Parts', kind: 'number', value: r => r.block.total, text: r => (r.block.complete ? String(r.block.total) : `${r.block.events.length} of ${r.block.total}`), size: 70, tone: r => (r.block.complete ? undefined : 'warning') },
  { id: 'length', label: 'Length', kind: 'number', value: r => r.block.text.length, size: 80 },
  text('path', 'Script path', r => r.block.path, { size: 260 }),
  text('user', 'User', r => r.user, { size: 180, facet: true }),
  text('id', 'Script block ID', r => r.block.id, { size: 280, kind: 'mono', hidden: true }),
]);

// ---------------------------------------------------------------- engine and host (400/403/600, 40961/40962, 53504)

interface HostRow extends EventRow {
  action: string;
  hostApplication: string;
  decoded: string;
  engineVersion: string;
  detail: string;
  indicators: string[];
}

function hostRow(e: EvtxEvent): HostRow {
  const base = { event: e, hostApplication: '', decoded: '', engineVersion: '', detail: '', indicators: [] as string[] };
  if (e.provider === CLASSIC) {
    const kv = keyValues(e.list[2] ?? '');
    const hostApplication = kv['HostApplication'] ?? '';
    const decoded = decodeEncodedCommand(hostApplication);
    const action = e.eventId === 400 ? 'Engine started' : e.eventId === 403 ? 'Engine stopped' : `Provider started: ${e.list[0] ?? kv['ProviderName'] ?? ''}`;
    return {
      ...base,
      action,
      hostApplication,
      decoded,
      engineVersion: kv['EngineVersion'] ?? '',
      detail: [kv['HostName'], kv['HostVersion'] && `host ${kv['HostVersion']}`].filter(Boolean).join(' · '),
      indicators: indicators(`${hostApplication}\n${decoded}`),
    };
  }
  switch (e.eventId) {
    case 40961:
      return { ...base, action: 'Console starting' };
    case 40962:
      return { ...base, action: 'Console ready for input' };
    default:
      return { ...base, action: 'Process started (IPC listener)', detail: [pick(e, 'param1') && `PID ${pick(e, 'param1')}`, pick(e, 'param2')].filter(Boolean).join(' · ') };
  }
}

/** Engine 2.0 lacks script block logging and AMSI; starting it is a known way to evade both. */
const isDowngrade = (r: HostRow) => /^2\./.test(r.engineVersion);

const hostTone = (r: HostRow): Tone | undefined => (isDowngrade(r) ? 'danger' : r.indicators.length ? 'warning' : undefined);

const hostColumns: Column<HostRow>[] = withBase<HostRow>([
  text('action', 'Action', r => r.action, { size: 220, facet: true }),
  text('engine', 'Engine version', r => r.engineVersion, { size: 120, facet: true, tone: r => (isDowngrade(r) ? 'danger' : undefined) }),
  text('host', 'Host application', r => r.hostApplication, { size: 420, kind: 'mono', tone: r => (r.indicators.length ? 'warning' : undefined) }),
  text('decoded', 'Decoded -EncodedCommand', r => preview(r.decoded), { size: 380, kind: 'mono', tone: r => (r.decoded ? 'warning' : undefined) }),
  text('indicators', 'Indicators', r => r.indicators.join(', '), { size: 220 }),
  text('detail', 'Detail', r => r.detail, { size: 220 }),
]);

// ---------------------------------------------------------------- pipeline execution (800, 4103)

interface PipelineRow extends EventRow {
  command: string;
  user: string;
  hostApplication: string;
  details: string;
  indicators: string[];
}

function pipelineRow(e: EvtxEvent, ctx: PluginContext): PipelineRow {
  if (e.provider === CLASSIC) {
    // 800: Data[0] command line, Data[1] context (Key=Value), Data[2] details (bindings/invocations)
    const kv = keyValues(e.list[1] ?? '');
    const details = e.list[2] ?? '';
    const command = e.list[0] || kv['CommandLine'] || details.split(/\r?\n/)[0] || '';
    return { event: e, command, user: kv['UserId'] ?? '', hostApplication: kv['HostApplication'] ?? '', details, indicators: indicators(`${command}\n${details}`) };
  }
  const kv = keyValues(e.data['ContextInfo'] ?? '');
  const payload = e.data['Payload'] ?? '';
  const command = kv['CommandName'] || payload.split(/\r?\n/)[0] || '';
  return {
    event: e,
    command,
    user: kv['User'] || ctx.sidName(e.userSid),
    hostApplication: kv['HostApplication'] ?? '',
    details: payload,
    indicators: indicators(`${kv['HostApplication'] ?? ''}\n${payload}`),
  };
}

const pipelineColumns: Column<PipelineRow>[] = withBase<PipelineRow>([
  text('command', 'Command', r => preview(r.command, 200), { size: 360, kind: 'mono', tone: r => (r.indicators.length ? 'warning' : undefined) }),
  text('indicators', 'Indicators', r => r.indicators.join(', '), { size: 220 }),
  text('user', 'User', r => r.user, { size: 180, facet: true }),
  text('details', 'Details', r => preview(r.details), { size: 420, kind: 'mono' }),
  text('host', 'Host application', r => r.hostApplication, { size: 320, kind: 'mono', hidden: true }),
]);

export const powershell: Plugin = {
  name: 'powershell',
  label: 'PowerShell',
  category: 'Application',
  icon: 'square-terminal',
  description:
    'Script blocks (4104) reassembled from their parts, module logging (4103), and the classic Windows PowerShell log (400/403/600/800) with decoded -EncodedCommand arguments and PowerShell 2.0 downgrades. Indicators are leads for review, not detections.',
  sources: SOURCES,
  analyze(ctx) {
    const events = ctx.select(SOURCES);
    const blocks: BlockRow[] = assembleScriptBlocks(events.filter(e => e.eventId === 4104)).map(block => ({
      event: block.event,
      block,
      user: ctx.sidName(block.event.userSid) || block.event.userSid,
      indicators: indicators(block.text),
    }));
    const hosts = events.filter(e => [400, 403, 600, 40961, 40962, 53504].includes(e.eventId)).map(hostRow);
    const pipelines = events.filter(e => e.eventId === 800 || e.eventId === 4103).map(e => pipelineRow(e, ctx));

    const flagged = blocks.filter(r => r.block.flagged);
    const withIndicators = blocks.filter(r => r.indicators.length);
    const downgrades = hosts.filter(r => r.event.eventId === 400 && isDowngrade(r));
    const decoded = hosts.filter(r => r.decoded && r.event.eventId === 400);

    const notes = [];
    if (downgrades.length)
      notes.push({ tone: 'warning' as const, text: `PowerShell 2.0 engine started ${downgrades.length} time(s). Version 2 has no script block logging or AMSI, so commands run there leave no 4104.` });
    if (!blocks.length && hosts.length)
      notes.push({ tone: 'info' as const, text: 'Windows PowerShell ran, but no script block events (4104) are loaded: script block logging may be off, or PowerShell/Operational was not collected.' });

    return {
      stats: [
        { label: 'Script blocks', value: blocks.length },
        { label: 'Flagged by PowerShell', value: flagged.length, tone: flagged.length ? 'danger' : undefined },
        { label: 'With indicators', value: withIndicators.length, tone: withIndicators.length ? 'warning' : undefined },
        { label: 'Engine starts', value: hosts.filter(r => r.event.eventId === 400).length },
        { label: 'Encoded commands', value: decoded.length, tone: decoded.length ? 'warning' : undefined },
        { label: 'PowerShell 2.0 starts', value: downgrades.length, tone: downgrades.length ? 'danger' : undefined },
      ],
      charts: [
        {
          kind: 'timeline',
          title: 'Script blocks over time',
          target: { view: 'blocks' },
          series: [
            { name: 'Flagged or with indicators', ts: blocks.filter(r => r.block.flagged || r.indicators.length).map(r => r.event.ts) },
            { name: 'Other', ts: blocks.filter(r => !r.block.flagged && !r.indicators.length).map(r => r.event.ts) },
          ],
        },
      ],
      views: [
        {
          ...eventView('blocks', 'Script blocks', blocks, blockColumns),
          detail: r => ({ title: `Script block${r.block.total > 1 ? ` (${r.block.events.length} of ${r.block.total} parts)` : ''}`, text: r.block.text }),
          timeline: r => ({
            title: `PowerShell script block${r.block.path ? `: ${basename(r.block.path)}` : ''}`,
            detail: [r.block.flagged && 'Flagged by PowerShell', r.indicators.join(', '), preview(r.block.text, 200)].filter(Boolean).join(' · '),
            users: [r.user],
            tone: blockTone(r),
          }),
        },
        {
          ...eventView('host', 'Engine & host', hosts, hostColumns),
          detail: r => (r.decoded ? { title: 'Decoded -EncodedCommand', text: r.decoded } : r.hostApplication ? { title: 'Host application', text: r.hostApplication } : undefined),
          // Engine starts only: they carry the host command line.
          timeline: r =>
            r.event.eventId === 400
              ? {
                  title: `PowerShell engine started${isDowngrade(r) ? ` (version ${r.engineVersion})` : ''}`,
                  detail: [r.indicators.join(', '), r.decoded ? `decoded: ${preview(r.decoded, 200)}` : r.hostApplication].filter(Boolean).join(' · '),
                  tone: hostTone(r),
                }
              : undefined,
        },
        {
          ...eventView('pipeline', 'Pipeline execution', pipelines, pipelineColumns),
          detail: r => ({ title: 'Command and details', text: [r.command, r.details].filter(Boolean).join('\n\n') }),
          // Module logging is voluminous; only commands with indicators reach the timeline.
          timeline: r => (r.indicators.length ? { title: `PowerShell command: ${preview(r.command, 80)}`, detail: r.indicators.join(', '), users: [r.user], tone: 'warning' } : undefined),
        },
      ],
      notes,
    };
  },
};
