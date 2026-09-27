<template>
  <div class="flex min-h-0 flex-1 flex-col gap-1.5">
    <div class="flex flex-wrap items-center gap-1.5">
      <div class="relative w-72">
        <SearchIcon class="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" aria-hidden="true" />
        <Input v-model="search" type="search" class="pl-7" placeholder="Search all columns" aria-label="Search all columns" />
      </div>
      <span class="text-muted-foreground text-xs tabular-nums">{{ rows.length.toLocaleString() }} of {{ view.rows.length.toLocaleString() }} rows</span>
      <Button v-if="hasFilters" variant="ghost" size="sm" @click="clearFilters"><FilterXIcon />Clear filters</Button>
      <div class="ml-auto flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline"><Columns3Icon />Columns</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="max-h-96 w-56 overflow-auto">
            <DropdownMenuCheckboxItem
              v-for="col in table.getAllLeafColumns()"
              :key="col.id"
              :model-value="col.getIsVisible()"
              @update:model-value="(v: boolean) => col.toggleVisibility(v)"
              @select="(e: Event) => e.preventDefault()"
            >
              {{ labelOf(col.id) }}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" :disabled="rows.length === 0" title="CSV in the selected time zone" @click="exportCsv"><DownloadIcon />CSV</Button>
        <Button variant="outline" :disabled="rows.length === 0 || !timeColumns.length" title="Timesketch JSONL (UTC)" @click="exportJsonl"><DownloadIcon />JSONL</Button>
      </div>
    </div>

    <div ref="scroller" class="bg-card min-h-60 flex-1 basis-0 overflow-auto rounded-lg border">
      <table class="w-full table-fixed border-separate border-spacing-0 text-xs" :style="{ minWidth: totalWidth + 'px' }">
        <colgroup>
          <col v-for="col in visibleColumns" :key="col.id" :style="{ width: (defs[col.id]?.size ?? 160) + 'px' }" />
        </colgroup>
        <thead class="bg-muted sticky top-0 z-10">
          <tr>
            <th
              v-for="col in visibleColumns"
              :key="col.id"
              scope="col"
              class="h-7 border-b px-1.5 text-left font-medium whitespace-nowrap"
              :class="{ 'text-right': defs[col.id]?.kind === 'number' }"
              :aria-sort="ariaSort(col.getIsSorted())"
            >
              <button
                type="button"
                class="focus-visible:ring-ring/50 flex w-full items-center gap-1 overflow-hidden rounded-sm text-ellipsis outline-none focus-visible:ring-2"
                :class="{ 'justify-end': defs[col.id]?.kind === 'number' }"
                @click="col.toggleSorting(undefined, false)"
              >
                <span class="truncate">{{ labelOf(col.id) }}</span>
                <ArrowUpIcon v-if="col.getIsSorted() === 'asc'" class="size-3 shrink-0" />
                <ArrowDownIcon v-else-if="col.getIsSorted() === 'desc'" class="size-3 shrink-0" />
              </button>
            </th>
          </tr>
          <tr>
            <th v-for="col in visibleColumns" :key="col.id" class="border-b px-1 pb-1 font-normal">
              <NativeSelect
                v-if="defs[col.id]?.facet"
                size="sm"
                class="w-full"
                :model-value="(col.getFilterValue() as string) ?? ''"
                :aria-label="`Filter ${labelOf(col.id)}`"
                @focus="facetOpen[col.id] = true"
                @update:model-value="(v: unknown) => col.setFilterValue(v ? String(v) : undefined)"
              >
                <option value="">All</option>
                <option v-for="[value, count] in facetValues(col)" :key="value" :value="value">
                  {{ value === '' ? '(empty)' : value }}{{ Number.isNaN(count) ? '' : ` (${count})` }}
                </option>
              </NativeSelect>
              <Input
                v-else
                class="h-6 px-1.5 text-[11px]"
                :model-value="(col.getFilterValue() as string) ?? ''"
                :placeholder="defs[col.id]?.kind === 'time' ? 'YYYY-MM-DD…' : 'contains…'"
                :aria-label="`Filter ${labelOf(col.id)}`"
                @update:model-value="(v: string | number) => col.setFilterValue(v === '' ? undefined : String(v))"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="padTop > 0" aria-hidden="true"><td :colspan="visibleColumns.length" :style="{ height: padTop + 'px', padding: 0, border: 0 }"></td></tr>
          <tr
            v-for="item in virtualItems"
            :key="String(item.key)"
            class="hover:bg-muted/60"
            :class="{ 'cursor-pointer': !!(view.event || view.pivot) }"
            @click="open(rows[item.index]!.original)"
          >
            <td
              v-for="col in visibleColumns"
              :key="col.id"
              class="h-[26px] truncate border-b px-1.5"
              :class="cellClass(rows[item.index]!.original, col.id)"
              :title="cellText(rows[item.index]!.original, col.id)"
            >{{ cellText(rows[item.index]!.original, col.id) }}</td>
          </tr>
          <tr v-if="padBottom > 0" aria-hidden="true"><td :colspan="visibleColumns.length" :style="{ height: padBottom + 'px', padding: 0, border: 0 }"></td></tr>
          <tr v-if="rows.length === 0">
            <td :colspan="visibleColumns.length" class="text-muted-foreground py-6 text-center">
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
import { toast } from 'vue-sonner';
import { ArrowDownIcon, ArrowUpIcon, Columns3Icon, DownloadIcon, FilterXIcon, SearchIcon } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { Column, Pivot, RowDetail, Tone, View } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import { download } from '@/core/csv';
import { cellText as textOf, tableToCsv, tableToJsonl, type TableSnapshot } from '@/core/tableExport';
import { eventStore } from '@/core/store';

