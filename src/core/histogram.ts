import { offsetCache, zonedToEpoch } from './time';

export type BucketUnit = 'minute' | 'hour' | 'day' | 'month';

export interface Bucket {
  /** Wall-clock label in the zone: "2024-05-01", "2024-05-01 09:00", … */
  key: string;
  /** Epoch ms, start inclusive, end exclusive. */
  start: number;
  end: number;
  count: number;
}

const HOUR = 3600000;
const DAY = 24 * HOUR;

/** Finest unit that keeps the chart readable over the span (Kibana-style auto interval). */
export function unitFor(span: number): BucketUnit {
  if (span <= 3 * HOUR) return 'minute';
  if (span <= 4 * DAY) return 'hour';
  if (span <= 400 * DAY) return 'day';
  return 'month';
}

const pad = (n: number) => String(n).padStart(2, '0');

interface Wall {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
}

function truncate(w: Wall, unit: BucketUnit): Wall {
  if (unit === 'month') return { ...w, d: 1, h: 0, mi: 0 };
  if (unit === 'day') return { ...w, h: 0, mi: 0 };
  if (unit === 'hour') return { ...w, mi: 0 };
  return w;
}

function keyOf(w: Wall, unit: BucketUnit): string {
  const date = `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
  if (unit === 'month') return date.slice(0, 7);
  if (unit === 'day') return date;
  return `${date} ${pad(w.h)}:${unit === 'hour' ? '00' : pad(w.mi)}`;
}

/** The next bucket's wall time (Date.UTC normalizes month and day overflow). */
function next(w: Wall, unit: BucketUnit): Wall {
  const t = new Date(Date.UTC(w.y, w.mo - 1 + (unit === 'month' ? 1 : 0), w.d + (unit === 'day' ? 1 : 0), w.h + (unit === 'hour' ? 1 : 0), w.mi + (unit === 'minute' ? 1 : 0)));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}

/**
 * Counts per calendar bucket in the zone, with empty buckets kept so gaps in the record stay
 * visible. `bounds` widens the axis to a selected time range.
 */
export function histogram(times: Iterable<number>, zone: string, bounds: { from?: number; to?: number } = {}): { unit: BucketUnit; buckets: Bucket[] } {
  const offset = offsetCache(zone);
  const list: number[] = [];
  let min = Infinity;
  let max = -Infinity;
  for (const ts of times) {
    if (!Number.isFinite(ts)) continue;
    list.push(ts);
    if (ts < min) min = ts;
    if (ts > max) max = ts;
  }
  if (bounds.from !== undefined) min = Math.min(min, bounds.from);
  if (bounds.to !== undefined) max = Math.max(max, bounds.to);
  if (!Number.isFinite(min)) return { unit: 'day', buckets: [] };

  const unit = unitFor(max - min);
  const wallOf = (ts: number): Wall => {
    const t = new Date(ts + offset(ts));
    return truncate({ y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() }, unit);
  };

  const counts = new Map<string, number>();
  for (const ts of list) {
    const k = keyOf(wallOf(ts), unit);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const buckets: Bucket[] = [];
  const lastKey = keyOf(wallOf(max), unit);
  let w = wallOf(min);
  let start = zonedToEpoch(zone, w.y, w.mo, w.d, w.h, w.mi);
  for (let guard = 0; guard < 5000; guard++) {
    const key = keyOf(w, unit);
    const n = next(w, unit);
    const end = zonedToEpoch(zone, n.y, n.mo, n.d, n.h, n.mi);
    // A clock set back repeats a wall hour; its instants are already counted under the first key.
    if (buckets[buckets.length - 1]?.key !== key) buckets.push({ key, start, end, count: counts.get(key) ?? 0 });
    else buckets[buckets.length - 1]!.end = end;
    if (key === lastKey) break;
    w = n;
    start = end;
  }
  return { unit, buckets };
}
