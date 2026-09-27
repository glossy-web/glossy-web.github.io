import init, { EvtxReader, renderRecordXml } from '@wasm/evtx_wasm.js';
import { parseChunks } from '@/core/parseChunks';
import type { ParsedEvent } from '@/core/evtx/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

// The project compiles against the DOM lib; describe just the worker scope we use.
const scope = self as unknown as {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

const ready = init();
const BATCH = 4000;

function parse(job: number, buffer: ArrayBuffer): void {
  const reader = new EvtxReader(new Uint8Array(buffer));
  try {
    let batch: ParsedEvent[] = [];
    const report = parseChunks(reader, (events, slot, slots) => {
      for (const e of events) batch.push(e);
      if (batch.length >= BATCH || slot === slots - 1) {
        scope.postMessage({ type: 'events', job, events: batch, slot, slots });
        batch = [];
      }
    });
    if (batch.length) scope.postMessage({ type: 'events', job, events: batch, slot: report.slots - 1, slots: report.slots });
    scope.postMessage({ type: 'done', job, report });
  } finally {
    reader.free();
  }
}

scope.onmessage = async event => {
  const req = event.data;
  try {
    await ready;
    if (req.type === 'parse') parse(req.job, req.buffer);
    else {
      const xml = renderRecordXml(new Uint8Array(req.chunk), BigInt(req.recordId));
      scope.postMessage({ type: 'xml', job: req.job, xml: xml ?? null });
    }
  } catch (err) {
    scope.postMessage({ type: 'error', job: req.job, message: err instanceof Error ? err.message : String(err) });
  }
};
