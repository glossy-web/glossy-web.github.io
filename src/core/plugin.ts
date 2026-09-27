import type { EvtxEvent, SourceFile } from './evtx/types';
import type { Selector } from './store';

export type Tone = 'danger' | 'warning' | 'success' | 'muted';

export interface Column<R> {
  id: string;
  label: string;
  /** Value used for sorting, filtering and export. `kind: 'time'` expects epoch ms. */
  value: (row: R) => string | number;
  /** Cell text when it differs from the value (never used for kind 'time'). */
  text?: (row: R) => string;
  kind?: 'time' | 'number' | 'mono' | 'wrap';
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
  sort?: { id: string; desc?: boolean };
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

export type ChartSpec =
  /** Events per day, stacked by series. */
  | { kind: 'timeline'; title: string; series: Series[] }
  /** Each event as a dot at (date, time of day) — spots off-hours activity. */
  | { kind: 'clock'; title: string; series: Series[] }
  /** Top items by count, as horizontal bars. */
  | { kind: 'ranking'; title: string; items: { name: string; value: number }[] };

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
}

export type Category = 'System' | 'Account' | 'Application' | 'Hardware' | 'All';

export interface Plugin {
  name: string;
  label: string;
  category: Category;
  /** Bootstrap Icons name without the "bi-" prefix. */
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
  return { id: 'time', label, kind: 'time', value: r => r.event.ts, size: 190 };
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
