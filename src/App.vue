<template>
  <div class="app d-flex flex-column">
    <header class="topbar d-flex align-items-center gap-3 px-3 border-bottom">
      <a href="#" class="brand text-reset text-decoration-none fw-semibold" @click.prevent="activePage = '__overview'">
        <img :src="icon" alt="" width="20" height="20" class="me-1" />Glossy
      </a>
      <span v-if="hasData || loader.busy" class="small text-body-secondary tabular">
        {{ sourceCount }} file(s) · {{ eventCount.toLocaleString() }} events
        <span v-if="loader.busy" class="ms-1"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> parsing</span>
      </span>
      <div class="ms-auto d-flex align-items-center gap-2">
        <label class="small text-body-secondary" for="tz">Time zone</label>
        <select id="tz" v-model="timeZone" class="form-select form-select-sm tz">
          <option :value="local">{{ local }} (system)</option>
          <option v-if="local !== 'UTC'" value="UTC">UTC</option>
          <option disabled>──────────</option>
          <option v-for="z in zones" :key="z" :value="z">{{ z }}</option>
        </select>
        <button class="btn btn-sm btn-primary" @click="fileInput?.click()"><i class="bi bi-file-earmark-plus"></i> Add files</button>
        <button class="btn btn-sm btn-outline-secondary" @click="folderInput?.click()"><i class="bi bi-folder-plus"></i> Add folder</button>
        <button v-if="hasData" class="btn btn-sm btn-outline-danger" @click="confirmClear"><i class="bi bi-trash"></i> Clear</button>
      </div>
      <input ref="fileInput" type="file" multiple accept=".evtx" hidden @change="onPick" />
      <input ref="folderInput" type="file" webkitdirectory multiple hidden @change="onPick" />
    </header>

    <div class="main d-flex flex-grow-1">
      <Sidebar v-if="hasData" :active="activePage" @select="activePage = $event" />
      <main class="content d-flex flex-column flex-grow-1">
        <SourceIndex v-if="!hasData && !loader.files.length" @browse="fileInput?.click()" />
        <SourceList v-else-if="activePage === '__overview' || !hasData" :zone="timeZone" />
        <PluginView v-else :key="activePage" :name="activePage" :zone="timeZone" />
      </main>
    </div>

    <FileDropZone @files="load" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { eventStore } from '@/core/store';
import { allZones, browserZone } from '@/core/time';
import { clearAll, loadFiles, loader } from '@/composables/useFileLoader';
import { activePage, timeZone } from '@/composables/useGlossyStore';
import Sidebar from '@/components/layout/Sidebar.vue';
import SourceIndex from '@/components/SourceIndex.vue';
import SourceList from '@/components/SourceList.vue';
import PluginView from '@/components/PluginView.vue';
import FileDropZone from '@/components/FileDropZone.vue';
import icon from '@/assets/glossy.ico';

const fileInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
const local = browserZone();
const zones = allZones().filter(z => z !== 'UTC' && z !== local);

const sourceCount = computed(() => {
  void eventStore.version.value;
  return eventStore.sources.length;
});
const eventCount = computed(() => {
  void eventStore.version.value;
  return eventStore.size;
});
const hasData = computed(() => sourceCount.value > 0);

function load(files: File[]) {
  activePage.value = '__overview';
  void loadFiles(files);
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  load(Array.from(input.files ?? []));
  input.value = '';
}

function confirmClear() {
  if (window.confirm('Remove all loaded files and events from this page?')) {
    clearAll();
    activePage.value = '__overview';
  }
}
</script>

<style scoped>
.app {
  height: 100vh;
}
.topbar {
  height: 48px;
  flex-shrink: 0;
  background: var(--bs-tertiary-bg);
}
.brand {
  display: flex;
  align-items: center;
  font-size: 15px;
}
.tz {
  width: 220px;
}
.main {
  min-height: 0;
}
.content {
  min-width: 0;
  min-height: 0;
}
.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
