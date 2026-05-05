import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class FirewallPlugin extends PluginBase {
  name = 'firewall';
  category = 'System';
  label = 'Firewall';
  description = 'Windows Firewall profile changes, rule changes, status changes';
  icon = 'fa-shield';
  providers = ['Microsoft-Windows-Windows Firewall With Advanced Security'];
  eventIds = [2003, 2004, 2005, 2006, 2009, 2010, 2030, 2031, 2032, 2033, 2071, 2072, 2073, 2097];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    const computers = [...new Set(events.map(e => e.computer).filter(Boolean))].sort();
    return [
      { key: 'action', label: 'Action', type: 'select', options: actions },
      { key: 'computer', label: 'Computer', type: 'select', options: computers },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'computer', label: 'Computer' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 2003: return 'Profile Changed (Private)';
      case 2004: return 'Rule Added';
      case 2005: return 'Rule Modified';
      case 2006: return 'Rule Deleted';
      case 2009: return 'Firewall Enabled';
      case 2010: return 'Firewall Disabled';
      case 2030: return 'Rule Deleted (Filtering Platform)';
      case 2031: return 'Connection Blocked';
      case 2032: return 'Connection Allowed';
      case 2033: return 'Rule Action';
      case 2071: return 'Profile Changed (Domain)';
      case 2072: return 'Profile Changed (Public)';
      case 2073: return 'Profile Changed';
      case 2097: return 'Profile Settings Updated';
      default: return `Event ${e.eventId}`;
    }
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    return {
      summary: [
        { title: 'Total Events', value: events.length },
        { title: 'Rule Changes', value: events.filter(e => [2004, 2005, 2006].includes(e.eventId)).length },
        { title: 'Status Changes', value: events.filter(e => [2009, 2010].includes(e.eventId)).length },
      ],
      charts: [],
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
      Computer: e.computer,
    }));
  }
}
