<template>
  <aside class="bg-background flex h-full min-h-0 flex-col" :aria-label="`Event ${event.eventId} details`">
    <header class="flex items-center gap-1.5 border-b px-2 py-1.5">
      <Badge :variant="level.variant" :class="level.class">{{ levelName(event.level) }}</Badge>
      <h2 class="min-w-0 flex-1 truncate text-xs font-semibold" :title="`Event ${event.eventId} · ${event.provider}`">Event {{ event.eventId }} · {{ event.provider }}</h2>
      <Button variant="ghost" size="icon-sm" title="Previous row (↑)" aria-label="Previous row" @click="emit('step', -1)"><ChevronUpIcon /></Button>
      <Button variant="ghost" size="icon-sm" title="Next row (↓)" aria-label="Next row" @click="emit('step', 1)"><ChevronDownIcon /></Button>
      <Button variant="ghost" size="icon-sm" :title="star ? 'Remove star (S)' : 'Star this event (S)'" :aria-pressed="!!star" @click="toggleStar(event)">
        <StarIcon :class="star ? 'fill-amber-400 text-amber-400' : ''" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon-sm" title="Surrounding events in all logs"><ClockArrowUpIcon /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-56">
          <DropdownMenuLabel>Events around this one, all logs</DropdownMenuLabel>
          <DropdownMenuItem v-for="w in WINDOWS" :key="w.ms" @select="surrounding(w.ms)">± {{ w.label }}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon-sm" title="Close (Esc)" aria-label="Close details" @click="emit('close')"><XIcon /></Button>
    </header>

    <Tabs :model-value="tab" class="min-h-0 flex-1 gap-0" @update:model-value="v => select(v as TabId)">
      <TabsList variant="line" class="px-2 pt-1">
        <TabsTrigger v-for="t in tabs" :key="t.id" :value="t.id" class="flex-none">{{ t.label }}</TabsTrigger>
        <Button variant="ghost" size="sm" class="ml-auto" @click="copy"><CheckIcon v-if="copied" /><CopyIcon v-else />{{ copied ? 'Copied' : `Copy ${copyTarget}` }}</Button>
      </TabsList>
      <div class="min-h-0 flex-1 overflow-auto px-3 py-2">
        <template v-if="tab === 'general'">
          <div v-if="star" class="mb-3">
            <label class="text-muted-foreground mb-1 block text-[11px] font-medium" for="star-note">Note</label>
            <Textarea id="star-note" :model-value="star.note" class="min-h-14 text-xs" placeholder="Why this event matters…" @update:model-value="v => setNote(event, String(v))" />
          </div>
          <template v-if="extra">
            <h3 class="mb-1 text-xs font-semibold">{{ extra.title }}</h3>
            <pre class="bg-muted/50 mb-3 max-h-[40vh] overflow-auto rounded-md border p-2 font-mono text-[11px] break-all whitespace-pre-wrap">{{ extra.text }}</pre>
          </template>
          <table class="mb-3 w-full text-xs">
            <tbody class="[&_th]:text-muted-foreground [&_td]:py-0.5 [&_th]:w-36 [&_th]:py-0.5 [&_th]:pr-2 [&_th]:text-left [&_th]:align-top [&_th]:font-medium [&_th]:whitespace-nowrap">
              <tr><th>Time ({{ zone }})</th><td class="tabular-nums">{{ formatTime(event.ts, zone) }}</td></tr>
              <tr><th>SystemTime (UTC)</th><td class="font-mono">{{ event.time }}</td></tr>
              <tr><th>Provider</th><td class="break-all">{{ event.provider }}</td></tr>
              <tr><th>Event ID</th><td>{{ event.eventId }}<span v-if="event.qualifiers !== null" class="text-muted-foreground"> (Qualifiers {{ event.qualifiers }})</span></td></tr>
              <tr><th>Channel</th><td class="break-all">{{ event.channel }}</td></tr>
              <tr><th>Computer</th><td>{{ event.computer }}</td></tr>
              <tr><th>Level / Task / Opcode</th><td>{{ event.level }} / {{ event.task ?? '-' }} / {{ event.opcode ?? '-' }}</td></tr>
              <tr><th>Keywords</th><td class="font-mono">{{ event.keywords }}</td></tr>
              <tr v-if="event.userSid"><th>User SID</th><td class="font-mono break-all">{{ event.userSid }}<span v-if="sidName" class="text-muted-foreground"> ({{ sidName }})</span></td></tr>
              <tr v-if="event.pid !== null"><th>Process / Thread ID</th><td class="tabular-nums">{{ event.pid }} / {{ event.tid }}</td></tr>
              <tr v-if="event.activityId"><th>Activity ID</th><td class="font-mono break-all">{{ event.activityId }}</td></tr>
              <tr><th>EventRecordID</th><td class="tabular-nums">{{ event.recordId }}</td></tr>
              <tr><th>Source file</th><td class="break-all">{{ source?.name }} <span class="text-muted-foreground">(record {{ event.seq }}, chunk {{ event.chunk }})</span></td></tr>
            </tbody>
          </table>

          <h3 class="mb-1 text-xs font-semibold">{{ event.payload || 'Event data' }}</h3>
          <table v-if="dataRows.length" class="w-full text-xs">
            <tbody>
              <tr v-for="[key, value] in dataRows" :key="key" class="group/field hover:bg-muted/50 border-t">
                <th class="text-muted-foreground w-36 py-0.5 pr-2 text-left align-top font-medium break-all">{{ key }}</th>
                <td class="py-0.5 font-mono break-all whitespace-pre-wrap">{{ value }}</td>
                <td class="w-16 py-0.5 text-right align-top whitespace-nowrap">
                  <span v-if="value && value !== '-'" class="invisible inline-flex group-hover/field:visible group-focus-within/field:visible">
                    <button type="button" class="hover:bg-muted rounded-sm p-0.5" :title="`Search this table for “${short(value)}”`" @click="emit('search', value)"><SearchIcon class="size-3.5" /></button>
                    <button type="button" class="hover:bg-muted rounded-sm p-0.5" :title="`Find “${short(value)}” in all events`" @click="findEverywhere(value)"><ListIcon class="size-3.5" /></button>
                    <button type="button" class="hover:bg-muted rounded-sm p-0.5" title="Copy value" @click="copyText(value)"><CopyIcon class="size-3.5" /></button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-muted-foreground text-xs">No event data.</p>

          <template v-if="event.message">
            <h3 class="mt-3 mb-1 text-xs font-semibold">Rendered message (from the forwarding host)</h3>
            <pre class="bg-muted/50 rounded-md border p-2 font-mono text-[11px] break-all whitespace-pre-wrap">{{ event.message }}</pre>
          </template>
        </template>

        <template v-else-if="tab === 'xml'">
          <p v-if="xmlState === 'loading'" class="text-muted-foreground text-xs">Rendering from the source file…</p>
          <p v-else-if="xmlState === 'failed'" class="text-danger text-xs">The record could not be re-read from the source file.</p>
          <pre v-else class="bg-muted/50 rounded-md border p-2 font-mono text-[11px] break-all whitespace-pre-wrap">{{ xml }}</pre>
        </template>

        <pre v-else class="bg-muted/50 rounded-md border p-2 font-mono text-[11px] break-all whitespace-pre-wrap">{{ json }}</pre>
      </div>
    </Tabs>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, ClockArrowUpIcon, CopyIcon, ListIcon, SearchIcon, StarIcon, XIcon } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { EvtxEvent } from '@/core/evtx/types';
