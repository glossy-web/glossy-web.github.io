<template>
  <CommandDialog v-model:open="open" title="Go to" description="Open a page or run a command">
    <CommandInput placeholder="Go to a page or run a command…" />
    <CommandList>
      <CommandEmpty>No results.</CommandEmpty>
      <CommandGroup v-if="hasData" heading="Pages">
        <CommandItem value="Overview" @select="go('/')"><ClipboardListIcon />Overview</CommandItem>
        <CommandItem v-for="p in plugins" :key="p.name" :value="`${p.label} ${p.category}`" @select="go(`/m/${p.name}`)">
          <component :is="icon(p.icon)" />{{ p.label }}
          <span v-if="p.category !== 'All'" class="text-muted-foreground ml-auto">{{ p.category }}</span>
        </CommandItem>
      </CommandGroup>
      <CommandSeparator v-if="hasData" />
      <CommandGroup heading="Commands">
        <CommandItem value="Add files" @select="run('add-files')"><FilePlusIcon />Add files…</CommandItem>
        <CommandItem value="Add folder" @select="run('add-folder')"><FolderPlusIcon />Add folder…</CommandItem>
        <CommandItem value="Toggle dark mode theme" @select="close(toggleTheme)"><SunMoonIcon />Toggle dark mode</CommandItem>
        <CommandItem v-if="hasData" value="Toggle sidebar" @select="close(toggleSidebar)"><PanelLeftIcon />Toggle sidebar<CommandShortcut>Ctrl B</CommandShortcut></CommandItem>
        <CommandItem v-if="hasData" value="Clear remove all files" @select="run('clear')"><Trash2Icon />Remove all files…</CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useEventListener } from '@vueuse/core';
import { ClipboardListIcon, FilePlusIcon, FolderPlusIcon, PanelLeftIcon, SunMoonIcon, Trash2Icon } from '@lucide/vue';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';
import { useSidebar } from '@/components/ui/sidebar';
import { plugins } from '@/plugins';
import { icon } from '@/components/icons';
import { toggleTheme } from '@/composables/useTheme';

export type PaletteCommand = 'add-files' | 'add-folder' | 'clear';

defineProps<{ hasData: boolean }>();
const emit = defineEmits<{ command: [command: PaletteCommand] }>();
const open = defineModel<boolean>('open', { default: false });
const router = useRouter();
const { toggleSidebar } = useSidebar();

useEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    open.value = !open.value;
  }
});

function go(path: string) {
  open.value = false;
  void router.push(path);
}

function run(command: PaletteCommand) {
  open.value = false;
  emit('command', command);
}

function close(action: () => void) {
  open.value = false;
  action();
}
</script>
