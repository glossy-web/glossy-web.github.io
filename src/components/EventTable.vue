<template>
  <div class="event-table d-flex flex-column flex-grow-1">
    <div class="toolbar d-flex flex-wrap align-items-center gap-2 mb-2">
      <div class="input-group input-group-sm search">
        <span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>
        <input
          v-model="search"
          type="search"
          class="form-control"
          placeholder="Search all columns"
          aria-label="Search all columns"
        />
      </div>
      <span class="text-body-secondary small tabular">
        {{ rows.length.toLocaleString() }} of {{ view.rows.length.toLocaleString() }} rows
      </span>
      <button v-if="hasFilters" class="btn btn-sm btn-link px-1" @click="clearFilters">Clear filters</button>
      <div class="ms-auto d-flex gap-2">
        <details class="columns-menu">
          <summary class="btn btn-sm btn-outline-secondary"><i class="bi bi-layout-three-columns"></i> Columns</summary>
          <div class="menu shadow-sm border rounded p-2">
            <label v-for="col in table.getAllLeafColumns()" :key="col.id" class="form-check small mb-1">
              <input
                class="form-check-input"
                type="checkbox"
                :checked="col.getIsVisible()"
                @change="col.toggleVisibility()"
              />
              {{ labelOf(col.id) }}
            </label>
          </div>
        </details>
        <button class="btn btn-sm btn-outline-secondary" :disabled="rows.length === 0" @click="exportCsv">
          <i class="bi bi-download"></i> CSV
        </button>
      </div>
    </div>

    <div ref="scroller" class="scroller border rounded flex-grow-1">
      <table class="table table-sm table-hover mb-0" :style="{ minWidth: totalWidth + 'px' }">
        <colgroup>
          <col v-for="col in visibleColumns" :key="col.id" :style="{ width: (defs[col.id]?.size ?? 160) + 'px' }" />
        </colgroup>
        <thead>
          <tr>
            <th
              v-for="col in visibleColumns"
              :key="col.id"
              scope="col"
              :class="{ 'text-end': defs[col.id]?.kind === 'number' }"
              :aria-sort="ariaSort(col.getIsSorted())"
            >
              <button class="sort-btn" type="button" @click="col.toggleSorting(undefined, false)">
                {{ labelOf(col.id) }}
                <i v-if="col.getIsSorted()" :class="col.getIsSorted() === 'asc' ? 'bi bi-caret-up-fill' : 'bi bi-caret-down-fill'"></i>
              </button>
            </th>
          </tr>
          <tr class="filters">
            <th v-for="col in visibleColumns" :key="col.id">
              <select
                v-if="defs[col.id]?.facet"
                class="form-select form-select-sm"
                :value="(col.getFilterValue() as string) ?? ''"
                :aria-label="`Filter ${labelOf(col.id)}`"
                @focus="facetOpen[col.id] = true"
                @change="col.setFilterValue(($event.target as HTMLSelectElement).value || undefined)"
              >
                <option value="">All</option>
                <option v-for="[value, count] in facetValues(col)" :key="value" :value="value">
                  {{ value === '' ? '(empty)' : value }}{{ Number.isNaN(count) ? '' : ` (${count})` }}
                </option>
              </select>
              <input
                v-else
                class="form-control form-control-sm"
                :value="(col.getFilterValue() as string) ?? ''"
                :placeholder="defs[col.id]?.kind === 'time' ? 'YYYY-MM-DD…' : 'contains…'"
                :aria-label="`Filter ${labelOf(col.id)}`"
                @input="col.setFilterValue(($event.target as HTMLInputElement).value || undefined)"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="padTop > 0" aria-hidden="true"><td :colspan="visibleColumns.length" :style="{ height: padTop + 'px', padding: 0, border: 0 }"></td></tr>
          <tr
            v-for="item in virtualItems"
            :key="String(item.key)"
            :class="{ clickable: !!view.event }"
            @click="open(rows[item.index]!.original)"
          >
            <td
              v-for="col in visibleColumns"
              :key="col.id"
              :class="cellClass(rows[item.index]!.original, col.id)"
              :title="cellText(rows[item.index]!.original, col.id)"
            >{{ cellText(rows[item.index]!.original, col.id) }}</td>
          </tr>
          <tr v-if="padBottom > 0" aria-hidden="true"><td :colspan="visibleColumns.length" :style="{ height: padBottom + 'px', padding: 0, border: 0 }"></td></tr>
          <tr v-if="rows.length === 0">
            <td :colspan="visibleColumns.length" class="text-center text-body-secondary py-4">
              {{ view.rows.length === 0 ? 'No matching events in the loaded logs.' : 'No rows match the current filters.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, reactive, ref, watch } from 'vue';
import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/vue-table';
import { useVirtualizer } from '@tanstack/vue-virtual';
import type { Column, View } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import { formatIso, formatTime, UTC } from '@/core/time';
import { download, toCsv } from '@/core/csv';
import { eventStore } from '@/core/store';

type Row = any; // rows are plugin-defined objects
type AnyColumn = Column<Row>;

const props = defineProps<{ view: View<Row>; zone: string; exportName: string }>();
const emit = defineEmits<{ open: [event: EvtxEvent] }>();

const ROW_HEIGHT = 27;

const defs = computed<Record<string, AnyColumn>>(() => Object.fromEntries(props.view.columns.map(c => [c.id, c])));
const labelOf = (id: string) => defs.value[id]?.label ?? id;

function textOf(row: Row, col: AnyColumn, zone: string): string {
  const value = col.value(row);
  if (col.kind === 'time') return typeof value === 'number' ? formatTime(value, zone) : '';
  if (col.text) return col.text(row);
  return value === null || value === undefined ? '' : String(value);
}

const cellText = (row: Row, id: string) => {
  const col = defs.value[id];
  return col ? textOf(row, col, props.zone) : '';
};

function cellClass(row: Row, id: string): string[] {
  const col = defs.value[id];
  if (!col) return [];
  const classes: string[] = [];
  if (col.kind === 'number') classes.push('text-end', 'tabular');
  if (col.kind === 'time') classes.push('tabular', 'text-nowrap');
  if (col.kind === 'mono') classes.push('font-monospace');
  if (col.kind === 'wrap') classes.push('wrap');
  const tone = col.tone?.(row);
  if (tone) classes.push(`tone-${tone}`);
  return classes;
}

/** Column filter: exact value for pick-list columns, case-insensitive substring otherwise. */
const columnFilter = (row: { original: Row }, columnId: string, filterValue: unknown) => {
  const col = defs.value[columnId];
  if (!col) return true;
  if (col.facet) return String(col.value(row.original) ?? '') === String(filterValue);
  return textOf(row.original, col, props.zone).toLowerCase().includes(String(filterValue ?? '').toLowerCase());
};

/** Search box: case-insensitive substring in any searchable column. */
const searchFilter = (row: { original: Row }, columnId: string, filterValue: unknown) => {
  const col = defs.value[columnId];
  return !!col && textOf(row.original, col, props.zone).toLowerCase().includes(String(filterValue ?? '').toLowerCase());
};

const compare = (a: { original: Row }, b: { original: Row }, columnId: string) => {
  const col = defs.value[columnId];
  if (!col) return 0;
  const va = col.value(a.original);
  const vb = col.value(b.original);
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  const sa = String(va ?? '');
  const sb = String(vb ?? '');
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  columnFacetingFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
});

const columns = props.view.columns.map(c => ({
  id: c.id,
  header: c.label,
  accessorFn: (row: Row) => c.value(row),
  filterFn: columnFilter,
  sortFn: compare,
  sortUndefined: 'last' as const,
}));

const data = computed(() => markRaw(props.view.rows));
const search = ref('');
const debounced = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, v => {
  clearTimeout(timer);
  timer = setTimeout(() => (debounced.value = v.trim()), 200);
});

