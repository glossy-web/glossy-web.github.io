<template>
  <div class="summary-chart" v-if="config" style="height: 350px">
    <div ref="chartContainer" style="width: 100%; height: 100%"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted, watch, PropType } from 'vue';
import * as echarts from 'echarts';
import type { ChartConfig } from '@/core/plugin';

export default defineComponent({
  name: 'SummaryChart',
  props: {
    config: { type: Object as PropType<ChartConfig | null>, default: null },
    pluginName: { type: String, default: '' },
  },
  setup(props) {
    const chartContainer = ref<HTMLElement | null>(null);
    let chart: echarts.ECharts | null = null;

    function buildOption(cfg: ChartConfig) {
      const data = cfg.data;
      const xData = data.map(d => d[cfg.xKey]);
      const yData = data.map(d => d[cfg.yKey]);

      if (cfg.type === 'pie') {
        return {
          title: { text: cfg.title, left: 'center', textStyle: { fontSize: 14 } },
          tooltip: { trigger: 'item' },
          series: [{
            type: 'pie',
            radius: ['35%', '65%'],
            data: xData.map((x, i) => ({ name: String(x), value: Number(yData[i]) })),
            label: { formatter: '{b}: {c}' },
          }],
        };
      }

      const series: Array<Record<string, unknown>> = [{
        type: 'bar',
        data: yData,
        name: cfg.title,
        large: true,
      }];

      if (cfg.categoryKey) {
        const catData = data.map(d => d[cfg.categoryKey!]);
        series.push({
          type: 'bar',
          data: catData,
          name: String(cfg.categoryKey),
          large: true,
        } as Record<string, unknown>);
      }

      return {
        title: { text: cfg.title, left: 'center', textStyle: { fontSize: 14 } },
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0, data: series.map((s: Record<string, unknown>) => s.name) },
        grid: { left: 60, right: 20, top: 40, bottom: 40 },
        xAxis: { type: 'category', data: xData, axisLabel: { rotate: 45, fontSize: 10 } },
        yAxis: { type: 'value' },
        dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 30 }],
        series,
      };
    }

    function renderChart() {
      if (!chartContainer.value || !props.config) return;
      if (!chart) {
        chart = echarts.init(chartContainer.value);
      }
      chart.setOption(buildOption(props.config), true);
    }

    onMounted(() => renderChart());
    watch(() => props.config, () => setTimeout(renderChart, 50));

    const observer = new ResizeObserver(() => chart?.resize());
    onMounted(() => {
      if (chartContainer.value) observer.observe(chartContainer.value);
    });
    onUnmounted(() => {
      observer.disconnect();
      chart?.dispose();
    });

    return { chartContainer };
  },
});
</script>
