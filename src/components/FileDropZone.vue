<template>
  <div
    class="dropzone-area"
    :class="{ dragging: isDragging, loading: isLoading }"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="handleDrop"
  >
    <div class="dropzone-content text-center p-5">
      <i class="fa fa-cloud-upload display-3 text-muted mb-3"></i>
      <h4 v-if="!isLoading">Drag & Drop .evtx Files Here</h4>
      <h4 v-else>Indexing Events...</h4>
      <p class="text-muted">or</p>
      <label class="btn btn-primary btn-lg">
        <i class="fa fa-folder-open"></i> Browse Files
        <input type="file" multiple accept=".evtx" hidden @change="handleBrowse" />
      </label>
      <p class="text-muted small mt-2">Only Windows Event Log (.evtx) files are supported</p>

      <div v-if="isLoading" class="mt-4">
        <div class="progress" style="height: 25px">
          <div class="progress-bar progress-bar-striped progress-bar-animated"
               :style="{ width: progress + '%' }">
            {{ progress }}%
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';

export default defineComponent({
  name: 'FileDropZone',
  props: {
    isLoading: { type: Boolean, default: false },
    progress: { type: Number, default: 0 },
  },
  emits: ['files-selected'],
  setup(_, { emit }) {
    const isDragging = ref(false);

    function handleDrop(e: DragEvent) {
      isDragging.value = false;
      const files = Array.from(e.dataTransfer?.files || []);
      emit('files-selected', files);
    }

    function handleBrowse(e: Event) {
      const target = e.target as HTMLInputElement;
      const files = Array.from(target.files || []);
      emit('files-selected', files);
      target.value = '';
    }

    return { isDragging, handleDrop, handleBrowse };
  },
});
</script>

<style scoped>
.dropzone-area {
  border: 3px dashed #dee2e6;
  border-radius: 12px;
  margin: 20px;
  transition: all 0.2s;
  background: #fafbfc;
}
.dropzone-area.dragging {
  border-color: #0d6efd;
  background: #e7f1ff;
}
.dropzone-area.loading {
  border-color: #198754;
  background: #f0fff4;
}
.dropzone-content {
  cursor: pointer;
}
</style>
