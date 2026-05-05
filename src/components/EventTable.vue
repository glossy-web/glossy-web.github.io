<template>
  <div class="event-table-wrapper d-flex flex-column flex-grow-1" style="min-height: 0">
    <div class="d-flex justify-content-between align-items-center mb-2 flex-shrink-0">
      <div class="d-flex align-items-center gap-2">
        <div class="input-group input-group-sm" style="width: 280px">
          <span class="input-group-text"><i class="fa fa-search"></i></span>
          <input type="text" class="form-control" v-model="searchText"
                 placeholder="Search events..." @input="onSearch" />
          <button v-if="searchText" class="btn btn-outline-secondary btn-sm" @click="searchText = ''; currentPage = 1">
            <i class="fa fa-times"></i>
          </button>
        </div>
        <select class="form-select form-select-sm" style="width: 80px" v-model.number="perPage" @change="currentPage = 1">
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="500">500</option>
          <option :value="1000">1000</option>
        </select>
      </div>
      <button class="btn btn-sm btn-outline-secondary" @click="exportCSV">
        <i class="fa fa-download"></i> Export CSV
      </button>
    </div>

    <div class="table-scroll" style="flex: 1 1 0; min-height: 600px; overflow-y: auto">
      <table class="table table-sm table-hover table-striped mb-0">
        <thead class="table-dark" style="position: sticky; top: 0; z-index: 2">
          <tr>
            <th v-for="col in columns" :key="col.key"
                :style="{ width: col.width || 'auto' }"
                class="sortable"
                @click="sortBy(col.key)">
              {{ col.label }}
              <span v-if="sortKey === col.key" class="ms-1">
                {{ sortAsc ? '▲' : '▼' }}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in paginatedEvents" :key="event.id"
              @click="$emit('show-detail', event)"
              style="cursor: pointer">
            <td v-for="col in columns" :key="col.key">
              <template v-if="col.render">
                {{ col.render(event) }}
              </template>
              <template v-else-if="col.key === 'timestamp'">
                {{ formatTimestamp(event.timestamp) }}
              </template>
              <template v-else-if="col.key === 'provider'">
                {{ event.provider }}
              </template>
              <template v-else-if="col.key === 'eventId'">
                {{ event.eventId }}
              </template>
              <template v-else-if="col.key === 'levelName'">
                <span :class="levelBadge(event.level)">{{ event.levelName }}</span>
              </template>
              <template v-else-if="col.key === 'channel'">
                {{ event.channel }}
              </template>
              <template v-else-if="col.key === 'computer'">
                {{ event.computer }}
              </template>
              <template v-else>
                {{ getEventData(event, col.key) }}
              </template>
            </td>
          </tr>
          <tr v-if="paginatedEvents.length === 0">
            <td :colspan="columns.length" class="text-center text-muted py-4">
              No events found matching the current filter.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="d-flex justify-content-between align-items-center mt-2 flex-shrink-0">
      <small class="text-muted">
        Showing {{ startIndex + 1 }}-{{ endIndex }} of {{ filteredEvents.length }} events
        ({{ events.length }} total)
      </small>
      <nav v-if="totalPages > 1">
        <ul class="pagination pagination-sm mb-0">
          <li class="page-item" :class="{ disabled: currentPage <= 1 }">
            <a class="page-link" href="#" @click.prevent="goToPage(1)">&laquo;</a>
          </li>
          <li class="page-item" :class="{ disabled: currentPage <= 1 }">
            <a class="page-link" href="#" @click.prevent="goToPage(currentPage - 1)">&lsaquo;</a>
          </li>
          <li class="page-item" v-for="p in pageNumbers" :key="p"
              :class="{ active: p === currentPage }">
            <a class="page-link" href="#" @click.prevent="goToPage(p)">{{ p }}</a>
          </li>
          <li class="page-item" :class="{ disabled: currentPage >= totalPages }">
            <a class="page-link" href="#" @click.prevent="goToPage(currentPage + 1)">&rsaquo;</a>
          </li>
          <li class="page-item" :class="{ disabled: currentPage >= totalPages }">
            <a class="page-link" href="#" @click.prevent="goToPage(totalPages)">&raquo;</a>
          </li>
        </ul>
      </nav>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref, PropType } from 'vue';
import type { EvtxEvent } from '@/core/evtx/types';
import type { TableColumn } from '@/core/plugin';
import dayjs from 'dayjs';

function searchableText(e: EvtxEvent): string {
  const parts = [e.provider, e.channel, e.computer, e.levelName];
  for (const v of Object.values(e.data || {})) {
    if (typeof v === 'string') parts.push(v);
  }
  return parts.join('\n').toLowerCase();
}

