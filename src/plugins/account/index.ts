import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class AccountPlugin extends PluginBase {
  name = 'account';
  category = 'Account';
  label = 'Account Events';
  description = 'Account creation, deletion, password changes, group changes';
  icon = 'fa-users';
  providers = ['Microsoft-Windows-Security-Auditing'];
  eventIds = [4720, 4724, 4726, 4728, 4729, 4731, 4732, 4733, 4734, 4735, 4756, 4757];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    return [
      { key: 'action', label: 'Action', type: 'select', options: actions },
      { key: 'user', label: 'Target User', type: 'text', width: '160px' },
      { key: 'initiator', label: 'Initiator', type: 'text', width: '160px' },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'user', label: 'Target User', render: e => (e.data['TargetUserName'] as string) || '' },
      { key: 'initiator', label: 'Initiator', render: e => (e.data['SubjectUserName'] as string) || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 4720: return 'User Account Created';
      case 4724: return 'Password Reset Attempt';
      case 4726: return 'User Account Deleted';
      case 4728: return 'Member Added to Global Group';
      case 4729: return 'Member Removed from Global Group';
      case 4731: return 'Local Group Created';
      case 4732: return 'Member Added to Local Group';
      case 4733: return 'Member Removed from Local Group';
      case 4734: return 'Local Group Deleted';
      case 4735: return 'Local Group Changed';
      case 4756: return 'Member Added to Universal Group';
      case 4757: return 'Member Removed from Universal Group';
      default: return `Event ${e.eventId}`;
    }
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    const actions = new Map<string, number>();
    for (const e of events) {
      const a = this.getAction(e);
      actions.set(a, (actions.get(a) || 0) + 1);
    }
    return {
      summary: [
        { title: 'Total Events', value: events.length },
        { title: 'Account Creations', value: events.filter(e => e.eventId === 4720).length },
        { title: 'Account Deletions', value: events.filter(e => e.eventId === 4726).length },
      ],
      charts: [{
        type: 'pie', title: 'Event Types',
        data: Array.from(actions.entries()).map(([name, count]) => ({ name, count })),
        xKey: 'name', yKey: 'count',
      }],
    };
  }

  getChartData(events: EvtxEvent[]): ChartConfig[] {
    return [];
  }

  getExportData(events: EvtxEvent[]): Record<string, unknown>[] {
    return events.map(e => ({
      Timestamp: e.timestamp.toISOString(),
      EventID: e.eventId,
      Action: this.getAction(e),
      TargetUser: e.data['TargetUserName'] || '',
      Initiator: e.data['SubjectUserName'] || '',
    }));
  }
}
