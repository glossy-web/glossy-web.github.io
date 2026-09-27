import { shallowRef } from 'vue';
import type { EvtxEvent, ParseReport, ParsedEvent, RecordIdGap, SourceFile } from './evtx/types';

/**
 * Selects events of one provider by event ID. Channels are not part of the match:
 * forwarded and archived logs keep the original System/Channel, and a provider's
 * event IDs mean the same thing in every channel it writes to.
 */
export interface Selector {
  provider: string;
  ids: number[];
}

const keyOf = (provider: string, eventId: number) => `${provider.toLowerCase()}\u0001${eventId}`;
const byTime = (a: EvtxEvent, b: EvtxEvent) => a.ts - b.ts || a.src - b.src || a.recordId - b.recordId;

/** Collects one file's events while it is being parsed. */
export class SourceBuilder {
  private recordIds: number[] = [];
  private times: number[] = [];
  private computers = new Set<string>();
  private channels = new Set<string>();
  private first = Infinity;
  private last = -Infinity;
  added = 0;
  duplicates = 0;

  constructor(
    private store: EventStore,
    readonly index: number,
    readonly meta: { name: string; size: number; sha256: string; file: File },
  ) {}

  add(events: ParsedEvent[]): void {
    for (const parsed of events) {
      this.recordIds.push(parsed.seq);
      this.times.push(parsed.ts);
      this.computers.add(parsed.computer);
      this.channels.add(parsed.channel);
      if (parsed.ts < this.first) this.first = parsed.ts;
      if (parsed.ts > this.last) this.last = parsed.ts;
      if (this.store.isDuplicate(parsed)) {
        this.duplicates++;
        continue;
      }
      this.store.push(parsed, this.index);
      this.added++;
    }
  }

  finish(report: ParseReport): SourceFile {
    const { gaps, missing, min, max } = this.recordIdGaps();
    const source: SourceFile = {
      index: this.index,
      ...this.meta,
      report,
      added: this.added,
      duplicates: this.duplicates,
      computers: [...this.computers].filter(Boolean).sort(),
      channels: [...this.channels].filter(Boolean).sort(),
      firstTs: Number.isFinite(this.first) ? this.first : null,
      lastTs: Number.isFinite(this.last) ? this.last : null,
      minSeq: min,
      maxSeq: max,
      gaps,
      missingRecords: missing,
      timeReversals: this.timeReversals(),
    };
    this.store.finishSource(source);
    return source;
  }

  /**
   * Record numbers are one sequence per log file, so holes between the lowest and
   * highest number point at records that were removed or lost.
   */
  private recordIdGaps(): { gaps: RecordIdGap[]; missing: number; min: number | null; max: number | null } {
    if (this.recordIds.length === 0) return { gaps: [], missing: 0, min: null, max: null };
    const ids = [...new Set(this.recordIds)].sort((a, b) => a - b);
    const min = ids[0]!;
    const max = ids[ids.length - 1]!;
    const gaps: RecordIdGap[] = [];
    let missing = 0;
    for (let i = 1; i < ids.length; i++) {
      const prev = ids[i - 1]!;
      const cur = ids[i]!;
      if (cur - prev > 1) {
        gaps.push({ from: prev + 1, to: cur - 1 });
        missing += cur - prev - 1;
      }
    }
    return { gaps, missing, min, max };
  }

  private timeReversals(): number {
    const order = this.recordIds.map((id, i) => [id, this.times[i]!] as const).sort((a, b) => a[0] - b[0]);
    let count = 0;
    for (let i = 1; i < order.length; i++) if (order[i]![1] < order[i - 1]![1] - 1000) count++;
    return count;
  }
}