export default defineComponent({
  name: 'EventTable',
  props: {
    events: { type: Array as PropType<EvtxEvent[]>, required: true },
    columns: { type: Array as PropType<TableColumn[]>, required: true },
    pluginName: { type: String, default: '' },
  },
  emits: ['show-detail'],
  setup(props) {
    const searchText = ref('');
    const sortKey = ref<string | null>(null);
    const sortAsc = ref(true);
    const currentPage = ref(1);
    const perPage = ref(1000);

    const filteredEvents = computed(() => {
      let list = [...props.events];

      if (searchText.value) {
        const q = searchText.value.toLowerCase();
        list = list.filter(e => searchableText(e).includes(q));
      }

      if (sortKey.value) {
        const key = sortKey.value;
        const asc = sortAsc.value;
        const col = props.columns.find(c => c.key === key);
        const getVal = col?.render
          ? (e: EvtxEvent) => col.render!(e)
          : (e: EvtxEvent) => {
              if (key === 'timestamp') return e.timestamp.getTime();
              if (key === 'provider') return e.provider;
              if (key === 'eventId') return e.eventId;
              if (key === 'levelName') return e.level;
              if (key === 'channel') return e.channel;
              if (key === 'computer') return e.computer;
              return (e.data as Record<string, unknown>)[key] ?? '';
            };

        list.sort((a, b) => {
          let va: unknown = getVal(a);
          let vb: unknown = getVal(b);

          if (typeof va === 'string' && typeof vb === 'string') {
            return asc ? va.localeCompare(vb) : vb.localeCompare(va);
          }
          const na = Number(va);
          const nb = Number(vb);
          if (!isNaN(na) && !isNaN(nb)) {
            return asc ? na - nb : nb - na;
          }
          return 0;
        });
      }

      return list;
    });

    const totalPages = computed(() => Math.max(1, Math.ceil(filteredEvents.value.length / perPage.value)));
    const startIndex = computed(() => (currentPage.value - 1) * perPage.value);
    const endIndex = computed(() => Math.min(startIndex.value + perPage.value, filteredEvents.value.length));

    const paginatedEvents = computed(() =>
      filteredEvents.value.slice(startIndex.value, endIndex.value),
    );

    const pageNumbers = computed(() => {
      const pages: number[] = [];
      const total = totalPages.value;
      const current = currentPage.value;
      let start = Math.max(1, current - 2);
      let end = Math.min(total, current + 2);
      if (end - start < 4) {
        if (start === 1) end = Math.min(total, 5);
        else start = Math.max(1, end - 4);
      }
      for (let i = start; i <= end; i++) pages.push(i);
      return pages;
    });

    function onSearch() {
      currentPage.value = 1;
    }

    function sortBy(key: string) {
      if (sortKey.value === key) sortAsc.value = !sortAsc.value;
      else { sortKey.value = key; sortAsc.value = true; }
      currentPage.value = 1;
    }

    function goToPage(p: number) {
      if (p >= 1 && p <= totalPages.value) currentPage.value = p;
    }

    function formatTimestamp(ts: Date): string {
      return dayjs(ts).format('YYYY-MM-DD HH:mm:ss');
    }

    function levelBadge(level: number): string {
      if (level <= 2) return 'badge bg-danger';
      if (level === 3) return 'badge bg-warning text-dark';
      return 'badge bg-secondary';
    }

    function getEventData(event: EvtxEvent, key: string): string {
      return (event.data?.[key] as string) || '';
    }

    function exportCSV() {
      const rows = filteredEvents.value.map(e =>
        props.columns.map(c => {
          if (c.render) return c.render(e);
          if (c.key === 'timestamp') return formatTimestamp(e.timestamp);
          return getEventData(e, c.key) || String((e as unknown as Record<string, unknown>)[c.key] ?? '');
        }),
      );
      const header = props.columns.map(c => c.label).join(',');
      const csv = [header, ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `glossy_${props.pluginName}_export.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    return {
      searchText, sortKey, sortAsc, currentPage, perPage,
      filteredEvents, totalPages, startIndex, endIndex, paginatedEvents, pageNumbers,
      sortBy, goToPage, formatTimestamp, levelBadge, getEventData, exportCSV, onSearch,
    };
  },
});
</script>

<style scoped>
.table-scroll {
  background: #fff;
}
.sortable {
  cursor: pointer;
  user-select: none;
}
.sortable:hover {
  background: #3a3f44;
}
.table-hover tbody tr:hover {
  background: #e7f1ff;
}
</style>
