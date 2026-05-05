import type { EvtxEvent, EventFilter } from './evtx/types';
import { ref } from 'vue';

export interface EventSource {
  id: string;
  name: string;
  eventCount: number;
  errors: string[];
}

class EventStore {
  private events: Map<number, EvtxEvent> = new Map();
  private sources: Map<string, EventSource> = new Map();
  private eventList: EvtxEvent[] = [];
  private nextId = 0;
  version = ref(0);

  private bump() { this.version.value++; }

  addSource(name: string, parsed: { events: EvtxEvent[]; errors: string[] }): string {
    const id = `src_${this.sources.size}`;
    const source: EventSource = {
      id,
      name,
      eventCount: parsed.events.length,
      errors: parsed.errors,
    };

    for (const event of parsed.events) {
      event.id = this.nextId++;
      this.events.set(event.id, event);
      this.eventList.push(event);
    }

    this.sources.set(id, source);
    this.bump();
    return id;
  }

  removeSource(id: string): void {
    const source = this.sources.get(id);
    if (!source) return;

    const toRemove = new Set<number>();
    for (const event of this.eventList) {
      if (event.sourceFile === source.name) {
        toRemove.add(event.id);
      }
    }

    for (const eventId of toRemove) {
      this.events.delete(eventId);
    }
    this.eventList = this.eventList.filter(e => !toRemove.has(e.id));
    this.sources.delete(id);
    this.bump();
  }

  reset(): void {
    this.events.clear();
    this.sources.clear();
    this.eventList = [];
    this.nextId = 0;
    this.bump();
  }

  getEvent(id: number): EvtxEvent | undefined {
    return this.events.get(id);
  }

  getEvents(ids: number[]): EvtxEvent[] {
    return ids.map(id => this.events.get(id)).filter(Boolean) as EvtxEvent[];
  }

  getAllEvents(): EvtxEvent[] {
    return this.eventList;
  }

  query(filter: EventFilter = {}): EvtxEvent[] {
    let results = this.eventList;

    if (filter.providers && filter.providers.length > 0) {
      const pSet = new Set(filter.providers);
      results = results.filter(e => pSet.has(e.provider));
    }
    if (filter.eventIds && filter.eventIds.length > 0) {
      const eidSet = new Set(filter.eventIds);
      results = results.filter(e => eidSet.has(e.eventId));
    }
    if (filter.channels && filter.channels.length > 0) {
      const chSet = new Set(filter.channels);
      results = results.filter(e => chSet.has(e.channel));
    }
    if (filter.computers && filter.computers.length > 0) {
      const compSet = new Set(filter.computers);
      results = results.filter(e => compSet.has(e.computer));
    }
    if (filter.levelMin != null) {
      results = results.filter(e => e.level >= filter.levelMin!);
    }
    if (filter.levelMax != null) {
      results = results.filter(e => e.level <= filter.levelMax!);
    }
    if (filter.since) {
      results = results.filter(e => e.timestamp >= filter.since!);
    }
    if (filter.until) {
      results = results.filter(e => e.timestamp <= filter.until!);
    }
    if (filter.textSearch) {
      const q = filter.textSearch.toLowerCase();
      results = results.filter(e =>
        JSON.stringify(e.data).toLowerCase().includes(q) ||
        e.provider.toLowerCase().includes(q) ||
        e.channel.toLowerCase().includes(q) ||
        e.computer.toLowerCase().includes(q),
      );
    }

    return results;
  }

  getStatistics() {
    const providerMap = new Map<string, number>();
    const eventIdMap = new Map<number, number>();
    const computerMap = new Map<string, number>();
    const channelMap = new Map<string, number>();
    let earliest: Date | null = null;
    let latest: Date | null = null;

    for (const event of this.eventList) {
      providerMap.set(event.provider, (providerMap.get(event.provider) || 0) + 1);
      eventIdMap.set(event.eventId, (eventIdMap.get(event.eventId) || 0) + 1);
      computerMap.set(event.computer, (computerMap.get(event.computer) || 0) + 1);
      channelMap.set(event.channel, (channelMap.get(event.channel) || 0) + 1);

      if (!earliest || event.timestamp < earliest) earliest = event.timestamp;
      if (!latest || event.timestamp > latest) latest = event.timestamp;
    }

    const sortDesc = <T>(map: Map<T, number>) =>
      Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ name: String(key), count }));

    return {
      totalEvents: this.eventList.length,
      sourceCount: this.sources.size,
      providers: sortDesc(providerMap),
      eventIds: sortDesc(eventIdMap).map(e => ({ id: Number(e.name), count: e.count })),
      computers: sortDesc(computerMap),
      channels: sortDesc(channelMap),
      timeRange: { earliest, latest },
    };
  }

  getSources(): EventSource[] {
    return Array.from(this.sources.values());
  }
}

export const eventStore = new EventStore();
