import type { EvtxEvent } from '@/core/evtx/types';
import type { ChartSpec, Column, GraphLink, GraphNode, PluginContext, View } from '@/core/plugin';
import { computerColumn, eventIdColumn, timeColumn } from '@/core/plugin';
import { clean } from '@/core/format';

/** A table row tied to one event. */
export interface EventRow {
  event: EvtxEvent;
}

export const d = (e: EvtxEvent, key: string): string => clean(e.data[key]);

/** First non-empty named field. */
export function pick(e: EvtxEvent, ...keys: string[]): string {
  for (const k of keys) {
    const v = clean(e.data[k]);
    if (v) return v;
  }
  return '';
}

/** Standard columns: time, then the plugin's columns, then event ID and computer. */
export function withBase<R extends EventRow>(columns: Column<R>[]): Column<R>[] {
  return [timeColumn<R>(), ...columns, eventIdColumn<R>(), computerColumn<R>()];
}

export function eventView<R extends EventRow>(id: string, label: string, rows: R[], columns: Column<R>[]): View<R> {
  return { id, label, rows, columns, event: r => r.event, sort: { id: 'time' } };
}

export function text<R>(id: string, label: string, value: (r: R) => string, extra: Partial<Column<R>> = {}): Column<R> {
  return { id, label, value, size: 160, ...extra };
}

/** Index of the last element with `ts <= at` in a time-sorted list, or -1. */
export function lastAtOrBefore(sorted: readonly { ts: number }[], at: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.ts <= at) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Groups items by key, keeping insertion order. */
export function groupBy<T>(items: Iterable<T>, key: (item: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    let list = m.get(k);
    if (!list) m.set(k, (list = []));
    list.push(item);
  }
  return m;
}

/**
 * Registered country and announcing network (iptoasn.com) of an IP column; blank for private,
 * unrouted or unknown addresses. The data describes routing today, not at the time of the event.
 */
export function networkColumns<R>(ctx: PluginContext, ip: (r: R) => string): Column<R>[] {
  return [
    { id: 'country', label: 'Country', value: r => ctx.ipInfo(ip(r))?.country ?? '', size: 70, facet: true },
    {
      id: 'network',
      label: 'Network (AS)',
      value: r => {
        const info = ctx.ipInfo(ip(r));
        return info ? `AS${info.asn} ${info.name}` : '';
      },
      size: 220,
      facet: true,
    },
  ];
}

/** The columns with `extra` inserted after the column `id`. */
export function insertAfter<R>(columns: Column<R>[], id: string, extra: Column<R>[]): Column<R>[] {
  const at = columns.findIndex(c => c.id === id) + 1;
  return [...columns.slice(0, at), ...extra, ...columns.slice(at)];
}

/** One observed connection for a graph: who (address or name) reached which computer. */
export interface Connection {
  source: string;
  target: string;
  account: string;
  failed: boolean;
}

const NO_SOURCE = new Set(['', '-', '127.0.0.1', '::1', 'LOCAL']);

/**
 * Source → computer graph (the original Glossy drew RDP this way): node size by volume, links
 * red when a connection failed, IPs labelled with their registered country. Clicking a node
 * filters the view on the source or target column. Keeps the `limit` busiest sources.
 */
export function connectionGraph(
  title: string,
  connections: Connection[],
  ctx: PluginContext,
  o: { view: string; sourceColumn: string; targetColumn: string; limit?: number },
): ChartSpec {
  const links = new Map<string, { source: string; target: string; n: number; failed: number; accounts: Set<string> }>();
  const totals = new Map<string, number>();
  for (const c of connections) {
    if (NO_SOURCE.has(c.source.toUpperCase()) || !c.target) continue;
    const key = `${c.source}\u0001${c.target}`;
    let l = links.get(key);
    if (!l) links.set(key, (l = { source: c.source, target: c.target, n: 0, failed: 0, accounts: new Set() }));
    l.n++;
    if (c.failed) l.failed++;
    if (c.account) l.accounts.add(c.account);
    totals.set(c.source, (totals.get(c.source) ?? 0) + 1);
  }
  const keep = new Set([...totals].sort((a, b) => b[1] - a[1]).slice(0, o.limit ?? 40).map(([s]) => s));
  const kept = [...links.values()].filter(l => keep.has(l.source));
  const nodes = new Map<string, GraphNode>();
  const node = (id: string, n: GraphNode) => {
    const known = nodes.get(id);
    if (known) known.weight += n.weight;
    else nodes.set(id, n);
  };
  for (const l of kept) {
    const info = ctx.ipInfo(l.source);
    node(`s:${l.source}`, {
      id: `s:${l.source}`,
      label: info?.country ? `${l.source} · ${info.country}` : l.source,
      group: 'source',
      weight: l.n,
      detail: info ? `AS${info.asn} ${info.name}` : undefined,
      filter: { column: o.sourceColumn, value: l.source },
    });
    node(`t:${l.target}`, { id: `t:${l.target}`, label: l.target, group: 'target', weight: l.n, filter: { column: o.targetColumn, value: l.target } });
  }
  const graphLinks: GraphLink[] = kept.map(l => ({
    source: `s:${l.source}`,
    target: `t:${l.target}`,
    weight: l.n,
    tone: l.failed ? 'danger' : undefined,
    detail: `${l.n.toLocaleString()} event(s)${l.failed ? `, ${l.failed.toLocaleString()} failed` : ''}${l.accounts.size ? ` · ${[...l.accounts].slice(0, 5).join(', ')}${l.accounts.size > 5 ? ` +${l.accounts.size - 5}` : ''}` : ''}`,
  }));
  return { kind: 'graph', title, nodes: [...nodes.values()], links: graphLinks, target: { view: o.view } };
}

export const SECURITY = 'Microsoft-Windows-Security-Auditing';
export const EVENTLOG = 'Microsoft-Windows-Eventlog';
