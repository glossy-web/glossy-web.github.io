<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="border-input bg-input/20 dark:bg-input/30 focus-visible:ring-ring/30 flex h-6 w-full min-w-0 items-center gap-1 rounded-md border px-1.5 text-left text-[11px] tabular-nums outline-none focus-visible:ring-2"
        :class="{ 'text-muted-foreground': !modelValue }"
        :aria-label="`Filter ${label}`"
      >
        <CalendarRangeIcon class="text-muted-foreground size-3 shrink-0" />
        <span class="truncate">{{ summary }}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-80 space-y-2 p-3" align="start" @open-auto-focus="load">
      <p class="text-muted-foreground text-[11px]">Times in {{ zone }}; both ends included.</p>
      <label class="block space-y-1 text-xs">
        <span>From</span>
        <Input v-model="from" type="datetime-local" step="1" class="h-7 text-xs" />
      </label>
      <label class="block space-y-1 text-xs">
        <span>To</span>
        <Input v-model="to" type="datetime-local" step="1" class="h-7 text-xs" />
      </label>
      <div class="flex justify-end gap-1.5 pt-1">
        <Button variant="ghost" size="sm" :disabled="!modelValue" @click="apply(undefined)">Clear</Button>
        <Button size="sm" @click="apply(parse())">Apply</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CalendarRangeIcon } from '@lucide/vue';
import type { ColumnFilter } from '@/core/tableFilter';
import { formatTime, zonedToEpoch } from '@/core/time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type RangeFilter = Extract<ColumnFilter, { kind: 'range' }>;

const props = defineProps<{ label: string; zone: string; modelValue: RangeFilter | undefined }>();
const emit = defineEmits<{ 'update:modelValue': [value: RangeFilter | undefined] }>();

const open = ref(false);
const from = ref('');
const to = ref('');

/** "2024-05-01 09:30:00.000 +09:00" → "2024-05-01T09:30:00" for the datetime-local input. */
const toInput = (ts: number | undefined) => (ts === undefined ? '' : formatTime(ts, props.zone).slice(0, 19).replace(' ', 'T'));
const short = (ts: number) => formatTime(ts, props.zone).slice(0, 19);

const summary = computed(() => {
  const f = props.modelValue;
  if (!f) return 'Any time';
  if (f.from !== undefined && f.to !== undefined) return `${short(f.from)} → ${short(f.to)}`;
  return f.from !== undefined ? `from ${short(f.from)}` : `until ${short(f.to!)}`;
});

function load() {
  from.value = toInput(props.modelValue?.from);
  to.value = toInput(props.modelValue?.to);
}

function epoch(value: string, endOfSecond: boolean): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  return zonedToEpoch(props.zone, y!, mo!, d!, h!, mi!, s || 0) + (endOfSecond ? 999 : 0);
}

function parse(): RangeFilter | undefined {
  const f = epoch(from.value, false);
  const t = epoch(to.value, true);
  return f === undefined && t === undefined ? undefined : { kind: 'range', from: f, to: t };
}

function apply(value: RangeFilter | undefined) {
  emit('update:modelValue', value);
  open.value = false;
}
</script>
