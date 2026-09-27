<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 *:shrink-0">
    <h1 class="flex items-center gap-2 text-base font-semibold"><ClipboardListIcon class="size-4" aria-hidden="true" />Overview</h1>

    <section v-if="loader.files.length" class="bg-card overflow-hidden rounded-lg border">
      <div class="flex items-center gap-2 border-b px-3 py-1.5 text-xs font-medium">
        Files
        <span v-if="loader.busy" class="text-muted-foreground font-normal">parsing in background workers…</span>
      </div>
      <div class="max-h-64 overflow-auto">
        <table class="w-full text-xs">
          <tbody>
            <tr v-for="(f, i) in loader.files" :key="i" class="border-b last:border-0">
              <td class="max-w-96 truncate px-3 py-1" :title="f.name">{{ f.name }}</td>
              <td class="text-muted-foreground px-3 py-1 text-right tabular-nums">{{ formatBytes(f.size) }}</td>
              <td class="w-48 px-3 py-1">
                <div
                  v-if="f.status === 'parsing' || f.status === 'reading'"
                  class="bg-muted h-2 overflow-hidden rounded-full"
                  role="progressbar"
                  :aria-valuenow="Math.round(f.progress * 100)"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-label="`Parsing ${f.name}`"
                >
                  <div class="bg-primary h-full transition-[width]" :style="{ width: `${Math.round(f.progress * 100)}%` }"></div>
                </div>
                <span v-else class="flex items-center gap-1" :class="statusClass(f.status)"><component :is="statusIcon(f.status)" class="size-3.5" aria-hidden="true" />{{ f.status }}</span>
              </td>
              <td class="text-muted-foreground px-3 py-1">{{ f.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <DashboardPanel :stats="stats" />

    <Alert v-for="(f, i) in findings" :key="i" :class="f.tone === 'warning' ? 'border-warning/40 text-warning' : ''">
      <TriangleAlertIcon v-if="f.tone === 'warning'" />
      <InfoIcon v-else />
      <AlertDescription :class="f.tone === 'warning' ? 'text-warning' : ''">{{ f.text }}</AlertDescription>
    </Alert>

    <section class="bg-card overflow-hidden rounded-lg border">
      <div class="border-b px-3 py-1.5 text-xs font-medium">Source files ({{ sources.length }})</div>
      <div class="overflow-auto">
        <table class="w-full text-xs">
          <thead class="bg-muted/50 text-muted-foreground">
            <tr class="[&>th]:px-3 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium [&>th]:whitespace-nowrap">
              <th>File</th>
              <th class="text-right!">Records</th>
              <th>Computers</th>
              <th>Channels</th>
              <th>First</th>
              <th>Last</th>
              <th>Header</th>
              <th class="text-right!" title="Missing record numbers between the first and last record in the file">Missing</th>
              <th class="text-right!">Errors</th>
              <th>SHA-256</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in sources" :key="s.index" class="hover:bg-muted/40 border-t align-top [&>td]:px-3 [&>td]:py-1">
              <td class="max-w-64 truncate" :title="s.name">{{ s.name }}</td>
              <td class="text-right tabular-nums">
                {{ s.added.toLocaleString() }}
                <div v-if="s.duplicates" class="text-muted-foreground" title="Records already loaded from another file">+{{ s.duplicates.toLocaleString() }} dup</div>
              </td>
              <td>{{ s.computers.join(', ') }}</td>
              <td class="max-w-56 truncate" :title="s.channels.join('\n')">{{ s.channels.join(', ') }}</td>
              <td class="whitespace-nowrap tabular-nums">{{ s.firstTs === null ? '' : formatTime(s.firstTs, timeZone) }}</td>
              <td class="whitespace-nowrap tabular-nums">{{ s.lastTs === null ? '' : formatTime(s.lastTs, timeZone) }}</td>
              <td class="whitespace-nowrap">
                <Badge v-if="s.report.header.dirty" variant="outline" title="Not cleanly closed (typical for a copy of a live log); all chunks were still read">dirty</Badge>
                <Badge v-if="s.report.header.full" variant="outline" class="ml-1">full</Badge>
                <span v-if="s.report.recordsBeyondHeader" class="text-muted-foreground ml-1" :title="`${s.report.recordsBeyondHeader} records came from chunks the header does not count`">+{{ s.report.recordsBeyondHeader.toLocaleString() }}</span>
              </td>
              <td class="text-right tabular-nums" :class="{ 'text-warning font-semibold': s.missingRecords }" :title="gapTitle(s)">
                {{ s.missingRecords ? s.missingRecords.toLocaleString() : '' }}
              </td>
              <td class="text-right tabular-nums" :title="errorTitle(s)">{{ errorCount(s) || '' }}</td>
              <td class="font-mono text-[11px]" :title="s.sha256">{{ s.sha256.slice(0, 12) }}…</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="grid gap-3 lg:grid-cols-2">
      <section class="bg-card overflow-hidden rounded-lg border">
        <div class="border-b px-3 py-1.5 text-xs font-medium">Log coverage</div>
        <table class="w-full text-xs">
          <tbody>
            <tr v-for="c in coverage" :key="c.channel" class="border-t first:border-0 [&>td]:px-3 [&>td]:py-1">
              <td>
                <span class="flex items-center gap-1">
                  <CircleCheckIcon v-if="c.count" class="text-success size-3.5" aria-hidden="true" />
                  <CircleDashedIcon v-else class="text-muted-foreground size-3.5" aria-hidden="true" />
                  {{ c.channel.replace(/^Microsoft-Windows-/, '') }}
                </span>
                <div class="text-muted-foreground pl-4.5">{{ c.why }}<span v-if="!c.count && c.offByDefault"> · disabled by default</span></div>
              </td>
              <td class="text-right align-top tabular-nums" :class="{ 'text-muted-foreground': !c.count }">{{ c.count ? c.count.toLocaleString() : 'not loaded' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section class="bg-card overflow-hidden rounded-lg border">
        <div class="border-b px-3 py-1.5 text-xs font-medium">Most frequent events</div>
        <table class="w-full text-xs">
          <thead class="bg-muted/50 text-muted-foreground">
            <tr class="[&>th]:px-3 [&>th]:py-1.5 [&>th]:font-medium"><th class="text-left">Provider</th><th class="text-right">Event ID</th><th class="text-right">Count</th></tr>
          </thead>
          <tbody>
            <tr v-for="t in topEvents" :key="t.key" class="border-t [&>td]:px-3 [&>td]:py-1">
              <td class="max-w-80 truncate">{{ t.provider }}</td>
              <td class="text-right tabular-nums">{{ t.eventId }}</td>
              <td class="text-right tabular-nums">{{ t.count.toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { CircleCheckIcon, CircleDashedIcon, CircleXIcon, ClipboardListIcon, HourglassIcon, InfoIcon, SkipForwardIcon, TriangleAlertIcon } from '@lucide/vue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { SourceFile } from '@/core/evtx/types';
import type { Note, Stat } from '@/core/plugin';
import { eventStore } from '@/core/store';
import { KEY_CHANNELS } from '@/core/settings';
import { formatTime, offsetLabel } from '@/core/time';
import { formatBytes } from '@/core/format';
import { loader, type FileProgress } from '@/composables/useFileLoader';
import { timeZone } from '@/composables/useGlossyStore';
import DashboardPanel from './DashboardPanel.vue';

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
    ...(Number.isFinite(first) ? [{ label: `Earliest (${offsetLabel(timeZone.value, first)})`, value: formatTime(first, timeZone.value).slice(0, 19) }] : []),
    ...(Number.isFinite(last) ? [{ label: `Latest (${offsetLabel(timeZone.value, last)})`, value: formatTime(last, timeZone.value).slice(0, 19) }] : []),
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

function statusIcon(status: FileProgress['status']): Component {
  if (status === 'done') return CircleCheckIcon;
  if (status === 'failed') return CircleXIcon;
  if (status === 'skipped') return SkipForwardIcon;
  return HourglassIcon;
}

function statusClass(status: FileProgress['status']): string {
  if (status === 'done') return 'text-success';
  if (status === 'failed') return 'text-danger';
  return 'text-muted-foreground';
}
</script>
