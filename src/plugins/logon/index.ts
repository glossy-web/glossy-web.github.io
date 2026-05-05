import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class LogonPlugin extends PluginBase {
  name = 'logon';
  category = 'Account';
  label = 'Account Logon';
  description = 'Logon/logoff events with failure reason analysis';
  icon = 'fa-sign-in';
  providers = ['Microsoft-Windows-Security-Auditing'];
  eventIds = [4624, 4625, 4647, 4672, 4634, 4778, 4779, 4800, 4801];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    const logonTypes = [...new Set(events.map(e => this.getLogonType(e)).filter(Boolean))].sort();
    return [
      { key: 'user', label: 'User', type: 'text', width: '160px' },
      { key: 'logonType', label: 'Logon Type', type: 'select', options: logonTypes },
      { key: 'sourceIP', label: 'Source IP', type: 'text', width: '160px' },
      { key: 'action', label: 'Action', type: 'select', options: actions },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'user', label: 'User', render: e => (e.data['TargetUserName'] as string) || '' },
      { key: 'logonType', label: 'Logon Type', render: e => this.getLogonType(e) },
      { key: 'sourceIP', label: 'Source IP', render: e => (e.data['IpAddress'] as string) || (e.data['SourceNetworkAddress'] as string) || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 4624: return 'Logon Success';
      case 4625: return 'Logon Failed';
      case 4647: return 'User Initiated Logoff';
      case 4672: return 'Special Privilege Logon';
      case 4634: return 'Logoff';
      case 4778: return 'Session Reconnect';
      case 4779: return 'Session Disconnect';
      case 4800: return 'Workstation Lock';
      case 4801: return 'Workstation Unlock';
      default: return `Event ${e.eventId}`;
    }
  }

  private getLogonType(e: EvtxEvent): string {
    const t = Number(e.data['LogonType'] || -1);
    const types: Record<number, string> = {
      2: 'Interactive',
      3: 'Network',
      4: 'Batch',
      5: 'Service',
      7: 'Unlock',
      8: 'NetworkCleartext',
      9: 'NewCredentials',
      10: 'RemoteInteractive',
      11: 'CachedInteractive',
    };
    return types[t] || (t > -1 ? `Type ${t}` : '');
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    const success = events.filter(e => e.eventId === 4624).length;
    const failed = events.filter(e => e.eventId === 4625).length;
    const users = new Set(events.map(e => e.data['TargetUserName']));

    const logonTypes = new Map<string, number>();
    for (const e of events.filter(e => e.eventId === 4624)) {
      const t = this.getLogonType(e);
      logonTypes.set(t, (logonTypes.get(t) || 0) + 1);
    }

    return {
      summary: [
        { title: 'Successful Logons', value: success },
        { title: 'Failed Logons', value: failed },
        { title: 'Unique Users', value: users.size },
      ],
      charts: [{
        type: 'pie', title: 'Logon Types',
        data: Array.from(logonTypes.entries()).map(([name, count]) => ({ name, count })),
        xKey: 'name', yKey: 'count',
      }],
    };
  }

  getChartData(events: EvtxEvent[]): ChartConfig[] {
    const byDate = new Map<string, { success: number; failed: number }>();
    for (const e of events) {
      const d = dayjs(e.timestamp).format('YYYY-MM-DD');
      if (!byDate.has(d)) byDate.set(d, { success: 0, failed: 0 });
      const v = byDate.get(d)!;
      if (e.eventId === 4624) v.success++;
      if (e.eventId === 4625) v.failed++;
    }
    return [{
      type: 'bar', title: 'Logon Activity',
      data: Array.from(byDate.entries()).map(([date, v]) => ({ date, success: v.success, failed: v.failed })),
      xKey: 'date', yKey: 'success', categoryKey: 'failed',
    }];
  }

  getExportData(events: EvtxEvent[]): Record<string, unknown>[] {
    return events.map(e => ({
      Timestamp: e.timestamp.toISOString(),
      EventID: e.eventId,
      Action: this.getAction(e),
      User: e.data['TargetUserName'],
      LogonType: this.getLogonType(e),
      SourceIP: e.data['IpAddress'] || e.data['SourceNetworkAddress'] || '',
    }));
  }
}
