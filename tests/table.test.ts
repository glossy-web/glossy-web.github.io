import { describe, expect, it } from 'vitest';
import { histogram, unitFor } from '@/core/histogram';
import { describe as describeFilter, filterFor, filterOut, negate, passes, type ColumnFilter } from '@/core/tableFilter';
import { zonedToEpoch } from '@/core/time';

describe('zonedToEpoch', () => {
  it('converts wall time in a zone to UTC', () => {
    expect(zonedToEpoch('Asia/Seoul', 2024, 5, 1, 9, 30)).toBe(Date.UTC(2024, 4, 1, 0, 30));
    expect(zonedToEpoch('UTC', 2024, 5, 1, 9, 30)).toBe(Date.UTC(2024, 4, 1, 9, 30));
    expect(zonedToEpoch('Asia/Kolkata', 2024, 1, 1)).toBe(Date.UTC(2023, 11, 31, 18, 30));
  });

  it('handles daylight saving changes', () => {
    // Clocks set back: 01:30 happens twice; the first (EDT) is used.
    expect(zonedToEpoch('America/New_York', 2024, 11, 3, 1, 30)).toBe(Date.UTC(2024, 10, 3, 5, 30));
    // Clocks set forward: 02:30 never happens; the moment after the gap is used.
    expect(zonedToEpoch('America/New_York', 2024, 3, 10, 2, 30)).toBe(Date.UTC(2024, 2, 10, 7, 30));
  });
});

describe('histogram', () => {
  it('picks the unit from the span', () => {
    expect(unitFor(3600000)).toBe('minute');
    expect(unitFor(2 * 86400000)).toBe('hour');
    expect(unitFor(30 * 86400000)).toBe('day');
    expect(unitFor(3 * 365 * 86400000)).toBe('month');
  });

  it('buckets by calendar day in the zone and keeps empty days', () => {
    const t = (d: number, h: number) => Date.UTC(2024, 4, d, h);
    // 2024-05-01 20:00Z is already 05-02 in Seoul.
    const { unit, buckets } = histogram([t(1, 1), t(1, 20), t(4, 1), t(20, 0)], 'Asia/Seoul');
    expect(unit).toBe('day');
    expect(buckets[0]).toEqual({ key: '2024-05-01', start: Date.UTC(2024, 3, 30, 15), end: Date.UTC(2024, 4, 1, 15), count: 1 });
    expect(buckets[1]).toMatchObject({ key: '2024-05-02', count: 1 });
    expect(buckets[2]).toMatchObject({ key: '2024-05-03', count: 0 });
    expect(buckets.at(-1)).toMatchObject({ key: '2024-05-20', count: 1 });
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
    for (let i = 1; i < buckets.length; i++) expect(buckets[i]!.start).toBe(buckets[i - 1]!.end);
  });

  it('gives short days to daylight saving changes', () => {
    const { buckets } = histogram([Date.UTC(2024, 2, 5, 12), Date.UTC(2024, 2, 14, 12)], 'America/New_York');
    const day = buckets.find(b => b.key === '2024-03-10')!;
    expect(day.end - day.start).toBe(23 * 3600000);
  });

  it('widens the axis to the selected range', () => {
    const at = Date.UTC(2024, 4, 1, 12, 30);
    const { unit, buckets } = histogram([at], 'UTC', { from: Date.UTC(2024, 4, 1, 12), to: Date.UTC(2024, 4, 1, 13) });
    expect(unit).toBe('minute');
    expect(buckets[0]!.key).toBe('2024-05-01 12:00');
    expect(buckets.at(-1)!.key).toBe('2024-05-01 13:00');
    expect(buckets.find(b => b.key === '2024-05-01 12:30')!.count).toBe(1);
  });

  it('returns nothing for no times', () => {
    expect(histogram([NaN], 'UTC').buckets).toEqual([]);
  });
});

describe('column filters', () => {
  it('matches values, text and ranges', () => {
    expect(passes({ kind: 'values', values: ['4624', '4625'] }, 4624, '4624')).toBe(true);
    expect(passes({ kind: 'values', values: ['4624'], exclude: true }, 4624, '4624')).toBe(false);
    expect(passes({ kind: 'values', values: [''] }, undefined, '')).toBe(true);
    expect(passes({ kind: 'text', text: 'BOB' }, 'CORP\\bob', 'CORP\\bob')).toBe(true);
    expect(passes({ kind: 'text', text: 'bob', exclude: true }, 'CORP\\bob', 'CORP\\bob')).toBe(false);
    expect(passes({ kind: 'range', from: 10, to: 20 }, 15, '')).toBe(true);
    expect(passes({ kind: 'range', from: 10 }, 5, '')).toBe(false);
    expect(passes({ kind: 'range', to: 10 }, NaN, '')).toBe(false);
  });

  it('builds filter-for and filter-out steps', () => {
    expect(filterFor('Logon')).toEqual({ kind: 'values', values: ['Logon'] });
    const out = filterOut(undefined, 'Logoff');
    expect(out).toEqual({ kind: 'values', values: ['Logoff'], exclude: true });
    expect(filterOut(out, 'Logon')).toEqual({ kind: 'values', values: ['Logoff', 'Logon'], exclude: true });
    expect(filterOut(filterFor('Logon'), 'Logoff')).toEqual({ kind: 'values', values: ['Logoff'], exclude: true });
    expect(negate({ kind: 'text', text: 'x' })).toEqual({ kind: 'text', text: 'x', exclude: true });
  });

  it('describes filters for chips', () => {
    const f: ColumnFilter = { kind: 'values', values: ['a', 'b', 'c', 'd'], exclude: true };
    expect(describeFilter(f, 'Action', 'UTC')).toBe('Action is not a, b, c +1 more');
    expect(describeFilter({ kind: 'range', from: Date.UTC(2024, 4, 1) }, 'Time', 'Asia/Seoul')).toBe('Time from 2024-05-01 09:00:00 +09:00');
  });
});
