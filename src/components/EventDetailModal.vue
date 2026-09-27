<template>
  <Dialog :open="true" @update:open="(v: boolean) => !v && $emit('close')">
    <DialogContent class="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-4xl">
      <DialogHeader class="flex-row items-center gap-2 border-b px-4 py-2.5">
        <Badge :variant="level.variant" :class="level.class">{{ levelName(event.level) }}</Badge>
        <DialogTitle class="truncate text-sm">Event {{ event.eventId }} · {{ event.provider }}</DialogTitle>
        <DialogDescription class="sr-only">Record {{ event.recordId }} from {{ source?.name }}</DialogDescription>
      </DialogHeader>

      <Tabs :model-value="tab" class="min-h-0 flex-1 gap-0" @update:model-value="v => select(v as TabId)">
        <TabsList variant="line" class="px-3 pt-1.5">
          <TabsTrigger v-for="t in tabs" :key="t.id" :value="t.id" class="flex-none">{{ t.label }}</TabsTrigger>
        </TabsList>
        <div class="min-h-0 flex-1 overflow-auto px-4 py-3">
          <template v-if="tab === 'general'">
            <template v-if="extra">
              <h3 class="mb-1.5 text-xs font-semibold">{{ extra.title }}</h3>
              <pre class="bg-muted/50 mb-3 max-h-[45vh] overflow-auto rounded-md border p-2.5 font-mono text-[11px] break-all whitespace-pre-wrap">{{ extra.text }}</pre>
            </template>
            <table class="mb-3 w-full text-xs">
              <tbody class="[&_th]:text-muted-foreground [&_td]:py-0.5 [&_th]:w-48 [&_th]:py-0.5 [&_th]:pr-3 [&_th]:text-left [&_th]:align-top [&_th]:font-medium [&_th]:whitespace-nowrap">
                <tr><th>Time ({{ zone }})</th><td class="tabular-nums">{{ formatTime(event.ts, zone) }}</td></tr>
                <tr><th>SystemTime (UTC)</th><td class="font-mono">{{ event.time }}</td></tr>
                <tr><th>Provider</th><td>{{ event.provider }}</td></tr>
                <tr><th>Event ID</th><td>{{ event.eventId }}<span v-if="event.qualifiers !== null" class="text-muted-foreground"> (Qualifiers {{ event.qualifiers }})</span></td></tr>
                <tr><th>Channel</th><td>{{ event.channel }}</td></tr>
                <tr><th>Computer</th><td>{{ event.computer }}</td></tr>
                <tr><th>Level / Task / Opcode</th><td>{{ event.level }} / {{ event.task ?? '-' }} / {{ event.opcode ?? '-' }}</td></tr>
                <tr><th>Keywords</th><td class="font-mono">{{ event.keywords }}</td></tr>
                <tr v-if="event.userSid"><th>User SID</th><td class="font-mono">{{ event.userSid }}<span v-if="sidName" class="text-muted-foreground"> ({{ sidName }})</span></td></tr>
                <tr v-if="event.pid !== null"><th>Process / Thread ID</th><td class="tabular-nums">{{ event.pid }} / {{ event.tid }}</td></tr>
                <tr v-if="event.activityId"><th>Activity ID</th><td class="font-mono">{{ event.activityId }}</td></tr>
                <tr><th>EventRecordID</th><td class="tabular-nums">{{ event.recordId }}</td></tr>
                <tr><th>Source file</th><td>{{ source?.name }} <span class="text-muted-foreground">(record {{ event.seq }}, chunk {{ event.chunk }})</span></td></tr>
              </tbody>
            </table>

            <h3 class="mb-1.5 text-xs font-semibold">{{ event.payload || 'Event data' }}</h3>
            <table v-if="dataRows.length" class="w-full text-xs">
              <tbody class="[&_th]:text-muted-foreground [&_td]:py-0.5 [&_th]:w-48 [&_th]:py-0.5 [&_th]:pr-3 [&_th]:text-left [&_th]:align-top [&_th]:font-medium">
                <tr v-for="[key, value] in dataRows" :key="key" class="border-t">
                  <th class="break-all">{{ key }}</th>
                  <td class="font-mono break-all whitespace-pre-wrap">{{ value }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="text-muted-foreground text-xs">No event data.</p>

            <template v-if="event.message">
              <h3 class="mt-3 mb-1.5 text-xs font-semibold">Rendered message (from the forwarding host)</h3>
              <pre class="bg-muted/50 rounded-md border p-2.5 font-mono text-[11px] break-all whitespace-pre-wrap">{{ event.message }}</pre>
            </template>
          </template>

          <template v-else-if="tab === 'xml'">
            <p v-if="xmlState === 'loading'" class="text-muted-foreground text-xs">Rendering from the source file…</p>
            <p v-else-if="xmlState === 'failed'" class="text-danger text-xs">The record could not be re-read from the source file.</p>
            <pre v-else class="bg-muted/50 rounded-md border p-2.5 font-mono text-[11px] break-all whitespace-pre-wrap">{{ xml }}</pre>
          </template>

          <pre v-else class="bg-muted/50 rounded-md border p-2.5 font-mono text-[11px] break-all whitespace-pre-wrap">{{ json }}</pre>
        </div>
      </Tabs>

      <DialogFooter class="border-t px-4 py-2.5">
        <Button variant="outline" @click="copy"><CheckIcon v-if="copied" /><CopyIcon v-else />{{ copied ? 'Copied' : `Copy ${copyTarget}` }}</Button>
        <DialogClose as-child><Button variant="secondary">Close</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CheckIcon, CopyIcon } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { EvtxEvent } from '@/core/evtx/types';
