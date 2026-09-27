import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec } from '@/core/plugin';
import { basename, ranking } from '@/core/format';
import { eventView, groupBy, pick, text, withBase, type EventRow } from '../common';

const SOURCES: SourceSpec[] = [
  { channel: 'Application', provider: 'Application Error', ids: [1000] },
  { channel: 'Application', provider: 'Application Hang', ids: [1002] },
  { channel: 'Application', provider: 'Windows Error Reporting', ids: [1001] },
  { channel: 'Application', provider: '.NET Runtime', ids: [1026] },
];

/** NTSTATUS exception codes most relevant when a crash might be an exploit attempt. */
const EXCEPTIONS: Record<string, string> = {
  c0000005: 'Access violation',
  c0000409: 'Stack buffer overrun (/GS)',
  c0000374: 'Heap corruption',
  c000001d: 'Illegal instruction',
  c0000094: 'Integer divide by zero',
  c00000fd: 'Stack overflow',
  e0434352: '.NET exception',
  '80000003': 'Breakpoint',
};

export interface ErrorRow extends EventRow {
  kind: 'Crash' | 'Hang' | 'Error report' | '.NET unhandled exception';
  app: string;
  version: string;
  module: string;
  exception: string;
  path: string;
  detail: string;
}

const at = (e: EvtxEvent, i: number) => (e.list[i] ?? '').trim();

function exceptionText(code: string): string {
  const key = code.toLowerCase().replace(/^0x/, '');
  return EXCEPTIONS[key] ? `0x${key} ${EXCEPTIONS[key]}` : code && `0x${key}`;
}

/** The faulting PID is written in hex, with or without "0x" ("abc" is PID 2748). */
function hexPid(v: string): string {
  const n = parseInt(v.replace(/^0x/i, ''), 16);
  return Number.isFinite(n) ? `PID ${n}` : '';
}

/** Application Error 1000 is positional before Windows 11 and named afterwards. */
function crash(e: EvtxEvent): ErrorRow {
  const named = !!e.data['AppName'];
  const f = (name: string, i: number) => (named ? pick(e, name) : at(e, i));
  return {
    event: e,
    kind: 'Crash',
    app: f('AppName', 0),
    version: f('AppVersion', 1),
    module: [f('ModuleName', 3), f('ModuleVersion', 4)].filter(Boolean).join(' '),
    exception: exceptionText(f('ExceptionCode', 6)),
    path: f('AppPath', 10),
    detail: [f('FaultingOffset', 7) && `offset 0x${f('FaultingOffset', 7).replace(/^0x/i, '')}`, hexPid(f('ProcessId', 8))].filter(Boolean).join(' · '),
  };
}

function toRow(e: EvtxEvent): ErrorRow {
  const exePath = e.list.find(v => /\\[^\\]+\.exe$/i.test(v)) ?? '';
  switch (e.provider) {
    case 'Application Error':
      return crash(e);
    case 'Application Hang':
      return { event: e, kind: 'Hang', app: pick(e, 'AppName') || at(e, 0), version: pick(e, 'AppVersion') || at(e, 1), module: '', exception: '', path: pick(e, 'AppPath') || exePath, detail: '' };
    case 'Windows Error Reporting': {
      // Fault bucket, type, event name, response, cab id, P1..P10, attached files, store path, ...
      const eventName = at(e, 2);
      const appCrash = /crash|hang|bex/i.test(eventName);
      // APPCRASH: P7 exception code, P8 offset. BEX (buffer overrun): P7 offset, P8 exception code.
      const code = /^bex/i.test(eventName) ? at(e, 12) : at(e, 11);
      return {
        event: e,
        kind: 'Error report',
        app: appCrash ? at(e, 5) : '',
        version: appCrash ? at(e, 6) : '',
        module: appCrash ? at(e, 8) : '',
        exception: appCrash ? exceptionText(code) : '',
        path: exePath,
        detail: [eventName, ...e.list.slice(5, 9).filter(v => v && !appCrash)].filter(Boolean).join(' · '),
      };
    }
    default: {
      const message = e.list.join('\n');
      const app = /Application:\s*(.+)/.exec(message)?.[1]?.trim() ?? '';
      const ex = /Exception Info:\s*(.+)/.exec(message)?.[1]?.trim() ?? '';
      return { event: e, kind: '.NET unhandled exception', app, version: '', module: '', exception: ex, path: exePath, detail: /Description:\s*(.+)/.exec(message)?.[1]?.trim() ?? '' };
    }
  }
}

