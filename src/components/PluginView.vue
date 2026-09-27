<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 *:shrink-0">
    <header class="space-y-1.5">
      <h1 class="flex items-center gap-2 text-base font-semibold"><component :is="icon(plugin.icon)" class="size-4" aria-hidden="true" />{{ plugin.label }}</h1>
      <p class="text-muted-foreground text-xs">{{ plugin.description }}</p>
      <FilterBar :plugin="plugin" :values="options" @update="setOption" />
    </header>

    <Alert v-for="(n, i) in result.notes" :key="i" :class="n.tone === 'warning' ? 'border-warning/40' : ''">
      <TriangleAlertIcon v-if="n.tone === 'warning'" class="text-warning!" />
      <InfoIcon v-else />
      <AlertDescription :class="n.tone === 'warning' ? 'text-warning' : ''">{{ n.text }}</AlertDescription>
    </Alert>

    <DashboardPanel :stats="result.stats" />

    <div v-if="charts.length" class="grid grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-3">
      <SummaryChart v-for="c in charts" :key="c.title" :spec="c" :zone="timeZone" />
    </div>

    <section class="flex min-h-[420px] flex-1 flex-col">
      <Tabs v-if="result.views.length > 1" :model-value="currentView?.id" class="mb-1.5" @update:model-value="id => showView(String(id))">
        <TabsList variant="line">
          <TabsTrigger v-for="v in result.views" :key="v.id" :value="v.id" class="flex-none">
            {{ v.label }}<Badge variant="secondary" class="h-4 px-1 tabular-nums">{{ v.rows.length.toLocaleString() }}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <EventTable
        v-if="currentView"
        :key="`${plugin.name}:${currentView.id}:${revision}:${JSON.stringify(filters)}`"
        :view="currentView"
        :zone="timeZone"
        :export-name="`${plugin.name}_${currentView.id}`"
        :filters="filters"
        @open="(event, extra) => (detail = { event, extra })"
        @pivot="target => showView(target.view, target.filters)"
      />
    </section>

    <EventDetailModal v-if="detail" :event="detail.event" :extra="detail.extra" :zone="timeZone" @close="detail = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import { InfoIcon, TriangleAlertIcon } from '@lucide/vue';
import type { EvtxEvent } from '@/core/evtx/types';
import type { RowDetail } from '@/core/plugin';
import { eventStore } from '@/core/store';
import { createContext } from '@/core/context';
import { pluginByName } from '@/plugins';
import { pluginOptions, timeZone } from '@/composables/useGlossyStore';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { icon } from '@/components/icons';
import FilterBar from './FilterBar.vue';
import DashboardPanel from './DashboardPanel.vue';
import SummaryChart from './SummaryChart.vue';
import EventTable from './EventTable.vue';
import EventDetailModal from './EventDetailModal.vue';

/** Route params: the module and, optionally, one of its views (#/m/logon/sessions). */
const props = defineProps<{ name: string; view?: string }>();
const router = useRouter();

const plugin = computed(() => pluginByName.get(props.name) ?? pluginByName.get('showAll')!);
const detail = shallowRef<{ event: EvtxEvent; extra: RowDetail | undefined } | null>(null);
/** Column filters a pivot hands to the view it opens (kept per view, so going back drops them). */
const preset = shallowRef<{ view: string; filters: Record<string, string> }>();

function showView(id: string, filters?: Record<string, string>) {
  preset.value = filters ? { view: id, filters } : undefined;
  const to = { name: 'module', params: { name: plugin.value.name, view: id } };
  // A pivot is a step the analyst may want to go back from; switching tabs is not.
  void (filters ? router.push(to) : router.replace(to));
}

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
const currentView = computed(() => result.value.views.find(v => v.id === props.view) ?? result.value.views[0]);
const filters = computed(() => (preset.value && preset.value.view === currentView.value?.id ? preset.value.filters : undefined));
</script>
