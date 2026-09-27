<template>
  <div class="overview p-3 d-flex flex-column gap-3">
    <h1 class="h5 mb-0"><i class="bi bi-clipboard-data me-2" aria-hidden="true"></i>Overview</h1>

    <section v-if="loader.files.length" class="card">
      <div class="card-header py-2 small fw-semibold d-flex">
        Files
        <span v-if="loader.busy" class="ms-2 text-body-secondary fw-normal">parsing in background workers…</span>
      </div>
      <div class="table-responsive">
        <table class="table table-sm mb-0 small align-middle">
          <tbody>
            <tr v-for="(f, i) in loader.files" :key="i">
              <td class="text-truncate" style="max-width: 360px" :title="f.name">{{ f.name }}</td>
              <td class="text-end tabular text-body-secondary">{{ formatBytes(f.size) }}</td>
              <td style="width: 180px">
                <div v-if="f.status === 'parsing' || f.status === 'reading'" class="progress" role="progressbar" :aria-valuenow="Math.round(f.progress * 100)" aria-valuemin="0" aria-valuemax="100" :aria-label="`Parsing ${f.name}`">
                  <div class="progress-bar" :style="{ width: `${Math.round(f.progress * 100)}%` }"></div>
                </div>
                <span v-else :class="statusClass(f.status)"><i :class="statusIcon(f.status)" aria-hidden="true"></i> {{ f.status }}</span>
              </td>
              <td class="text-body-secondary">{{ f.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <DashboardPanel :stats="stats" />

    <section v-if="findings.length" class="d-flex flex-column gap-2">
      <div v-for="(f, i) in findings" :key="i" class="alert py-2 mb-0 small" :class="f.tone === 'warning' ? 'alert-warning' : 'alert-secondary'">
        <i :class="f.tone === 'warning' ? 'bi bi-exclamation-triangle me-1' : 'bi bi-info-circle me-1'" aria-hidden="true"></i>{{ f.text }}
      </div>
    </section>

    <section class="card">
      <div class="card-header py-2 small fw-semibold">Source files ({{ sources.length }})</div>
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0 small align-middle">
          <thead>
            <tr>
              <th>File</th>
              <th class="text-end">Records</th>
              <th>Computers</th>
              <th>Channels</th>
              <th>First</th>
              <th>Last</th>
              <th>Header</th>
              <th class="text-end" title="Missing record numbers between the first and last record in the file">Missing</th>
              <th class="text-end">Errors</th>
              <th>SHA-256</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in sources" :key="s.index">
              <td class="text-truncate" style="max-width: 260px" :title="s.name">{{ s.name }}</td>
              <td class="text-end tabular">
                {{ s.added.toLocaleString() }}
                <div v-if="s.duplicates" class="text-body-secondary" title="Records already loaded from another file">+{{ s.duplicates.toLocaleString() }} dup</div>
              </td>
              <td>{{ s.computers.join(', ') }}</td>
              <td class="text-truncate" style="max-width: 220px" :title="s.channels.join('\n')">{{ s.channels.join(', ') }}</td>
              <td class="tabular text-nowrap">{{ s.firstTs === null ? '' : formatTime(s.firstTs, zone) }}</td>
              <td class="tabular text-nowrap">{{ s.lastTs === null ? '' : formatTime(s.lastTs, zone) }}</td>
              <td>
                <span v-if="s.report.header.dirty" class="badge text-bg-light border" title="Not cleanly closed (typical for a copy of a live log); all chunks were still read">dirty</span>
                <span v-if="s.report.header.full" class="badge text-bg-light border ms-1">full</span>
                <span v-if="s.report.recordsBeyondHeader" class="text-body-secondary ms-1" :title="`${s.report.recordsBeyondHeader} records came from chunks the header does not count`">+{{ s.report.recordsBeyondHeader.toLocaleString() }}</span>
              </td>
              <td class="text-end tabular" :class="{ 'text-warning-emphasis fw-semibold': s.missingRecords }" :title="gapTitle(s)">
                {{ s.missingRecords ? s.missingRecords.toLocaleString() : '' }}
              </td>
              <td class="text-end tabular" :title="errorTitle(s)">{{ errorCount(s) || '' }}</td>
              <td class="font-monospace sha" :title="s.sha256">{{ s.sha256.slice(0, 12) }}…</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="row g-3">
      <section class="col-lg-6">
        <div class="card h-100">
          <div class="card-header py-2 small fw-semibold">Log coverage</div>
          <table class="table table-sm mb-0 small">
            <tbody>
              <tr v-for="c in coverage" :key="c.channel">
                <td>
                  <i :class="c.count ? 'bi bi-check2 text-success' : 'bi bi-dash-circle text-body-secondary'" aria-hidden="true"></i>
                  {{ c.channel.replace(/^Microsoft-Windows-/, '') }}
                  <div class="text-body-secondary">{{ c.why }}<span v-if="!c.count && c.offByDefault"> · disabled by default</span></div>
                </td>
                <td class="text-end tabular">{{ c.count ? c.count.toLocaleString() : 'not loaded' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="col-lg-6">
        <div class="card h-100">
          <div class="card-header py-2 small fw-semibold">Most frequent events</div>
          <table class="table table-sm mb-0 small">
            <thead>
              <tr><th>Provider</th><th class="text-end">Event ID</th><th class="text-end">Count</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in topEvents" :key="t.key">
                <td class="text-truncate" style="max-width: 320px">{{ t.provider }}</td>
                <td class="text-end tabular">{{ t.eventId }}</td>
                <td class="text-end tabular">{{ t.count.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SourceFile } from '@/core/evtx/types';
import type { Note, Stat } from '@/core/plugin';
import { eventStore } from '@/core/store';
import { KEY_CHANNELS } from '@/core/settings';
import { formatTime, offsetLabel } from '@/core/time';
import { formatBytes } from '@/core/format';
import { loader, type FileProgress } from '@/composables/useFileLoader';
import DashboardPanel from './DashboardPanel.vue';

const props = defineProps<{ zone: string }>();

const sources = computed(() => {
  void eventStore.version.value;
  return [...eventStore.sources];
});

const stats = computed<Stat[]>(() => {
  void eventStore.version.value;
  const list = sources.value;
  const first = Math.min(...list.map(s => s.firstTs ?? Infinity));
  const last = Math.max(...list.map(s => s.lastTs ?? -Infinity));
  const computers = new Set(list.flatMap(s => s.computers));
  return [
    { label: 'Events', value: eventStore.size },
    { label: 'Files', value: list.length },
    { label: 'Computers', value: computers.size },
    { label: 'Channels', value: eventStore.channels().length },
    ...(Number.isFinite(first) ? [{ label: `Earliest (${offsetLabel(props.zone, first)})`, value: formatTime(first, props.zone).slice(0, 19) }] : []),
    ...(Number.isFinite(last) ? [{ label: `Latest (${offsetLabel(props.zone, last)})`, value: formatTime(last, props.zone).slice(0, 19) }] : []),
  ];
});

const findings = computed<Note[]>(() => {
  const list = sources.value;
  const out: Note[] = [];
  const gaps = list.filter(s => s.missingRecords > 0);
  if (gaps.length)
    out.push({
      tone: 'warning',
      text: `${gaps.length} file(s) have missing record numbers (${gaps.map(s => `${s.name}: ${s.missingRecords.toLocaleString()}`).join(', ')}). Records inside a log are numbered consecutively; holes can mean selective deletion, a damaged chunk, or a partial copy.`,
    });
  const errors = list.filter(s => errorCount(s) > 0);
  if (errors.length)
    out.push({ tone: 'warning', text: `${errors.length} file(s) contain chunks or records that could not be decoded; everything else in those files was read.` });
  const reversed = list.filter(s => s.timeReversals > 0);
  if (reversed.length)
    out.push({
      tone: 'info',
      text: `${reversed.length} file(s) have records whose time goes backwards by more than a second relative to the previous record (${reversed.map(s => `${s.name}: ${s.timeReversals}`).join(', ')}). Check Time Change for clock adjustments.`,
    });
  const dup = list.reduce((n, s) => n + s.duplicates, 0);
  if (dup) out.push({ tone: 'info', text: `${dup.toLocaleString()} records were already loaded from another file (e.g. a shadow copy or archive) and were not added twice.` });
  return out;
});

const coverage = computed(() => {
  void eventStore.version.value;
  return KEY_CHANNELS.map(c => ({ ...c, count: eventStore.channelCount(c.channel) }));
});

const topEvents = computed(() => {
  void eventStore.version.value;
  const counts = new Map<string, { key: string; provider: string; eventId: number; count: number }>();
  for (const e of eventStore.events) {
    const key = `${e.provider}\u0001${e.eventId}`;
    const hit = counts.get(key);
    if (hit) hit.count++;
    else counts.set(key, { key, provider: e.provider, eventId: e.eventId, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 20);
});

function errorCount(s: SourceFile): number {
  return s.report.chunkErrors.length + s.report.recordErrors;
}

function errorTitle(s: SourceFile): string {
  return [...s.report.chunkErrors.map(e => `chunk ${e.chunk}: ${e.message}`), ...s.report.recordErrorSamples].join('\n');
}

function gapTitle(s: SourceFile): string {
  if (!s.gaps.length) return '';
  const shown = s.gaps.slice(0, 20).map(g => (g.from === g.to ? `${g.from}` : `${g.from}–${g.to}`));
  return `Missing record numbers: ${shown.join(', ')}${s.gaps.length > 20 ? ` … (${s.gaps.length} ranges)` : ''}`;
}

function statusIcon(status: FileProgress['status']): string {
  if (status === 'done') return 'bi bi-check2';
  if (status === 'failed') return 'bi bi-x-circle';
  if (status === 'skipped') return 'bi bi-skip-forward';
  return 'bi bi-hourglass';
}

function statusClass(status: FileProgress['status']): string {
  if (status === 'done') return 'text-success-emphasis';
  if (status === 'failed') return 'text-danger-emphasis';
  return 'text-body-secondary';
}
</script>

<style scoped>
.overview {
  overflow: auto;
}
.tabular {
  font-variant-numeric: tabular-nums;
}
.sha {
  font-size: 11px;
}
.progress {
  height: 10px;
}
</style>
