<template>
  <div class="flex flex-wrap items-center gap-1.5 text-xs">
    <span v-if="coverage.length" class="text-muted-foreground">Logs:</span>
    <span
      v-for="s in coverage"
      :key="s.channel"
      class="inline-flex h-5 items-center gap-1 rounded-md border px-1.5"
      :class="s.count ? 'bg-muted/50' : 'text-muted-foreground border-dashed'"
      :title="s.count ? `${s.count.toLocaleString()} events loaded` : s.offByDefault ? 'Not loaded. This log is disabled by default on Windows, so its absence is not evidence of absence.' : 'Not loaded'"
    >
      <CircleCheckIcon v-if="s.count" class="text-success size-3" aria-hidden="true" />
      <CircleDashedIcon v-else class="size-3" aria-hidden="true" />
      {{ shortChannel(s.channel) }}
      <span v-if="!s.count && s.offByDefault">(off by default)</span>
    </span>
    <template v-if="plugin.options?.length">
      <span v-if="coverage.length" class="bg-border mx-1 h-4 w-px"></span>
      <label v-for="o in plugin.options" :key="o.id" class="flex cursor-pointer items-center gap-1.5">
        <Switch :model-value="values[o.id]" size="sm" @update:model-value="(v: boolean) => $emit('update', o.id, v)" />
        {{ o.label }}
      </label>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CircleCheckIcon, CircleDashedIcon } from '@lucide/vue';
import type { Plugin } from '@/core/plugin';
import { Switch } from '@/components/ui/switch';
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
