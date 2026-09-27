<template>
  <div class="bg-card rounded-lg border px-2 pt-1">
    <div class="text-muted-foreground flex items-center gap-2 text-[11px]">
      <span>{{ total.toLocaleString() }} rows per {{ result.unit }} ({{ zone }})</span>
      <span class="ml-auto">Drag across bars or click one to filter by time</span>
    </div>
    <div ref="el" class="h-16 w-full" role="img" :aria-label="`Histogram of ${total} rows per ${result.unit}`"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { BrushComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { histogram } from '@/core/histogram';
import { isDark } from '@/composables/useTheme';
import { chartTheme } from '@/components/chartTheme';

echarts.use([BarChart, BrushComponent, GridComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{ times: number[]; zone: string; range?: { from?: number; to?: number } }>();
const emit = defineEmits<{ select: [range: { from: number; to: number }] }>();

const el = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;
let resize: ResizeObserver | null = null;

const result = computed(() => histogram(props.times, props.zone, props.range ?? {}));
const total = computed(() => props.times.length);

function select(first: number, last: number) {
  const b = result.value.buckets;
  const a = b[Math.max(0, Math.min(first, last))];
  const z = b[Math.min(b.length - 1, Math.max(first, last))];
  if (a && z) emit('select', { from: a.start, to: z.end - 1 });
}

function render() {
  if (!el.value) return;
  chart ??= echarts.init(el.value, undefined, { renderer: 'canvas' });
  const theme = chartTheme(isDark.value);
  const buckets = result.value.buckets;
  chart.setOption(
    {
      animation: false,
      grid: { left: 40, right: 8, top: 6, bottom: 18 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: theme.surface,
        borderColor: theme.border,
        textStyle: { color: theme.text, fontSize: 11 },
        formatter: (p: { dataIndex: number }[]) => {
          const b = buckets[p[0]?.dataIndex ?? -1];
          return b ? `${b.key}<br/><b>${b.count.toLocaleString()}</b> rows` : '';
        },
      },
      xAxis: {
        type: 'category',
        data: buckets.map(b => b.key),
        axisLine: { lineStyle: { color: theme.axis } },
        axisTick: { show: false },
        axisLabel: { color: theme.muted, fontSize: 10, hideOverlap: true },
      },
      yAxis: { type: 'value', minInterval: 1, splitNumber: 2, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted, fontSize: 10 } },
      brush: { xAxisIndex: 0, brushType: 'lineX', brushMode: 'single', transformable: false, throttleType: 'debounce', brushStyle: { color: 'rgba(120,120,120,0.2)', borderColor: theme.muted } },
      series: [{ type: 'bar', data: buckets.map(b => b.count), barCategoryGap: '10%', itemStyle: { color: theme.series[0] }, large: buckets.length > 600 }],
    } as never,
    true,
  );
  // Drag-to-select without a toolbox button, as in Kibana's histogram.
  chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } });
}

onMounted(() => {
  render();
  chart?.on('brushEnd', (p: unknown) => {
    const range = (p as { areas?: { coordRange?: [number, number] }[] }).areas?.[0]?.coordRange;
    chart?.dispatchAction({ type: 'brush', areas: [] });
    if (range) select(range[0], range[1]);
  });
  chart?.on('click', (p: unknown) => {
    const i = (p as { dataIndex?: number }).dataIndex;
    if (typeof i === 'number') select(i, i);
  });
  resize = new ResizeObserver(() => chart?.resize());
  if (el.value) resize.observe(el.value);
});
watch(() => [result.value, isDark.value], render);
onBeforeUnmount(() => {
  resize?.disconnect();
  chart?.dispose();
});
</script>
