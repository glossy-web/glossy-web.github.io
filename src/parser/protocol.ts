import type { ParseReport, ParsedEvent } from '@/core/evtx/types';

export type WorkerRequest =
  | { type: 'parse'; job: number; buffer: ArrayBuffer }
  | { type: 'xml'; job: number; chunk: ArrayBuffer; recordId: number };

export type WorkerResponse =
  | { type: 'events'; job: number; events: ParsedEvent[]; slot: number; slots: number }
  | { type: 'done'; job: number; report: ParseReport }
  | { type: 'xml'; job: number; xml: string | null }
  | { type: 'error'; job: number; message: string };
