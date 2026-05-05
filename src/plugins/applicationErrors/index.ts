import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class ApplicationErrorsPlugin extends PluginBase {
  name = 'applicationErrors';
  category = 'Application';
  label = 'Application Error';
  description = 'Application crash and error events';
  icon = 'fa-exclamation-triangle';
  providers = ['Application Error', 'Windows Error Reporting', '.NET Runtime'];
  eventIds = [1000, 1001, 1002, 1026];

  getFilterDefs(_events: EvtxEvent[]): FilterDef[] {
    return [
      { key: 'app', label: 'Application', type: 'text', width: '160px' },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'app', label: 'Application', render: e => (e.data['Application Name'] as string) || '' },
      { key: 'error', label: 'Error', render: e => {
        const mod = e.data['Faulting module name'] as string || '';
        const ex = e.data['Exception'] as string || '';
        return mod || ex || '';
      }},
    ];
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    const apps = new Map<string, number>();
    for (const e of events) {
      const app = (e.data['Application Name'] as string) || 'Unknown';
      apps.set(app, (apps.get(app) || 0) + 1);
    }
    return {
      summary: [
        { title: 'Total Errors', value: events.length },
        { title: 'Affected Apps', value: apps.size },
      ],
      charts: [{
        type: 'bar', title: 'Errors by Application',
        data: Array.from(apps.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
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
      Application: e.data['Application Name'] || '',
      Error: e.data['Faulting module name'] || e.data['Exception'] || '',
    }));
  }
}
