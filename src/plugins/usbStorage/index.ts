import { PluginBase, type TableColumn, type DashboardData, type ChartConfig, type FilterDef } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import dayjs from 'dayjs';

export class UsbStoragePlugin extends PluginBase {
  name = 'usbStorage';
  category = 'Hardware';
  label = 'USB Storage';
  description = 'USB/external storage device connection history';
  icon = 'fa-usb';
  providers = ['Microsoft-Windows-UserPnp', 'Microsoft-Windows-DriverFrameworks-UserMode', 'Microsoft-Windows-Partition'];
  eventIds = [20001, 10000, 2101, 2102, 1006];

  getFilterDefs(events: EvtxEvent[]): FilterDef[] {
    const actions = [...new Set(events.map(e => this.getAction(e)))].sort();
    return [
      { key: 'action', label: 'Action', type: 'select', options: actions },
      { key: 'device', label: 'Device', type: 'text', width: '160px' },
      { key: 'model', label: 'Model', type: 'text', width: '160px' },
      { key: 'serial', label: 'Serial', type: 'text', width: '160px' },
    ];
  }

  getTableColumns(): TableColumn[] {
    return [
      { key: 'timestamp', label: 'Timestamp', render: e => dayjs(e.timestamp).format('YYYY-MM-DD HH:mm:ss') },
      { key: 'eventId', label: 'Event ID' },
      { key: 'action', label: 'Action', render: e => this.getAction(e) },
      { key: 'device', label: 'Device', render: e => this.getDeviceName(e) },
      { key: 'model', label: 'Model', render: e => this.getDeviceModel(e) },
      { key: 'serial', label: 'Serial', render: e => (e.data['SerialNumber'] as string) || '' },
    ];
  }

  private getAction(e: EvtxEvent): string {
    switch (e.eventId) {
      case 20001: return 'Device Connected';
      case 10000: return 'Driver Installed';
      case 2101: return 'Device Arrived';
      case 2102: return 'Device Removed';
      case 1006: return 'Volume Mounted';
      default: return `Event ${e.eventId}`;
    }
  }

  private getDeviceName(e: EvtxEvent): string {
    let desc = (e.data['DeviceDescription'] as string) || '';
    if (!desc) {
      desc = (e.data['FriendlyName'] as string) || '';
    }
    return desc;
  }

  private getDeviceModel(e: EvtxEvent): string {
    const modelParts = [];
    const vid = e.data['VendorId'] as string || e.data['VID'] as string;
    const pid = e.data['ProductId'] as string || e.data['PID'] as string;
    const rev = e.data['Revision'] as string || e.data['REV'] as string;

    if (vid) modelParts.push(`VID:${vid}`);
    if (pid) modelParts.push(`PID:${pid}`);
    if (rev) modelParts.push(`Rev:${rev}`);

    return modelParts.join(' ') || (e.data['Model'] as string) || '';
  }

  processEvents(events: EvtxEvent[]): EvtxEvent[] {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getDashboardData(events: EvtxEvent[]): DashboardData {
    const devices = new Map<string, number>();
    for (const e of events) {
      const name = this.getDeviceName(e) || this.getDeviceModel(e) || 'Unknown';
      devices.set(name, (devices.get(name) || 0) + 1);
    }
    return {
      summary: [
        { title: 'Total Events', value: events.length },
        { title: 'Device Connections', value: events.filter(e => [20001, 2101].includes(e.eventId)).length },
        { title: 'Unique Devices', value: devices.size },
      ],
      charts: [{
        type: 'bar', title: 'Most Connected Devices',
        data: Array.from(devices.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
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
      Action: this.getAction(e),
      Device: this.getDeviceName(e),
      Model: this.getDeviceModel(e),
      Serial: e.data['SerialNumber'] || '',
    }));
  }
}
