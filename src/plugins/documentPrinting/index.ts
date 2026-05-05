import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class DocumentPrintingPlugin extends PluginBase {
  name = 'documentPrinting';
  category = 'Hardware';
  label = 'Document Printing';
  description = 'Print job records';
  icon = 'fa-print';
  providers = ['Microsoft-Windows-PrintService'];
  eventIds = [307, 308, 310, 311, 315, 316, 800, 801, 808, 842, 843];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    return [
      { key: 'user', label: 'User', type: 'text', width: '160px' },
      { key: 'printer', label: 'Printer', type: 'text', width: '160px' },
      { key: 'action', label: 'Action', type: 'select', options: actions },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'document', label: 'Document', render: e => (e.data['Document'] as string) || (e.data['param2'] as string) || '' },
      { key: 'user', label: 'User', render: e => (e.data['User'] as string) || (e.data['param1'] as string) || '' },
      { key: 'printer', label: 'Printer', render: e => (e.data['PrinterName'] as string) || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 307: return 'Document Printed';
      case 308: return 'Document Deleted';
      case 310: return 'Document Spooled';
      case 311: return 'Document Error';
      case 315: return 'Print Job Sent';
      case 316: return 'Print Job Completed';
      case 800: return 'Printer Added';
      case 801: return 'Printer Deleted';
      case 808: return 'Printer Config Changed';
      case 842: return 'Print Job Paused';
      case 843: return 'Print Job Resumed';
      default: return `Event ${e.eventId}`;
    }
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    const users = new Map<string, number>();
    for (const e of events) {
      const u = (e.data['User'] as string) || (e.data['param1'] as string) || 'Unknown';
      users.set(u, (users.get(u) || 0) + 1);
    }
    return {
      summary: [
        { title: 'Print Jobs', value: events.filter(e => [307, 315].includes(e.eventId)).length },
        { title: 'Errors', value: events.filter(e => e.eventId === 311).length },
        { title: 'Unique Users', value: users.size },
      ],
      charts: [{
        type: 'bar', title: 'Print Jobs by User',
        data: Array.from(users.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
        xKey: 'name', yKey: 'count',
      }],
    };
  }

  getChartData(events: EvtxEvent[]): ChartConfig[] {
    const byDate = new Map<string, number>();
    for (const e of events) {
      const d = dayjs(e.timestamp).format('YYYY-MM-DD');
      byDate.set(d, (byDate.get(d) || 0) + 1);
    }
    return [{
      type: 'bar', title: 'Print History',
      data: Array.from(byDate.entries()).map(([date, count]) => ({ date, count })),
      xKey: 'date', yKey: 'count',
    }];
  }

  getExportData(events: EvtxEvent[]): Record<string, unknown>[] {
    return events.map(e => ({
      Timestamp: e.timestamp.toISOString(),
      EventID: e.eventId,
      Action: this.getAction(e),
      Document: e.data['Document'] || e.data['param2'] || '',
      User: e.data['User'] || e.data['param1'] || '',
      Printer: e.data['PrinterName'] || '',
    }));
  }
}
