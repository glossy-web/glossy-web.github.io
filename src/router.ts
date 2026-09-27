import { createRouter, createWebHashHistory, type LocationQueryValue } from 'vue-router';
import SourceList from '@/components/SourceList.vue';

type QueryValue = LocationQueryValue | LocationQueryValue[] | undefined;
const text = (v: QueryValue) => (typeof v === 'string' && v ? v : undefined);
const number = (v: QueryValue) => (typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

/**
 * Hash URLs (#/m/logon/sessions) work on GitHub Pages without server rewrites and give every
 * page and view its own address, so the back button and links behave as expected.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'overview', component: SourceList },
    // Modules (tables, ECharts) load on first use, so the landing page stays light.
    // Query: q (search), from/to (epoch ms, time range), anchor (event id to select).
    {
      path: '/m/:name/:view?',
      name: 'module',
      component: () => import('@/components/PluginView.vue'),
      props: route => ({
        name: String(route.params['name']),
        view: route.params['view'] ? String(route.params['view']) : undefined,
        q: text(route.query['q']),
        from: number(route.query['from']),
        to: number(route.query['to']),
        anchor: number(route.query['anchor']),
      }),
    },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
});
