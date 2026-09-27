import type { ParsedEvent } from './evtx/types';

/** One record as emitted by the wasm reader (`EvtxReader.parseChunk`). */
export interface RawRecord {
  id: number;
  /** Record header timestamp (fallback when System/TimeCreated is missing). */
  time: string;
  event: { Event?: Record<string, unknown> } | null;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Converts a JSON leaf (or small subtree) to the string an analyst would read. */
export function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (Array.isArray(v)) return v.map(text).join(', ');
  if (isObj(v) && '#text' in v && Object.keys(v).length === 1) return text(v['#text']);
  return JSON.stringify(v);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function attrs(v: unknown): Obj {
  return isObj(v) && isObj(v['#attributes']) ? v['#attributes'] : {};
}

const join = (prefix: string, key: string) => (prefix ? `${prefix}.${key}` : key);

/** Flattens an XML-as-JSON subtree into `out` using dotted paths; namespace attributes are dropped. */
function flatten(node: Obj, prefix: string, out: Record<string, string>): void {
  for (const [key, value] of Object.entries(node)) {
    if (key === '#attributes') {
      if (!isObj(value)) continue;
      for (const [name, attr] of Object.entries(value)) {
        if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
        out[join(prefix, name)] = text(attr);
      }
    } else if (key === '#text') {
      out[prefix || '#text'] = text(value);
    } else if (isObj(value)) {
      flatten(value, join(prefix, key), out);
    } else {
      out[join(prefix, key)] = text(value);
    }
  }
}

/** Parses an ISO-8601 UTC time with up to 7 fractional digits to epoch milliseconds. */
export function parseSystemTime(s: string): number {
  if (!s) return NaN;
  return Date.parse(s.replace(/(\.\d{3})\d+/, '$1'));
}

function readPayload(event: Obj): Pick<ParsedEvent, 'data' | 'list' | 'payload'> {
  const data: Record<string, string> = {};
  const list: string[] = [];

  const eventData = event['EventData'];
  if (eventData !== undefined) {
    if (isObj(eventData)) {
      for (const [key, value] of Object.entries(eventData)) {
        if (key === '#attributes') continue;
        // Unnamed <Data> elements are rendered as {"Data": {"#text": [...]}}.
        if (key === 'Data' && isObj(value) && '#text' in value) {
          const t = value['#text'];
          if (Array.isArray(t)) for (const item of t) list.push(text(item));
          else list.push(text(t));
        } else {
          data[key] = text(value);
        }
      }
    }
    return { data, list, payload: 'EventData' };
  }

  const userData = event['UserData'];
  if (isObj(userData)) {
    const roots = Object.keys(userData).filter(k => k !== '#attributes');
    for (const root of roots) {
      const content = userData[root];
      if (isObj(content)) flatten(content, roots.length > 1 ? root : '', data);
      else data[root] = text(content);
    }
    return { data, list, payload: `UserData/${roots.join('+')}` };
  }

  // Records that failed to render on the source system carry ProcessingErrorData etc.
  for (const [key, value] of Object.entries(event)) {
    if (key === 'System' || key === '#attributes' || key === 'RenderingInfo') continue;
    if (isObj(value)) flatten(value, '', data);
    return { data, list, payload: key };
  }
  return { data, list, payload: '' };
}

export function normalizeRecord(raw: RawRecord, chunk: number): ParsedEvent {
  const event = raw.event && isObj(raw.event.Event) ? raw.event.Event : {};
  const system = isObj(event['System']) ? event['System'] : {};

  const provider = attrs(system['Provider']);
  const eventIdNode = system['EventID'];
  const eventId = isObj(eventIdNode) ? num(eventIdNode['#text']) : num(eventIdNode);
  const qualifiers = num(attrs(eventIdNode)['Qualifiers']);
  const created = text(attrs(system['TimeCreated'])['SystemTime']);
  const time = created || raw.time;
  const execution = attrs(system['Execution']);
  const recordId = num(system['EventRecordID']) ?? raw.id;

  return {
    chunk,
    seq: raw.id,
    recordId,
    time,
    ts: parseSystemTime(time),
    provider: text(provider['Name']),
    eventId: eventId ?? -1,
    qualifiers,
    version: num(system['Version']),
    level: num(system['Level']) ?? 0,
    task: num(system['Task']),
    opcode: num(system['Opcode']),
    keywords: text(system['Keywords']),
    channel: text(system['Channel']),
    computer: text(system['Computer']),
    userSid: text(attrs(system['Security'])['UserID']),
    pid: num(execution['ProcessID']),
    tid: num(execution['ThreadID']),
    activityId: text(attrs(system['Correlation'])['ActivityID']),
    ...readPayload(event),
    message: isObj(event['RenderingInfo']) ? text(event['RenderingInfo']['Message']) : '',
  };
}