import type { RowDetail } from '@/core/plugin';
import { levelName } from '@/core/evtx/types';
import { formatTime } from '@/core/time';
import { eventStore } from '@/core/store';
import { createContext } from '@/core/context';
import { renderXml } from '@/composables/useFileLoader';

const props = defineProps<{ event: EvtxEvent; zone: string; extra?: RowDetail }>();
defineEmits<{ close: [] }>();

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'xml', label: 'XML' },
  { id: 'json', label: 'JSON' },
] as const;
type TabId = (typeof tabs)[number]['id'];
const tab = ref<TabId>('general');
const copied = ref(false);
const xml = ref('');
const xmlState = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle');

const source = computed(() => eventStore.sources.find(s => s.index === props.event.src));
const sidName = computed(() => createContext(eventStore).sidName(props.event.userSid));
const level = computed(() => {
  const l = props.event.level;
  if (l === 1 || l === 2) return { variant: 'destructive' as const, class: '' };
  if (l === 3) return { variant: 'outline' as const, class: 'border-warning/50 text-warning' };
  return { variant: 'secondary' as const, class: '' };
});
const dataRows = computed(() => [
  ...Object.entries(props.event.data),
  ...props.event.list.map((v, i) => [`Data[${i}]`, v] as [string, string]),
]);
const json = computed(() => {
  const { id: _id, src: _src, ...rest } = props.event;
  return JSON.stringify({ ...rest, sourceFile: source.value?.name }, null, 2);
});

async function select(id: TabId) {
  tab.value = id;
  if (id === 'xml' && xmlState.value === 'idle') {
    xmlState.value = 'loading';
    const out = await renderXml(props.event).catch(() => null);
    xml.value = out ?? '';
    xmlState.value = out ? 'ready' : 'failed';
  }
}

const copyTarget = computed(() => (tab.value === 'xml' ? 'XML' : tab.value === 'general' && props.extra ? 'text' : 'JSON'));

async function copy() {
  await navigator.clipboard.writeText(copyTarget.value === 'XML' ? xml.value : copyTarget.value === 'text' ? props.extra!.text : json.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

</script>
