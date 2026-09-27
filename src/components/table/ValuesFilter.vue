<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="border-input bg-input/20 dark:bg-input/30 focus-visible:ring-ring/30 flex h-6 w-full min-w-0 items-center gap-1 rounded-md border px-1.5 text-left text-[11px] outline-none focus-visible:ring-2"
        :class="{ 'text-muted-foreground': !modelValue, 'text-danger': modelValue?.exclude }"
        :aria-label="`Filter ${label}`"
      >
        <span class="truncate">{{ summary }}</span>
        <ChevronDownIcon class="text-muted-foreground ml-auto size-3 shrink-0" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-72 p-0" align="start">
      <div class="border-b p-1.5">
        <Input v-model="query" class="h-6 text-[11px]" :placeholder="`Search ${label}`" />
      </div>
      <div class="max-h-72 overflow-auto p-1">
        <label
          v-for="[value, count] in shown"
          :key="value"
          class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-xs"
        >
          <Checkbox :model-value="selected.has(value)" @update:model-value="toggle(value)" />
          <span class="min-w-0 flex-1 truncate" :title="value">{{ value === '' ? '(empty)' : value }}</span>
          <span class="text-muted-foreground tabular-nums">{{ count.toLocaleString() }}</span>
        </label>
        <p v-if="!shown.length" class="text-muted-foreground p-2 text-xs">No values.</p>
        <p v-if="truncated" class="text-muted-foreground p-1.5 text-[11px]">Showing the {{ LIMIT }} most frequent values; search to find others.</p>
      </div>
      <div class="flex items-center gap-2 border-t p-1.5 text-xs">
        <label class="flex cursor-pointer items-center gap-1.5">
          <Switch size="sm" :model-value="!!modelValue?.exclude" :disabled="!modelValue" @update:model-value="setExclude" />Exclude
        </label>
        <Button variant="ghost" size="sm" class="ml-auto" :disabled="!modelValue" @click="emit('update:modelValue', undefined)">Clear</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDownIcon } from '@lucide/vue';
import type { ColumnFilter } from '@/core/tableFilter';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';

type ValuesFilter = Extract<ColumnFilter, { kind: 'values' }>;

const props = defineProps<{
  label: string;
  modelValue: ValuesFilter | undefined;
  /** Distinct values with counts under the other filters, most frequent first (read when opened). */
  load: () => [string, number][];
}>();
const emit = defineEmits<{ 'update:modelValue': [value: ValuesFilter | undefined] }>();

const LIMIT = 500;
const open = ref(false);
const query = ref('');

const selected = computed(() => new Set(props.modelValue?.values ?? []));
const values = computed(() => (open.value ? props.load() : []));
const matching = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q ? values.value.filter(([v]) => v.toLowerCase().includes(q)) : values.value;
});
const shown = computed(() => {
  const top = matching.value.slice(0, LIMIT);
  // Selected values stay listed even when rare, so they can be unticked.
  const missing = [...selected.value].filter(v => !top.some(([t]) => t === v)).map(v => [v, 0] as [string, number]);
  return [...top, ...missing];
});
const truncated = computed(() => matching.value.length > LIMIT);

const summary = computed(() => {
  const f = props.modelValue;
  if (!f) return 'All';
  const first = f.values[0] === '' ? '(empty)' : f.values[0];
  const text = f.values.length === 1 ? first : `${f.values.length} values`;
  return f.exclude ? `not ${text}` : text;
});

function toggle(value: string) {
  const next = new Set(selected.value);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  emit('update:modelValue', next.size ? { kind: 'values', values: [...next], exclude: props.modelValue?.exclude } : undefined);
}

function setExclude(exclude: boolean) {
  if (props.modelValue) emit('update:modelValue', { ...props.modelValue, exclude });
}
</script>
