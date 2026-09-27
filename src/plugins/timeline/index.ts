import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, PluginContext, Tone, View } from '@/core/plugin';
import { eventView, text, withBase, type EventRow } from '../common';

export interface TimelineRow extends EventRow {
  modules: string[];
  title: string;
  detail: string;
  users: string[];
  remote: string;
  tone: Tone | undefined;
}

const highlighted = (tone: Tone | undefined) => tone === 'danger' || tone === 'warning';
const severity = (tone: Tone | undefined) => (tone === 'danger' ? 2 : tone === 'warning' ? 1 : 0);

/**
 * Runs every module with its default options and gathers the rows its views map to
 * timeline entries. An event reported by several modules (a type 10 logon is both a
 * logon and an RDP stage) becomes one entry: the first module's wording, every module's
 * name, the union of accounts and the most severe tone.
 */
export function buildTimeline(modules: readonly Plugin[], ctx: PluginContext): TimelineRow[] {
  const byEvent = new Map<number, TimelineRow>();
  for (const m of modules) {
    const defaults = Object.fromEntries((m.options ?? []).map(o => [o.id, o.default]));
    for (const view of m.analyze(ctx, defaults).views) {
      if (!view.timeline || !view.event) continue;
      for (const row of view.rows) {
        const entry = view.timeline(row);
        const event: EvtxEvent | undefined = entry && view.event(row);
        if (!entry || !event) continue;
        const users = (entry.users ?? []).filter(Boolean);
        const known = byEvent.get(event.id);
        if (!known) {
          byEvent.set(event.id, { event, modules: [m.label], title: entry.title, detail: entry.detail ?? '', users, remote: entry.remote ?? '', tone: entry.tone });
          continue;
        }
        if (!known.modules.includes(m.label)) known.modules.push(m.label);
        for (const u of users) if (!known.users.some(k => k.toLowerCase() === u.toLowerCase())) known.users.push(u);
        known.remote ||= entry.remote ?? '';
        if (severity(entry.tone) > severity(known.tone)) known.tone = entry.tone;
      }
    }
  }
  return [...byEvent.values()].sort((a, b) => a.event.ts - b.event.ts);
}

type EntityKind = 'Account' | 'Remote address' | 'Computer';

interface EntityRow {
  kind: EntityKind;
  value: string;
  entries: number;
  highlighted: number;
  first: number;
  last: number;
  modules: string;
}

const PIVOT_COLUMN: Record<EntityKind, string> = { Account: 'users', 'Remote address': 'remote', Computer: 'computer' };

/** Accounts, remote addresses and computers seen in the timeline, case-insensitively. */
function entities(rows: TimelineRow[]): EntityRow[] {
  const found = new Map<string, EntityRow & { moduleSet: Set<string> }>();
  const add = (kind: EntityKind, value: string, r: TimelineRow) => {
    if (!value) return;
    const key = `${kind}\u0001${value.toLowerCase()}`;
    let e = found.get(key);
    if (!e) found.set(key, (e = { kind, value, entries: 0, highlighted: 0, first: r.event.ts, last: r.event.ts, modules: '', moduleSet: new Set() }));
    e.entries++;
    if (highlighted(r.tone)) e.highlighted++;
    e.last = r.event.ts;
    for (const m of r.modules) e.moduleSet.add(m);
  };
  for (const r of rows) {
    for (const u of r.users) add('Account', u, r);
    add('Remote address', r.remote, r);
    add('Computer', r.event.computer, r);
  }
  return [...found.values()].map(({ moduleSet, ...e }) => ({ ...e, modules: [...moduleSet].join(', ') }));
}

const timelineColumns: Column<TimelineRow>[] = withBase<TimelineRow>([
  text('module', 'Module', r => r.modules.join(', '), { size: 170, facet: true }),
  text('title', 'Event', r => r.title, { size: 320, tone: r => r.tone }),
  text('detail', 'Detail', r => r.detail, { size: 460 }),
  text('users', 'Accounts', r => r.users.join(', '), { size: 220 }),
  text('remote', 'Remote address', r => r.remote, { size: 140, facet: true }),
]);

const entityColumns: Column<EntityRow>[] = [
  text('kind', 'Type', r => r.kind, { size: 130, facet: true }),
  text('value', 'Value', r => r.value, { size: 280 }),
  { id: 'highlighted', label: 'Highlighted', kind: 'number', value: r => r.highlighted, size: 100, tone: r => (r.highlighted ? 'warning' : undefined) },
  { id: 'entries', label: 'Entries', kind: 'number', value: r => r.entries, size: 90 },
  { id: 'first', label: 'First seen', kind: 'time', value: r => r.first, size: 230 },
  { id: 'last', label: 'Last seen', kind: 'time', value: r => r.last, size: 230 },
  text('modules', 'Modules', r => r.modules, { size: 360 }),
];

function entityView(rows: EntityRow[]): View<EntityRow> {
  return {
    id: 'entities',
    label: 'Entities',
    rows,
    columns: entityColumns,
    pivot: r => ({ view: 'timeline', filters: { [PIVOT_COLUMN[r.kind]]: r.value } }),
    sort: { id: 'highlighted', desc: true },
  };
}

export function createTimeline(modules: readonly Plugin[]): Plugin {
  return {
    name: 'timeline',
    label: 'Timeline',
    category: 'All',
    icon: 'clock-history',
    description:
      'One chronology built from every module with its default options. Bookkeeping events stay out (logoffs, process exits, service state changes, duplicate MSI lines, PowerShell module logging without indicators); open a module for its full view. The Entities view lists accounts, remote addresses and computers; click one to filter the timeline to it.',
    // Log coverage is per module and on the overview; listing every channel here would bury the page.
    sources: [],
    options: [{ id: 'highlightedOnly', label: 'Highlighted entries only', default: false }],
    analyze(ctx, opts) {
      const all = buildTimeline(modules, ctx);
      const rows = opts['highlightedOnly'] ? all.filter(r => highlighted(r.tone)) : all;
      const found = entities(rows);
      const count = (kind: EntityKind) => found.filter(e => e.kind === kind).length;
      const flagged = all.filter(r => highlighted(r.tone));
      const perModule = new Map<string, number>();
      for (const r of rows) for (const m of r.modules) perModule.set(m, (perModule.get(m) ?? 0) + 1);
      return {
        stats: [
          { label: 'Entries', value: rows.length },
          { label: 'Highlighted', value: flagged.length, tone: flagged.length ? 'warning' : undefined },
          { label: 'Accounts', value: count('Account') },
          { label: 'Remote addresses', value: count('Remote address') },
          { label: 'Computers', value: count('Computer') },
          { label: 'Modules with entries', value: perModule.size },
        ],
        charts: [
          {
            kind: 'timeline',
            title: 'Entries per day',
            series: [
              { name: 'Highlighted', ts: rows.filter(r => highlighted(r.tone)).map(r => r.event.ts) },
              { name: 'Other', ts: rows.filter(r => !highlighted(r.tone)).map(r => r.event.ts) },
            ],
          },
          { kind: 'ranking', title: 'Entries by module', items: [...perModule].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value) },
        ],
        views: [
          eventView('timeline', 'Timeline', rows, timelineColumns),
          entityView(found),
        ],
        notes: [],
      };
    },
  };
}