const eventColumns: Column<ErrorRow>[] = withBase<ErrorRow>([
  text('kind', 'Type', r => r.kind, { size: 170, facet: true }),
  text('app', 'Application', r => r.app, { size: 200, facet: true }),
  text('version', 'Version', r => r.version, { size: 110 }),
  text('module', 'Faulting module', r => r.module, { size: 200 }),
  text('exception', 'Exception', r => r.exception, { size: 220, facet: true, tone: r => (/c0000005|c0000409|c0000374/i.test(r.exception) ? 'warning' : undefined) }),
  text('path', 'Path', r => r.path, { size: 340 }),
  text('detail', 'Detail', r => r.detail, { size: 260 }),
]);

interface AppSummary {
  app: string;
  path: string;
  count: number;
  first: number;
  last: number;
  exceptions: string;
  sample: EvtxEvent;
}

const appColumns: Column<AppSummary>[] = [
  text('app', 'Application', r => r.app, { size: 220 }),
  text('path', 'Path', r => r.path, { size: 360 }),
  { id: 'count', label: 'Events', kind: 'number', value: r => r.count, size: 80 },
  { id: 'first', label: 'First', kind: 'time', value: r => r.first, size: 190 },
  { id: 'last', label: 'Last', kind: 'time', value: r => r.last, size: 190 },
  text('exceptions', 'Exceptions', r => r.exceptions, { size: 300 }),
];

export const applicationErrors: Plugin = {
  name: 'applicationErrors',
  label: 'Application Errors',
  category: 'Application',
  icon: 'bug',
  description:
    'Application crashes (1000), hangs (1002), Windows Error Reporting (1001) and unhandled .NET exceptions (1026). Crashes with memory-corruption exception codes in document readers, browsers or services can point to exploitation attempts.',
  sources: SOURCES,
  analyze(ctx) {
    const rows = ctx.select(SOURCES).map(toRow);
    const withApp = rows.filter(r => r.app);
    const apps: AppSummary[] = [...groupBy(withApp, r => (r.path || r.app).toLowerCase()).values()].map(list => ({
      app: list[0]!.app,
      path: list.find(r => r.path)?.path ?? '',
      count: list.length,
      first: list[0]!.event.ts,
      last: list[list.length - 1]!.event.ts,
      exceptions: [...new Set(list.map(r => r.exception).filter(Boolean))].join(', '),
      sample: list[0]!.event,
    }));
    return {
      stats: [
        { label: 'Crashes', value: rows.filter(r => r.kind === 'Crash').length },
        { label: 'Hangs', value: rows.filter(r => r.kind === 'Hang').length },
        { label: 'Error reports', value: rows.filter(r => r.kind === 'Error report').length },
        { label: '.NET exceptions', value: rows.filter(r => r.kind === '.NET unhandled exception').length },
        { label: 'Applications', value: apps.length },
      ],
      charts: [{ kind: 'ranking', title: 'Most frequent faulting applications', items: ranking(withApp.map(r => r.app || basename(r.path)), 10) }],
      views: [
        eventView('events', 'Events', rows, eventColumns),
        { id: 'apps', label: 'Applications', rows: apps, columns: appColumns, event: r => r.sample, sort: { id: 'count', desc: true } },
      ],
      notes: [],
    };
  },
};
