<template>
  <div v-if="stats.length" class="stats d-flex flex-wrap gap-2">
    <div v-for="s in stats" :key="s.label" class="stat border rounded px-3 py-2" :class="s.tone ? `tone-${s.tone}` : ''">
      <div class="value">{{ typeof s.value === 'number' ? s.value.toLocaleString() : s.value }}</div>
      <div class="label small text-body-secondary">
        <i v-if="s.tone === 'danger' || s.tone === 'warning'" class="bi bi-exclamation-triangle-fill me-1" aria-hidden="true"></i>{{ s.label }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Stat } from '@/core/plugin';

defineProps<{ stats: Stat[] }>();
</script>

<style scoped>
.stat {
  min-width: 140px;
  background: var(--bs-body-bg);
}
.value {
  font-size: 1.35rem;
  font-weight: 600;
  line-height: 1.2;
}
.tone-danger {
  border-color: var(--bs-danger-border-subtle) !important;
}
.tone-danger .label {
  color: var(--bs-danger-text-emphasis) !important;
}
.tone-warning {
  border-color: var(--bs-warning-border-subtle) !important;
}
.tone-warning .label {
  color: var(--bs-warning-text-emphasis) !important;
}
</style>
