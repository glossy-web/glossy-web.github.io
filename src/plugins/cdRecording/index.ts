import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class CdRecordingPlugin extends PluginBase {
  name = 'cdRecording';
  category = 'Hardware';
  label = 'CD/DVD Recording';
  description = 'CD/DVD burning records';
  icon = 'fa-disc';
  providers = ['Microsoft-Windows-CDROM'];
  eventIds = [100, 101, 102, 103, 104];

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
      { key: 'device', label: 'Device', render: e => (e.data['DeviceName'] as string) || '' },
      { key: 'media', label: 'Media', render: e => (e.data['MediaType'] as string) || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 100: return 'Disc Inserted';
      case 101: return 'Disc Ejected';
      case 102: return 'Recording Started';
      case 103: return 'Recording Completed';
      case 104: return 'Recording Failed';
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
        { title: 'Recordings', value: events.filter(e => e.eventId === 103).length },
        { title: 'Failures', value: events.filter(e => e.eventId === 104).length },
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
      Device: e.data['DeviceName'] || '',
      Media: e.data['MediaType'] || '',
    }));
  }
}
