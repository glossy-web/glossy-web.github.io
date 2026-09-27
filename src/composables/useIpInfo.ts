import { ref, shallowRef } from 'vue';
import { IpDb, type AsInfo } from '@/core/ipdb';

const db = shallowRef<IpDb | null>(null);
export const ipDbStatus = ref<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');

/**
 * Fetches the packed iptoasn.com database from this site (built by scripts/build-ip2asn.ts).
 * Addresses are looked up locally; none leave the browser.
 */
async function load(): Promise<void> {
  ipDbStatus.value = 'loading';
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/ip2asn-v4.bin.gz`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let bytes = await res.arrayBuffer();
    // Servers may already have removed the gzip layer (Content-Encoding); check the magic bytes.
    const head = new Uint8Array(bytes, 0, 2);
    if (head[0] === 0x1f && head[1] === 0x8b) bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    db.value = new IpDb(bytes);
    ipDbStatus.value = 'ready';
  } catch (e) {
    console.warn('IP-to-ASN database unavailable:', e);
    ipDbStatus.value = 'unavailable';
  }
}

/** AS and registered country of a public IPv4 address; loads the database on first use and is reactive to it. */
export function ipInfo(ip: string): AsInfo | undefined {
  if (!ip) return undefined;
  if (ipDbStatus.value === 'idle') void load();
  return db.value?.lookup(ip);
}
