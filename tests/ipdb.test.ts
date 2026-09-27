import { describe, expect, it } from 'vitest';
import { encodeIpDb, IpDb, parseIp2AsnTsv, parseIPv4 } from '@/core/ipdb';

const TSV = [
  ['16777216', '16777471', '13335', 'US', 'CLOUDFLARENET'],
  ['16777472', '16778239', '0', 'None', 'Not routed'],
  ['16778240', '16779263', '38803', 'AU', 'GTELECOM-AS-AP Gtelecom Pty Ltd'],
  ['16779264', '16779519', '38803', 'AU', 'GTELECOM-AS-AP Gtelecom Pty Ltd'],
  // 1.0.8.0 – 1.0.15.255 is not listed: a gap
  ['16781312', '16781567', '4766', 'KR', 'KIXS-AS-KR Korea Telecom'],
]
  .map(r => r.join('\t'))
  .join('\n');

describe('IPv4 to ASN database', () => {
  const packed = encodeIpDb(parseIp2AsnTsv(TSV), 1700000000);
  const db = new IpDb(packed.buffer as ArrayBuffer);

  it('parses IPv4 text', () => {
    expect(parseIPv4('1.0.0.1')).toBe(16777217);
    expect(parseIPv4('::ffff:1.0.0.1')).toBe(16777217);
    expect(parseIPv4('255.255.255.255')).toBe(4294967295);
    expect(parseIPv4('256.0.0.1')).toBeNull();
    expect(parseIPv4('fe80::1')).toBeNull();
    expect(parseIPv4('-')).toBeNull();
  });

  it('finds the AS for addresses in listed ranges', () => {
    expect(db.lookup('1.0.0.1')).toEqual({ asn: 13335, country: 'US', name: 'CLOUDFLARENET' });
    expect(db.lookup('1.0.4.0')).toEqual({ asn: 38803, country: 'AU', name: 'GTELECOM-AS-AP Gtelecom Pty Ltd' });
    expect(db.lookup('1.0.16.200')?.asn).toBe(4766);
  });

  it('treats unrouted, unlisted and out-of-range addresses as unknown', () => {
    expect(db.lookup('1.0.1.1')).toBeUndefined();
    expect(db.lookup('1.0.10.1')).toBeUndefined();
    expect(db.lookup('0.0.0.1')).toBeUndefined();
    expect(db.lookup('8.8.8.8')).toBeUndefined();
    expect(db.lookup('not an ip')).toBeUndefined();
  });

  it('merges adjacent ranges of one AS and keeps the build time', () => {
    // 0 (gap) · Cloudflare · unrouted · Gtelecom (two rows merged) · gap · KT · rest
    expect(db.ranges).toBe(7);
    expect(db.builtAt).toBe(1700000000);
  });

  it('rejects unsorted input', () => {
    expect(() => encodeIpDb([...parseIp2AsnTsv(TSV)].reverse())).toThrow(/not sorted/);
  });
});
