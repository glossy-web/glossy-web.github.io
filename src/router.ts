import { createRouter, createWebHashHistory } from 'vue-router';
import SourceList from '@/components/SourceList.vue';

/**
 * Hash URLs (#/m/logon/sessions) work on GitHub Pages without server rewrites and give every
 * page and view its own address, so the back button and links behave as expected.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'overview', component: SourceList },
    // Modules (tables, ECharts) load on first use, so the landing page stays light.
    { path: '/m/:name/:view?', name: 'module', component: () => import('@/components/PluginView.vue'), props: true },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
});
