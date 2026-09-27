import { computed } from 'vue';
import { useColorMode } from '@vueuse/core';

/** Dark by default; the choice is remembered per browser (index.html applies it before the first paint). */
const mode = useColorMode({ storageKey: 'glossy.theme', initialValue: 'dark', disableTransition: true });

export const isDark = computed(() => mode.value === 'dark');

export function toggleTheme(): void {
  mode.value = isDark.value ? 'light' : 'dark';
}
