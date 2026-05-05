<template>
  <div class="source-list">
    <div class="px-4 py-3 border-bottom bg-white">
      <h5 class="mb-0"><i class="fa fa-database me-2"></i>Source Overview</h5>
    </div>

    <div class="row g-3 p-4" v-if="statistics">
      <div class="col-sm-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body text-center py-3">
            <div class="stat-value">{{ statistics.totalEvents }}</div>
            <div class="stat-label">Total Events</div>
          </div>
        </div>
      </div>
      <div class="col-sm-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body text-center py-3">
            <div class="stat-value">{{ sources.length }}</div>
            <div class="stat-label">Source Files</div>
          </div>
        </div>
      </div>
      <div class="col-sm-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body text-center py-3">
            <div class="stat-value">{{ statistics.providers.length }}</div>
            <div class="stat-label">Unique Providers</div>
          </div>
        </div>
      </div>
      <div class="col-sm-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body text-center py-3">
            <div class="stat-value">{{ statistics.computers.length }}</div>
            <div class="stat-label">Computers</div>
          </div>
        </div>
      </div>
    </div>

    <div class="px-4 mb-4">
      <h6 class="fw-bold">Source Files</h6>
      <table class="table table-sm table-hover">
        <thead class="table-dark">
          <tr>
            <th>File Name</th>
            <th>Events</th>
            <th>Errors</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="src in sources" :key="src.id">
            <td><i class="fa fa-file-text-o me-2 text-muted"></i>{{ src.name }}</td>
            <td>{{ src.eventCount }}</td>
            <td>
              <span v-if="src.errors.length > 0" class="text-danger">
                {{ src.errors.length }}
              </span>
              <span v-else class="text-success">0</span>
            </td>
            <td>
              <span v-if="src.errors.length > 0" class="badge bg-warning">Warnings</span>
              <span v-else class="badge bg-success">OK</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="px-4 mb-4" v-if="statistics.providers.length > 0">
      <div class="row">
        <div class="col-md-6">
          <h6 class="fw-bold">Top Providers</h6>
          <table class="table table-sm">
            <tbody>
              <tr v-for="p in statistics.providers.slice(0, 10)" :key="p.name">
                <td class="text-truncate" style="max-width: 300px">{{ p.name }}</td>
                <td class="text-end">{{ p.count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="col-md-6" v-if="timeRange">
          <h6 class="fw-bold">Time Range</h6>
          <p>
            <strong>From:</strong> {{ timeRange.earliest }}<br />
            <strong>To:</strong> {{ timeRange.latest }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed } from 'vue';
import type { EventSource } from '@/core/store';
import dayjs from 'dayjs';

export default defineComponent({
  name: 'SourceList',
  props: {
    sources: { type: Array as PropType<EventSource[]>, required: true },
    statistics: { type: Object as PropType<ReturnType<typeof import('@/core/store').eventStore.getStatistics>>, default: null },
  },
  setup(props) {
    const timeRange = computed(() => {
      if (!props.statistics?.timeRange.earliest) return null;
      return {
        earliest: dayjs(props.statistics.timeRange.earliest).format('YYYY-MM-DD HH:mm:ss'),
        latest: props.statistics.timeRange.latest
          ? dayjs(props.statistics.timeRange.latest).format('YYYY-MM-DD HH:mm:ss')
          : 'now',
      };
    });
    return { timeRange };
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
  color: #6c757d;
}
.card {
  border-radius: 8px;
  transition: transform 0.15s;
}
.card:hover {
  transform: translateY(-2px);
}
</style>