type Row = any; // rows are plugin-defined objects
type AnyColumn = Column<Row>;

const props = defineProps<{
  view: View<Row>;
  zone: string;
  exportName: string;
  /** Column filters to start with (column id → value), e.g. from a pivot. */
  filters?: Record<string, string>;
}>();
const emit = defineEmits<{ open: [event: EvtxEvent, detail: RowDetail | undefined]; pivot: [target: Pivot] }>();

const ROW_HEIGHT = 26;

const TONE: Record<Tone, string> = {
  danger: 'text-danger font-semibold',
  warning: 'text-warning font-semibold',
  success: 'text-success',
  muted: 'text-muted-foreground',
};

const defs = computed<Record<string, AnyColumn>>(() => Object.fromEntries(props.view.columns.map(c => [c.id, c])));
const labelOf = (id: string) => defs.value[id]?.label ?? id;

const cellText = (row: Row, id: string) => {
  const col = defs.value[id];
  return col ? textOf(row, col, props.zone) : '';
};

function cellClass(row: Row, id: string): string[] {
  const col = defs.value[id];
  if (!col) return [];
  const classes: string[] = [];
  if (col.kind === 'number') classes.push('text-right', 'tabular-nums');
  if (col.kind === 'time') classes.push('tabular-nums');
  if (col.kind === 'mono') classes.push('font-mono');
  const tone = col.tone?.(row);
  if (tone) classes.push(TONE[tone]);
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
    columnFilters: Object.entries(props.filters ?? {}).map(([id, value]) => ({ id, value })),
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
  const target = props.view.pivot?.(row);
  if (target) return emit('pivot', target);
  const event = props.view.event?.(row);
  if (event) emit('open', event, props.view.detail?.(row));
}

const timeColumns = computed(() => props.view.columns.filter(c => c.kind === 'time'));

function snapshot(): TableSnapshot<Row> {
  return {
    columns: visibleColumns.value.map((c: { id: string }) => defs.value[c.id]!).filter(Boolean),
    rows: rows.value.map(r => r.original),
    event: props.view.event,
    sourceName: e => eventStore.sources.find(s => s.index === e.src)?.name ?? '',
  };
}

const fileName = (ext: string) => `glossy_${props.exportName}_${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}.${ext}`;

function exportCsv() {
  download(fileName('csv'), tableToCsv(snapshot(), props.zone));
}

function exportJsonl() {
  const { text, skipped } = tableToJsonl(snapshot(), timeColumns.value, `glossy:${props.exportName}`);
  if (skipped) toast.warning(`${skipped.toLocaleString()} row(s) without a time were left out of the JSONL file.`);
  if (text) download(fileName('jsonl'), text, 'application/x-ndjson;charset=utf-8');
}
</script>
