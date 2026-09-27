import { reactive } from 'vue';
import { eventStore } from '@/core/store';
import { EVTX_CHUNK_SIZE, EVTX_FILE_HEADER_SIZE } from '@/core/parseChunks';
import type { EvtxEvent } from '@/core/evtx/types';
import type { WorkerRequest, WorkerResponse } from '@/parser/protocol';

export interface FileProgress {
  name: string;
  size: number;
  status: 'queued' | 'reading' | 'parsing' | 'done' | 'skipped' | 'failed';
  progress: number;
  message: string;
}

export const loader = reactive({
  busy: false,
  files: [] as FileProgress[],
});

const createWorker = () => new Worker(new URL('../parser/evtx.worker.ts', import.meta.url), { type: 'module' });

type Handler = (msg: WorkerResponse) => void;

/** A worker plus the handler of the job it is currently running. */
class Slot {
  readonly worker = createWorker();
  private handlers = new Map<number, Handler>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handlers.get(e.data.job)?.(e.data);
  }

  run(request: WorkerRequest, transfer: Transferable[], handler: Handler): void {
    this.handlers.set(request.job, handler);
    this.worker.postMessage(request, transfer);
  }

  release(job: number): void {
    this.handlers.delete(job);
  }
}

let parseSlots: Slot[] = [];
let xmlSlot: Slot | null = null;
let nextJob = 1;

function poolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(4, cores - 1));
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}

async function parseOne(slot: Slot, file: File, progress: FileProgress): Promise<void> {
  progress.status = 'reading';
  const buffer = await file.arrayBuffer();
  const hash = await sha256(buffer);
  if (eventStore.hasFile(hash)) {
    progress.status = 'skipped';
    progress.message = 'Identical file already loaded (same SHA-256)';
    return;
  }
  const builder = eventStore.beginSource({ name: file.name, size: file.size, sha256: hash, file });
  progress.status = 'parsing';
  const job = nextJob++;
  await new Promise<void>(resolve => {
    slot.run({ type: 'parse', job, buffer }, [buffer], msg => {
      if (msg.type === 'events') {
        builder.add(msg.events);
        progress.progress = (msg.slot + 1) / Math.max(1, msg.slots);
      } else if (msg.type === 'done') {
        const source = builder.finish(msg.report);
        const r = msg.report;
        progress.status = 'done';
        progress.progress = 1;
        progress.message =
          `${source.added.toLocaleString()} records` +
          (source.duplicates ? `, ${source.duplicates.toLocaleString()} duplicates skipped` : '') +
          (r.chunkErrors.length || r.recordErrors ? `, ${r.chunkErrors.length + r.recordErrors} parse errors` : '');
        slot.release(job);
        resolve();
      } else if (msg.type === 'error') {
        if (builder.added === 0) eventStore.discardSource(hash);
        progress.status = 'failed';
        progress.message = msg.message;
        slot.release(job);
        resolve();
      }
    });
  });
}

/** Parses the given files in a pool of workers. Non-.evtx files are reported and ignored. */
export async function loadFiles(files: File[]): Promise<void> {
  const queue: [File, FileProgress][] = [];
  for (const file of files) {
    const progress: FileProgress = reactive({ name: file.name, size: file.size, status: 'queued', progress: 0, message: '' });
    loader.files.push(progress);
    if (!file.name.toLowerCase().endsWith('.evtx')) {
      progress.status = 'skipped';
      progress.message = 'Not an .evtx file';
      continue;
    }
    queue.push([file, progress]);
  }
  if (queue.length === 0) return;

  loader.busy = true;
  if (parseSlots.length === 0) parseSlots = Array.from({ length: poolSize() }, () => new Slot());
  // Large files first so the pool finishes together.
  queue.sort((a, b) => b[0].size - a[0].size);
  await Promise.all(
    parseSlots.map(async slot => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const [file, progress] = item;
        try {
          await parseOne(slot, file, progress);
        } catch (err) {
          progress.status = 'failed';
          progress.message = err instanceof Error ? err.message : String(err);
        }
      }
    }),
  );
  loader.busy = false;
}

/** Re-reads one chunk of the event's source file and renders the record as XML. */
export async function renderXml(event: EvtxEvent): Promise<string | null> {
  const source = eventStore.sources.find(s => s.index === event.src);
  if (!source) return null;
  const start = EVTX_FILE_HEADER_SIZE + event.chunk * EVTX_CHUNK_SIZE;
  const chunk = await source.file.slice(start, start + EVTX_CHUNK_SIZE).arrayBuffer();
  xmlSlot ??= new Slot();
  const slot = xmlSlot;
  const job = nextJob++;
  return new Promise(resolve => {
    slot.run({ type: 'xml', job, chunk, recordId: event.seq }, [chunk], msg => {
      slot.release(job);
      resolve(msg.type === 'xml' ? msg.xml : null);
    });
  });
}

export function clearAll(): void {
  eventStore.reset();
  loader.files.splice(0);
}
