import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class AutorunsPlugin extends PluginBase {
  name = 'autoruns';
  category = 'System';
  label = 'Autoruns';
  description = 'Auto-start entries from scheduler, Run keys, BHO etc.';
  icon = 'fa-play-circle';
  providers = ['Microsoft-Windows-TaskScheduler', 'Microsoft-Windows-Kernel-General'];
  eventIds = [106, 100, 101, 200, 201, 129, 140, 141];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    return [
      { key: 'action', label: 'Action', type: 'select', options: actions },
      { key: 'detail', label: 'Detail', type: 'text', width: '160px' },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'detail', label: 'Detail', render: e => e.data['TaskName'] as string || e.data['CommandLine'] as string || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 106: return 'Task Registered';
      case 100: return 'Task Started';
      case 101: return 'Task Completed';
      case 200: return 'Task Updated';
      case 201: return 'Task Deleted';
      case 129: return 'Process Created (Run Key)';
      case 140: return 'Task Triggered';
      case 141: return 'Task Disabled';
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
        { title: 'Task Registrations', value: events.filter(e => e.eventId === 106).length },
        { title: 'Unique Tasks', value: new Set(events.map(e => e.data['TaskName'])).size },
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
      Detail: e.data['TaskName'] || e.data['CommandLine'] || '',
    }));
  }
}
