import { normalizeRecord, type RawRecord } from './normalize';
import type { EvtxFileHeaderInfo, ParseReport, ParsedEvent } from './evtx/types';

/** The subset of the wasm `EvtxReader` this module needs (also satisfied by tests). */
export interface ChunkReader {
  header(): string;
  slotCount(): number;
  parseChunk(index: number): string;
}

interface RawChunk {
  empty: boolean;
  error: string | null;
  checksumOk?: boolean;
  records?: RawRecord[];
  recordErrors?: string[];
}

/**
 * Walks every chunk slot of a file, normalizing records and handing them to
 * `onChunk` one chunk at a time. Returns what was found about the file itself.
 */
export function parseChunks(
  reader: ChunkReader,
  onChunk: (events: ParsedEvent[], slot: number, slots: number) => void,
): ParseReport {
  const header = JSON.parse(reader.header()) as EvtxFileHeaderInfo;
  const slots = reader.slotCount();
  const report: ParseReport = {
    header,
    slots,
    chunksParsed: 0,
    emptyChunks: 0,
    chunkErrors: [],
    checksumMismatches: [],
    recordErrors: 0,
    recordErrorSamples: [],
    records: 0,
    recordsBeyondHeader: 0,
  };

  for (let slot = 0; slot < slots; slot++) {
    const chunk = JSON.parse(reader.parseChunk(slot)) as RawChunk;
    if (chunk.empty) {
      report.emptyChunks++;
      onChunk([], slot, slots);
      continue;
    }
    if (chunk.error) {
      report.chunkErrors.push({ chunk: slot, message: chunk.error });
      onChunk([], slot, slots);
      continue;
    }
    report.chunksParsed++;
    if (chunk.checksumOk === false) report.checksumMismatches.push(slot);
    for (const message of chunk.recordErrors ?? []) {
      report.recordErrors++;
      if (report.recordErrorSamples.length < 5) report.recordErrorSamples.push(`chunk ${slot}: ${message}`);
    }
    const events = (chunk.records ?? []).map(r => normalizeRecord(r, slot));
    report.records += events.length;
    if (slot >= header.headerChunkCount) report.recordsBeyondHeader += events.length;
    onChunk(events, slot, slots);
  }
  return report;
}

export const EVTX_FILE_HEADER_SIZE = 4096;
export const EVTX_CHUNK_SIZE = 65536;
