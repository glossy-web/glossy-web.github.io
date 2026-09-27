<template>
  <div v-if="chips.length" class="flex flex-wrap items-center gap-1">
    <span
      v-for="c in chips"
      :key="c.id"
      class="bg-muted/60 inline-flex h-6 max-w-full items-center gap-1 rounded-md border pr-0.5 pl-2 text-xs"
      :class="{ 'border-danger/40 text-danger': c.exclude }"
    >
      <button
        type="button"
        class="truncate"
        :disabled="!c.negatable"
        :title="c.negatable ? 'Click to invert (include ⇄ exclude)' : c.text"
        @click="emit('negate', c.id)"
      >{{ c.text }}</button>
      <button type="button" class="hover:bg-muted rounded-sm p-0.5" :aria-label="`Remove filter: ${c.text}`" @click="emit('remove', c.id)">
        <XIcon class="size-3" />
      </button>
    </span>
    <Button variant="ghost" size="sm" @click="emit('clear')"><FilterXIcon />Clear all</Button>
  </div>
</template>

<script setup lang="ts">
import { FilterXIcon, XIcon } from '@lucide/vue';
import { Button } from '@/components/ui/button';

export interface Chip {
  id: string;
  text: string;
  exclude?: boolean;
  negatable: boolean;
}

defineProps<{ chips: Chip[] }>();
const emit = defineEmits<{ remove: [id: string]; negate: [id: string]; clear: [] }>();
</script>
