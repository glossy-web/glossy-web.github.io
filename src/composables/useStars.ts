import { computed } from 'vue';
import { useStorage } from '@vueuse/core';
import type { EvtxEvent } from '@/core/evtx/types';
import { recordKey } from '@/core/store';

interface Star {
  at: number;
  note: string;
}

/**
 * Starred events and their notes, kept in this browser by record identity, so they come back
 * when the same logs (or other copies of them) are loaded again.
 */
const stars = useStorage<Record<string, Star>>('glossy.stars', {});

export const starCount = computed(() => Object.keys(stars.value).length);

export function starOf(e: EvtxEvent): Star | undefined {
  return stars.value[recordKey(e)];
}

export function toggleStar(e: EvtxEvent): void {
  const key = recordKey(e);
  const next = { ...stars.value };
  if (next[key]) delete next[key];
  else next[key] = { at: Date.now(), note: '' };
  stars.value = next;
}

export function setNote(e: EvtxEvent, note: string): void {
  const key = recordKey(e);
  const star = stars.value[key];
  if (star) stars.value = { ...stars.value, [key]: { ...star, note } };
}

export function clearStars(): void {
  stars.value = {};
}
