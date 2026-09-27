/**
 * IPv4 → autonomous system (number, country, name), from the iptoasn.com database, packed
 * for the browser. Layout (little-endian): a 24-byte header; range starts, delta-encoded;
 * one AS index per range (0 = not routed); the AS table (numbers, country codes, name
 * offsets); AS names in UTF-8. Adjacent ranges of the same AS are merged, and gaps between
 * listed ranges are stored as not routed. The file is gzipped on disk.
 */

export interface AsInfo {
  asn: number;
  /** ISO 3166 alpha-2 code as registered for the AS ('' when unknown). */
  country: string;
  name: string;
}

export interface AsRange extends AsInfo {
  start: number;
  end: number;
}

const MAGIC = 0x53415049; // "IPAS"
const VERSION = 1;
const HEADER = 24;

/** "1.2.3.4" (or "::ffff:1.2.3.4") → 32-bit number; null for anything else. */
export function parseIPv4(ip: string): number | null {
  const m = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(ip.trim());
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some(n => n > 255)) return null;
  return o[0]! * 16777216 + o[1]! * 65536 + o[2]! * 256 + o[3]!;
}

/** Packs sorted, non-overlapping ranges (as listed in ip2asn-v4-u32.tsv). */
export function encodeIpDb(ranges: Iterable<AsRange>, builtAt = 0): Uint8Array {
  const keys = new Map<string, number>([['', 0]]);
  const table: AsInfo[] = [{ asn: 0, country: '', name: '' }];
  const starts: number[] = [];
  const index: number[] = [];
  const push = (start: number, i: number) => {
    if (index.length && index[index.length - 1] === i) return;
    starts.push(start);
    index.push(i);
  };
  let next = 0;
  for (const r of ranges) {
    if (r.start < next) throw new Error(`IP ranges overlap or are not sorted at ${r.start}`);
    if (r.start > next) push(next, 0);
    let i = 0;
    if (r.asn !== 0) {
      const country = r.country === 'None' ? '' : r.country;
      const key = `${r.asn}\u0001${country}\u0001${r.name}`;
      i = keys.get(key) ?? -1;
      if (i < 0) {
        i = table.length;
        keys.set(key, i);
        table.push({ asn: r.asn, country, name: r.name });
      }
    }
    push(r.start, i);
    next = r.end + 1;
  }
  if (next <= 0xffffffff) push(next, 0);

  const enc = new TextEncoder();
  const names = table.map(t => enc.encode(t.name));
  const namesBytes = names.reduce((n, b) => n + b.length, 0);
  const size = HEADER + starts.length * 8 + table.length * (4 + 2 + 4) + 4 + namesBytes;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, starts.length, true);
  view.setUint32(12, table.length, true);
  view.setUint32(16, namesBytes, true);
  view.setUint32(20, builtAt, true);
  let o = HEADER;
  for (let k = 0; k < starts.length; k++, o += 4) view.setUint32(o, starts[k]! - (k ? starts[k - 1]! : 0), true);
  for (const i of index) (view.setUint32(o, i, true), (o += 4));
  for (const t of table) (view.setUint32(o, t.asn, true), (o += 4));
  for (const t of table) {
    bytes[o++] = t.country.charCodeAt(0) || 0;
    bytes[o++] = t.country.charCodeAt(1) || 0;
  }
  let offset = 0;
  for (const b of names) (view.setUint32(o, offset, true), (o += 4), (offset += b.length));
  view.setUint32(o, offset, true);
  o += 4;
  for (const b of names) (bytes.set(b, o), (o += b.length));
  return bytes;
}

export class IpDb {
  private readonly starts: Uint32Array;
  private readonly index: Uint32Array;
  private readonly asns: Uint32Array;
  private readonly countries: Uint8Array;
  private readonly nameOffsets: Uint32Array;
  private readonly names: Uint8Array;
  private readonly cache = new Map<number, AsInfo>();
  /** Unix seconds when the database was built (0 if unknown). */
  readonly builtAt: number;

  constructor(buffer: ArrayBuffer) {
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== VERSION) throw new Error('Not an IP-to-ASN database');
    const ranges = view.getUint32(8, true);
    const ases = view.getUint32(12, true);
    const namesBytes = view.getUint32(16, true);
    this.builtAt = view.getUint32(20, true);
    let o = HEADER;
    const deltas = new Uint32Array(buffer.slice(o, (o += ranges * 4)));
    this.starts = new Uint32Array(ranges);
    for (let k = 0, sum = 0; k < ranges; k++) this.starts[k] = sum += deltas[k]!;
    this.index = new Uint32Array(buffer.slice(o, (o += ranges * 4)));
    this.asns = new Uint32Array(buffer.slice(o, (o += ases * 4)));
    this.countries = new Uint8Array(buffer.slice(o, (o += ases * 2)));
    this.nameOffsets = new Uint32Array(buffer.slice(o, (o += (ases + 1) * 4)));
    this.names = new Uint8Array(buffer.slice(o, o + namesBytes));
  }

  get ranges(): number {
    return this.starts.length;
  }

  /** The AS announcing the address; undefined for private, reserved, unrouted or non-IPv4 input. */
  lookup(ip: string): AsInfo | undefined {
    const n = parseIPv4(ip);
    if (n === null) return undefined;
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= n) lo = mid;
      else hi = mid - 1;
    }
    const i = this.index[lo]!;
    if (i === 0) return undefined;
    let info = this.cache.get(i);
    if (!info) {
      const c = this.countries;
      info = {
        asn: this.asns[i]!,
        country: c[i * 2] ? String.fromCharCode(c[i * 2]!, c[i * 2 + 1]!) : '',
        name: new TextDecoder().decode(this.names.subarray(this.nameOffsets[i], this.nameOffsets[i + 1])),
      };
      this.cache.set(i, info);
    }
    return info;
  }
}

/** Reads ip2asn-v4-u32.tsv lines: start, end, AS number, country, AS description. */
export function* parseIp2AsnTsv(text: string): Generator<AsRange> {
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [start, end, asn, country, name] = line.split('\t');
    yield { start: Number(start), end: Number(end), asn: Number(asn), country: country ?? '', name: (name ?? '').trim() };
  }
}
