import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, SourceSpec } from '@/core/plugin';
import { d, eventView, groupBy, pick, text, withBase, type EventRow } from '../common';

const WLAN = 'Microsoft-Windows-WLAN-AutoConfig';
const NP = 'Microsoft-Windows-NetworkProfile';

const SOURCES: SourceSpec[] = [
  { channel: 'Microsoft-Windows-WLAN-AutoConfig/Operational', provider: WLAN, ids: [8000, 8001, 8002, 8003] },
  { channel: 'Microsoft-Windows-NetworkProfile/Operational', provider: NP, ids: [10000, 10001] },
];

const LABELS: Record<string, string> = {
  8000: 'Wi-Fi connection started',
  8001: 'Wi-Fi connected',
  8002: 'Wi-Fi connection failed',
  8003: 'Wi-Fi disconnected',
  10000: 'Network connected',
  10001: 'Network disconnected',
};

export interface WlanRow extends EventRow {
  action: string;
  ssid: string;
  bssid: string;
  profile: string;
  auth: string;
  cipher: string;
  phy: string;
  detail: string;
}

function toRow(e: EvtxEvent): WlanRow {
  if (e.provider.toLowerCase() === NP.toLowerCase()) {
    return { event: e, action: LABELS[e.eventId]!, ssid: '', bssid: '', profile: d(e, 'Name'), auth: '', cipher: '', phy: '', detail: [d(e, 'Description'), d(e, 'Category') && `Category ${d(e, 'Category')}`].filter(Boolean).join(' · ') };
  }
  return {
    event: e,
    action: LABELS[e.eventId]!,
    ssid: d(e, 'SSID'),
    bssid: pick(e, 'BSSID', 'Bssid'),
    profile: d(e, 'ProfileName'),
    auth: d(e, 'AuthenticationAlgorithm'),
    cipher: d(e, 'CipherAlgorithm'),
    phy: d(e, 'PHYType'),
    detail: e.eventId === 8002 ? pick(e, 'FailureReason', 'ReasonCode') : e.eventId === 8003 ? d(e, 'Reason') : d(e, 'InterfaceDescription'),
  };
}

const eventColumns: Column<WlanRow>[] = withBase<WlanRow>([
  text('action', 'Action', r => r.action, { size: 190, facet: true, tone: r => (r.event.eventId === 8002 ? 'danger' : r.event.eventId === 8001 ? 'success' : undefined) }),
  text('ssid', 'SSID', r => r.ssid, { size: 200, facet: true }),
  text('profile', 'Profile / network', r => r.profile, { size: 200 }),
  text('auth', 'Authentication', r => r.auth, { size: 130, facet: true }),
  text('cipher', 'Cipher', r => r.cipher, { size: 100, facet: true }),
  text('phy', 'PHY', r => r.phy, { size: 90 }),
  text('bssid', 'BSSID', r => r.bssid, { size: 150, kind: 'mono' }),
  text('detail', 'Detail', r => r.detail, { size: 300 }),
]);

interface NetworkSummary {
  ssid: string;
  computer: string;
  first: number;
  last: number;
  connections: number;
  failures: number;
  security: string;
  sample: EvtxEvent;
}

const networkColumns: Column<NetworkSummary>[] = [
  text('ssid', 'SSID', r => r.ssid, { size: 220 }),
  text('computer', 'Computer', r => r.computer, { size: 150, facet: true }),
  { id: 'first', label: 'First connected', kind: 'time', value: r => r.first, size: 230 },
  { id: 'last', label: 'Last connected', kind: 'time', value: r => r.last, size: 230 },
  { id: 'connections', label: 'Connections', kind: 'number', value: r => r.connections, size: 100 },
  { id: 'failures', label: 'Failures', kind: 'number', value: r => r.failures, size: 80 },
  text('security', 'Security', r => r.security, { size: 200, tone: r => (/open|none|wep/i.test(r.security) ? 'warning' : undefined) }),
];

export const wireless: Plugin = {
  name: 'wireless',
  label: 'Wireless & Networks',
  category: 'Hardware',
  icon: 'wifi',
  description: 'Wi-Fi connections, failures and disconnections (WLAN-AutoConfig 8000–8003) and network connections by name (NetworkProfile 10000/10001).',
  sources: SOURCES,
  analyze(ctx) {
    const rows = ctx.select(SOURCES).map(toRow);
    const wifi = rows.filter(r => r.ssid);
    const networks: NetworkSummary[] = [...groupBy(wifi, r => `${r.event.computer}\u0001${r.ssid}`).values()].map(list => {
      const connected = list.filter(r => r.event.eventId === 8001);
      return {
        ssid: list[0]!.ssid,
        computer: list[0]!.event.computer,
        first: connected[0]?.event.ts ?? NaN,
        last: connected[connected.length - 1]?.event.ts ?? NaN,
        connections: connected.length,
        failures: list.filter(r => r.event.eventId === 8002).length,
        security: [...new Set(connected.map(r => [r.auth, r.cipher].filter(Boolean).join(' / ')))].join(', '),
        sample: (connected[connected.length - 1] ?? list[0]!).event,
      };
    });
    return {
      stats: [
        { label: 'Wi-Fi connections', value: rows.filter(r => r.event.eventId === 8001).length },
        { label: 'Failed connections', value: rows.filter(r => r.event.eventId === 8002).length },
        { label: 'Networks (SSID)', value: networks.length },
        { label: 'Network profile events', value: rows.filter(r => r.event.eventId >= 10000).length },
      ],
      charts: [
        {
          kind: 'clock',
          title: 'Wi-Fi activity by time of day',
          series: [
            { name: 'Connected', ts: rows.filter(r => r.event.eventId === 8001).map(r => r.event.ts) },
            { name: 'Disconnected', ts: rows.filter(r => r.event.eventId === 8003).map(r => r.event.ts) },
            { name: 'Failed', ts: rows.filter(r => r.event.eventId === 8002).map(r => r.event.ts) },
          ],
        },
      ],
      views: [
        { id: 'networks', label: 'Networks', rows: networks, columns: networkColumns, event: r => r.sample, sort: { id: 'last', desc: true } },
        {
          ...eventView('events', 'Events', rows, eventColumns),
          timeline: r => ({ title: `Wi-Fi ${r.action.toLowerCase()}: ${r.ssid}`, detail: [r.bssid, r.auth, r.cipher, r.detail].filter(Boolean).join(' · ') }),
        },
      ],
      notes: [],
    };
  },
};
