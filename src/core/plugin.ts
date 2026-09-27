import type { EvtxEvent, SourceFile } from './evtx/types';
import type { AsInfo } from './ipdb';
import type { Selector } from './store';

export type Tone = 'danger' | 'warning' | 'success' | 'muted';

export interface Column<R> {
  id: string;
  label: string;
  /** Value used for sorting, filtering and export. `kind: 'time'` expects epoch ms. */
  value: (row: R) => string | number;
  /** Cell text when it differs from the value (never used for kind 'time'). */
  text?: (row: R) => string;
  kind?: 'time' | 'number' | 'mono';
  /** Initial width in px. */
  size?: number;
  /** Offer a pick-list of the column's distinct values as its filter. */
  facet?: boolean;
  hidden?: boolean;
  tone?: (row: R) => Tone | undefined;
}

export interface View<R = unknown> {
  id: string;
  label: string;
  rows: R[];
  columns: Column<R>[];
  /** The event opened when a row is clicked. */
  event?: (row: R) => EvtxEvent | undefined;
  /** Text shown above the record when a row is opened (e.g. a script reassembled from several events). */
  detail?: (row: R) => RowDetail | undefined;
  /** How the row appears in the unified timeline; rows mapped to undefined stay out of it. */
  timeline?: (row: R) => TimelineEntry | undefined;
  /** Clicking the row opens another view of the same page with column filters set. */
  pivot?: (row: R) => Pivot | undefined;
  sort?: { id: string; desc?: boolean };
}

/**
 * One row's contribution to the unified timeline, modelled on EvtxECmd maps:
 * a short description, free-text details, and the user and remote host involved.
 */
export interface TimelineEntry {
  title: string;
  detail?: string;
  /** Accounts involved (DOMAIN\user); empty values are dropped. */
  users?: string[];
  /** Remote IP address or host name. */
  remote?: string;
  /** 'danger' or 'warning' marks the entry as highlighted. */
  tone?: Tone;
}

export interface Pivot {
  view: string;
  /** Column id → filter value. */
  filters: Record<string, string>;
}

export interface RowDetail {
  title: string;
  text: string;
}

export interface Stat {
  label: string;
  value: number | string;
  tone?: Tone;
}

export interface Series {
  name: string;
  ts: number[];
}

/**
 * What clicking a chart filters in the page's table: time charts set a time range on the view's
 * time column; ranking bars set `column` to the bar's name (exact value or substring).
 */
export interface ChartTarget {
  /** View to filter; the view on screen when omitted. */
  view?: string;
  column?: string;
  match?: 'exact' | 'contains';
}

export interface GraphNode {
  id: string;
  label: string;
  /** Sources (addresses) and targets (computers) are drawn in different colors. */
  group: 'source' | 'target';
  weight: number;
  /** Tooltip text. */
  detail?: string;
  /** Column filter a click on the node applies. */
  filter?: { column: string; value: string };
}

export interface GraphLink {
  source: string;
  target: string;
  weight: number;
  detail?: string;
  tone?: Tone;
}

export type ChartSpec = (
  /** Events per time bucket (minute to month), stacked by series. */
  | { kind: 'timeline'; title: string; series: Series[] }
  /** Each event as a dot at (date, time of day) — spots off-hours activity. */
  | { kind: 'clock'; title: string; series: Series[] }
  /** Top items by count, as horizontal bars. */
  | { kind: 'ranking'; title: string; items: { name: string; value: number }[] }
  /** Events per calendar day, one row of weeks per year (as GitHub's contribution graph). */
  | { kind: 'calendar'; title: string; ts: number[] }
  /** Who connected to what: sources, targets and the links between them. */
  | { kind: 'graph'; title: string; nodes: GraphNode[]; links: GraphLink[] }
) & { target?: ChartTarget };

export interface Note {
  tone: 'info' | 'warning';
  text: string;
}

export interface AnalysisResult {
  stats: Stat[];
  charts: ChartSpec[];
  views: View<any>[];
  notes: Note[];
}

/** A log channel a plugin reads, shown with its presence in the loaded data. */
export interface SourceSpec extends Selector {
  channel: string;
  /** The channel is disabled or tiny by default, so absence is not evidence of absence. */
  offByDefault?: boolean;
}

export interface PluginOption {
  id: string;
  label: string;
  default: boolean;
}

export interface PluginContext {
  select(selectors: readonly Selector[]): EvtxEvent[];
  /** Every loaded event, sorted by time. */
  all(): EvtxEvent[];
  /** Account name for a SID, learned from Security events and well-known SIDs ('' if unknown). */
  sidName(sid: string): string;
  source(e: EvtxEvent): SourceFile | undefined;
  /** Every loaded source file. */
  files(): readonly SourceFile[];
  /** The analyst's star on an event, with its note; undefined when the event is not starred. */
  starred(e: EvtxEvent): { note: string } | undefined;
  /** Announcing AS and registered country of a public IPv4 address (iptoasn.com); undefined if unknown or not loaded yet. */
  ipInfo(ip: string): AsInfo | undefined;
}

export type Category = 'System' | 'Account' | 'Application' | 'Hardware' | 'All';

export interface Plugin {
  name: string;
  label: string;
  category: Category;
  /** lucide icon name (kebab-case), resolved by the UI. */
  icon: string;
  description: string;
  sources: SourceSpec[];
  options?: PluginOption[];
  analyze(ctx: PluginContext, options: Record<string, boolean>): AnalysisResult;
}

export function emptyResult(): AnalysisResult {
  return { stats: [], charts: [], views: [], notes: [] };
}

/** Standard columns shared by most views: time, event ID, computer. */
export function timeColumn<R extends { event: EvtxEvent }>(label = 'Time'): Column<R> {
  return { id: 'time', label, kind: 'time', value: r => r.event.ts, size: 230 };
}

export function eventIdColumn<R extends { event: EvtxEvent }>(): Column<R> {
  return { id: 'eventId', label: 'Event ID', kind: 'number', value: r => r.event.eventId, size: 80, facet: true };
}

export function computerColumn<R extends { event: EvtxEvent }>(): Column<R> {
  return { id: 'computer', label: 'Computer', value: r => r.event.computer, size: 160, facet: true };
}

export function recordIdColumn<R extends { event: EvtxEvent }>(): Column<R> {
  return { id: 'recordId', label: 'Record ID', kind: 'number', value: r => r.event.recordId, size: 90, hidden: true };
}
