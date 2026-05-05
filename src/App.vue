<template>
  <div class="glossy-app">
    <nav class="navbar navbar-dark bg-dark px-3">
      <span class="navbar-brand mb-0 h1">
        <i class="fa fa-search"></i> Glossy Event Log Forensics
      </span>
      <div class="d-flex align-items-center gap-2" v-if="sources.length > 0">
        <span class="text-light small">
          <strong>{{ sources.length }}</strong> file(s)
        </span>
        <span class="text-muted">|</span>
        <span class="text-light small" v-if="isLoading">
          Processing: {{ loadProgress }}%
        </span>
        <span class="text-light small" v-else>
          Ready &middot; <strong>{{ totalEventCount }}</strong> events
        </span>
        <span class="text-muted">|</span>
        <button class="btn btn-outline-light btn-sm" @click="triggerFileInput">
          <i class="fa fa-plus"></i> Add EVTX
        </button>
        <button class="btn btn-outline-danger btn-sm" @click="confirmClear">
          <i class="fa fa-trash"></i> Clear All
        </button>
      </div>
      <div class="d-flex align-items-center gap-2" v-else>
        <span class="text-light small text-muted">No files loaded</span>
        <button class="btn btn-outline-light btn-sm" @click="triggerFileInput">
          <i class="fa fa-plus"></i> Add EVTX
        </button>
      </div>
      <input type="file" ref="fileInputEl" multiple accept=".evtx" hidden
        @change="handleBrowse" />
    </nav>

    <div class="d-flex" style="height: calc(100vh - 56px)">
      <Sidebar v-if="sources.length > 0"
        :activePlugin="activePlugin" @select="activePlugin = $event" />

      <main class="flex-grow-1 d-flex flex-column" style="min-width: 0; min-height: 0">
        <div v-if="isLoading" class="text-center py-1 bg-info text-white small">
          Indexing... {{ loadProgress }}%
        </div>

        <div v-if="errors.length > 0" class="alert alert-warning m-2 py-1 small mb-0">
          <i class="fa fa-exclamation-triangle"></i>
          {{ errors.length }} parse error(s)
        </div>

        <SourceIndex
          v-if="sources.length === 0"
          @trigger-upload="triggerFileInput"
        />

        <SourceList
          v-else-if="activePlugin === '__index'"
          :sources="sources"
          :statistics="statistics"
        />

        <PluginView
          v-else
          :pluginName="activePlugin"
          :key="activePlugin + '_' + totalEventCount"
        />
      </main>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';
import { useFileLoader } from '@/composables/useFileLoader';
import { registerAllPlugins } from '@/plugins';
import { eventStore } from '@/core/store';
import Sidebar from '@/components/layout/Sidebar.vue';
import PluginView from '@/components/PluginView.vue';
import SourceIndex from '@/components/SourceIndex.vue';
import SourceList from '@/components/SourceList.vue';
import Swal from 'sweetalert2';

registerAllPlugins();

export default defineComponent({
  name: 'GlossyApp',
  components: { Sidebar, PluginView, SourceIndex, SourceList },
  setup() {
    const { isLoading, loadProgress, errors, sources, loadFiles, clearAll } = useFileLoader();
    const activePlugin = ref('__index');
    const fileInputEl = ref<HTMLInputElement | null>(null);

    const totalEventCount = computed(() => eventStore.getAllEvents().length);
    const statistics = computed(() => eventStore.getStatistics());

    function triggerFileInput() {
      fileInputEl.value?.click();
    }

    async function handleBrowse(e: Event) {
      const target = e.target as HTMLInputElement;
      const files = Array.from(target.files || []);
      await loadFiles(files);
      if (sources.value.length > 0) {
        activePlugin.value = '__index';
      }
      target.value = '';
    }

    function confirmClear() {
      Swal.fire({
        title: 'Clear all data?',
        text: 'All parsed events and sources will be removed.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, clear all',
        cancelButtonText: 'Cancel',
      }).then((result) => {
        if (result.isConfirmed) {
          clearAll();
          activePlugin.value = '__index';
        }
      });
    }

    return {
      activePlugin, fileInputEl, isLoading, loadProgress, errors, sources, totalEventCount, statistics,
      triggerFileInput, handleBrowse, confirmClear,
    };
  },
});
</script>