const table = useTable({
  features,
  columns: columns as never,
  data: data as never,
  initialState: {
    sorting: [{ id: props.view.sort?.id ?? props.view.columns[0]?.id ?? '', desc: props.view.sort?.desc ?? false }],
    columnVisibility: Object.fromEntries(props.view.columns.filter(c => c.hidden).map(c => [c.id, false])),
  },
  enableSortingRemoval: false,
  globalFilterFn: searchFilter as never,
  getColumnCanGlobalFilter: (column: { id: string }) => defs.value[column.id]?.kind !== 'time',
} as never) as any;

watch(debounced, v => table.setGlobalFilter(v || undefined));

const rows = computed(() => table.getRowModel().rows as { id: string; original: Row }[]);
const visibleColumns = computed(() => table.getVisibleLeafColumns() as any[]);
const totalWidth = computed(() => visibleColumns.value.reduce((w: number, c: { id: string }) => w + (defs.value[c.id]?.size ?? 160), 0));
const hasFilters = computed(() => table.atoms.columnFilters.get().length > 0 || !!debounced.value);

// Facet lists are computed only for pickers the analyst has focused.
const facetOpen = reactive<Record<string, boolean>>({});
function facetValues(col: { id: string; getFacetedUniqueValues: () => Map<unknown, number>; getFilterValue: () => unknown }) {
  if (!facetOpen[col.id]) {
    const current = col.getFilterValue();
    return current === undefined ? [] : [[String(current), NaN] as [string, number]];
  }
  return [...col.getFacetedUniqueValues()]
    .map(([v, n]) => [String(v ?? ''), n] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 500);
}

