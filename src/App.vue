<template>
  <SidebarProvider class="h-svh min-h-0">
    <AppSidebar v-if="hasData" />
    <SidebarInset class="min-w-0 overflow-hidden">
      <header class="bg-background flex h-10 shrink-0 items-center gap-2 border-b px-2">
        <template v-if="hasData">
          <SidebarTrigger />
          <Separator orientation="vertical" class="h-4!" />
        </template>
        <RouterLink v-else to="/" class="flex items-center gap-1.5 px-1 text-sm font-semibold"><img :src="logo" alt="" class="size-4" />Glossy</RouterLink>
        <span v-if="hasData || loader.busy" class="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
          {{ sourceCount }} file(s) · {{ eventCount.toLocaleString() }} events
          <template v-if="loader.busy"><LoaderCircleIcon class="size-3.5 animate-spin" /> parsing</template>
        </span>

        <div class="ml-auto flex items-center gap-1.5">
          <Button variant="outline" class="text-muted-foreground w-44 justify-between font-normal" @click="paletteOpen = true">
            <span class="flex items-center gap-1.5"><SearchIcon />Go to…</span>
            <KbdGroup><Kbd>Ctrl</Kbd><Kbd>K</Kbd></KbdGroup>
          </Button>
          <TimeZonePicker />
          <Button variant="ghost" size="icon" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'" :title="isDark ? 'Light mode' : 'Dark mode'" @click="toggleTheme">
            <SunIcon v-if="isDark" /><MoonIcon v-else />
          </Button>
          <Separator orientation="vertical" class="h-4!" />
          <Button @click="fileInput?.click()"><FilePlusIcon />Add files</Button>
          <Button variant="outline" @click="folderInput?.click()"><FolderPlusIcon />Add folder</Button>
          <Button v-if="hasData" variant="ghost" size="icon" aria-label="Remove all files" title="Remove all files" @click="confirmClear = true"><Trash2Icon /></Button>
        </div>
        <input ref="fileInput" type="file" multiple accept=".evtx" hidden @change="onPick" />
        <input ref="folderInput" type="file" webkitdirectory multiple hidden @change="onPick" />
      </header>

      <div class="flex min-h-0 flex-1 flex-col">
        <SourceIndex v-if="!hasData && !loader.files.length" @browse="fileInput?.click()" />
        <RouterView v-else v-slot="{ Component, route }">
          <component :is="Component" :key="String(route.params['name'] ?? 'overview')" />
        </RouterView>
      </div>
    </SidebarInset>

    <CommandPalette v-model:open="paletteOpen" :has-data="hasData" @command="onCommand" />
    <AlertDialog v-model:open="confirmClear">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove all files?</AlertDialogTitle>
          <AlertDialogDescription>Every loaded file and event is removed from this page. The files on disk are not touched.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="clear">Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <FileDropZone @files="load" />
    <Toaster position="bottom-right" rich-colors />
  </SidebarProvider>
</template>

<script setup lang="ts">
import 'vue-sonner/style.css';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { FilePlusIcon, FolderPlusIcon, LoaderCircleIcon, MoonIcon, SearchIcon, SunIcon, Trash2Icon } from '@lucide/vue';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { eventStore } from '@/core/store';
import { clearAll, loadFiles, loader } from '@/composables/useFileLoader';
import { isDark, toggleTheme } from '@/composables/useTheme';
import AppSidebar from '@/components/layout/AppSidebar.vue';
import CommandPalette, { type PaletteCommand } from '@/components/layout/CommandPalette.vue';
import TimeZonePicker from '@/components/layout/TimeZonePicker.vue';
import SourceIndex from '@/components/SourceIndex.vue';
import FileDropZone from '@/components/FileDropZone.vue';
import logo from '@/assets/glossy.ico';

const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
const paletteOpen = ref(false);
const confirmClear = ref(false);

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
  void router.push('/');
  void loadFiles(files);
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  load(Array.from(input.files ?? []));
  input.value = '';
}

function clear() {
  clearAll();
  void router.push('/');
  toast('All files removed');
}

function onCommand(command: PaletteCommand) {
  if (command === 'add-files') fileInput.value?.click();
  else if (command === 'add-folder') folderInput.value?.click();
  else confirmClear.value = true;
}

// One summary toast per loading batch.
let batchStart = 0;
let eventsBefore = 0;
watch(
  () => loader.busy,
  busy => {
    if (busy) {
      batchStart = loader.files.findIndex(f => f.status === 'queued' || f.status === 'reading' || f.status === 'parsing');
      eventsBefore = eventStore.size;
      return;
    }
    const batch = loader.files.slice(Math.max(0, batchStart));
    const failed = batch.filter(f => f.status === 'failed').length;
    const skipped = batch.filter(f => f.status === 'skipped').length;
    const done = batch.length - failed - skipped;
    const detail = [skipped && `${skipped} already loaded`, failed && `${failed} failed`].filter(Boolean).join(', ');
    const message = `${done} file(s) loaded · ${(eventStore.size - eventsBefore).toLocaleString()} events added`;
    if (failed) toast.warning(message, { description: detail });
    else toast.success(message, { description: detail || undefined });
  },
);
</script>
