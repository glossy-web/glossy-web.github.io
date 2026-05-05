import { ref, computed } from 'vue';
import { eventStore, type EventSource } from '@/core/store';

const sources = ref<EventSource[]>([]);
const isLoading = ref(false);
const loadProgress = ref(0);
const error = ref<string | null>(null);
const activePlugin = ref('showAll');
const eventCount = computed(() => eventStore.getAllEvents().length);
const statistics = computed(() => eventStore.getStatistics());

function setActivePlugin(name: string) {
  activePlugin.value = name;
}

function resetAll() {
  eventStore.reset();
  sources.value = [];
  isLoading.value = false;
  loadProgress.value = 0;
  error.value = null;
}

export function useGlossyStore() {
  return {
    sources,
    isLoading,
    loadProgress,
    error,
    activePlugin,
    eventCount,
    statistics,
    setActivePlugin,
    resetAll,
    eventStore,
  };
}
