<template>
  <div class="plugin-view d-flex flex-column flex-grow-1" style="min-height: 0">
    <div class="plugin-header px-4 py-3 border-bottom bg-white flex-shrink-0">
      <h5 class="mb-0">
        <i :class="'fa ' + plugin.icon + ' me-2'"></i>{{ plugin.label }}
        <small class="text-muted ms-2">{{ filteredEvents.length }} events</small>
      </h5>
      <p class="text-muted small mb-0">{{ plugin.description }}</p>
    </div>

    <FilterBar
      v-if="filterDefs.length > 0"
      :defs="filterDefs"
      @update="filterValues = $event"
    />

    <DashboardPanel
      v-if="dashboard"
      :data="dashboard"
      :plugin-name="plugin.name"
    />

    <div class="px-4 py-2 flex-shrink-0" v-if="chartConfigs.length > 0">
      <SummaryChart :config="chartConfigs[0]" :plugin-name="plugin.name" />
    </div>

    <div class="flex-grow-1 d-flex flex-column px-4 py-2" style="min-height: 0">
      <EventTable
        :events="filteredEvents"
        :columns="tableColumns"
        :plugin-name="plugin.name"
        @show-detail="handleShowDetail"
      />
    </div>

    <EventDetailModal
      v-if="detailEvent"
      :event="detailEvent"
      @close="detailEvent = null"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import { pluginRegistry, type Plugin, type FilterDef } from '@/core/plugin';
import { eventStore } from '@/core/store';
import type { EvtxEvent } from '@/core/evtx/types';
import DashboardPanel from '@/components/DashboardPanel.vue';
import SummaryChart from '@/components/SummaryChart.vue';
import EventTable from '@/components/EventTable.vue';
import EventDetailModal from '@/components/EventDetailModal.vue';
import FilterBar from '@/components/FilterBar.vue';

export default defineComponent({
  name: 'PluginView',
  components: { DashboardPanel, SummaryChart, EventTable, EventDetailModal, FilterBar },
  props: {
    pluginName: { type: String, required: true },
  },
  setup(props) {
    const detailEvent = ref<EvtxEvent | null>(null);
    const filterValues = ref<Record<string, string>>({});

    const plugin = computed<Plugin>(() =>
      pluginRegistry.get(props.pluginName) ?? pluginRegistry.get('showAll')!,
    );

    const events = computed<EvtxEvent[]>(() => {
      const p = plugin.value;
      const filter = p.getFilters();
      eventStore.version.value;
      const raw = eventStore.query(filter);
      return p.processEvents(raw);
    });

    const filterDefs = computed<FilterDef[]>(() => {
      const defs = plugin.value.getFilterDefs(events.value);
      for (const def of defs) {
        if (def.type === 'select' && !def.options) {
          const values = new Set<string>();
          for (const e of events.value) {
            let v: string | undefined;
            if (['action', 'logonType'].includes(def.key)) {
              const fn = (plugin.value as unknown as Record<string, unknown>)[def.key === 'action' ? 'getAction' : 'getLogonType'];
              if (fn) v = ((fn as (e: EvtxEvent) => string)(e)) as string;
            } else if (def.key === 'provider') {
              v = e.provider;
            } else if (def.key === 'channel') {
              v = e.channel;
            } else if (def.key === 'computer') {
              v = e.computer;
            } else if (def.key === 'level' || def.key === 'levelName') {
              v = e.levelName;
            } else {
              v = e.data[def.key] as string;
            }
            if (v && v.length > 0) values.add(v);
          }
          def.options = Array.from(values).sort();
        }
      }
      return defs;
    });

    const filteredEvents = computed<EvtxEvent[]>(() => {
      let list = events.value;
      const fv = filterValues.value;
      if (!fv || Object.keys(fv).length === 0) return list;

      for (const [key, val] of Object.entries(fv)) {
        if (!val) continue;
        const q = val.toLowerCase();
        list = list.filter(e => {
          if (key === 'action') {
            const action = (plugin.value as unknown as Record<string, unknown>).getAction
              ? ((plugin.value as unknown as Record<string, unknown>).getAction as (e: EvtxEvent) => string)(e)
              : '';
            return action.toLowerCase().includes(q);
          }
          if (key === 'logonType') {
            const lt = (plugin.value as unknown as Record<string, unknown>).getLogonType
              ? ((plugin.value as unknown as Record<string, unknown>).getLogonType as (e: EvtxEvent) => string)(e)
              : '';
            return lt.toLowerCase().includes(q);
          }
          if (key === 'level' || key === 'levelName') {
            return e.levelName.toLowerCase().includes(q);
          }
          if (key === 'provider') return e.provider.toLowerCase().includes(q);
          if (key === 'channel') return e.channel.toLowerCase().includes(q);
          if (key === 'computer') return e.computer.toLowerCase().includes(q);
          if (key === 'sourceIP') {
            const ip = (e.data['IpAddress'] || e.data['Address'] || e.data['SourceNetworkAddress'] || '') as string;
            return String(ip).toLowerCase().includes(q);
          }
          if (key === 'ip') {
            const ip = (e.data['Address'] || e.data['IpAddress'] || '') as string;
            return String(ip).toLowerCase().includes(q);
          }
          if (key === 'ssid') {
            const ssid = (e.data['SSID'] || e.data['Ssid'] || '') as string;
            return String(ssid).toLowerCase().includes(q);
          }
          if (key === 'bssid') {
            const bssid = (e.data['BSSID'] || e.data['Bssid'] || '') as string;
            return String(bssid).toLowerCase().includes(q);
          }
          const v = e.data[key] as string;
          return v && String(v).toLowerCase().includes(q);
        });
      }
      return list;
    });

    const tableColumns = computed(() => plugin.value.getTableColumns());
    const dashboard = computed(() => {
      if (filteredEvents.value.length === 0) return null;
      return plugin.value.getDashboardData(filteredEvents.value);
    });
    const chartConfigs = computed(() => plugin.value.getChartData(filteredEvents.value));

    function handleShowDetail(event: EvtxEvent) {
      detailEvent.value = event;
    }

    return { plugin, filteredEvents, filterDefs, filterValues, tableColumns, dashboard, chartConfigs, detailEvent, handleShowDetail };
  },
});
</script>
