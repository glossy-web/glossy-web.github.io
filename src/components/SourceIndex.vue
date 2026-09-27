<template>
  <div class="landing d-flex flex-column align-items-center text-center p-4">
    <h1 class="h3 mt-4 d-flex align-items-center gap-2"><img :src="icon" alt="" width="32" height="32" />Glossy Event Log Forensics</h1>
    <p class="text-body-secondary col-lg-7">
      Windows event log (<code>.evtx</code>) analysis that runs entirely in your browser. Files are parsed locally by a
      WebAssembly build of the Rust <code>evtx</code> parser. Nothing is uploaded, and analysis makes no network requests.
    </p>

    <button type="button" class="drop border rounded-3 p-5 mt-2" @click="$emit('browse')">
      <i class="bi bi-cloud-arrow-up display-5 text-body-secondary d-block mb-2" aria-hidden="true"></i>
      <span class="h5 d-block">Drop .evtx files or a whole <code>winevt\Logs</code> folder here</span>
      <span class="text-body-secondary">or click to choose files</span>
    </button>

    <ul class="facts text-start small text-body-secondary mt-4 col-lg-7">
      <li>Reads every chunk, including those a dirty (not cleanly closed) header leaves out, and reports damaged chunks instead of stopping.</li>
      <li>Timestamps are shown in this computer's time zone until you pick another (e.g. UTC) from the header, each with its offset from UTC. CSV exports carry the offset too; JSONL for Timesketch is always UTC.</li>
      <li>Flags record-number gaps, duplicate files and duplicate records (e.g. shadow copies), and which logs are missing.</li>
      <li>Analysis modules follow the original <a :href="links.original" target="_blank" rel="noopener">Glossy</a> (<a :href="links.paper" target="_blank" rel="noopener">KDFS 2017 paper</a>, Korean) and current triage practice.</li>
    </ul>

    <footer class="links d-flex flex-wrap justify-content-center gap-3 small mt-auto pt-4">
      <a :href="links.repo" target="_blank" rel="noopener"><i class="bi bi-github me-1" aria-hidden="true"></i>glossy-web</a>
      <a :href="links.original" target="_blank" rel="noopener"><i class="bi bi-diagram-2 me-1" aria-hidden="true"></i>original Glossy</a>
      <a :href="links.x" target="_blank" rel="noopener"><i class="bi bi-twitter-x me-1" aria-hidden="true"></i>@copy_and_paster</a>
      <a :href="links.linkedin" target="_blank" rel="noopener"><i class="bi bi-linkedin me-1" aria-hidden="true"></i>LinkedIn</a>
    </footer>
  </div>
</template>

<script setup lang="ts">
import icon from '@/assets/glossy.ico';

defineEmits<{ browse: [] }>();

const links = {
  repo: 'https://github.com/glossy-web/glossy-web.github.io',
  original: 'https://github.com/whatabeautifulmemory/glossy',
  paper: 'https://github.com/whatabeautifulmemory/glossy/files/13562844/KDFS.2017.v0.1.pdf',
  x: 'https://x.com/copy_and_paster',
  linkedin: 'https://www.linkedin.com/in/whatabeautifulmoment/',
};
</script>

<style scoped>
.landing {
  overflow: auto;
}
.drop {
  background: var(--bs-tertiary-bg);
  border-style: dashed !important;
  border-width: 2px !important;
  width: min(560px, 100%);
  color: inherit;
}
.drop:hover,
.drop:focus-visible {
  border-color: var(--bs-primary) !important;
  background: var(--bs-primary-bg-subtle);
}
.facts li {
  margin-bottom: 6px;
}
.links a {
  color: var(--bs-secondary-color);
  text-decoration: none;
}
.links a:hover {
  color: var(--bs-body-color);
}
</style>
