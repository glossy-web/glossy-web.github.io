<template>
  <div class="glossy-modal-overlay" @click.self="$emit('close')">
    <div class="glossy-modal-dialog">
      <div class="glossy-modal-content">
        <div class="modal-header border-bottom">
          <h5 class="modal-title">
            <span :class="levelBadge(event.level)">{{ event.levelName }}</span>
            Event #{{ event.eventId }} - {{ event.provider }}
          </h5>
          <button type="button" class="btn-close" @click="$emit('close')"></button>
        </div>
        <div class="modal-body">
          <table class="table table-sm table-bordered mb-3">
            <tbody>
              <tr><th class="bg-light" style="width: 150px">Timestamp</th><td>{{ formatTime(event.timestamp) }}</td></tr>
            <tr><th class="bg-light">Provider</th><td>{{ event.provider }} <small class="text-muted">{{ event.providerGuid }}</small></td></tr>
            <tr><th class="bg-light">Event ID</th><td>{{ event.eventId }}</td></tr>
            <tr><th class="bg-light">Level</th><td>{{ event.levelName }} ({{ event.level }})</td></tr>
            <tr><th class="bg-light">Task / Opcode</th><td>{{ event.task }} / {{ event.opcode }}</td></tr>
            <tr><th class="bg-light">Channel</th><td>{{ event.channel }}</td></tr>
            <tr><th class="bg-light">Computer</th><td>{{ event.computer }}</td></tr>
            <tr v-if="event.securityUserId"><th class="bg-light">Security User</th><td>{{ event.securityUserId }}</td></tr>
            <tr v-if="event.processId"><th class="bg-light">Process ID</th><td>{{ event.processId }}</td></tr>
            <tr><th class="bg-light">Source File</th><td>{{ event.sourceFile }}</td></tr>
            </tbody>
          </table>

          <h6 class="fw-bold" v-if="hasData">Event Data</h6>
          <table class="table table-sm table-bordered" v-if="hasData">
            <tbody>
              <tr v-for="(value, key) in event.data" :key="key">
                <th class="bg-light" style="width: 200px">{{ key }}</th>
                <td style="word-break: break-all">{{ value }}</td>
              </tr>
            </tbody>
          </table>

          <h6 class="fw-bold mt-3">Full JSON</h6>
          <pre class="json-view"><code>{{ jsonString }}</code></pre>
        </div>
        <div class="modal-footer border-top">
          <button class="btn btn-sm btn-outline-secondary" @click="copyJSON">Copy JSON</button>
          <button class="btn btn-sm btn-secondary" @click="$emit('close')">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed } from 'vue';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export default defineComponent({
  name: 'EventDetailModal',
  props: {
    event: { type: Object as PropType<EvtxEvent>, required: true },
  },
  emits: ['close'],
  setup(props) {
    const hasData = computed(() => Object.keys(props.event.data || {}).length > 0);
    const jsonString = computed(() => {
      const obj = {
        timestamp: props.event.timestamp.toISOString(),
        provider: props.event.provider,
        eventId: props.event.eventId,
        level: props.event.levelName,
        channel: props.event.channel,
        computer: props.event.computer,
        data: props.event.data,
      };
      return JSON.stringify(obj, null, 2);
    });

    function formatTime(ts: Date): string {
      return dayjs(ts).format('YYYY-MM-DD HH:mm:ss.SSS');
    }

    function levelBadge(level: number): string {
      if (level <= 2) return 'badge bg-danger';
      if (level === 3) return 'badge bg-warning text-dark';
      return 'badge bg-secondary';
    }

    function copyJSON() {
      navigator.clipboard.writeText(jsonString.value);
    }

    return { hasData, jsonString, formatTime, levelBadge, copyJSON };
  },
});
</script>

<style scoped>
.glossy-modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 1050;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 40px;
}
.glossy-modal-dialog {
  z-index: 1055;
  width: 90%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
}
.glossy-modal-content {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}
.glossy-modal-content .modal-body {
  overflow-y: auto;
  flex: 1;
  padding: 16px;
}
.glossy-modal-content .modal-header,
.glossy-modal-content .modal-footer {
  flex-shrink: 0;
  background: #fff;
}
.json-view {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 15px;
  border-radius: 6px;
  font-size: 12px;
  max-height: 400px;
  overflow: auto;
}
.json-view code {
  color: #ce9178;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
