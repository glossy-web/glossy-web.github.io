<template>
  <figure class="bg-card min-w-0 rounded-lg border p-2">
    <figcaption class="flex items-center gap-2 px-1 text-xs font-medium">
      {{ spec.title }}
      <span v-if="clickable" class="text-muted-foreground ml-auto font-normal">{{ hint }}</span>
    </figcaption>
    <div ref="el" class="w-full" :style="{ height: height + 'px' }" role="img" :aria-label="ariaLabel"></div>
  </figure>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, GraphChart, HeatmapChart, ScatterChart } from 'echarts/charts';
import { CalendarComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartSpec } from '@/core/plugin';
import type { ColumnFilter } from '@/core/tableFilter';
import { histogram } from '@/core/histogram';
import { dayAndHour, dayBounds, formatTime, zonedToEpoch } from '@/core/time';
import { escapeHtml } from '@/core/report';
import { isDark } from '@/composables/useTheme';
import { chartTheme } from './chartTheme';

echarts.use([
  BarChart,
  ScatterChart,
  HeatmapChart,
  GraphChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CalendarComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

/** A click on the chart: filter `column` of `view` (the time column when omitted). */
export interface ChartClick {
  view?: string;
  column?: string;
  filter: ColumnFilter;
}

const props = defineProps<{ spec: ChartSpec; zone: string }>();
const emit = defineEmits<{ filter: [click: ChartClick] }>();
const el = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;
let resize: ResizeObserver | null = null;
let theme = chartTheme(isDark.value);

const DAY = 86400000;

const years = computed(() => {
  if (props.spec.kind !== 'calendar' || !props.spec.ts.length) return [] as number[];
  const ys = props.spec.ts.map(ts => Number(formatTime(ts, props.zone).slice(0, 4)));
  const out: number[] = [];
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) out.push(y);
  return out;
});

const height = computed(() => {
  const s = props.spec;
  if (s.kind === 'ranking') return Math.max(120, s.items.length * 22 + 40);
  if (s.kind === 'calendar') return years.value.length * 120 + 30;
  if (s.kind === 'graph') return 380;
  return 260;
});

const clickable = computed(() => {
  const s = props.spec;
  if (s.kind === 'ranking') return !!s.target?.column;
  if (s.kind === 'graph') return s.nodes.some(n => n.filter);
  return true;
});
const hint = computed(() => (props.spec.kind === 'graph' ? 'Drag to arrange, scroll to zoom, click a node to filter' : 'Click to filter the table'));

const ariaLabel = computed(() => {
  const s = props.spec;
  if (s.kind === 'ranking') return `${s.title}: ${s.items.slice(0, 5).map(i => `${i.name} ${i.value}`).join(', ')}`;
  if (s.kind === 'calendar') return `${s.title}: ${s.ts.length} events`;
  if (s.kind === 'graph') return `${s.title}: ${s.nodes.length} nodes, ${s.links.length} links`;
  return `${s.title}: ${s.series.map(x => `${x.name} ${x.ts.length}`).join(', ')}`;
});

const tooltip = (extra: object = {}) => ({ backgroundColor: theme.surface, borderColor: theme.border, textStyle: { color: theme.text, fontSize: 12 }, ...extra });
const base = () => ({ color: theme.series, textStyle: { color: theme.text, fontFamily: theme.font }, animation: false });

// ---------------------------------------------------------------- timeline: zone-aware buckets, empty ones kept

let timelineBuckets: { start: number; end: number }[] = [];

function timelineOption(spec: Extract<ChartSpec, { kind: 'timeline' }>) {
  const { buckets } = histogram(spec.series.flatMap(s => s.ts), props.zone);
  timelineBuckets = buckets;
  const bucketOf = (ts: number) => {
    let lo = 0;
    let hi = buckets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (buckets[mid]!.start <= ts) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const counts = spec.series.map(s => {
    const c = new Array<number>(buckets.length).fill(0);
    for (const ts of s.ts) if (Number.isFinite(ts)) c[bucketOf(ts)]!++;
    return c;
  });
  return {
    ...base(),
    grid: { left: 44, right: 16, top: spec.series.length > 1 ? 32 : 12, bottom: buckets.length > 40 ? 56 : 28 },
    legend: spec.series.length > 1 ? { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: theme.text } } : undefined,
    tooltip: tooltip({ trigger: 'axis', axisPointer: { type: 'shadow' } }),
    xAxis: { type: 'category', data: buckets.map(b => b.key), axisLine: { lineStyle: { color: theme.axis } }, axisLabel: { color: theme.muted, hideOverlap: true }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted } },
    dataZoom: buckets.length > 40 ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6 }] : [],
    series: spec.series.map((s, i) => ({
      name: s.name,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 18,
      itemStyle: { borderColor: theme.surface, borderWidth: 1, borderRadius: 2 },
      emphasis: { focus: 'series' },
      data: counts[i],
    })),
  };
}

