import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class UpdatePlugin extends PluginBase {
  name = 'update';
  category = 'System';
  label = 'Windows Update';
  description = 'Windows Update installation history';
  icon = 'fa-refresh';
  providers = ['Microsoft-Windows-WindowsUpdateClient'];
  eventIds = [19, 20, 21, 22, 24, 25, 27, 31, 34, 35, 41, 42, 43, 44];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    return [
      { key: 'action', label: 'Action', type: 'select', options: actions },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'title', label: 'Update Title', render: e => (e.data['updateTitle'] as string) || (e.data['Title'] as string) || '' },
      { key: 'result', label: 'Result', render: e => (e.data['Result'] as string) || (e.data['errorCode'] as string) || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 19: return 'Install Success';
      case 20: return 'Install Failure';
      case 21: return 'Download Success';
      case 22: return 'Download Failure';
      case 24: return 'Uninstall Success';
      case 25: return 'Uninstall Failure';
      case 27: return 'Auto Update Ended';
      case 31: return 'Download Started';
      case 34: return 'Scan Started';
      case 35: return 'Scan Ended';
      case 41: return 'Install Started';
      case 42: return 'Install Ended';
      case 43: return 'Reboot Required';
      case 44: return 'Update Downloaded';
      default: return `Event ${e.eventId}`;
    }
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    return {
      summary: [
        { title: 'Total Updates', value: events.length },
        { title: 'Successful Installs', value: events.filter(e => e.eventId === 19).length },
        { title: 'Failed Installs', value: events.filter(e => e.eventId === 20).length },
      ],
      charts: [],
    };
  }

  getChartData(events: EvtxEvent[]): ChartConfig[] {
    const byDate = new Map<string, number>();
    for (const e of events) {
      const d = dayjs(e.timestamp).format('YYYY-MM-DD');
      byDate.set(d, (byDate.get(d) || 0) + 1);
    }
    return [{
      type: 'bar', title: 'Update History',
      data: Array.from(byDate.entries()).map(([date, count]) => ({ date, count })),
      xKey: 'date', yKey: 'count',
    }];
  }

  getExportData(events: EvtxEvent[]): Record<string, unknown>[] {
    return events.map(e => ({
      Timestamp: e.timestamp.toISOString(),
      Action: this.getAction(e),
      Title: e.data['updateTitle'] || e.data['Title'] || '',
      Result: e.data['Result'] || e.data['errorCode'] || '',
    }));
  }
}
