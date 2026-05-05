export interface EvtxEventData {
  [key: string]: unknown;
}

export interface EvtxEvent {
  id: number;
  recordId: bigint;
  timestamp: Date;
  provider: string;
  providerGuid: string;
  eventId: number;
  qualifiers: number | null;
  version: number;
  level: number;
  levelName: string;
  task: number;
  opcode: number;
  keywords: string;
  channel: string;
  computer: string;
  securityUserId: string | null;
  processId: number | null;
  threadId: number | null;
  activityId: string | null;
  data: EvtxEventData;
  rawXml: string;
  sourceFile: string;
}

export interface EvtxFileHeader {
  firstChunk: bigint;
  lastChunk: bigint;
  nextRecordId: bigint;
  headerSize: number;
  minorVersion: number;
  majorVersion: number;
  chunkCount: number;
  isDirty: boolean;
  isFull: boolean;
}

export interface EvtxChunkHeader {
  firstRecordNum: bigint;
  lastRecordNum: bigint;
  firstRecordId: bigint;
  lastRecordId: bigint;
  headerSize: number;
  lastRecordOffset: number;
  recordCount: number;
}

export interface EvtxParseResult {
  events: EvtxEvent[];
  fileHeader: EvtxFileHeader;
  recordCount: number;
  errors: string[];
}

export interface EventFilter {
  providers?: string[];
  eventIds?: number[];
  channels?: string[];
  computers?: string[];
  levelMin?: number;
  levelMax?: number;
  since?: Date;
  until?: Date;
  textSearch?: string;
}

export const LEVEL_NAMES: Record<number, string> = {
  1: 'Critical',
  2: 'Error',
  3: 'Warning',
  4: 'Information',
  5: 'Verbose',
  0: 'LogAlways',
};

export function filetimeToDate(filetime: bigint): Date {
  const EPOCH_DIFF = 11644473600000n;
  const ms = Number((filetime / 10000n) - EPOCH_DIFF);
  return new Date(ms);
}
