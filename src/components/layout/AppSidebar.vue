<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton as-child tooltip="Glossy">
            <RouterLink to="/">
              <img :src="logo" alt="" class="size-4 shrink-0" />
              <span class="text-sm font-semibold">Glossy</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent class="gap-0">
      <SidebarGroup class="py-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton as-child size="sm" tooltip="Overview" :is-active="route.name === 'overview'">
              <RouterLink to="/"><ClipboardListIcon /><span>Overview</span></RouterLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem v-for="p in pages" :key="p.name">
            <SidebarMenuButton as-child size="sm" :tooltip="p.label" :is-active="active === p.name">
              <RouterLink :to="`/m/${p.name}`"><component :is="icon(p.icon)" /><span>{{ p.label }}</span></RouterLink>
            </SidebarMenuButton>
            <SidebarMenuBadge v-if="p.name === 'showAll'" class="text-muted-foreground">{{ total.toLocaleString() }}</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup v-for="cat in groups" :key="cat.id" class="py-1">
        <SidebarGroupLabel class="h-6">{{ cat.label }}</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem v-for="p in cat.plugins" :key="p.name">
            <SidebarMenuButton
              as-child
              size="sm"
              :tooltip="p.label"
              :is-active="active === p.name"
              :class="{ 'text-muted-foreground': !counts[p.name] }"
              :title="counts[p.name] ? undefined : 'No matching events in the loaded logs'"
            >
              <RouterLink :to="`/m/${p.name}`"><component :is="icon(p.icon)" /><span>{{ p.label }}</span></RouterLink>
            </SidebarMenuButton>
            <SidebarMenuBadge class="text-muted-foreground">{{ (counts[p.name] ?? 0).toLocaleString() }}</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
    <SidebarRail />
  </Sidebar>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ClipboardListIcon } from '@lucide/vue';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { CATEGORIES } from '@/core/settings';
import { eventStore } from '@/core/store';
import { plugins } from '@/plugins';
import { icon } from '@/components/icons';
import logo from '@/assets/glossy.ico';

const route = useRoute();
const active = computed(() => (route.name === 'module' ? String(route.params['name']) : ''));

/** Pages over all loaded events (All Events, Timeline), then the modules by category. */
const pages = plugins.filter(p => p.category === 'All');
const groups = CATEGORIES.map(c => ({ ...c, plugins: plugins.filter(p => p.category === c.id) })).filter(c => c.plugins.length);

const total = computed(() => {
  void eventStore.version.value;
  return eventStore.size;
});
const counts = computed(() => {
  void eventStore.version.value;
  return Object.fromEntries(plugins.map(p => [p.name, eventStore.count(p.sources)]));
});
</script>
