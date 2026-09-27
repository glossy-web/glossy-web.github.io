import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initSync, EvtxReader } from '@wasm/evtx_wasm.js';
import { parseChunks } from '@/core/parseChunks';
import { createContext } from '@/core/context';
import { EventStore } from '@/core/store';
import type { EvtxEvent, ParseReport, ParsedEvent, SourceFile } from '@/core/evtx/types';
import type { PluginContext } from '@/core/plugin';

let initialized = false;

function wasm(): void {
  if (initialized) return;
  initSync({ module: readFileSync(fileURLToPath(new URL('../wasm/pkg/evtx_wasm_bg.wasm', import.meta.url))) });
  initialized = true;
}

export const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

export function parseFixture(name: string): { events: ParsedEvent[]; report: ParseReport } {
  wasm();
  const reader = new EvtxReader(readFileSync(fixture(name)));
  const events: ParsedEvent[] = [];
  try {
    const report = parseChunks(reader, batch => events.push(...batch));
    return { events, report };
  } finally {
    reader.free();
  }
}

/** Loads fixtures into a fresh store, the same way the worker pipeline does. */
export function loadStore(...names: string[]): { store: EventStore; ctx: PluginContext; sources: SourceFile[] } {
  const store = new EventStore();
  const sources = names.map(name => {
    const { events, report } = parseFixture(name);
    const builder = store.beginSource({ name, size: 0, sha256: name, file: null as unknown as File });
    builder.add(events);
    return builder.finish(report);
  });
  return { store, ctx: createContext(store), sources };
}

let nextRecord = 1;

/** Builds a synthetic event for plugins without public sample data. */
export function makeEvent(partial: Partial<EvtxEvent> & Pick<EvtxEvent, 'provider' | 'eventId'>): ParsedEvent {
  const time = partial.time ?? '2024-01-01T00:00:00.000Z';
  return {
    chunk: 0,
    seq: nextRecord,
    recordId: nextRecord++,
    ts: Date.parse(time),
    qualifiers: null,
    version: 0,
    level: 4,
    task: null,
    opcode: null,
    keywords: '',
    channel: '',
    computer: 'HOST1',
    userSid: '',
    pid: null,
    tid: null,
    activityId: '',
    data: {},
    list: [],
    payload: 'EventData',
    message: '',
    ...partial,
    time,
  };
}

/** A store holding synthetic events as one source. */
export function storeOf(events: ParsedEvent[]): { store: EventStore; ctx: PluginContext } {
  const store = new EventStore();
  const builder = store.beginSource({ name: 'synthetic', size: 0, sha256: 'synthetic', file: null as unknown as File });
  builder.add(events);
  builder.finish({
    header: { firstChunk: 0, lastChunk: 0, nextRecordId: 0, majorVersion: 3, minorVersion: 1, headerChunkCount: 1, dirty: false, full: false },
    slots: 1, chunksParsed: 1, emptyChunks: 0, chunkErrors: [], checksumMismatches: [], recordErrors: 0, recordErrorSamples: [], records: events.length, recordsBeyondHeader: 0,
  });
  return { store, ctx: createContext(store) };
}
