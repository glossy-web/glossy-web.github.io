import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class EventResetPlugin extends PluginBase {
  name = 'eventReset';
  category = 'System';
  label = 'Event Reset';
  description = 'Event log clearing detection';
  icon = 'fa-trash-o';
  providers = ['Microsoft-Windows-Eventlog'];
  eventIds = [104, 1102];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const channels = [...new Set(events.map(e => e.channel).filter(Boolean))].sort();
    return [
      { key: 'user', label: 'User', type: 'text', width: '160px' },
      { key: 'channel', label: 'Channel', type: 'select', options: channels },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => e.eventId === 104 ? 'Log Cleared' : 'Audit Log Cleared' },
      { key: 'user', label: 'User', render: e => (e.data['SubjectUserName'] as string) || (e.data['UserName'] as string) || '' },
      { key: 'channel', label: 'Channel' },
    ];
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    return {
      summary: [
        { title: 'Log Clears', value: events.length, unit: 'events' },
        { title: 'Affected Channels', value: new Set(events.map(e => e.channel)).size },
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
      Action: e.eventId === 104 ? 'Log Cleared' : 'Audit Log Cleared',
      User: e.data['SubjectUserName'] || e.data['UserName'] || '',
      Channel: e.channel,
    }));
  }
}
