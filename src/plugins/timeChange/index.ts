import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class TimeChangePlugin extends PluginBase {
  name = 'timeChange';
  category = 'System';
  label = 'Time Change';
  description = 'System time modification detection';
  icon = 'fa-clock-o';
  providers = ['Microsoft-Windows-Kernel-General'];
  eventIds = [1];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const computers = [...new Set(events.map(e => e.computer).filter(Boolean))].sort();
    return [
      { key: 'computer', label: 'Computer', type: 'select', options: computers },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'computer', label: 'Computer' },
      { key: 'detail', label: 'Detail', render: e => {
        const oldTime = e.data['OldTime'] as string || '';
        const newTime = e.data['NewTime'] as string || '';
        return oldTime && newTime ? `${oldTime} → ${newTime}` : '';
      }},
    ];
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    return {
      summary: [
        { title: 'Time Changes', value: events.length, unit: 'events' },
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
      type: 'bar', title: 'Time Changes Timeline',
      data: Array.from(byDate.entries()).map(([date, count]) => ({ date, count })),
      xKey: 'date', yKey: 'count',
    }];
  }

  getExportData(events: EvtxEvent[]): Record<string, unknown>[] {
    return events.map(e => ({ Timestamp: e.timestamp.toISOString(), Computer: e.computer }));
  }
}
