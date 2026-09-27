<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" role="combobox" :aria-expanded="open" aria-label="Display time zone" class="w-72 justify-between font-normal">
        <span class="flex min-w-0 items-center gap-1.5"><GlobeIcon class="text-muted-foreground" /><span class="truncate">{{ label(timeZone) }}</span></span>
        <ChevronsUpDownIcon class="text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-80 p-0" align="end">
      <Command :model-value="timeZone" @update:model-value="pick">
        <CommandInput placeholder="Search time zones…" />
        <CommandList class="max-h-80">
          <CommandEmpty>No time zone found.</CommandEmpty>
          <CommandGroup>
            <CommandItem :value="local">{{ label(local) }}</CommandItem>
            <CommandItem v-if="local !== UTC" :value="UTC">{{ label(UTC) }}</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup v-if="open" heading="All time zones">
            <CommandItem v-for="z in zones" :key="z" :value="z">{{ label(z) }}</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AcceptableValue } from 'reka-ui';
import { ChevronsUpDownIcon, GlobeIcon } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { allZones, browserZone, offsetLabel, UTC } from '@/core/time';
import { timeZone } from '@/composables/useGlossyStore';

const open = ref(false);
const local = browserZone();

/**
 * Windows-style names with the current offset, e.g. "(UTC+09:00) Asia/Seoul". Every time shown
 * also carries its own offset, which differs from this one across daylight saving changes.
 */
const label = (z: string) => `(${offsetLabel(z)}) ${z}${z === local ? ' (system)' : ''}`;

// The full list (400+ zones, one formatter each) is only built while the picker is open.
const zones = computed(() => (open.value ? allZones().filter(z => z !== UTC && z !== local) : []));

function pick(value: AcceptableValue) {
  if (typeof value === 'string' && value) timeZone.value = value;
  open.value = false;
}
</script>
