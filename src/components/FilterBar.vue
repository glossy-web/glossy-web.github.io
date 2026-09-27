<template>
  <div class="filter-bar d-flex flex-wrap align-items-center gap-2 small">
    <span v-if="coverage.length" class="text-body-secondary">Logs:</span>
    <span
      v-for="s in coverage"
      :key="s.channel"
      class="badge border fw-normal"
      :class="s.count ? 'text-bg-light' : 'missing'"
      :title="s.count ? `${s.count.toLocaleString()} events loaded` : s.offByDefault ? 'Not loaded. This log is disabled by default on Windows, so its absence is not evidence of absence.' : 'Not loaded'"
    >
      <i :class="s.count ? 'bi bi-check2 text-success' : 'bi bi-dash-circle text-body-secondary'" aria-hidden="true"></i>
      {{ shortChannel(s.channel) }}
      <span v-if="!s.count && s.offByDefault" class="text-body-secondary">(off by default)</span>
    </span>
    <template v-if="plugin.options?.length">
      <span v-if="coverage.length" class="vr mx-1"></span>
      <label v-for="o in plugin.options" :key="o.id" class="form-check form-switch mb-0">
        <input
          class="form-check-input"
          type="checkbox"
          role="switch"
          :checked="values[o.id]"
          @change="$emit('update', o.id, ($event.target as HTMLInputElement).checked)"
        />
        {{ o.label }}
      </label>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Plugin } from '@/core/plugin';
import { eventStore } from '@/core/store';

const props = defineProps<{ plugin: Plugin; values: Record<string, boolean> }>();
defineEmits<{ update: [id: string, value: boolean] }>();

const coverage = computed(() => {
  void eventStore.version.value;
  const seen = new Map<string, { channel: string; count: number; offByDefault: boolean }>();
  for (const s of props.plugin.sources) {
    const entry = seen.get(s.channel) ?? { channel: s.channel, count: 0, offByDefault: !!s.offByDefault };
    entry.count = eventStore.channelCount(s.channel);
    seen.set(s.channel, entry);
  }
  return [...seen.values()];
});

function shortChannel(channel: string): string {
  return channel.replace(/^Microsoft-Windows-/, '');
}
</script>

<style scoped>
.badge {
  font-size: 11.5px;
}
.missing {
  background: transparent;
  color: var(--bs-secondary-color);
  border-style: dashed !important;
}
</style>
