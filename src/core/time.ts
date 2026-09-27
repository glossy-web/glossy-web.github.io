/**
 * All timestamps are stored as UTC epoch milliseconds (plus the original
 * SystemTime string on each event). Rendering applies one IANA time zone,
 * chosen by the analyst and always named in the UI, so screen and exports agree.
 */

export const UTC = 'UTC';

interface Parts {
  date: string;
  time: string;
  offset: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    });
    formatters.set(zone, f);
  }
  return f;
}

function parts(ts: number, zone: string): Parts {
  if (zone === UTC) {
    const iso = new Date(ts).toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 19), offset: '+00:00' };
  }
  const p: Record<string, string> = {};
  for (const { type, value } of formatter(zone).formatToParts(ts)) p[type] = value;
  const gmt = p['timeZoneName'] ?? 'GMT';
  const offset = gmt === 'GMT' ? '+00:00' : gmt.replace('GMT', '');
  return { date: `${p['year']}-${p['month']}-${p['day']}`, time: `${p['hour']}:${p['minute']}:${p['second']}`, offset };
}

const ms = (ts: number) => String(((ts % 1000) + 1000) % 1000).padStart(3, '0');

/** "YYYY-MM-DD HH:mm:ss.SSS +09:00": time in the given zone and its offset from UTC at that instant. */
export function formatTime(ts: number, zone: string): string {
  if (!Number.isFinite(ts)) return '';
  const p = parts(ts, zone);
  return `${p.date} ${p.time}.${ms(ts)} ${p.offset}`;
}

/** ISO 8601 with the zone's offset, e.g. "2024-05-01T09:30:00.123+09:00" (for exports). */
export function formatIso(ts: number, zone: string): string {
  if (!Number.isFinite(ts)) return '';
  const p = parts(ts, zone);
  return `${p.date}T${p.time}.${ms(ts)}${p.offset === '+00:00' && zone === UTC ? 'Z' : p.offset}`;
}

/** Calendar date and fractional hour of day in the given zone (for time-of-day charts). */
export function dayAndHour(ts: number, zone: string): { day: string; hour: number } {
  const p = parts(ts, zone);
  const [h, m, s] = p.time.split(':').map(Number) as [number, number, number];
  return { day: p.date, hour: h + m / 60 + s / 3600 };
}

/** Offset label of the zone at a given instant, e.g. "UTC+09:00". */
export function offsetLabel(zone: string, at = Date.now()): string {
  return `UTC${parts(at, zone).offset}`;
}

export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || UTC;
}

export function allZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.('timeZone') ?? [];
  return [UTC, ...zones.filter(z => z !== UTC)];
}

/** Human readable duration, e.g. "3d 4h 05m 10s" or "850 ms". */
export function formatDuration(msValue: number): string {
  const sign = msValue < 0 ? '-' : '';
  let rest = Math.abs(msValue);
  if (rest < 1000) return `${sign}${Math.round(rest)} ms`;
  rest = Math.round(rest / 1000);
  const d = Math.floor(rest / 86400);
  const h = Math.floor((rest % 86400) / 3600);
  const m = Math.floor((rest % 3600) / 60);
  const s = rest % 60;
  const out: string[] = [];
  if (d) out.push(`${d}d`);
  if (d || h) out.push(`${h}h`);
  if (d || h || m) out.push(`${String(m).padStart(d || h ? 2 : 1, '0')}m`);
  out.push(`${String(s).padStart(d || h || m ? 2 : 1, '0')}s`);
  return sign + out.join(' ');
}

/** Windows FILETIME (100 ns ticks since 1601, decimal or hex string) to epoch ms. */
export function filetimeToMs(value: string): number | null {
  if (!value) return null;
  try {
    const ticks = BigInt(value);
    if (ticks === 0n) return null;
    return Number(ticks / 10000n - 11644473600000n);
  } catch {
    return null;
  }
}
