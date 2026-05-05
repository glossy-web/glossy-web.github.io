import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class WirelessPlugin extends PluginBase {
  name = 'wireless';
  category = 'Hardware';
  label = 'Wireless Connect';
  description = 'Wi-Fi network connection history';
  icon = 'fa-wifi';
  providers = ['Microsoft-Windows-WLAN-AutoConfig'];
  eventIds = [8000, 8001, 8002, 8003, 11000, 11001, 11002, 11004, 11005, 11010];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    return [
      { key: 'ssid', label: 'SSID', type: 'text', width: '160px' },
      { key: 'bssid', label: 'BSSID', type: 'text', width: '160px' },
      { key: 'action', label: 'Action', type: 'select', options: actions },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'ssid', label: 'SSID', render: e => (e.data['SSID'] as string) || (e.data['Ssid'] as string) || '' },
      { key: 'bssid', label: 'BSSID', render: e => (e.data['BSSID'] as string) || (e.data['Bssid'] as string) || '' },
      { key: 'auth', label: 'Authentication', render: e => (e.data['Authentication'] as string) || '' },
      { key: 'cipher', label: 'Cipher', render: e => (e.data['Cipher'] as string) || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 8000: return 'WLAN Service Started';
      case 8001: return 'WLAN Service Stopped';
      case 8002: return 'Connected to WLAN';
      case 8003: return 'Disconnected from WLAN';
      case 11000: return 'Wireless Association Started';
      case 11001: return 'Wireless Association Success';
      case 11002: return 'Wireless Association Failed';
      case 11004: return 'Wireless Security Started';
      case 11005: return 'Wireless Security Success';
      case 11010: return 'Wireless Security Failed';
      default: return `Event ${e.eventId}`;
    }
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    const ssids = new Map<string, number>();
    for (const e of events) {
      const ssid = (e.data['SSID'] as string) || (e.data['Ssid'] as string) || 'Unknown';
      if (ssid && ssid !== 'Unknown') ssids.set(ssid, (ssids.get(ssid) || 0) + 1);
    }
    return {
      summary: [
        { title: 'Connections', value: events.filter(e => e.eventId === 8002).length },
        { title: 'Unique SSIDs', value: ssids.size },
        { title: 'Association Failures', value: events.filter(e => e.eventId === 11002).length },
      ],
      charts: [{
        type: 'bar', title: 'Favorite Networks',
        data: Array.from(ssids.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
        xKey: 'name', yKey: 'count',
      }],
    };
  }

  getChartData(events: EvtxEvent[]): ChartConfig[] {
    const byDate = new Map<string, number>();
    for (const e of events) {
      if (e.eventId === 8002) {
        const d = dayjs(e.timestamp).format('YYYY-MM-DD');
        byDate.set(d, (byDate.get(d) || 0) + 1);
      }
    }
    return [{
      type: 'bar', title: 'WiFi Connection History',
      data: Array.from(byDate.entries()).map(([date, count]) => ({ date, count })),
      xKey: 'date', yKey: 'count',
    }];
  }

  getExportData(events: EvtxEvent[]): Record<string, unknown>[] {
    return events.map(e => ({
      Timestamp: e.timestamp.toISOString(),
      EventID: e.eventId,
      Action: this.getAction(e),
      SSID: e.data['SSID'] || e.data['Ssid'] || '',
      BSSID: e.data['BSSID'] || e.data['Bssid'] || '',
      Authentication: e.data['Authentication'] || '',
      Cipher: e.data['Cipher'] || '',
    }));
  }
}
