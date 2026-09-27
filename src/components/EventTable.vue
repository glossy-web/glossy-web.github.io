<template>
  <div class="flex min-h-0 flex-1 flex-col gap-1.5">
    <div class="flex flex-wrap items-center gap-1.5">
      <div class="relative w-72">
        <SearchIcon class="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" aria-hidden="true" />
        <Input v-model="search" type="search" class="pl-7" placeholder="Search all columns" aria-label="Search all columns" />
      </div>
      <span class="text-muted-foreground text-xs tabular-nums">{{ rows.length.toLocaleString() }} of {{ view.rows.length.toLocaleString() }} rows</span>
      <div class="ml-auto flex items-center gap-1.5">
        <Button
          v-if="view.event"
          variant="outline"
          size="icon"
          :aria-pressed="starredOnly"
          :class="{ 'bg-muted': starredOnly }"
          :title="starredOnly ? 'Show all rows' : 'Show starred rows only'"
          @click="starredOnly = !starredOnly"
        >
          <StarIcon :class="starredOnly ? 'fill-amber-400 text-amber-400' : ''" />
        </Button>
        <Button
          v-if="timeColumn"
          variant="outline"
          size="icon"
          :aria-pressed="layout.histogram"
          :class="{ 'bg-muted': layout.histogram }"
          :title="layout.histogram ? 'Hide histogram' : 'Show histogram'"
          @click="layout.histogram = !layout.histogram"
        >
          <ChartColumnIcon />
        </Button>
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
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="resetLayout"><RotateCcwIcon />Reset columns</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" :disabled="rows.length === 0" title="CSV in the selected time zone" @click="exportCsv"><DownloadIcon />CSV</Button>
        <Button variant="outline" :disabled="rows.length === 0 || !timeColumn" title="Timesketch JSONL (UTC)" @click="exportJsonl"><DownloadIcon />JSONL</Button>
        <Button
          v-if="view.event"
          variant="outline"
          :disabled="rows.length === 0"
          title="Printable HTML report of the filtered rows, with each record and your notes"
          @click="exportReport"
        >
          <FileTextIcon />Report
        </Button>
      </div>
    </div>

    <FilterChips :chips="chips" @remove="removeChip" @negate="negateChip" @clear="clearFilters" />

    <TableHistogram
      v-if="timeColumn && layout.histogram && view.rows.length"
      :times="histogramTimes"
      :zone="zone"
      :range="timeRange"
      @select="r => setFilter(timeColumn!.id, { kind: 'range', from: r.from, to: r.to })"
    />

    <ContextMenu @update:open="(o: boolean) => !o && (menu = null)">
      <ContextMenuTrigger as-child>
        <div
          ref="scroller"
          tabindex="0"
          class="bg-card focus-visible:ring-ring/40 min-h-60 flex-1 basis-0 overflow-auto rounded-lg border outline-none focus-visible:ring-2"
          aria-label="Table rows: arrow keys move, Enter opens, S stars"
          @contextmenu="onContextMenu"
          @keydown="onKeydown"
        >
          <table class="table-fixed border-separate border-spacing-0 text-xs" :style="{ width: table.getTotalSize() + starWidth + 'px', minWidth: '100%' }">
            <colgroup>
              <col v-if="view.event" :style="{ width: STAR_WIDTH + 'px' }" />
              <col v-for="h in headers" :key="h.id" :style="{ width: h.getSize() + 'px' }" />
            </colgroup>
            <thead class="sticky top-0 z-20">
              <tr>
                <th v-if="view.event" class="bg-muted sticky left-0 z-10 border-b" aria-label="Starred"><StarIcon class="text-muted-foreground mx-auto size-3" /></th>
                <th
                  v-for="h in headers"
                  :key="h.id"
                  scope="col"
                  class="bg-muted group/th relative h-7 border-b px-1.5 text-left font-medium whitespace-nowrap"
                  :class="{ 'z-10': isPinned(h), 'ring-primary ring-2 ring-inset': dragOver === h.id }"
                  :style="pinStyle(h)"
                  :aria-sort="ariaSort(h.column.getIsSorted())"
                  @dragover.prevent="dragOver = h.id"
                  @dragleave="dragOver = dragOver === h.id ? null : dragOver"
                  @drop.prevent="onDrop(h.id)"
                  @dragend="dragOver = null"
                >
                  <!-- Only the title area drags (to reorder), so the resize handle next to it never starts a drag. -->
                  <div
                    class="flex cursor-grab items-center gap-0.5 active:cursor-grabbing"
                    :class="{ 'flex-row-reverse': defs[h.id]?.kind === 'number' }"
                    draggable="true"
                    @dragstart="e => onDragStart(e, h.id)"
                  >
                    <button
                      type="button"
                      class="focus-visible:ring-ring/50 flex min-w-0 items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
                      :title="`Sort by ${labelOf(h.id)}`"
                      @click="h.column.toggleSorting(undefined, false)"
                    >
                      <PinIcon v-if="isPinned(h)" class="text-muted-foreground size-3 shrink-0" />
                      <span class="truncate">{{ labelOf(h.id) }}</span>
                      <ArrowUpIcon v-if="h.column.getIsSorted() === 'asc'" class="size-3 shrink-0" />
                      <ArrowDownIcon v-else-if="h.column.getIsSorted() === 'desc'" class="size-3 shrink-0" />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger as-child>
                        <button
                          type="button"
                          class="text-muted-foreground hover:bg-background data-[state=open]:bg-background shrink-0 rounded-sm p-0.5 opacity-0 group-hover/th:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          :aria-label="`${labelOf(h.id)} column menu`"
                        >
                          <ChevronDownIcon class="size-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" class="w-44">
                        <DropdownMenuItem @select="h.column.toggleSorting(false)"><ArrowUpIcon />Sort ascending</DropdownMenuItem>
                        <DropdownMenuItem @select="h.column.toggleSorting(true)"><ArrowDownIcon />Sort descending</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem v-if="isPinned(h)" @select="h.column.pin(false)"><PinOffIcon />Unpin</DropdownMenuItem>
                        <DropdownMenuItem v-else @select="h.column.pin('start')"><PinIcon />Pin to left</DropdownMenuItem>
                        <DropdownMenuItem @select="h.column.resetSize()"><MoveHorizontalIcon />Reset width</DropdownMenuItem>
                        <DropdownMenuItem @select="h.column.toggleVisibility(false)"><EyeOffIcon />Hide column</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div
                    class="hover:bg-primary/60 absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none"
                    :class="{ 'bg-primary': h.column.getIsResizing() }"
                    aria-hidden="true"
                    @mousedown.stop.prevent="h.getResizeHandler()($event)"
                    @touchstart.stop="h.getResizeHandler()($event)"
                    @click.stop
                    @dblclick.stop="h.column.resetSize()"
                  ></div>
                </th>
              </tr>
              <tr>
                <th v-if="view.event" class="bg-muted sticky left-0 z-10 border-b"></th>
                <th
                  v-for="h in headers"
                  :key="h.id"
                  class="bg-muted border-b px-1 pb-1 font-normal"
                  :class="{ 'z-10': isPinned(h) }"
                  :style="pinStyle(h)"
                >
                  <TimeRangeFilter
                    v-if="defs[h.id]?.kind === 'time'"
                    :label="labelOf(h.id)"
                    :zone="zone"
                    :model-value="rangeOf(h.column.getFilterValue())"
                    @update:model-value="v => setFilter(h.id, v)"
                  />
                  <ValuesFilter
                    v-else-if="defs[h.id]?.facet || valuesOf(h.column.getFilterValue())"
                    :label="labelOf(h.id)"
                    :model-value="valuesOf(h.column.getFilterValue())"
                    :load="() => facetValues(h.column)"
                    @update:model-value="v => setFilter(h.id, v)"
                  />
                  <Input
                    v-else
                    class="h-6 px-1.5 text-[11px]"
                    :model-value="textOf(h.column.getFilterValue())?.text ?? ''"
                    placeholder="contains…"
                    :aria-label="`Filter ${labelOf(h.id)}`"
                    @update:model-value="(v: string | number) => setFilter(h.id, v === '' ? undefined : { kind: 'text', text: String(v), exclude: textOf(h.column.getFilterValue())?.exclude })"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="padTop > 0" aria-hidden="true"><td :colspan="colspan" :style="{ height: padTop + 'px', padding: 0, border: 0 }"></td></tr>
              <tr
                v-for="item in virtualItems"
                :key="String(item.key)"
                class="group/row"
                :class="{ 'cursor-pointer': !!(view.event || view.pivot), selected: rows[item.index]!.id === selectedId }"
                :aria-selected="rows[item.index]!.id === selectedId"
                @click="activate(item.index)"
              >
                <td
                  v-if="view.event"
                  class="bg-card group-hover/row:bg-muted group-[.selected]/row:bg-accent sticky left-0 z-10 h-[26px] border-b text-center group-[.selected]/row:shadow-[inset_2px_0_0_var(--primary)]"
                >
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground rounded-sm p-0.5"
                    :aria-label="isStarred(rows[item.index]!.original) ? 'Remove star' : 'Star'"
                    @click.stop="star(rows[item.index]!.original)"
                  >
                    <StarIcon class="size-3" :class="isStarred(rows[item.index]!.original) ? 'fill-amber-400 text-amber-400' : 'opacity-40 group-hover/row:opacity-100'" />
                  </button>
                </td>
                <td
                  v-for="h in headers"
                  :key="h.id"
                  :data-row="item.index"
                  :data-col="h.id"
                  class="bg-card group-hover/row:bg-muted group-[.selected]/row:bg-accent h-[26px] truncate border-b px-1.5"
                  :class="[cellClass(rows[item.index]!.original, h.id), { 'z-10': isPinned(h) }]"
                  :style="pinStyle(h)"
                  :title="cellText(rows[item.index]!.original, h.id)"
                >{{ cellText(rows[item.index]!.original, h.id) }}</td>
              </tr>
              <tr v-if="padBottom > 0" aria-hidden="true"><td :colspan="colspan" :style="{ height: padBottom + 'px', padding: 0, border: 0 }"></td></tr>
              <tr v-if="rows.length === 0">
                <td :colspan="colspan" class="text-muted-foreground py-6 text-center">
                  {{ view.rows.length === 0 ? 'No matching events in the loaded logs.' : 'No rows match the current filters.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent v-if="menu" class="w-64">
        <template v-if="menu.col.kind === 'time'">
          <ContextMenuItem :disabled="!Number.isFinite(menu.value)" @select="setRangeEdge('from')"><ArrowRightFromLineIcon />Show from this time</ContextMenuItem>
          <ContextMenuItem :disabled="!Number.isFinite(menu.value)" @select="setRangeEdge('to')"><ArrowLeftToLineIcon />Show until this time</ContextMenuItem>
        </template>
        <template v-else>
          <ContextMenuItem @select="setFilter(menu.col.id, filterFor(menuValue))"><FilterIcon /><span class="truncate">Filter for “{{ menuLabel }}”</span></ContextMenuItem>
          <ContextMenuItem @select="setFilter(menu.col.id, filterOut(currentFilter(menu.col.id), menuValue))"><FilterXIcon /><span class="truncate">Filter out “{{ menuLabel }}”</span></ContextMenuItem>
        </template>
        <ContextMenuSeparator />
        <ContextMenuItem @select="copy(menu.text, 'Value')"><CopyIcon />Copy value</ContextMenuItem>
        <ContextMenuItem @select="copyRow(menu.row)"><ClipboardListIcon />Copy row</ContextMenuItem>
        <template v-if="view.event?.(menu.row)">
          <ContextMenuSeparator />
          <ContextMenuItem @select="star(menu.row)"><StarIcon />{{ isStarred(menu.row) ? 'Remove star' : 'Star event' }}</ContextMenuItem>
          <ContextMenuItem @select="open(menu.row)"><SquareArrowOutUpRightIcon />Open record</ContextMenuItem>
        </template>
      </ContextMenuContent>
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, ref, watch, type CSSProperties } from 'vue';
import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
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
import { useStorage } from '@vueuse/core';
import { toast } from 'vue-sonner';
import {
  ArrowDownIcon,
  ArrowLeftToLineIcon,
  ArrowRightFromLineIcon,
  ArrowUpIcon,
  ChartColumnIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  Columns3Icon,
  CopyIcon,
  DownloadIcon,
  EyeOffIcon,
  FileTextIcon,
  FilterIcon,
  FilterXIcon,
  MoveHorizontalIcon,
  PinIcon,
  PinOffIcon,
  RotateCcwIcon,
  SearchIcon,
  SquareArrowOutUpRightIcon,
  StarIcon,
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { Column, Pivot, RowDetail, Tone, View } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import { download } from '@/core/csv';
import { cellText as displayText, tableToCsv, tableToJsonl, type TableSnapshot } from '@/core/tableExport';
import { buildReport } from '@/core/report';
import { describe, filterFor, filterOut, negate, passes, type ColumnFilter } from '@/core/tableFilter';
import { eventStore } from '@/core/store';
import { starOf, toggleStar } from '@/composables/useStars';
import FilterChips, { type Chip } from './table/FilterChips.vue';
import TableHistogram from './table/TableHistogram.vue';
import TimeRangeFilter from './table/TimeRangeFilter.vue';
import ValuesFilter from './table/ValuesFilter.vue';

type Row = any; // rows are plugin-defined objects
type AnyColumn = Column<Row>;
/* TanStack's column and header objects, as used by the template. */
type TColumn = any;
type THeader = any;

const props = defineProps<{
  view: View<Row>;
  zone: string;
  exportName: string;
  /** Heading of exported reports. */
  title?: string;
  /** Column filters to start with (column id → value), e.g. from a pivot. */
  filters?: Record<string, string>;
  /** Search text, time range and a record to select when the table opens (from the page address). */
  initial?: { search?: string; from?: number; to?: number; anchor?: number };
}>();
const emit = defineEmits<{ open: [event: EvtxEvent, detail: RowDetail | undefined]; pivot: [target: Pivot] }>();
defineExpose({ step, searchFor });

const ROW_HEIGHT = 26;
const STAR_WIDTH = 26;

const TONE: Record<Tone, string> = {
  danger: 'text-danger font-semibold',
  warning: 'text-warning font-semibold',
  success: 'text-success',
  muted: 'text-muted-foreground',
};

const defs = computed<Record<string, AnyColumn>>(() => Object.fromEntries(props.view.columns.map(c => [c.id, c])));
const labelOf = (id: string) => defs.value[id]?.label ?? id;
const timeColumn = computed(() => props.view.columns.find(c => c.kind === 'time'));

const cellText = (row: Row, id: string) => {
  const col = defs.value[id];
  return col ? displayText(row, col, props.zone) : '';
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

// ---------------------------------------------------------------- column layout, remembered per view

interface Layout {
  order: string[];
  sizing: Record<string, number>;
  pinned: string[];
  /** Hidden column ids once the analyst changed visibility; null keeps the view's defaults. */
  hidden: string[] | null;
  histogram: boolean;
}

const layout = useStorage<Layout>(
  `glossy.table.${props.exportName}`,
  { order: [], sizing: {}, pinned: [], hidden: null, histogram: true },
  localStorage,
  { mergeDefaults: true },
);

const ids = props.view.columns.map(c => c.id);
const known = (list: string[]) => list.filter(id => ids.includes(id));

// ---------------------------------------------------------------- table

const columnFilter = (row: { original: Row }, columnId: string, filterValue: unknown) => {
  const col = defs.value[columnId];
  const filter = filterValue as ColumnFilter;
  if (!col) return true;
  return passes(filter, col.value(row.original), filter.kind === 'text' ? displayText(row.original, col, props.zone) : '');
};

/** Search box: case-insensitive substring in any searchable column. */
const searchFilter = (row: { original: Row }, columnId: string, filterValue: unknown) => {
  const col = defs.value[columnId];
  return !!col && displayText(row.original, col, props.zone).toLowerCase().includes(String(filterValue ?? '').toLowerCase());
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
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnResizingFeature,
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
  size: c.size ?? 160,
  minSize: 50,
}));

/** Pivot presets: pick-list columns match the value exactly, others contain it. A time range from the address applies to the first time column. */
const presetFilters = Object.entries(props.filters ?? {}).map(([id, value]) => ({
  id,
  value: (defs.value[id]?.facet ? { kind: 'values', values: [value] } : { kind: 'text', text: value }) as ColumnFilter,
}));
if (timeColumn.value && (props.initial?.from !== undefined || props.initial?.to !== undefined))
  presetFilters.push({ id: timeColumn.value.id, value: { kind: 'range', from: props.initial.from, to: props.initial.to } });

const starredOnly = ref(false);
const isStarred = (row: Row) => {
  const e = props.view.event?.(row);
  return !!e && !!starOf(e);
};
const star = (row: Row) => {
  const e = props.view.event?.(row);
  if (e) toggleStar(e);
};
const data = computed(() => markRaw(starredOnly.value ? props.view.rows.filter(isStarred) : props.view.rows));
const search = ref(props.initial?.search ?? '');
const debounced = ref(search.value);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, v => {
  clearTimeout(timer);
  timer = setTimeout(() => (debounced.value = v.trim()), 200);
});

