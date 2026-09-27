<template>
  <figure class="chart border rounded p-2 mb-0" :style="{ background: chartTheme(dark).surface }">
    <figcaption class="small fw-semibold px-1">{{ spec.title }}</figcaption>
    <div ref="el" class="canvas" :style="{ height: height + 'px' }" role="img" :aria-label="ariaLabel"></div>
  </figure>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, ScatterChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartSpec } from '@/core/plugin';
import { dayAndHour, formatTime } from '@/core/time';
import { chartTheme } from './chartTheme';

echarts.use([BarChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer]);

const props = defineProps<{ spec: ChartSpec; zone: string; dark: boolean }>();
const el = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;
let resize: ResizeObserver | null = null;

const height = computed(() => (props.spec.kind === 'ranking' ? Math.max(120, props.spec.items.length * 22 + 40) : 260));
const ariaLabel = computed(() => {
  const s = props.spec;
  if (s.kind === 'ranking') return `${s.title}: ${s.items.slice(0, 5).map(i => `${i.name} ${i.value}`).join(', ')}`;
  return `${s.title}: ${s.series.map(x => `${x.name} ${x.ts.length}`).join(', ')}`;
});

type Bucket = 'hour' | 'day' | 'month';

function bucketOf(ts: number, bucket: Bucket, zone: string): string {
  const t = formatTime(ts, zone);
  return bucket === 'hour' ? `${t.slice(0, 13)}:00` : bucket === 'day' ? t.slice(0, 10) : t.slice(0, 7);
}

function timelineOption(spec: Extract<ChartSpec, { kind: 'timeline' }>) {
  const theme = chartTheme(props.dark);
  const all = spec.series.flatMap(s => s.ts);
  const span = all.length ? Math.max(...all) - Math.min(...all) : 0;
  const bucket: Bucket = span <= 2 * 86400000 ? 'hour' : span <= 400 * 86400000 ? 'day' : 'month';
  const keys = new Set<string>();
  const counts = spec.series.map(s => {
    const m = new Map<string, number>();
    for (const ts of s.ts) {
      const k = bucketOf(ts, bucket, props.zone);
      keys.add(k);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  });
  const categories = [...keys].sort();
  return {
    color: theme.series,
    textStyle: { color: theme.text, fontFamily: theme.font },
    grid: { left: 44, right: 16, top: spec.series.length > 1 ? 32 : 12, bottom: categories.length > 40 ? 56 : 28 },
    legend: spec.series.length > 1 ? { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: theme.text } } : undefined,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: theme.surface, borderColor: theme.border, textStyle: { color: theme.text } },
    xAxis: { type: 'category', data: categories, axisLine: { lineStyle: { color: theme.axis } }, axisLabel: { color: theme.muted, hideOverlap: true }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted } },
    dataZoom: categories.length > 40 ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6 }] : [],
    series: spec.series.map((s, i) => ({
      name: s.name,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 18,
      itemStyle: { borderColor: theme.surface, borderWidth: 1, borderRadius: 2 },
      emphasis: { focus: 'series' },
      data: categories.map(c => counts[i]!.get(c) ?? 0),
    })),
  };
}

function clockOption(spec: Extract<ChartSpec, { kind: 'clock' }>) {
  const theme = chartTheme(props.dark);
  return {
    color: theme.series,
    textStyle: { color: theme.text, fontFamily: theme.font },
    grid: { left: 44, right: 16, top: spec.series.length > 1 ? 32 : 12, bottom: 56 },
    legend: spec.series.length > 1 ? { top: 0, left: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { color: theme.text } } : undefined,
    tooltip: {
      trigger: 'item',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.text },
      formatter: (p: { seriesName: string; value: [number, number, number] }) => `${p.seriesName}<br/>${formatTime(p.value[2], props.zone)}`,
    },
    xAxis: {
      type: 'time',
      minInterval: 86400000,
      // Half a day of padding so dots on the first and last day are not cut in half.
      min: (v: { min: number }) => v.min - 43200000,
      max: (v: { max: number }) => v.max + 43200000,
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

function rankingOption(spec: Extract<ChartSpec, { kind: 'ranking' }>) {
  const theme = chartTheme(props.dark);
  const items = [...spec.items].reverse();
  return {
    color: theme.series,
    textStyle: { color: theme.text, fontFamily: theme.font },
    grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: 'item', backgroundColor: theme.surface, borderColor: theme.border, textStyle: { color: theme.text } },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: items.map(i => i.name),
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
      axisLabel: { color: theme.text, width: 260, overflow: 'truncate' },
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

function option() {
  const s = props.spec;
  if (s.kind === 'timeline') return timelineOption(s);
  if (s.kind === 'clock') return clockOption(s);
  return rankingOption(s);
}

function render() {
  if (!el.value) return;
  chart ??= echarts.init(el.value, undefined, { renderer: 'canvas' });
  chart.setOption(option() as never, true);
}

onMounted(() => {
  render();
  resize = new ResizeObserver(() => chart?.resize());
  if (el.value) resize.observe(el.value);
});
watch(() => [props.spec, props.zone, props.dark], render);
onBeforeUnmount(() => {
  resize?.disconnect();
  chart?.dispose();
});
</script>

<style scoped>
.chart {
  min-width: 0;
}
.canvas {
  width: 100%;
}
</style>
