<template>
  <aside class="glossy-sidebar bg-white border-end">
    <div class="sidebar-header px-3 py-2 fw-bold text-muted small text-uppercase">
      Analysis Plugins
    </div>
    <ul class="nav flex-column">
      <li>
        <a class="nav-link sidebar-item"
           :class="{ active: activePlugin === '__index' }"
           href="#" @click.prevent="$emit('select', '__index')">
          <i class="fa fa-dashboard me-2"></i>Overview
        </a>
      </li>
      <li v-for="item in menu" :key="item.name">
        <template v-if="item.children">
          <a class="nav-link sidebar-category" data-bs-toggle="collapse"
             :href="'#cat_' + sanitize(item.name)" role="button">
            <i :class="'fa ' + item.icon + ' me-2'"></i>{{ item.label }}
          </a>
          <div class="collapse" :class="{ show: isCategoryActive(item) }"
               :id="'cat_' + sanitize(item.name)">
            <ul class="nav flex-column ms-3">
              <li v-for="child in item.children" :key="child.name">
                <a class="nav-link sidebar-item"
                   :class="{ active: activePlugin === child.name }"
                   href="#" @click.prevent="$emit('select', child.name)">
                  <i :class="'fa ' + child.icon + ' me-2'"></i>{{ child.label }}
                </a>
              </li>
            </ul>
          </div>
        </template>
        <template v-else>
          <a class="nav-link sidebar-item"
             :class="{ active: activePlugin === item.name }"
             href="#" @click.prevent="$emit('select', item.name)">
            <i :class="'fa ' + item.icon + ' me-2'"></i>{{ item.label }}
          </a>
        </template>
      </li>
    </ul>
  </aside>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { pluginMenu } from '@/core/settings';

export default defineComponent({
  name: 'GlossySidebar',
  props: {
    activePlugin: { type: String, required: true },
  },
  emits: ['select'],
  setup(props) {
    const menu = pluginMenu;

    function sanitize(name: string): string {
      return name.replace(/[^a-zA-Z0-9]/g, '_');
    }

    function isCategoryActive(cat: { name: string; children?: Array<{ name: string }> }): boolean {
      return cat.children?.some(c => c.name === props.activePlugin) ?? false;
    }

    return { menu, sanitize, isCategoryActive };
  },
});
</script>

<style scoped>
.glossy-sidebar {
  width: 250px;
  min-width: 250px;
  min-height: calc(100vh - 56px);
  overflow-y: auto;
  font-size: 13px;
}
.sidebar-header {
  border-bottom: 1px solid #dee2e6;
}
.sidebar-category {
  color: #495057;
  font-weight: 600;
  padding: 8px 16px;
  border-bottom: 1px solid #f0f0f0;
}
.sidebar-item {
  color: #6c757d;
  padding: 5px 16px;
  border-left: 3px solid transparent;
}
.sidebar-item:hover {
  background: #f8f9fa;
  color: #212529;
}
.sidebar-item.active {
  color: #0d6efd;
  background: #e7f1ff;
  border-left-color: #0d6efd;
  font-weight: 600;
}
</style>
