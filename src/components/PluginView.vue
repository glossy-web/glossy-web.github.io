<template>
  <div class="plugin-view d-flex flex-column flex-grow-1 p-3 gap-3">
    <header>
      <h1 class="h5 mb-1"><i :class="`bi bi-${plugin.icon} me-2`" aria-hidden="true"></i>{{ plugin.label }}</h1>
      <p class="text-body-secondary small mb-2">{{ plugin.description }}</p>
      <FilterBar :plugin="plugin" :values="options" @update="setOption" />
    </header>

    <div v-for="(n, i) in result.notes" :key="i" class="alert py-2 mb-0 small" :class="n.tone === 'warning' ? 'alert-warning' : 'alert-secondary'">
      <i :class="n.tone === 'warning' ? 'bi bi-exclamation-triangle me-1' : 'bi bi-info-circle me-1'" aria-hidden="true"></i>{{ n.text }}
    </div>

    <DashboardPanel :stats="result.stats" />

    <div v-if="charts.length" class="charts">
      <SummaryChart v-for="c in charts" :key="c.title" :spec="c" :zone="zone" :dark="dark" />
    </div>

    <section class="d-flex flex-column flex-grow-1 views">
      <ul v-if="result.views.length > 1" class="nav nav-tabs mb-2" role="tablist">
        <li v-for="v in result.views" :key="v.id" class="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            class="nav-link"
            :class="{ active: currentView?.id === v.id }"
            :aria-selected="currentView?.id === v.id"
            @click="viewId = v.id"
          >
            {{ v.label }} <span class="badge text-bg-light border ms-1">{{ v.rows.length.toLocaleString() }}</span>
          </button>
        </li>
      </ul>
      <EventTable
        v-if="currentView"
        :key="`${plugin.name}:${currentView.id}:${revision}`"
        :view="currentView"
        :zone="zone"
        :export-name="`${plugin.name}_${currentView.id}`"
        @open="detail = $event"
      />
    </section>

    <EventDetailModal v-if="detail" :event="detail" :zone="zone" @close="detail = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import type { EvtxEvent } from '@/core/evtx/types';
import { eventStore } from '@/core/store';
import { createContext } from '@/core/context';
import { pluginByName } from '@/plugins';
import { pluginOptions } from '@/composables/useGlossyStore';
import FilterBar from './FilterBar.vue';
import DashboardPanel from './DashboardPanel.vue';
import SummaryChart from './SummaryChart.vue';
import EventTable from './EventTable.vue';
import EventDetailModal from './EventDetailModal.vue';

const props = defineProps<{ name: string; zone: string; dark: boolean }>();

const plugin = computed(() => pluginByName.get(props.name) ?? pluginByName.get('showAll')!);
const detail = shallowRef<EvtxEvent | null>(null);
const viewId = ref('');

const options = computed<Record<string, boolean>>(() => {
  const saved = pluginOptions.value[plugin.value.name] ?? {};
  return Object.fromEntries((plugin.value.options ?? []).map(o => [o.id, saved[o.id] ?? o.default]));
});

function setOption(id: string, value: boolean) {
  pluginOptions.value = {
    ...pluginOptions.value,
    [plugin.value.name]: { ...options.value, [id]: value },
  };
}

// Re-analysis happens only when the data or the plugin's own options change.
const result = computed(() => {
  void eventStore.version.value;
  return plugin.value.analyze(createContext(eventStore), options.value);
});
// Charts without a single data point are left out rather than drawn empty.
const charts = computed(() =>
  result.value.charts.filter(c => (c.kind === 'ranking' ? c.items.length > 0 : c.series.some(s => s.ts.length > 0))),
);
const revision = computed(() => `${eventStore.version.value}:${JSON.stringify(options.value)}`);
const currentView = computed(() => result.value.views.find(v => v.id === viewId.value) ?? result.value.views[0]);
</script>

<style scoped>
.plugin-view {
  min-height: 0;
  overflow: auto;
}
.charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 12px;
}
.views {
  min-height: 420px;
}
</style>
