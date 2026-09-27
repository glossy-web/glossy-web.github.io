<template>
  <nav class="sidebar border-end" aria-label="Analysis">
    <ul class="list-unstyled mb-0 py-2">
      <li>
        <a href="#" class="item" :class="{ active: active === '__overview' }" @click.prevent="$emit('select', '__overview')">
          <i class="bi bi-clipboard-data" aria-hidden="true"></i><span>Overview</span>
        </a>
      </li>
      <li>
        <a href="#" class="item" :class="{ active: active === 'showAll' }" @click.prevent="$emit('select', 'showAll')">
          <i class="bi bi-list-ul" aria-hidden="true"></i><span>All Events</span>
          <span class="count">{{ total.toLocaleString() }}</span>
        </a>
      </li>
      <li>
        <a href="#" class="item" :class="{ active: active === 'timeline' }" @click.prevent="$emit('select', 'timeline')">
          <i class="bi bi-clock-history" aria-hidden="true"></i><span>Timeline</span>
        </a>
      </li>
      <li v-for="cat in groups" :key="cat.id" class="mt-2">
        <div class="category"><i :class="`bi bi-${cat.icon}`" aria-hidden="true"></i>{{ cat.label }}</div>
        <ul class="list-unstyled">
          <li v-for="p in cat.plugins" :key="p.name">
            <a
              href="#"
              class="item"
              :class="{ active: active === p.name, empty: !counts[p.name] }"
              :title="counts[p.name] ? '' : 'No matching events in the loaded logs'"
              @click.prevent="$emit('select', p.name)"
            >
              <i :class="`bi bi-${p.icon}`" aria-hidden="true"></i><span>{{ p.label }}</span>
              <span class="count">{{ (counts[p.name] ?? 0).toLocaleString() }}</span>
            </a>
          </li>
        </ul>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CATEGORIES } from '@/core/settings';
import { eventStore } from '@/core/store';
import { plugins } from '@/plugins';

defineProps<{ active: string }>();
defineEmits<{ select: [name: string] }>();

const groups = computed(() =>
  CATEGORIES.map(c => ({ ...c, plugins: plugins.filter(p => p.category === c.id) })).filter(c => c.plugins.length),
);
const total = computed(() => {
  void eventStore.version.value;
  return eventStore.size;
});
const counts = computed(() => {
  void eventStore.version.value;
  return Object.fromEntries(plugins.map(p => [p.name, eventStore.count(p.sources)]));
});
</script>

<style scoped>
.sidebar {
  width: 240px;
  min-width: 240px;
  overflow-y: auto;
  font-size: 13px;
  background: var(--bs-body-bg);
}
.category {
  padding: 6px 16px 2px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--bs-secondary-color);
}
.category .bi {
  margin-right: 6px;
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 16px;
  color: var(--bs-body-color);
  text-decoration: none;
  border-left: 3px solid transparent;
}
.item:hover {
  background: var(--bs-tertiary-bg);
}
.item.active {
  background: var(--bs-primary-bg-subtle);
  border-left-color: var(--bs-primary);
  font-weight: 600;
}
.item.empty span:not(.count) {
  color: var(--bs-secondary-color);
}
.count {
  margin-left: auto;
  font-size: 11px;
  color: var(--bs-secondary-color);
  font-variant-numeric: tabular-nums;
}
</style>
