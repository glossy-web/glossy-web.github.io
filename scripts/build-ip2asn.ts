/**
 * Packs the iptoasn.com IPv4 database for the browser.
 *
 *   node --experimental-strip-types scripts/build-ip2asn.ts ip2asn-v4-u32.tsv.gz [public/data/ip2asn-v4.bin.gz]
 *
 * The input is https://iptoasn.com/data/ip2asn-v4-u32.tsv.gz; CI downloads a fresh copy on each deploy.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { encodeIpDb, IpDb, parseIp2AsnTsv } from '../src/core/ipdb.ts';

const [input, output = 'public/data/ip2asn-v4.bin.gz'] = process.argv.slice(2);
if (!input) {
  console.error('usage: build-ip2asn.ts <ip2asn-v4-u32.tsv.gz> [output]');
  process.exit(2);
}

const text = gunzipSync(readFileSync(input)).toString('utf8');
const packed = encodeIpDb(parseIp2AsnTsv(text), Math.floor(Date.now() / 1000));
const db = new IpDb(packed.buffer as ArrayBuffer);
// A known allocation as a sanity check: 1.1.1.1 is announced by Cloudflare (AS13335).
if (db.lookup('1.1.1.1')?.asn !== 13335) throw new Error('Sanity check failed: 1.1.1.1 is not AS13335');

mkdirSync(dirname(output), { recursive: true });
const gz = gzipSync(packed, { level: 9 });
writeFileSync(output, gz);
console.log(`${output}: ${db.ranges.toLocaleString()} ranges, ${(packed.length / 1e6).toFixed(1)} MB → ${(gz.length / 1e6).toFixed(1)} MB gzipped`);
