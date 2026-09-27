import { formatTime } from './time';

/**
 * A column filter: exact values (pick-list, "filter for / filter out"), a substring, or a time range.
 * `exclude` negates values and text filters, as Kibana's filter pills do.
 */
export type ColumnFilter =
  | { kind: 'values'; values: string[]; exclude?: boolean }
  | { kind: 'text'; text: string; exclude?: boolean }
  | { kind: 'range'; from?: number; to?: number };

const valueSets = new WeakMap<object, Set<string>>();

function valueSet(filter: { values: string[] }): Set<string> {
  let set = valueSets.get(filter);
  if (!set) valueSets.set(filter, (set = new Set(filter.values)));
  return set;
}

/** Whether a cell passes the filter: `value` is the column's value, `text` its displayed text. */
export function passes(filter: ColumnFilter, value: unknown, text: string): boolean {
  switch (filter.kind) {
    case 'values': {
      const hit = valueSet(filter).has(value === null || value === undefined ? '' : String(value));
      return filter.exclude ? !hit : hit;
    }
    case 'text': {
      const hit = text.toLowerCase().includes(filter.text.toLowerCase());
      return filter.exclude ? !hit : hit;
    }
    case 'range':
      return typeof value === 'number' && Number.isFinite(value) && (filter.from === undefined || value >= filter.from) && (filter.to === undefined || value <= filter.to);
  }
}

/** "Filter for value": this column shows only the value. */
export function filterFor(value: string): ColumnFilter {
  return { kind: 'values', values: [value] };
}

/** "Filter out value": adds the value to the column's exclusions. */
export function filterOut(current: ColumnFilter | undefined, value: string): ColumnFilter {
  if (current?.kind === 'values' && current.exclude) return current.values.includes(value) ? current : { ...current, values: [...current.values, value] };
  return { kind: 'values', values: [value], exclude: true };
}

/** Flips a values or text filter between include and exclude. */
export function negate(filter: ColumnFilter): ColumnFilter {
  return filter.kind === 'range' ? filter : { ...filter, exclude: !filter.exclude };
}

const shortTime = (ts: number, zone: string) => formatTime(ts, zone).replace(/\.\d{3}/, '');

/** Chip text for an active filter, e.g. 'Action is not Logoff, Logon' or 'Time 2024-05-01 09:00:00 +09:00 →'. */
export function describe(filter: ColumnFilter, label: string, zone: string): string {
  switch (filter.kind) {
    case 'values': {
      const shown = filter.values.slice(0, 3).map(v => (v === '' ? '(empty)' : v));
      const more = filter.values.length > 3 ? ` +${filter.values.length - 3} more` : '';
      return `${label} ${filter.exclude ? 'is not' : 'is'} ${shown.join(', ')}${more}`;
    }
    case 'text':
      return `${label} ${filter.exclude ? 'does not contain' : 'contains'} "${filter.text}"`;
    case 'range':
      if (filter.from !== undefined && filter.to !== undefined) return `${label} ${shortTime(filter.from, zone)} → ${shortTime(filter.to, zone)}`;
      if (filter.from !== undefined) return `${label} from ${shortTime(filter.from, zone)}`;
      return `${label} until ${shortTime(filter.to!, zone)}`;
  }
}
