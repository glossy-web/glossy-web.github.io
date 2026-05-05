import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent, EventFilter } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class ShowAllPlugin extends PluginBase {
  name = 'showAll';
  category = '';
  label = 'Show All Events';
  description = 'Display all indexed events with statistics';
  icon = 'fa-list-alt';
  providers = [];
  eventIds = [];

  getFilters(base?: EventFilter): EventFilter {
    return base ?? {};
  }

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const providers = [...new Set(events.map(e => e.provider).filter(Boolean))].sort();
    const channels = [...new Set(events.map(e => e.channel).filter(Boolean))].sort();
    return [
      { key: 'provider', label: 'Provider', type: 'select', options: providers, width: '200px' },
      { key: 'channel', label: 'Channel', type: 'select', options: channels, width: '160px' },
      { key: 'level', label: 'Level', type: 'select', options: ['Critical','Error','Warning','Information','Verbose'] },
      { key: 'computer', label: 'Computer', type: 'select', options: [...new Set(events.map(e => e.computer).filter(Boolean))].sort(), width: '160px' },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'provider', label: 'Provider' },
      { key: 'eventId', label: 'Event ID' },
      { key: 'levelName', label: 'Level' },
      { key: 'channel', label: 'Channel' },
      { key: 'computer', label: 'Computer' },
    ];
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events;
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    const providerMap = new Map<string, number>();
    for (const e of events) {
      const p = e.provider || 'Unknown';
      providerMap.set(p, (providerMap.get(p) || 0) + 1);
    }
    return {
      summary: [
        { title: 'Total Events', value: events.length, unit: 'events' },
        { title: 'Unique Providers', value: providerMap.size },
        { title: 'Unique Event IDs', value: new Set(events.map(e => e.eventId)).size },
      ],
      charts: [{
        type: 'bar', title: 'Events by Provider',
        data: Array.from(providerMap.entries()).map(([name, count]) => ({ name, count })),
        xKey: 'name', yKey: 'count',
      }],
    };
  }

  getChartData(events: EvtxEvent[]): ChartConfig[] {
    const byHour = new Map<string, number>();
    for (const e of events) {
      const h = dayjs(e.timestamp).format('YYYY-MM-DD HH:00');
      byHour.set(h, (byHour.get(h) || 0) + 1);
    }
    return [{
      type: 'bar', title: 'Events Timeline',
      data: Array.from(byHour.entries()).map(([hour, count]) => ({ hour, count })),
      xKey: 'hour', yKey: 'count',
    }];
  }

  getExportData(events: EvtxEvent[]): Record<string, unknown>[] {
    return events.map(e => ({
      Timestamp: e.timestamp.toISOString(),
      Provider: e.provider,
      EventID: e.eventId,
      Level: e.levelName,
      Channel: e.channel,
      Computer: e.computer,
      Data: JSON.stringify(e.data),
    }));
  }
}