const defaultVisibility = () => Object.fromEntries(props.view.columns.filter(c => c.hidden).map(c => [c.id, false]));

const table = useTable({
  features,
  columns: columns as never,
  data: data as never,
  initialState: {
    sorting: [{ id: props.view.sort?.id ?? props.view.columns[0]?.id ?? '', desc: props.view.sort?.desc ?? false }],
    columnVisibility: layout.value.hidden ? Object.fromEntries(ids.map(id => [id, !layout.value.hidden!.includes(id)])) : defaultVisibility(),
    columnFilters: presetFilters,
    columnOrder: known(layout.value.order),
    columnSizing: Object.fromEntries(Object.entries(layout.value.sizing).filter(([id]) => ids.includes(id))),
    columnPinning: { start: known(layout.value.pinned), end: [] },
  },
  enableSortingRemoval: false,
  columnResizeMode: 'onChange',
  globalFilterFn: searchFilter as never,
  getColumnCanGlobalFilter: (column: { id: string }) => defs.value[column.id]?.kind !== 'time',
} as never) as any;

watch(debounced, v => table.setGlobalFilter(v || undefined), { immediate: true });

watch(
  () => [table.atoms.columnOrder.get(), table.atoms.columnSizing.get(), table.atoms.columnPinning.get(), table.atoms.columnVisibility.get()],
  ([order, sizing, pinning, visibility]) => {
    const vis = visibility as Record<string, boolean>;
    layout.value = {
      ...layout.value,
      order: order as string[],
      sizing: sizing as Record<string, number>,
      pinned: (pinning as { start: string[] }).start,
      hidden: ids.filter(id => vis[id] === false),
    };
  },
  { deep: true },
);