function clearFilters() {
  table.resetColumnFilters(true);
  search.value = '';
  debounced.value = '';
}

const scroller = ref<HTMLElement | null>(null);
const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => scroller.value,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index: number) => rows.value[index]?.id ?? index,
    overscan: 12,
  })),
);
const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const padTop = computed(() => virtualItems.value[0]?.start ?? 0);
const padBottom = computed(() => {
  const items = virtualItems.value;
  const last = items[items.length - 1];
  return last ? virtualizer.value.getTotalSize() - last.end : 0;
});

function ariaSort(sorted: false | 'asc' | 'desc'): 'ascending' | 'descending' | 'none' {
  return sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none';
}

function open(row: Row) {
  const event = props.view.event?.(row);
  if (event) emit('open', event);
}

function exportCsv() {
  const cols = visibleColumns.value.map((c: { id: string }) => defs.value[c.id]!).filter(Boolean);
  const zone = props.zone;
  const header = cols.map(c => (c.kind === 'time' ? `${c.label} (${zone === UTC ? 'UTC' : zone})` : c.label));
  // Every exported row carries enough to find its record again, unless the view already shows it.
  const shown = new Set(cols.map(c => c.id));
  const trace: [string, string, (e: EvtxEvent) => string][] = props.view.event
    ? ([
        ['computer', 'Computer', e => e.computer],
        ['channel', 'Channel', e => e.channel],
        ['provider', 'Provider', e => e.provider],
        ['eventId', 'EventID', e => String(e.eventId)],
        ['recordId', 'EventRecordID', e => String(e.recordId)],
        ['sourceFile', 'SourceFile', e => eventStore.sources.find(s => s.index === e.src)?.name ?? ''],
      ] as [string, string, (e: EvtxEvent) => string][]).filter(([id]) => !shown.has(id))
    : [];
  header.push(...trace.map(([, label]) => label));
  const body = rows.value.map(r => {
    const out = cols.map(c => {
      const v = c.value(r.original);
      return c.kind === 'time' ? (typeof v === 'number' ? formatIso(v, zone) : '') : textOf(r.original, c, zone);
    });
    const e = props.view.event?.(r.original);
    for (const [, , get] of trace) out.push(e ? get(e) : '');
    return out;
  });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  download(`glossy_${props.exportName}_${stamp}.csv`, toCsv(header, body));
}
</script>

<style scoped>
.event-table {
  min-height: 0;
}
.search {
  width: 280px;
}
.scroller {
  overflow: auto;
  min-height: 240px;
  flex: 1 1 0;
  background: var(--bs-body-bg);
}
table {
  table-layout: fixed;
  font-size: 12.5px;
}
thead th {
  position: sticky;
  z-index: 2;
  background: var(--bs-tertiary-bg);
  white-space: nowrap;
}
thead tr:first-child th {
  top: 0;
}
thead tr.filters th {
  top: 31px;
  padding: 2px 4px 4px;
  font-weight: normal;
}
.sort-btn {
  all: unset;
  cursor: pointer;
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sort-btn:focus-visible {
  outline: 2px solid var(--bs-primary);
}
td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 27px;
}
td.wrap {
  white-space: nowrap;
}
tr.clickable {
  cursor: pointer;
}
.tabular {
  font-variant-numeric: tabular-nums;
}
.tone-danger {
  color: var(--bs-danger-text-emphasis);
  font-weight: 600;
}
.tone-warning {
  color: var(--bs-warning-text-emphasis);
  font-weight: 600;
}
.tone-success {
  color: var(--bs-success-text-emphasis);
}
.tone-muted {
  color: var(--bs-secondary-color);
}
.columns-menu {
  position: relative;
}
.columns-menu summary {
  list-style: none;
}
.columns-menu .menu {
  position: absolute;
  right: 0;
  z-index: 10;
  background: var(--bs-body-bg);
  min-width: 220px;
  max-height: 360px;
  overflow: auto;
}
</style>
