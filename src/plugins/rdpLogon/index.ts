import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class RdpLogonPlugin extends PluginBase {
  name = 'rdpLogon';
  category = 'Account';
  label = 'RDP Logon';
  description = 'RDP connection history with IP geolocation data';
  icon = 'fa-desktop';
  providers = [
    'Microsoft-Windows-TerminalServices-LocalSessionManager',
    'Microsoft-Windows-TerminalServices-RemoteConnectionManager',
    'Microsoft-Windows-Security-Auditing',
  ];
  eventIds = [21, 22, 23, 24, 25, 1149, 4624, 4625];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    return [
      { key: 'user', label: 'User', type: 'text', width: '160px' },
      { key: 'ip', label: 'Source IP', type: 'text', width: '160px' },
      { key: 'action', label: 'Action', type: 'select', options: actions },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'user', label: 'User', render: e => (e.data['User'] as string) || (e.data['TargetUserName'] as string) || '' },
      { key: 'sourceIP', label: 'Source IP', render: e => (e.data['Address'] as string) || (e.data['IpAddress'] as string) || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 21: return 'Shell Start (Logon)';
      case 22: return 'Shell Stop (Logoff)';
      case 23: return 'Session Connect';
      case 24: return 'Session Disconnect';
      case 25: return 'Session Reconnect';
      case 1149: return 'RDP Connection Attempt';
      case 4624: return 'RDP Logon Success';
      case 4625: return 'RDP Logon Failed';
      default: return `Event ${e.eventId}`;
    }
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    const uniqueIPs = new Set(
      events.map(e => e.data['Address'] || e.data['IpAddress']).filter(Boolean),
    );
    return {
      summary: [
        { title: 'RDP Sessions', value: events.filter(e => [21, 23, 25].includes(e.eventId)).length },
        { title: 'Unique IPs', value: uniqueIPs.size },
        { title: 'Connection Attempts', value: events.filter(e => e.eventId === 1149).length },
      ],
      charts: [],
    };
  }

  getChartData(events: EvtxEvent[]): ChartConfig[] {
    const byIP = new Map<string, number>();
    for (const e of events) {
      const ip = (e.data['Address'] as string) || (e.data['IpAddress'] as string) || 'Unknown';
      byIP.set(ip, (byIP.get(ip) || 0) + 1);
    }
    return [{
      type: 'bar', title: 'RDP by Source IP',
      data: Array.from(byIP.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([ip, count]) => ({ ip, count })),
      xKey: 'ip', yKey: 'count',
    }];
  }

  getExportData(events: EvtxEvent[]): Record<string, unknown>[] {
    return events.map(e => ({
      Timestamp: e.timestamp.toISOString(),
      EventID: e.eventId,
      Action: this.getAction(e),
      User: e.data['User'] || e.data['TargetUserName'] || '',
      SourceIP: e.data['Address'] || e.data['IpAddress'] || '',
    }));
  }
}
