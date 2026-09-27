/**
 * One EVTX record, normalized from the evtx crate's JSON output.
 *
 * `data` holds named fields: `EventData/Data[@Name]` or, for UserData events,
 * the leaves under the UserData root element (nested elements and attributes
 * are joined with "."). `list` holds unnamed `EventData/Data` values in order
 * (MsiInstaller, Application Error, EventLog, ...). Values are kept exactly as
 * written; nothing derived by analysis is ever stored on the event.
 */
export interface EvtxEvent {
  /** Index in the store's event array (assigned when added). */
  id: number;
  /** Index of the source file in the store. */
  src: number;
  /** Chunk slot the record was read from (used to re-render its XML on demand). */
  chunk: number;
  /** Record number from the record header: the file's own sequence (gap checks, XML lookup). */
  seq: number;
  /** System/EventRecordID (differs from `seq` in forwarded logs). */
  recordId: number;
  /** System/TimeCreated/@SystemTime as written (UTC, sub-millisecond precision). */
  time: string;
  /** `time` as epoch milliseconds. */
  ts: number;
  provider: string;
  eventId: number;
  qualifiers: number | null;
  version: number | null;
  level: number;
  task: number | null;
  opcode: number | null;
  keywords: string;
  channel: string;
  computer: string;
  /** System/Security/@UserID */
  userSid: string;
  /** System/Execution/@ProcessID and @ThreadID */
  pid: number | null;
  tid: number | null;
  /** System/Correlation/@ActivityID */
  activityId: string;
  data: Record<string, string>;
  list: string[];
  /** "EventData", "UserData/<Root>" or "" when the record has neither. */
  payload: string;
  /** RenderingInfo/Message, present only in forwarded (WEF) events. */
  message: string;
}

/** An event before the store assigns `id` and `src`. */
export type ParsedEvent = Omit<EvtxEvent, 'id' | 'src'>;

export interface EvtxFileHeaderInfo {
  firstChunk: number;
  lastChunk: number;
  nextRecordId: number;
  majorVersion: number;
  minorVersion: number;
  headerChunkCount: number;
  dirty: boolean;
  full: boolean;
}

/** What the parser learned about one file. */
export interface ParseReport {
  header: EvtxFileHeaderInfo;
  /** 64 KiB chunk slots physically present in the file. */
  slots: number;
  chunksParsed: number;
  emptyChunks: number;
  /** Chunks whose header could not be parsed at all. */
  chunkErrors: { chunk: number; message: string }[];
  /** Chunks that parsed but whose CRC32 does not match (kept, flagged). */
  checksumMismatches: number[];
  /** Records that failed to decode. */
  recordErrors: number;
  recordErrorSamples: string[];
  records: number;
  /** Records read from slots beyond the header's chunk count. */
  recordsBeyondHeader: number;
}

export interface RecordIdGap {
  from: number;
  to: number;
}

export interface SourceFile {
  index: number;
  name: string;
  size: number;
  sha256: string;
  /** Kept to re-read a single chunk for the XML view; never read in full again. */
  file: File;
  report: ParseReport;
  /** Records added to the store (after cross-file de-duplication). */
  added: number;
  duplicates: number;
  computers: string[];
  channels: string[];
  firstTs: number | null;
  lastTs: number | null;
  minSeq: number | null;
  maxSeq: number | null;
  /** Missing record numbers between the lowest and highest in the file. */
  gaps: RecordIdGap[];
  missingRecords: number;
  /** Adjacent records (by record number) whose time goes back by more than one second. */
  timeReversals: number;
}

export const LEVEL_NAMES: Record<number, string> = {
  0: 'Information',
  1: 'Critical',
  2: 'Error',
  3: 'Warning',
  4: 'Information',
  5: 'Verbose',
};

export function levelName(level: number): string {
  return LEVEL_NAMES[level] ?? `Level ${level}`;
}
