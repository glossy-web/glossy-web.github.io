import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec } from '@/core/plugin';
import { formatBytes, ranking } from '@/core/format';
import { d, eventView, groupBy, text, withBase, type EventRow } from '../common';
import { summarize } from '../showAll';

const PS = 'Microsoft-Windows-PrintService';
const SOURCES: SourceSpec[] = [
  { channel: 'Microsoft-Windows-PrintService/Operational', provider: PS, ids: [307, 800, 801, 805, 812, 823, 842], offByDefault: true },
];

const LABELS: Record<number, string> = {
  307: 'Document printed',
  800: 'Job spooled',
  801: 'Job printing',
  805: 'Job rendered',
  812: 'Spool file operation failed',
  823: 'Default printer changed',
  842: 'Job sent through print processor',
};

export interface PrintJob extends EventRow {
  document: string;
  user: string;
  client: string;
  printer: string;
  port: string;
  bytes: number;
  pages: number;
  jobId: string;
  spoolFile: string;
}

/**
 * 307 "Document %1, %2 owned by %3 on %4 was printed on %5 through port %6. Size in bytes: %7. Pages printed: %8."
 * The spool file path comes from an 812 in the same job, grouped as the original Glossy did:
 * events of one spooler thread (ProcessID/ThreadID) from an 801 up to the next 801.
 */
function jobs(events: EvtxEvent[]): PrintJob[] {
  const out: PrintJob[] = [];
  for (const list of groupBy(events, e => `${e.computer}\u0001${e.pid}\u0001${e.tid}`).values()) {
    let spool = '';
    for (const e of list) {
      if (e.eventId === 801) spool = '';
      else if (e.eventId === 812) spool = d(e, 'Source') || spool;
      else if (e.eventId === 307) {
        out.push({
          event: e,
          jobId: d(e, 'Param1'),
          document: d(e, 'Param2'),
          user: d(e, 'Param3'),
          client: d(e, 'Param4'),
          printer: d(e, 'Param5'),
          port: d(e, 'Param6'),
          bytes: Number(d(e, 'Param7')),
          pages: Number(d(e, 'Param8')),
          spoolFile: spool,
        });
      }
    }
  }
  return out.sort((a, b) => a.event.ts - b.event.ts);
}

const jobColumns: Column<PrintJob>[] = withBase<PrintJob>([
  text('document', 'Document', r => r.document, { size: 320 }),
  text('user', 'User', r => r.user, { size: 150, facet: true }),
  text('client', 'Client', r => r.client, { size: 150, facet: true }),
  text('printer', 'Printer', r => r.printer, { size: 220, facet: true }),
  { id: 'pages', label: 'Pages', kind: 'number', value: r => r.pages, size: 70 },
  { id: 'bytes', label: 'Size', kind: 'number', value: r => r.bytes, text: r => formatBytes(r.bytes), size: 90 },
  text('port', 'Port', r => r.port, { size: 140 }),
  text('jobId', 'Job', r => r.jobId, { size: 60, hidden: true }),
  text('spool', 'Spool file', r => r.spoolFile, { size: 300, kind: 'mono', hidden: true }),
]);

interface PrintEvent extends EventRow {
  action: string;
  detail: string;
}

const eventColumns: Column<PrintEvent>[] = withBase<PrintEvent>([
  text('action', 'Action', r => r.action, { size: 240, facet: true }),
  text('detail', 'Detail', r => r.detail, { size: 600 }),
]);

export const documentPrinting: Plugin = {
  name: 'documentPrinting',
  label: 'Document Printing',
  category: 'Hardware',
  icon: 'printer',
  description: 'Printed documents with owner, client machine, printer and page count, plus default printer changes. The PrintService/Operational log must be enabled beforehand; it is off by default.',
  sources: SOURCES,
  analyze(ctx) {
    const events = ctx.select(SOURCES);
    const printed = jobs(events);
    const all: PrintEvent[] = events.map(e => ({
      event: e,
      action: LABELS[e.eventId] ?? String(e.eventId),
      detail: e.eventId === 823 ? d(e, 'NewDefaultPrinter').split(',')[0] ?? '' : summarize(e),
    }));
    return {
      stats: [
        { label: 'Documents printed', value: printed.length },
        { label: 'Pages', value: printed.reduce((n, j) => n + (Number.isFinite(j.pages) ? j.pages : 0), 0) },
        { label: 'Users', value: new Set(printed.map(j => j.user.toLowerCase())).size },
        { label: 'Printers', value: new Set(printed.map(j => j.printer)).size },
      ],
      charts: printed.length
        ? [
            { kind: 'timeline', title: 'Documents printed', series: [{ name: 'Documents', ts: printed.map(j => j.event.ts) }], target: { view: 'jobs' } },
            { kind: 'ranking', title: 'Documents by user', items: ranking(printed.map(j => j.user), 10), target: { view: 'jobs', column: 'user' } },
          ]
        : [],
      views: [
        {
          ...eventView('jobs', 'Printed documents', printed, jobColumns),
          timeline: r => ({ title: `Printed: ${r.document}`, detail: [r.printer, Number.isFinite(r.pages) && `${r.pages} page(s)`, r.port].filter(Boolean).join(' · '), users: [r.user], remote: r.client.replace(/^\\\\/, '') }),
        },
        eventView('events', 'All print events', all, eventColumns),
      ],
      notes: [],
    };
  },
};
