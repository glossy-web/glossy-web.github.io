<template>
  <div class="flex flex-1 flex-col items-center overflow-auto p-6 text-center">
    <h1 class="mt-6 flex items-center gap-2 text-2xl font-semibold"><img :src="icon" alt="" width="32" height="32" />Glossy Event Log Forensics</h1>
    <p class="text-muted-foreground mt-2 max-w-2xl text-sm">
      Windows event log (<code>.evtx</code>) analysis that runs entirely in your browser. Files are parsed locally by a
      WebAssembly build of the Rust <code>evtx</code> parser. Nothing is uploaded, and analysis makes no network requests.
    </p>

    <button
      type="button"
      class="bg-muted/40 hover:border-primary hover:bg-primary/5 focus-visible:border-primary focus-visible:ring-ring/30 mt-6 w-full max-w-xl rounded-xl border-2 border-dashed p-10 outline-none focus-visible:ring-2"
      @click="$emit('browse')"
    >
      <CloudUploadIcon class="text-muted-foreground mx-auto mb-3 size-10" aria-hidden="true" />
      <span class="block text-base font-medium">Drop .evtx files or a whole <code>winevt\Logs</code> folder here</span>
      <span class="text-muted-foreground text-xs">or click to choose files</span>
    </button>

    <ul class="text-muted-foreground mt-6 max-w-2xl list-disc space-y-1.5 pl-5 text-left text-xs leading-relaxed">
      <li>Reads every chunk, including those a dirty (not cleanly closed) header leaves out, and reports damaged chunks instead of stopping.</li>
      <li>Timestamps are shown in this computer's time zone until you pick another (e.g. UTC) from the header, each with its offset from UTC. CSV exports carry the offset too; JSONL for Timesketch is always UTC.</li>
      <li>Flags record-number gaps, duplicate files and duplicate records (e.g. shadow copies), and which logs are missing.</li>
      <li>
        Analysis modules follow the original <a :href="links.original" target="_blank" rel="noopener" class="text-foreground underline underline-offset-2">Glossy</a>
        (<a :href="links.paper" target="_blank" rel="noopener" class="text-foreground underline underline-offset-2">KDFS 2017 paper</a>, Korean) and current triage practice.
      </li>
    </ul>

    <footer class="text-muted-foreground mt-auto flex flex-wrap justify-center gap-4 pt-8 text-xs">
      <a v-for="l in footer" :key="l.href" :href="l.href" target="_blank" rel="noopener" class="hover:text-foreground flex items-center gap-1">
        <component :is="l.icon" class="size-3.5" aria-hidden="true" />{{ l.label }}
      </a>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { AtSignIcon, BriefcaseIcon, CloudUploadIcon, CodeIcon, GitForkIcon } from '@lucide/vue';
import icon from '@/assets/glossy.ico';

defineEmits<{ browse: [] }>();

const links = {
  original: 'https://github.com/whatabeautifulmemory/glossy',
  paper: 'https://github.com/whatabeautifulmemory/glossy/files/13562844/KDFS.2017.v0.1.pdf',
};

const footer = [
  { label: 'glossy-web', href: 'https://github.com/glossy-web/glossy-web.github.io', icon: CodeIcon },
  { label: 'original Glossy', href: links.original, icon: GitForkIcon },
  { label: '@copy_and_paster', href: 'https://x.com/copy_and_paster', icon: AtSignIcon },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/whatabeautifulmoment/', icon: BriefcaseIcon },
];
</script>