// ---------------------------------------------------------------- clock: date × time of day

function clockOption(spec: Extract<ChartSpec, { kind: 'clock' }>) {
  return {
    ...base(),
    grid: { left: 44, right: 16, top: spec.series.length > 1 ? 32 : 12, bottom: 56 },
    legend: spec.series.length > 1 ? { top: 0, left: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { color: theme.text } } : undefined,
    tooltip: tooltip({ trigger: 'item', formatter: (p: { seriesName: string; value: [number, number, number] }) => `${escapeHtml(p.seriesName)}<br/>${formatTime(p.value[2], props.zone)}` }),
    xAxis: {
      type: 'time',
      minInterval: DAY,
      // Half a day of padding so dots on the first and last day are not cut in half.
      min: (v: { min: number }) => v.min - DAY / 2,
      max: (v: { max: number }) => v.max + DAY / 2,
      axisLine: { lineStyle: { color: theme.axis } },
      axisLabel: { color: theme.muted, hideOverlap: true, formatter: (v: number) => new Date(v).toISOString().slice(0, 10) },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 24,
      interval: 3,
      inverse: true,
      splitLine: { lineStyle: { color: theme.grid } },
      axisLabel: { color: theme.muted, formatter: (v: number) => `${String(v).padStart(2, '0')}:00` },
    },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6 }],
    series: spec.series.map(s => ({
      name: s.name,
      type: 'scatter',
      symbolSize: 8,
      large: s.ts.length > 5000,
      itemStyle: { borderColor: theme.surface, borderWidth: 1, opacity: 0.85 },
      // x: the calendar day in the chosen zone (as a UTC midnight), y: hour of day there.
      data: s.ts.map(ts => {
        const { day, hour } = dayAndHour(ts, props.zone);
        return [Date.parse(`${day}T00:00:00Z`), hour, ts];
      }),
    })),
  };
}

// ---------------------------------------------------------------- ranking

function rankingOption(spec: Extract<ChartSpec, { kind: 'ranking' }>) {
  const items = [...spec.items].reverse();
  return {
    ...base(),
    grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
    tooltip: tooltip({ trigger: 'item' }),
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: items.map(i => i.name),
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
      axisLabel: { color: theme.text, width: 260, overflow: 'truncate' },
      triggerEvent: true,
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 14,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: theme.muted },
        data: items.map(i => i.value),
      },
    ],
  };
}

// ---------------------------------------------------------------- calendar heatmap

function calendarOption(spec: Extract<ChartSpec, { kind: 'calendar' }>) {
  const counts = new Map<string, number>();
  for (const ts of spec.ts) {
    const day = formatTime(ts, props.zone).slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const max = Math.max(1, ...counts.values());
  return {
    ...base(),
    tooltip: tooltip({ trigger: 'item', formatter: (p: { value: [string, number] }) => `${p.value[0]}<br/><b>${p.value[1].toLocaleString()}</b> events` }),
    visualMap: { show: false, min: 1, max, inRange: { color: theme.scale } },
    calendar: years.value.map((y, i) => ({
      range: String(y),
      top: 22 + i * 120,
      left: 64,
      right: 8,
      cellSize: ['auto', 13],
      splitLine: { show: false },
      itemStyle: { color: theme.surface, borderColor: theme.grid, borderWidth: 1 },
      yearLabel: { show: true, position: 'left', margin: 28, color: theme.muted, fontSize: 11 },
      monthLabel: { color: theme.muted, fontSize: 10 },
      dayLabel: { color: theme.muted, fontSize: 9, firstDay: 1, nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] },
    })),
    series: years.value.map((y, i) => ({
      type: 'heatmap',
      coordinateSystem: 'calendar',
      calendarIndex: i,
      data: [...counts].filter(([d]) => d.startsWith(String(y))),
    })),
  };
}

// ---------------------------------------------------------------- graph

