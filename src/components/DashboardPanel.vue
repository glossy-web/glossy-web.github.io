<template>
  <div v-if="stats.length" class="flex flex-wrap gap-2">
    <div
      v-for="s in stats"
      :key="s.label"
      class="bg-card min-w-32 rounded-lg border px-3 py-1.5"
      :class="{ 'border-danger/40': s.tone === 'danger', 'border-warning/40': s.tone === 'warning' }"
    >
      <div class="text-lg leading-tight font-semibold tabular-nums">{{ typeof s.value === 'number' ? s.value.toLocaleString() : s.value }}</div>
      <div class="flex items-center gap-1 text-xs" :class="s.tone === 'danger' ? 'text-danger' : s.tone === 'warning' ? 'text-warning' : 'text-muted-foreground'">
        <TriangleAlertIcon v-if="s.tone === 'danger' || s.tone === 'warning'" class="size-3" aria-hidden="true" />{{ s.label }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { TriangleAlertIcon } from '@lucide/vue';
import type { Stat } from '@/core/plugin';

defineProps<{ stats: Stat[] }>();
</script>
