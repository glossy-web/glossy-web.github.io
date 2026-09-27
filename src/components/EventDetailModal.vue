<template>
  <div class="overlay" @click.self="$emit('close')">
    <div
      ref="dialog"
      class="dialog shadow-lg rounded border"
      role="dialog"
      aria-modal="true"
      :aria-label="`Event ${event.eventId} from ${event.provider}`"
      tabindex="-1"
      @keydown.esc="$emit('close')"
    >
      <header class="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
        <span class="badge" :class="levelClass">{{ levelName(event.level) }}</span>
        <h2 class="h6 mb-0 text-truncate">Event {{ event.eventId }} · {{ event.provider }}</h2>
        <button type="button" class="btn-close ms-auto" aria-label="Close" @click="$emit('close')"></button>
      </header>

      <nav class="px-3 pt-2">
        <ul class="nav nav-tabs small">
          <li v-for="t in tabs" :key="t.id" class="nav-item">
            <button type="button" class="nav-link" :class="{ active: tab === t.id }" @click="select(t.id)">{{ t.label }}</button>
          </li>
        </ul>
      </nav>

      <div class="body px-3 py-2">
        <template v-if="tab === 'general'">
          <table class="table table-sm kv mb-3">
            <tbody>
              <tr><th>Time ({{ zoneLabel }})</th><td class="tabular">{{ formatTime(event.ts, zone) }}</td></tr>
              <tr><th>SystemTime (UTC)</th><td class="font-monospace">{{ event.time }}</td></tr>
              <tr><th>Provider</th><td>{{ event.provider }}</td></tr>
              <tr><th>Event ID</th><td>{{ event.eventId }}<span v-if="event.qualifiers !== null" class="text-body-secondary"> (Qualifiers {{ event.qualifiers }})</span></td></tr>
              <tr><th>Channel</th><td>{{ event.channel }}</td></tr>
              <tr><th>Computer</th><td>{{ event.computer }}</td></tr>
              <tr><th>Level / Task / Opcode</th><td>{{ event.level }} / {{ event.task ?? '-' }} / {{ event.opcode ?? '-' }}</td></tr>
              <tr><th>Keywords</th><td class="font-monospace">{{ event.keywords }}</td></tr>
              <tr v-if="event.userSid"><th>User SID</th><td class="font-monospace">{{ event.userSid }}<span v-if="sidName" class="text-body-secondary"> ({{ sidName }})</span></td></tr>
              <tr v-if="event.pid !== null"><th>Process / Thread ID</th><td class="tabular">{{ event.pid }} / {{ event.tid }}</td></tr>
              <tr v-if="event.activityId"><th>Activity ID</th><td class="font-monospace">{{ event.activityId }}</td></tr>
              <tr><th>EventRecordID</th><td class="tabular">{{ event.recordId }}</td></tr>
              <tr><th>Source file</th><td>{{ source?.name }} <span class="text-body-secondary">(record {{ event.seq }}, chunk {{ event.chunk }})</span></td></tr>
            </tbody>
          </table>

          <h3 class="h6">{{ event.payload || 'Event data' }}</h3>
          <table v-if="dataRows.length" class="table table-sm kv mb-2">
            <tbody>
              <tr v-for="[key, value] in dataRows" :key="key">
                <th>{{ key }}</th>
                <td class="font-monospace value">{{ value }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-body-secondary small">No event data.</p>

          <template v-if="event.message">
            <h3 class="h6 mt-3">Rendered message (from the forwarding host)</h3>
            <pre class="raw">{{ event.message }}</pre>
          </template>
        </template>

        <template v-else-if="tab === 'xml'">
          <p v-if="xmlState === 'loading'" class="text-body-secondary small">Rendering from the source file…</p>
          <p v-else-if="xmlState === 'failed'" class="text-danger small">The record could not be re-read from the source file.</p>
          <pre v-else class="raw">{{ xml }}</pre>
        </template>

        <pre v-else class="raw">{{ json }}</pre>
      </div>

      <footer class="d-flex gap-2 px-3 py-2 border-top">
        <button class="btn btn-sm btn-outline-secondary" @click="copy">
          <i class="bi bi-clipboard"></i> {{ copied ? 'Copied' : `Copy ${tab === 'xml' ? 'XML' : 'JSON'}` }}
        </button>
        <button class="btn btn-sm btn-secondary ms-auto" @click="$emit('close')">Close</button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import type { EvtxEvent } from '@/core/evtx/types';
import { levelName } from '@/core/evtx/types';
import { formatTime, offsetLabel, UTC } from '@/core/time';
import { eventStore } from '@/core/store';
import { createContext } from '@/core/context';
import { renderXml } from '@/composables/useFileLoader';

const props = defineProps<{ event: EvtxEvent; zone: string }>();
defineEmits<{ close: [] }>();

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'xml', label: 'XML' },
  { id: 'json', label: 'JSON' },
] as const;
const tab = ref<(typeof tabs)[number]['id']>('general');
const dialog = ref<HTMLElement | null>(null);
const copied = ref(false);
const xml = ref('');
const xmlState = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle');

const source = computed(() => eventStore.sources.find(s => s.index === props.event.src));
const sidName = computed(() => createContext(eventStore).sidName(props.event.userSid));
const zoneLabel = computed(() => (props.zone === UTC ? 'UTC' : `${props.zone}, ${offsetLabel(props.zone, props.event.ts)}`));
const levelClass = computed(() => {
  const l = props.event.level;
  if (l === 1 || l === 2) return 'text-bg-danger';
  if (l === 3) return 'text-bg-warning';
  return 'text-bg-secondary';
});
const dataRows = computed(() => [
  ...Object.entries(props.event.data),
  ...props.event.list.map((v, i) => [`Data[${i}]`, v] as [string, string]),
]);
const json = computed(() => {
  const { id: _id, src: _src, ...rest } = props.event;
  return JSON.stringify({ ...rest, sourceFile: source.value?.name }, null, 2);
});

async function select(id: (typeof tabs)[number]['id']) {
  tab.value = id;
  if (id === 'xml' && xmlState.value === 'idle') {
    xmlState.value = 'loading';
    const out = await renderXml(props.event).catch(() => null);
    xml.value = out ?? '';
    xmlState.value = out ? 'ready' : 'failed';
  }
}

async function copy() {
  await navigator.clipboard.writeText(tab.value === 'xml' ? xml.value : json.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

onMounted(() => nextTick(() => dialog.value?.focus()));
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1050;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 16px;
}
.dialog {
  background: var(--bs-body-bg);
  width: min(960px, 100%);
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  outline: none;
}
.body {
  overflow: auto;
  flex: 1;
}
.kv th {
  width: 200px;
  color: var(--bs-secondary-color);
  font-weight: 500;
  white-space: nowrap;
}
.kv td.value {
  white-space: pre-wrap;
  word-break: break-all;
}
.raw {
  background: var(--bs-tertiary-bg);
  border: 1px solid var(--bs-border-color);
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