function graphOption(spec: Extract<ChartSpec, { kind: 'graph' }>) {
  const max = Math.max(1, ...spec.nodes.map(n => n.weight));
  const maxLink = Math.max(1, ...spec.links.map(l => l.weight));
  return {
    ...base(),
    legend: { top: 0, left: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { color: theme.text }, data: ['Source', 'Target'] },
    color: [theme.series[1], theme.series[0]],
    tooltip: tooltip({
      trigger: 'item',
      formatter: (p: { dataType: string; data: { name?: string; detail?: string; source?: string; target?: string } }) =>
        p.dataType === 'edge'
          ? `${escapeHtml(p.data.source ?? '')} → ${escapeHtml(p.data.target ?? '')}${p.data.detail ? `<br/>${escapeHtml(p.data.detail)}` : ''}`
          : `${escapeHtml(p.data.name ?? '')}${p.data.detail ? `<br/>${escapeHtml(p.data.detail)}` : ''}`,
    }),
    series: [
      {
        type: 'graph',
        layout: 'force',
        top: 24,
        roam: true,
        draggable: true,
        // Legend and nodes take their colors from the categories.
        categories: [
          { name: 'Source', itemStyle: { color: theme.series[1] } },
          { name: 'Target', itemStyle: { color: theme.series[0] } },
        ],
        force: { repulsion: 180, edgeLength: [60, 160], gravity: 0.08 },
        label: { show: true, position: 'right', color: theme.text, fontSize: 11 },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: 6,
        lineStyle: { color: theme.muted, opacity: 0.6, curveness: 0.1 },
        emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
        data: spec.nodes.map(n => ({
          id: n.id,
          name: n.label,
          detail: n.detail,
          category: n.group === 'source' ? 0 : 1,
          symbolSize: 8 + 22 * Math.sqrt(n.weight / max),
        })),
        links: spec.links.map(l => ({
          source: l.source,
          target: l.target,
          detail: l.detail,
          lineStyle: { width: 1 + 4 * Math.sqrt(l.weight / maxLink), color: l.tone === 'danger' ? theme.danger : theme.muted },
        })),
      },
    ],
  };
}

function option() {
  const s = props.spec;
  if (s.kind === 'timeline') return timelineOption(s);
  if (s.kind === 'clock') return clockOption(s);
  if (s.kind === 'calendar') return calendarOption(s);
  if (s.kind === 'graph') return graphOption(s);
  return rankingOption(s);
}

// ---------------------------------------------------------------- clicks → table filters

const range = (from: number, to: number): ChartClick => ({ view: props.spec.target?.view, filter: { kind: 'range', from, to: to - 1 } });

function onClick(p: { componentType: string; dataIndex?: number; value?: unknown; data?: { id?: string }; dataType?: string }) {
  const s = props.spec;
  if (s.kind === 'timeline' && typeof p.dataIndex === 'number') {
    const b = timelineBuckets[p.dataIndex];
    if (b) emit('filter', range(b.start, b.end));
  } else if (s.kind === 'clock' && Array.isArray(p.value)) {
    const { from, to } = dayBounds(p.value[2] as number, props.zone);
    emit('filter', range(from, to));
  } else if (s.kind === 'calendar' && Array.isArray(p.value)) {
    // The cell's date is a day in the display zone.
    const [y, m, d] = String(p.value[0]).split('-').map(Number) as [number, number, number];
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    emit('filter', range(zonedToEpoch(props.zone, y, m, d), zonedToEpoch(props.zone, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())));
  } else if (s.kind === 'ranking' && s.target?.column) {
    const items = [...s.items].reverse();
    const name = p.componentType === 'yAxis' ? String(p.value ?? '') : items[p.dataIndex ?? -1]?.name;
    if (!name) return;
    const filter: ColumnFilter = s.target.match === 'contains' ? { kind: 'text', text: name } : { kind: 'values', values: [name] };
    emit('filter', { view: s.target.view, column: s.target.column, filter });
  } else if (s.kind === 'graph' && p.dataType === 'node') {
    const node = s.nodes.find(n => n.id === p.data?.id);
    if (node?.filter) emit('filter', { view: s.target?.view, column: node.filter.column, filter: { kind: 'values', values: [node.filter.value] } });
  }
}

function render() {
  if (!el.value) return;
  chart ??= echarts.init(el.value, undefined, { renderer: 'canvas' });
  theme = chartTheme(isDark.value);
  chart.setOption(option() as never, true);
}

onMounted(() => {
  render();
  chart?.on('click', p => onClick(p as never));
  resize = new ResizeObserver(() => chart?.resize());
  if (el.value) resize.observe(el.value);
});
watch(() => [props.spec, props.zone, isDark.value], render);
onBeforeUnmount(() => {
  resize?.disconnect();
  chart?.dispose();
});
</script>
