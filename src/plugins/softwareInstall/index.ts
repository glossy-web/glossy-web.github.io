import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class SoftwareInstallPlugin extends PluginBase {
  name = 'softwareInstall';
  category = 'Application';
  label = 'Software Install';
  description = 'Software installation and removal records';
  icon = 'fa-download';
  providers = ['MsiInstaller'];
  eventIds = [1022, 1033, 1034, 1035, 11707, 11708, 11724];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    return [
      { key: 'action', label: 'Action', type: 'select', options: actions },
      { key: 'product', label: 'Product', type: 'text', width: '160px' },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'product', label: 'Product', render: e => (e.data['ProductName'] as string) || '' },
      { key: 'user', label: 'User', render: e => (e.data['User'] as string) || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 1022: return 'Product Registered';
      case 1033: return 'Install Started';
      case 1034: return 'Install Success';
      case 1035: return 'Install Failed';
      case 11707: return 'Install Success (ARP)';
      case 11708: return 'Install Failed (ARP)';
      case 11724: return 'Product Removed';
      default: return `Event ${e.eventId}`;
    }
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    return {
      summary: [
        { title: 'Installations', value: events.filter(e => [1034, 11707].includes(e.eventId)).length },
        { title: 'Install Failures', value: events.filter(e => [1035, 11708].includes(e.eventId)).length },
        { title: 'Removals', value: events.filter(e => e.eventId === 11724).length },
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
      Action: this.getAction(e),
      Product: e.data['ProductName'] || '',
      User: e.data['User'] || '',
    }));
  }
}