function resetLayout() {
  table.resetColumnOrder(true);
  table.resetColumnSizing(true);
  table.resetColumnPinning(true);
  table.setColumnVisibility(defaultVisibility());
  layout.value = { order: [], sizing: {}, pinned: [], hidden: null, histogram: layout.value.histogram };
}

const rows = computed(() => table.getRowModel().rows as { id: string; original: Row }[]);
/** Headers in display order: pinned columns first. */
const headers = computed<THeader[]>(() => [...table.getStartLeafHeaders(), ...table.getCenterLeafHeaders()]);

const starWidth = computed(() => (props.view.event ? STAR_WIDTH : 0));
const colspan = computed(() => headers.value.length + (props.view.event ? 1 : 0));
const isPinned = (h: THeader) => h.column.getIsPinned() === 'start';
const pinStyle = (h: THeader): CSSProperties | undefined => (isPinned(h) ? { position: 'sticky', left: `${h.column.getStart('start') + starWidth.value}px` } : undefined);

// Reordering by dragging headers.
const dragId = ref<string | null>(null);
const dragOver = ref<string | null>(null);
function onDragStart(e: DragEvent, id: string) {
  dragId.value = id;
  e.dataTransfer?.setData('text/plain', id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDrop(target: string) {
  const from = dragId.value;
  dragOver.value = null;
  dragId.value = null;
  if (!from || from === target) return;
  const order = table.getAllLeafColumns().map((c: TColumn) => c.id as string).filter((id: string) => id !== from);
  order.splice(order.indexOf(target), 0, from);
  table.setColumnOrder(order);
}

// ---------------------------------------------------------------- filters

const currentFilter = (id: string) => table.getColumn(id)?.getFilterValue() as ColumnFilter | undefined;
const setFilter = (id: string, value: ColumnFilter | undefined) => table.getColumn(id)?.setFilterValue(value);
const rangeOf = (v: unknown) => ((v as ColumnFilter | undefined)?.kind === 'range' ? (v as Extract<ColumnFilter, { kind: 'range' }>) : undefined);
const valuesOf = (v: unknown) => ((v as ColumnFilter | undefined)?.kind === 'values' ? (v as Extract<ColumnFilter, { kind: 'values' }>) : undefined);
const textOf = (v: unknown) => ((v as ColumnFilter | undefined)?.kind === 'text' ? (v as Extract<ColumnFilter, { kind: 'text' }>) : undefined);

/** Distinct values under the other filters, most frequent first. */
function facetValues(col: TColumn): [string, number][] {
  return [...(col.getFacetedUniqueValues() as Map<unknown, number>)]
    .map(([v, n]) => [v === null || v === undefined ? '' : String(v), n] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const chips = computed<Chip[]>(() => {
  const out: Chip[] = (table.atoms.columnFilters.get() as { id: string; value: ColumnFilter }[]).map(f => ({
    id: f.id,
    text: describe(f.value, labelOf(f.id), props.zone),
    exclude: f.value.kind !== 'range' && !!f.value.exclude,
    negatable: f.value.kind !== 'range',
  }));
  if (debounced.value) out.push({ id: '__search', text: `Search: "${debounced.value}"`, negatable: false });
  if (starredOnly.value) out.push({ id: '__starred', text: 'Starred only', negatable: false });
  return out;
});

function removeChip(id: string) {
  if (id === '__search') search.value = debounced.value = '';
  else if (id === '__starred') starredOnly.value = false;
  else setFilter(id, undefined);
}

function negateChip(id: string) {
  const f = currentFilter(id);
  if (f) setFilter(id, negate(f));
}

function clearFilters() {
  table.resetColumnFilters(true);
  search.value = '';
  debounced.value = '';
  starredOnly.value = false;
}

const timeRange = computed(() => (timeColumn.value ? rangeOf(table.atoms.columnFilters.get().find((f: { id: string }) => f.id === timeColumn.value!.id)?.value) : undefined));
const histogramTimes = computed(() => {
  const col = timeColumn.value;
  return col ? rows.value.map(r => col.value(r.original) as number) : [];
});

// ---------------------------------------------------------------- context menu

const menu = ref<{ row: Row; col: AnyColumn; value: unknown; text: string } | null>(null);
const menuValue = computed(() => (menu.value ? (menu.value.value === null || menu.value.value === undefined ? '' : String(menu.value.value)) : ''));
const menuLabel = computed(() => {
  const t = menu.value?.text ?? '';
  if (!t) return '(empty)';
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
});

function onContextMenu(e: MouseEvent) {
  const td = (e.target as HTMLElement).closest('td[data-col]') as HTMLElement | null;
  const row = td ? rows.value[Number(td.dataset['row'])]?.original : undefined;
  const col = td ? defs.value[td.dataset['col'] ?? ''] : undefined;
  if (!row || !col) {
    // Outside a cell the browser's own menu stays available.
    e.stopPropagation();
    menu.value = null;
    return;
  }
  menu.value = { row, col, value: col.value(row), text: displayText(row, col, props.zone) };
}

function setRangeEdge(edge: 'from' | 'to') {
  const m = menu.value;
  if (!m || typeof m.value !== 'number') return;
  const current = rangeOf(currentFilter(m.col.id));
  setFilter(m.col.id, { kind: 'range', from: current?.from, to: current?.to, [edge]: m.value });
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('The clipboard is not available here');
  }
}

function copyRow(row: Row) {
  const lines = headers.value.map(h => `${labelOf(h.id)}: ${cellText(row, h.id)}`);
  void copy(lines.join('\n'), 'Row');
}

// ---------------------------------------------------------------- rows

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

// ---------------------------------------------------------------- selection and keyboard

const selectedId = ref<string | null>(null);

function activate(index: number) {
  const row = rows.value[index];
  if (!row) return;
  selectedId.value = row.id;
  open(row.original);
}

/** Moves the selection (and the open record) by delta rows in the current order. */
function step(delta: number) {
  const list = rows.value;
  if (!list.length) return;
  const at = list.findIndex(r => r.id === selectedId.value);
  const index = Math.max(0, Math.min(list.length - 1, at < 0 ? 0 : at + delta));
  virtualizer.value.scrollToIndex(index, { align: 'auto' });
  const row = list[index]!;
  selectedId.value = row.id;
  // Stepping opens records; it never pivots to another view.
  const event = props.view.event?.(row.original);
  if (event) emit('open', event, props.view.detail?.(row.original));
}

function searchFor(text: string) {
  search.value = debounced.value = text;
}

function onKeydown(e: KeyboardEvent) {
  if (e.target !== scroller.value || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    step(e.key === 'ArrowDown' ? 1 : -1);
  } else if (e.key === 'Enter') {
    const at = rows.value.findIndex(r => r.id === selectedId.value);
    if (at >= 0) activate(at);
  } else if (e.key === 's' || e.key === 'S') {
    const row = rows.value.find(r => r.id === selectedId.value);
    if (row) star(row.original);
  }
}

// A record handed over in the address (e.g. surrounding events) is selected and scrolled to.
let anchored = props.initial?.anchor === undefined;
watch(
  rows,
  list => {
    if (anchored) return;
    const index = list.findIndex(r => props.view.event?.(r.original)?.id === props.initial!.anchor);
    if (index < 0) return;
    anchored = true;
    selectedId.value = list[index]!.id;
    requestAnimationFrame(() => virtualizer.value.scrollToIndex(index, { align: 'center' }));
    open(list[index]!.original);
  },
  { immediate: true },
);

// ---------------------------------------------------------------- export

function snapshot(): TableSnapshot<Row> {
  return {
    columns: headers.value.filter(h => h.column.getIsVisible()).map(h => defs.value[h.id]!).filter(Boolean),
    rows: rows.value.map(r => r.original),
    event: props.view.event,
    sourceName: e => eventStore.sources.find(s => s.index === e.src)?.name ?? '',
  };
}

const fileName = (ext: string) => `glossy_${props.exportName}_${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}.${ext}`;

function exportCsv() {
  download(fileName('csv'), tableToCsv(snapshot(), props.zone));
}

const REPORT_LIMIT = 2000;

function exportReport() {
  if (rows.value.length > REPORT_LIMIT) {
    toast.warning(`Reports hold up to ${REPORT_LIMIT.toLocaleString()} rows; this table has ${rows.value.length.toLocaleString()}. Filter it first (or star the events that matter).`);
    return;
  }
  const snap = snapshot();
  const html = buildReport({
    title: props.title ?? props.exportName,
    zone: props.zone,
    columns: snap.columns,
    rows: snap.rows,
    event: props.view.event,
    sources: eventStore.sources,
    note: e => starOf(e)?.note,
    generatedAt: Date.now(),
  });
  download(fileName('html'), html, 'text/html;charset=utf-8');
}

function exportJsonl() {
  const { text, skipped } = tableToJsonl(snapshot(), props.view.columns.filter(c => c.kind === 'time'), `glossy:${props.exportName}`);
  if (skipped) toast.warning(`${skipped.toLocaleString()} row(s) without a time were left out of the JSONL file.`);
  if (text) download(fileName('jsonl'), text, 'application/x-ndjson;charset=utf-8');
}
</script>
