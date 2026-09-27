<template>
  <div v-if="dragging" class="drop-overlay d-flex align-items-center justify-content-center" aria-hidden="true">
    <div class="box rounded-3 p-5 text-center">
      <i class="bi bi-cloud-arrow-up display-4 d-block mb-2"></i>
      <div class="h5 mb-0">Drop .evtx files or folders to add them</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const emit = defineEmits<{ files: [files: File[]] }>();
const dragging = ref(false);
let depth = 0;

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

/** Recursively collects files from dropped folders (webkitGetAsEntry is supported by all current browsers). */
async function collect(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise(resolve => (entry as FileSystemFileEntry).file(f => resolve([f]), () => resolve([])));
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const out: File[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>(resolve => reader.readEntries(resolve, () => resolve([])));
    if (batch.length === 0) break;
    for (const child of batch) out.push(...(await collect(child)));
  }
  return out;
}

function onEnter(e: DragEvent) {
  if (!hasFiles(e)) return;
  e.preventDefault();
  depth++;
  dragging.value = true;
}

function onOver(e: DragEvent) {
  if (hasFiles(e)) e.preventDefault();
}

function onLeave(e: DragEvent) {
  if (!hasFiles(e)) return;
  depth = Math.max(0, depth - 1);
  if (depth === 0) dragging.value = false;
}

async function onDrop(e: DragEvent) {
  if (!hasFiles(e)) return;
  e.preventDefault();
  depth = 0;
  dragging.value = false;
  const items = Array.from(e.dataTransfer?.items ?? []);
  const entries = items.map(i => i.webkitGetAsEntry?.()).filter((x): x is FileSystemEntry => !!x);
  const files = entries.length ? (await Promise.all(entries.map(collect))).flat() : Array.from(e.dataTransfer?.files ?? []);
  if (files.length) emit('files', files);
}

onMounted(() => {
  window.addEventListener('dragenter', onEnter);
  window.addEventListener('dragover', onOver);
  window.addEventListener('dragleave', onLeave);
  window.addEventListener('drop', onDrop);
});
onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onEnter);
  window.removeEventListener('dragover', onOver);
  window.removeEventListener('dragleave', onLeave);
  window.removeEventListener('drop', onDrop);
});
</script>

<style scoped>
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(13, 110, 253, 0.12);
  pointer-events: none;
}
.box {
  background: var(--bs-body-bg);
  border: 2px dashed var(--bs-primary);
}
</style>
