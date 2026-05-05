<template>
  <div class="source-index">
    <div class="text-center p-5">
      <i class="fa fa-search display-1 text-muted mb-3"></i>
      <h3>Glossy Event Log Forensics</h3>
      <p class="text-muted col-md-6 mx-auto">
        Drag &amp; drop <code>.evtx</code> files onto this page or click the button below
        to analyze Windows Event Log files directly in your browser.
        No server required &mdash; all processing happens locally.
      </p>

      <div class="mt-4">
        <div class="dropzone-inline"
             @dragover.prevent="dragging = true"
             @dragleave.prevent="dragging = false"
             @drop.prevent="handleDrop"
             :class="{ active: dragging }">
          <div class="py-5 px-3">
            <i class="fa fa-cloud-upload display-3 text-muted mb-2 d-block"></i>
            <h5>Drop .evtx files here</h5>
            <p class="text-muted small">or</p>
            <button class="btn btn-primary btn-lg px-4" @click="$emit('trigger-upload')">
              <i class="fa fa-folder-open me-2"></i>Browse Files
            </button>
          </div>
        </div>
      </div>

      <div class="mt-4 small text-muted">
        <p>Supported: All Windows Event Log formats (.evtx)</p>
        <p>18 analysis modules for system forensics, account auditing, process tracking, and more.</p>
        <p>
          <i class="fa fa-file-pdf-o me-1"></i>
          Based on the research paper:
          <a :href="links.paper" target="_blank">Link</a> (Korean)
        </p>
      </div>

      <div class="mt-5 pt-4 border-top" style="max-width: 600px; margin: 0 auto">
        <div class="alert alert-warning py-2 small text-start mb-3">
          <i class="fa fa-exclamation-triangle me-1"></i>
          <strong>Notice:</strong> A vibecoding port of the 9-year-old
          <a href="https://github.com/whatabeautifulmemory/glossy" target="_blank">Glossy</a>
          to a pure browser-based application. Output not reviewed.
          Bugs and unexpected behavior may occur. Not maintained.
        </div>

        <div class="d-flex justify-content-center gap-3 flex-wrap small">
          <a :href="links.repo" target="_blank" class="text-decoration-none text-secondary">
            <i class="fa fa-github me-1"></i>glossy-web
          </a>
          <a :href="links.original" target="_blank" class="text-decoration-none text-secondary">
            <i class="fa fa-code-fork me-1"></i>original glossy
          </a>
          <span class="text-muted mx-2">&#10072;</span>
          <a :href="links.twitter" target="_blank" class="text-decoration-none text-secondary">
            <i class="fa fa-twitter me-1"></i>@copy_and_paster
          </a>
          <a :href="links.linkedin" target="_blank" class="text-decoration-none text-secondary">
            <i class="fa fa-linkedin-square me-1"></i>LinkedIn
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';

export default defineComponent({
  name: 'SourceIndex',
  emits: ['trigger-upload'],
  setup(_, { emit }) {
    const dragging = ref(false);

    function handleDrop(e: DragEvent) {
      dragging.value = false;
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) {
        emit('trigger-upload');
        const input = document.querySelector<HTMLInputElement>('input[type="file"]');
        if (input) {
          const dt = new DataTransfer();
          files.forEach(f => dt.items.add(f));
          input.files = dt.files;
          input.dispatchEvent(new Event('change'));
        }
      }
    }

    const links = {
      repo: 'https://github.com/glossy-web/glossy-web.github.io',
      original: 'https://github.com/whatabeautifulmemory/glossy',
      twitter: 'https://x.com/copy_and_paster',
      linkedin: 'https://www.linkedin.com/in/whatabeautifulmoment/',
      paper: 'https://github.com/whatabeautifulmemory/glossy/files/13562844/KDFS.2017.v0.1.pdf',
    };

    return { dragging, handleDrop, links };
  },
});
</script>

<style scoped>
.dropzone-inline {
  border: 3px dashed #dee2e6;
  border-radius: 12px;
  transition: all 0.2s;
  background: #fafbfc;
  max-width: 500px;
  margin: 0 auto;
}
.dropzone-inline.active {
  border-color: #0d6efd;
  background: #e7f1ff;
}
</style>
