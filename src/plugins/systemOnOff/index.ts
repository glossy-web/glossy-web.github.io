import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class SystemOnOffPlugin extends PluginBase {
  name = 'systemOnOff';
  category = 'System';
  label = 'System On/Off';
  description = 'System startup, shutdown, sleep, and forced shutdown events';
  icon = 'fa-power-off';
  providers = ['Microsoft-Windows-Kernel-General', 'Microsoft-Windows-Kernel-Power', 'Microsoft-Windows-Power-Troubleshooter'];
  eventIds = [1, 12, 13, 41, 42, 107, 109];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    const computers = [...new Set(events.map(e => e.computer).filter(Boolean))].sort();
    return [
      { key: 'action', label: 'Action', type: 'select', options: actions },
      { key: 'computer', label: 'Computer', type: 'select', options: computers },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'computer', label: 'Computer' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    const pid = e.provider;
    const eid = e.eventId;
    if (pid.includes('Kernel-General')) {
      if (eid === 1) return 'System Time Changed';
      if (eid === 12) return 'OS Started';
      if (eid === 13) return 'OS Shutdown';
    }
    if (pid.includes('Kernel-Power')) {
      if (eid === 41) return 'Forced Shutdown (Crash)';
      if (eid === 42) return 'Sleep';
      if (eid === 107) return 'Resume from Sleep';
    }
    if (pid.includes('Power-Troubleshooter') && eid === 1) return 'Power State Change';
    return `Event ${eid}`;
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    const actions = new Map<string, number>();
    for (const e of events) actions.set(this.getAction(e), (actions.get(this.getAction(e)) || 0) + 1);
    return {
      summary: [
        { title: 'Total Events', value: events.length },
        { title: 'Boot Events', value: events.filter(e => e.eventId === 12).length },
        { title: 'Shutdown Events', value: events.filter(e => e.eventId === 13 || e.eventId === 41).length },
      ],
      charts: [{
        type: 'pie', title: 'Event Types',
        data: Array.from(actions.entries()).map(([name, count]) => ({ name, count })),
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
      type: 'bar', title: 'System Events Timeline',
      data: Array.from(byDate.entries()).map(([date, count]) => ({ date, count })),
      xKey: 'date', yKey: 'count',
    }];
  }

  getExportData(events: EvtxEvent[]): Record<string, unknown>[] {
    return events.map(e => ({
      Timestamp: e.timestamp.toISOString(),
      EventID: e.eventId,
      Action: this.getAction(e),
      Computer: e.computer,
    }));
  }
}
