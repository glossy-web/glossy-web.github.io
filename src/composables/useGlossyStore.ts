import { ref, watch } from 'vue';
import { browserZone } from '@/core/time';

const TZ_KEY = 'glossy.timeZone';

function readZone(): string {
  try {
    return localStorage.getItem(TZ_KEY) || browserZone();
  } catch {
    return browserZone();
  }
}

/** Display time zone: this computer's zone until the analyst picks one, which is then remembered per browser. */
export const timeZone = ref(readZone());

watch(timeZone, zone => {
  try {
    localStorage.setItem(TZ_KEY, zone);
  } catch {
    /* storage unavailable (private mode); the setting just is not remembered */
  }
});

/** Per-plugin option toggles (noise filters etc.), keyed by plugin name. */
export const pluginOptions = ref<Record<string, Record<string, boolean>>>({});