export class EventStore {
  /** Bumped whenever sources or events change; read it inside computed() to react. */
  readonly version = shallowRef(0);
  private sourceList: SourceFile[] = [];
  private eventList: EvtxEvent[] = [];
  private index = new Map<string, EvtxEvent[]>();
  private channelCounts = new Map<string, number>();
  /** computer+channel -> EventRecordID -> TimeCreated, to drop records seen in another file. */
  private seen = new Map<string, Map<number, string>>();
  private hashes = new Set<string>();
  private nextSource = 0;
  private cache = new Map<string, EvtxEvent[]>();
  private cacheVersion = -1;

  get sources(): readonly SourceFile[] {
    return this.sourceList;
  }

  get events(): readonly EvtxEvent[] {
    return this.eventList;
  }

  get size(): number {
    return this.eventList.length;
  }

  hasFile(sha256: string): boolean {
    return this.hashes.has(sha256);
  }

  beginSource(meta: { name: string; size: number; sha256: string; file: File }): SourceBuilder {
    this.hashes.add(meta.sha256);
    return new SourceBuilder(this, this.nextSource++, meta);
  }

  /** Aborts a source whose parse failed before anything was added. */
  discardSource(sha256: string): void {
    this.hashes.delete(sha256);
  }

  isDuplicate(e: ParsedEvent): boolean {
    const key = `${e.computer}\u0001${e.channel}`;
    let ids = this.seen.get(key);
    if (!ids) this.seen.set(key, (ids = new Map()));
    const time = ids.get(e.recordId);
    if (time === undefined) {
      ids.set(e.recordId, e.time);
      return false;
    }
    return time === e.time;
  }

  push(parsed: ParsedEvent, src: number): void {
    const event = parsed as EvtxEvent;
    event.id = this.eventList.length;
    event.src = src;
    this.eventList.push(event);
    const key = keyOf(event.provider, event.eventId);
    let bucket = this.index.get(key);
    if (!bucket) this.index.set(key, (bucket = []));
    bucket.push(event);
    this.channelCounts.set(event.channel, (this.channelCounts.get(event.channel) ?? 0) + 1);
  }

  finishSource(source: SourceFile): void {
    this.sourceList.push(source);
    this.sourceList.sort((a, b) => a.index - b.index);
    this.touch();
  }

  touch(): void {
    this.version.value++;
  }

  reset(): void {
    this.sourceList = [];
    this.eventList = [];
    this.index.clear();
    this.channelCounts.clear();
    this.seen.clear();
    this.hashes.clear();
    this.cache.clear();
    this.nextSource = 0;
    this.touch();
  }

  channelCount(channel: string): number {
    return this.channelCounts.get(channel) ?? 0;
  }

  channels(): { channel: string; count: number }[] {
    return [...this.channelCounts].map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count);
  }

  /** Events matching any selector, sorted by time. Results are cached per store version. */
  select(selectors: readonly Selector[]): EvtxEvent[] {
    if (this.cacheVersion !== this.version.value) {
      this.cache.clear();
      this.cacheVersion = this.version.value;
    }
    const cacheKey = JSON.stringify(selectors.map(s => [s.provider.toLowerCase(), s.ids]));
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;
    const out: EvtxEvent[] = [];
    for (const s of selectors) {
      for (const id of s.ids) {
        for (const e of this.index.get(keyOf(s.provider, id)) ?? []) out.push(e);
      }
    }
    out.sort(byTime);
    this.cache.set(cacheKey, out);
    return out;
  }

  /** Every event sorted by time (cached). */
  all(): EvtxEvent[] {
    if (this.cacheVersion !== this.version.value) {
      this.cache.clear();
      this.cacheVersion = this.version.value;
    }
    let hit = this.cache.get('*');
    if (!hit) this.cache.set('*', (hit = [...this.eventList].sort(byTime)));
    return hit;
  }

  count(selectors: readonly Selector[]): number {
    let n = 0;
    for (const s of selectors) {
      for (const id of s.ids) {
        n += this.index.get(keyOf(s.provider, id))?.length ?? 0;
      }
    }
    return n;
  }
}

export const eventStore = new EventStore();
