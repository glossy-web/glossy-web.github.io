import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, View } from '@/core/plugin';
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

export const SECURITY = 'Microsoft-Windows-Security-Auditing';
export const EVENTLOG = 'Microsoft-Windows-Eventlog';