import type { RowDetail } from '@/core/plugin';
import { levelName } from '@/core/evtx/types';
import { formatTime } from '@/core/time';
import { eventStore } from '@/core/store';
import { createContext } from '@/core/context';
import { renderXml } from '@/composables/useFileLoader';
import { setNote, starOf, toggleStar } from '@/composables/useStars';

const props = defineProps<{ event: EvtxEvent; zone: string; extra?: RowDetail }>();
const emit = defineEmits<{ close: []; step: [delta: number]; search: [value: string] }>();
const router = useRouter();

const WINDOWS = [
  { label: '1 minute', ms: 60000 },
  { label: '5 minutes', ms: 300000 },
  { label: '15 minutes', ms: 900000 },
  { label: '1 hour', ms: 3600000 },
];

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

const star = computed(() => starOf(props.event));
const source = computed(() => eventStore.sources.find(s => s.index === props.event.src));
const context = computed(() => {
  void eventStore.version.value;
  return createContext(eventStore);
});
const sidName = computed(() => context.value.sidName(props.event.userSid));
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
const short = (v: string) => (v.length > 40 ? `${v.slice(0, 40)}…` : v);

async function loadXml() {
  xmlState.value = 'loading';
  const event = props.event;
  const out = await renderXml(event).catch(() => null);
  if (event !== props.event) return;
  xml.value = out ?? '';
  xmlState.value = out ? 'ready' : 'failed';
}

function select(id: TabId) {
  tab.value = id;
  if (id === 'xml' && xmlState.value === 'idle') void loadXml();
}

// Stepping through rows keeps the tab; the XML is re-read for the new record.
watch(
  () => props.event,
  () => {
    xmlState.value = 'idle';
    xml.value = '';
    if (tab.value === 'xml') void loadXml();
  },
);

const copyTarget = computed(() => (tab.value === 'xml' ? 'XML' : tab.value === 'general' && props.extra ? 'text' : 'JSON'));

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast.error('The clipboard is not available here');
    return false;
  }
}

async function copy() {
  const ok = await copyText(copyTarget.value === 'XML' ? xml.value : copyTarget.value === 'text' ? props.extra!.text : json.value);
  if (!ok) return;
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

/** All Events around this record, across every loaded log, with the record selected. */
function surrounding(ms: number) {
  const t = props.event.ts;
  void router.push({ name: 'module', params: { name: 'showAll' }, query: { from: String(t - ms), to: String(t + ms), anchor: String(props.event.id) } });
}

function findEverywhere(value: string) {
  void router.push({ name: 'module', params: { name: 'showAll' }, query: { q: value } });
}
</script>
