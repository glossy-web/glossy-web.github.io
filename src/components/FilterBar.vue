<template>
  <div class="filter-bar px-4 py-2 border-bottom bg-light" v-if="defs.length > 0">
    <div class="d-flex align-items-center gap-2 flex-wrap">
      <small class="text-muted text-nowrap fw-bold me-1">Filters:</small>
      <template v-for="def in defs" :key="def.key">
        <select v-if="def.type === 'select'"
          class="form-select form-select-sm"
          :style="{ width: def.width || '140px' }"
          v-model="values[def.key]"
          @change="$emit('update', { ...values })">
          <option value="">{{ def.label }}</option>
          <option v-for="opt in def.options" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <input v-else
          class="form-control form-control-sm"
          :style="{ width: def.width || '160px' }"
          :placeholder="def.label"
          v-model="values[def.key]"
          @input="$emit('update', { ...values })" />
      </template>
      <button v-if="hasActive"
        class="btn btn-sm btn-outline-secondary ms-1"
        @click="clearAll">
        <i class="fa fa-times"></i> Clear
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, ref, computed, watch } from 'vue';
import type { FilterDef } from '@/core/plugin';

export default defineComponent({
  name: 'FilterBar',
  props: {
    defs: { type: Array as PropType<FilterDef[]>, default: () => [] },
  },
  emits: ['update'],
  setup(props, { emit }) {
    const values = ref<Record<string, string>>({});

    const hasActive = computed(() =>
      Object.values(values.value).some(v => v !== ''),
    );

    watch(() => props.defs, () => {
      const next: Record<string, string> = {};
      for (const d of props.defs) {
        next[d.key] = values.value[d.key] || '';
      }
      values.value = next;
    });

    function clearAll() {
      values.value = {};
      emit('update', {});
    }

    return { values, hasActive, clearAll };
  },
});
</script>
