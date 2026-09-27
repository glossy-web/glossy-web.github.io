/** Small value helpers shared by plugins. */

/** "DOMAIN\user", or whichever part exists; "-" placeholders are dropped. */
export function account(domain: string | undefined, user: string | undefined): string {
  const d = clean(domain);
  const u = clean(user);
  if (d && u) return `${d}\\${u}`;
  return u || d;
}

/** Windows writes "-" for "not applicable"; treat it as empty. */
export function clean(v: string | undefined): string {
  if (!v || v === '-') return '';
  return v;
}

/** Parses "0x1a2c" or "6700" to a number; NaN when not numeric. */
export function toInt(v: string | undefined): number {
  if (!v) return NaN;
  const s = v.trim();
  return /^0x/i.test(s) ? parseInt(s, 16) : /^-?\d+$/.test(s) ? parseInt(s, 10) : NaN;
}

/** PID as written by Windows (hex in Security events) shown in decimal like Task Manager. */
export function pid(v: string | undefined): string {
  const n = toInt(v);
  return Number.isFinite(n) ? String(n) : clean(v);
}

export function basename(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return i >= 0 ? path.slice(i + 1) : path;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

/** Splits "10.0.0.5:51234" / "[::1]:3389" into address and port. */
export function splitHostPort(v: string): { ip: string; port: string } {
  const s = v.trim();
  const bracket = /^\[([^\]]+)\]:(\d+)$/.exec(s);
  if (bracket) return { ip: bracket[1]!, port: bracket[2]! };
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/.exec(s);
  if (v4) return { ip: v4[1]!, port: v4[2]! };
  return { ip: s, port: '' };
}

export type IpScope = 'loopback' | 'private' | 'link-local' | 'public' | '';

/** Coarse scope of an IP address; no lookups leave the browser. */
export function ipScope(value: string): IpScope {
  const ip = clean(value).replace(/^::ffff:/i, '');
  if (!ip || ip === 'LOCAL') return '';
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127) return 'loopback';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
    if (a === 169 && b === 254) return 'link-local';
    if (a === 100 && b >= 64 && b <= 127) return 'private';
    return 'public';
  }
  if (ip.includes(':')) {
    const low = ip.toLowerCase();
    if (low === '::1') return 'loopback';
    if (low.startsWith('fe80')) return 'link-local';
    if (low.startsWith('fc') || low.startsWith('fd')) return 'private';
    return 'public';
  }
  return '';
}

const USER_WRITABLE = /\\(temp|tmp|appdata|users\\public|downloads|perflogs|programdata|recycle|windows\\tasks)\\/i;
// Defender keeps its engine and scan drivers under ProgramData; that folder is not user-writable.
const PROTECTED = /\\programdata\\microsoft\\windows defender\\/i;

/** Paths where a standard user can drop executables: common staging locations for malware. */
export function isUserWritablePath(path: string): boolean {
  return USER_WRITABLE.test(path) && !PROTECTED.test(path);
}

/** Counts values, returning [value, count] sorted by count descending. */
export function countBy<T>(items: Iterable<T>, key: (item: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function ranking(items: Iterable<string>, top = 15): { name: string; value: number }[] {
  return countBy(items, s => s)
    .slice(0, top)
    .map(([name, value]) => ({ name, value }));
}

/** Decodes the five predefined XML entities and numeric character references. */
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, ent: string) => {
    const e = ent.toLowerCase();
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'amp') return '&';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    return String.fromCodePoint(e.startsWith('#x') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

/** Text of every `<tag>` element in an XML string (e.g. a task definition). */
export function xmlElements(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const out: string[] = [];
  for (let m = re.exec(xml); m; m = re.exec(xml)) out.push(decodeXml(m[1]!.trim()));
  return out;
}
