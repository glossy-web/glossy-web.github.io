import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class ServicesPlugin extends PluginBase {
  name = 'services';
  category = 'System';
  label = 'Services';
  description = 'Windows service start/stop events';
  icon = 'fa-cogs';
  providers = ['Service Control Manager'];
  eventIds = [7034, 7035, 7036, 7040, 7045];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    return [
      { key: 'action', label: 'Action', type: 'select', options: actions },
      { key: 'serviceName', label: 'Service Name', type: 'text', width: '160px' },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'serviceName', label: 'Service Name', render: e => (e.data['param1'] as string) || (e.data['ServiceName'] as string) || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 7034: return 'Service Crashed';
      case 7035: return 'Start/Stop Control Sent';
      case 7036: return 'Service State Changed';
      case 7040: return 'Start Type Changed';
      case 7045: return 'New Service Installed';
      default: return `Event ${e.eventId}`;
    }
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    const services = new Set(events.map(e => e.data['param1'] || e.data['ServiceName'] || ''));
    return {
      summary: [
        { title: 'Total Events', value: events.length },
        { title: 'Unique Services', value: services.size },
        { title: 'New Installations', value: events.filter(e => e.eventId === 7045).length },
        { title: 'Crashes', value: events.filter(e => e.eventId === 7034).length },
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
      Service: e.data['param1'] || e.data['ServiceName'] || '',
    }));
  }
}
