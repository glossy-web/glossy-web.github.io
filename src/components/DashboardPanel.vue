<template>
  <div class="dashboard-panel px-4 py-3" v-if="data">
    <div class="row g-3">
      <div class="col-md-3 col-sm-6" v-for="(item, idx) in data.summary" :key="idx">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body text-center py-3">
            <div class="stat-value">{{ item.value }}</div>
            <div class="stat-label text-muted small">{{ item.title }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import type { DashboardData } from '@/core/plugin';

export default defineComponent({
  name: 'DashboardPanel',
  props: {
    data: { type: Object as PropType<DashboardData | null>, default: null },
    pluginName: { type: String, default: '' },
  },
});
</script>

<style scoped>
.stat-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: #0d6efd;
}
.stat-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.card {
  border-radius: 8px;
  transition: transform 0.15s;
}
.card:hover {
  transform: translateY(-2px);
}
</style>
