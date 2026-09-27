import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, PluginContext, SourceSpec } from '@/core/plugin';
import { account, formatBytes } from '@/core/format';
import { isNoiseAccount } from '@/core/lookups';
import { d, eventView, groupBy, lastAtOrBefore, pick, SECURITY, text, withBase, type EventRow } from '../common';
import { hasRealSerial, normalizeSerial, parseDeviceId, USB_VENDORS, volumeSerialFromVbr, type DeviceIdentity } from './device';

const PARTITION = 'Microsoft-Windows-Partition';
const KPNP = 'Microsoft-Windows-Kernel-PnP';
const USERPNP = 'Microsoft-Windows-UserPnp';
const DFUM = 'Microsoft-Windows-DriverFrameworks-UserMode';

const SOURCES: SourceSpec[] = [
  { channel: 'Microsoft-Windows-Partition/Diagnostic', provider: PARTITION, ids: [1006] },
  { channel: 'Microsoft-Windows-Kernel-PnP/Configuration', provider: KPNP, ids: [400, 410, 420, 430] },
  { channel: 'System', provider: USERPNP, ids: [20001, 20003] },
  { channel: 'System', provider: DFUM, ids: [10000] },
  { channel: 'Microsoft-Windows-DriverFrameworks-UserMode/Operational', provider: DFUM, ids: [2003, 2100, 2101, 2102], offByDefault: true },
];

type Action = 'Connected' | 'Disconnected' | 'Driver installed' | 'Device configured' | 'Device started' | 'Device removed';

export interface UsbRow extends EventRow {
  action: Action;
  identity: DeviceIdentity;
  serial: string;
  instanceId: string;
  capacity: number;
  volumeSerial: string;
  source: string;
  user: string;
  detail: string;
}

const isStorageId = (id: string) => /USBSTOR|WPDBUSENUM|SWD\\WPD/i.test(id);

function row(e: EvtxEvent, action: Action, instanceId: string, source: string, extra: Partial<UsbRow> = {}): UsbRow {
  const identity = parseDeviceId(instanceId);
  return {
    event: e,
    action,
    identity,
    serial: identity.serial ? normalizeSerial(identity.serial) : '',
    instanceId,
    capacity: NaN,
    volumeSerial: '',
    source,
    user: '',
    detail: '',
    ...extra,
  };
}

function toRow(e: EvtxEvent, includeAll: boolean): UsbRow | null {
  const p = e.provider.toLowerCase();
  if (p === PARTITION.toLowerCase()) {
    const capacity = Number(d(e, 'Capacity'));
    const parent = pick(e, 'ParentId', 'DiskId');
    const busUsb = /USB/i.test(parent) || d(e, 'BusType') === '7';
    if (!busUsb && !includeAll) return null;
    const r = row(e, capacity > 0 ? 'Connected' : 'Disconnected', parent, 'Partition 1006', { capacity });
    const vendor = d(e, 'Manufacturer');
    const model = d(e, 'Model');
    r.identity = {
      ...r.identity,
      kind: r.identity.kind || 'USB mass storage',
      vendor: vendor || r.identity.vendor,
      product: model || r.identity.product,
      revision: d(e, 'Revision') || r.identity.revision,
    };
    const serial = d(e, 'SerialNumber');
    if (serial) r.serial = normalizeSerial(serial);
    const vbr = volumeSerialFromVbr(d(e, 'Vbr0'));
    if (vbr.serial) r.volumeSerial = `${vbr.serial} (${vbr.fs})`;
    return r;
  }
  if (p === KPNP.toLowerCase()) {
    const id = pick(e, 'DeviceInstanceId', 'DeviceInstanceID');
    const driver = d(e, 'DriverName');
    if (!includeAll && !isStorageId(id) && !/wpdmtp|usbstor/i.test(driver)) return null;
    const action: Action = e.eventId === 400 ? 'Device configured' : e.eventId === 410 ? 'Device started' : e.eventId === 420 ? 'Device removed' : 'Device configured';
    return row(e, action, id, `Kernel-PnP ${e.eventId}`, { detail: driver });
  }
  if (p === USERPNP.toLowerCase()) {
    const id = pick(e, 'DeviceInstanceID', 'DeviceInstanceId');
    const driver = pick(e, 'DriverName', 'DriverFileName');
    if (!includeAll && !isStorageId(id) && !/wpdmtp|usbstor|disk\.inf/i.test(driver)) return null;
    return row(e, 'Driver installed', id, `UserPnp ${e.eventId}`, { detail: [pick(e, 'DriverDescription', 'ServiceName'), driver].filter(Boolean).join(' · ') });
  }
  // DriverFrameworks-UserMode
  const id = pick(e, 'DeviceId', 'InstanceId', 'instance');
  if (!includeAll && !isStorageId(id)) return null;
  if (e.eventId === 10000) return row(e, 'Driver installed', id, 'DriverFrameworks 10000');
  if (e.eventId === 2003) return row(e, 'Connected', id, 'DriverFrameworks 2003');
  const minor = pick(e, 'Request.minor', 'RequestMinorCode', 'minor');
  // The original Glossy de-duplicated the several requests per plug event this way:
  // 2101 with minor 20 marks a connection, 2102 with minor 2 (IRP_MN_REMOVE_DEVICE) a removal.
  if (e.eventId === 2101 && minor === '20') return row(e, 'Connected', id, 'DriverFrameworks 2101');
  if (e.eventId === 2102 && minor === '2') return row(e, 'Disconnected', id, 'DriverFrameworks 2102');
  return null;
}

const deviceName = (i: DeviceIdentity) => {
  const vendor = i.vendor || USB_VENDORS[i.vid] || (i.vid ? `VID ${i.vid}` : '');
  const product = i.product || (i.pid ? `PID ${i.pid}` : '');
  return [vendor, product].filter(Boolean).join(' ');
};

const historyColumns: Column<UsbRow>[] = withBase<UsbRow>([
  text('action', 'Action', r => r.action, { size: 140, facet: true, tone: r => (r.action === 'Connected' ? 'success' : r.action === 'Disconnected' ? 'muted' : undefined) }),
  text('device', 'Device', r => deviceName(r.identity), { size: 240, facet: true }),
  text('serial', 'Serial', r => r.serial, { size: 200, kind: 'mono' }),
  { id: 'capacity', label: 'Capacity', kind: 'number', value: r => (Number.isFinite(r.capacity) ? r.capacity : -1), text: r => formatBytes(r.capacity), size: 90 },
  text('volumeSerial', 'Volume serial', r => r.volumeSerial, { size: 150, kind: 'mono' }),
  text('user', 'Logged-on user (inferred)', r => r.user, { size: 180, facet: true }),
  text('kind', 'Type', r => r.identity.kind, { size: 170, facet: true }),
  text('source', 'Source', r => r.source, { size: 150, facet: true }),
  text('detail', 'Driver / detail', r => r.detail, { size: 220 }),
  text('instanceId', 'Device instance ID', r => r.instanceId, { size: 420, kind: 'mono', hidden: true }),
]);

interface DeviceSummary {
  device: string;
  kind: string;
  serial: string;
  realSerial: boolean;
  capacity: number;
  volumeSerials: string;
  computer: string;
  firstSeen: number;
  lastConnected: number;
  lastDisconnected: number;
  connections: number;
  users: string;
  sample: EvtxEvent;
}

const deviceColumns: Column<DeviceSummary>[] = [
  text('device', 'Device', r => r.device, { size: 240 }),
  text('serial', 'Serial', r => r.serial, { size: 220, kind: 'mono', tone: r => (r.realSerial ? undefined : 'muted') }),
  text('kind', 'Type', r => r.kind, { size: 170, facet: true }),
  { id: 'capacity', label: 'Capacity', kind: 'number', value: r => (Number.isFinite(r.capacity) ? r.capacity : -1), text: r => formatBytes(r.capacity), size: 90 },
  text('volumeSerials', 'Volume serials', r => r.volumeSerials, { size: 180, kind: 'mono' }),
  text('computer', 'Computer', r => r.computer, { size: 150, facet: true }),
  { id: 'firstSeen', label: 'First seen', kind: 'time', value: r => r.firstSeen, size: 230 },
  { id: 'lastConnected', label: 'Last connected', kind: 'time', value: r => r.lastConnected, size: 230 },
  { id: 'lastDisconnected', label: 'Last disconnected', kind: 'time', value: r => r.lastDisconnected, size: 230 },
  { id: 'connections', label: 'Connections', kind: 'number', value: r => r.connections, size: 100 },
  text('users', 'Users (inferred)', r => r.users, { size: 200 }),
];

/** The last interactive (console, RDP, cached) logon on the computer before `ts` — an inference, not a record of who plugged the device. */
function userResolver(ctx: PluginContext): (e: EvtxEvent) => string {
  const logons = ctx
    .select([{ provider: SECURITY, ids: [4624] }])
    .filter(e => ['2', '10', '11'].includes(d(e, 'LogonType')) && !isNoiseAccount(e.data['TargetUserName'] ?? ''));
  const byComputer = groupBy(logons, e => e.computer);
  return e => {
    const list = byComputer.get(e.computer);
    if (!list) return '';
    const i = lastAtOrBefore(list, e.ts);
    return i >= 0 ? account(list[i]!.data['TargetDomainName'], list[i]!.data['TargetUserName']) : '';
  };
}

function devices(rows: UsbRow[]): DeviceSummary[] {
  const keyed = rows.filter(r => r.serial || r.instanceId);
  return [...groupBy(keyed, r => `${r.event.computer}\u0001${r.serial || r.instanceId.toUpperCase()}`).values()].map(list => {
    const described = list.find(r => r.identity.vendor || r.identity.product) ?? list[0]!;
    const connects = list.filter(r => r.action === 'Connected');
    const disconnects = list.filter(r => r.action === 'Disconnected');
    const capacity = list.find(r => r.capacity > 0)?.capacity ?? NaN;
    return {
      device: deviceName(described.identity),
      kind: described.identity.kind,
      serial: list[0]!.serial,
      realSerial: hasRealSerial(list[0]!.serial),
      capacity,
      volumeSerials: [...new Set(list.map(r => r.volumeSerial).filter(Boolean))].join(', '),
      computer: list[0]!.event.computer,
      firstSeen: list[0]!.event.ts,
      lastConnected: connects[connects.length - 1]?.event.ts ?? NaN,
      lastDisconnected: disconnects[disconnects.length - 1]?.event.ts ?? NaN,
      connections: connects.length,
      users: [...new Set(connects.map(r => r.user).filter(Boolean))].join(', '),
      sample: list[0]!.event,
    };
  });
}

export const usbStorage: Plugin = {
  name: 'usbStorage',
  label: 'USB Storage',
  category: 'Hardware',
  icon: 'usb',
  description:
    'Removable storage and portable devices: first install (UserPnp, Kernel-PnP), connections and removals (Partition/Diagnostic 1006 on Windows 10+, DriverFrameworks-UserMode). Serials, capacity and the volume serial number from the boot record link a device to LNK files and jump lists.',
  sources: SOURCES,
  options: [{ id: 'includeAll', label: 'Include all USB and PnP devices', default: false }],
  analyze(ctx, opts) {
    const userAt = userResolver(ctx);
    const rows = ctx
      .select(SOURCES)
      .map(e => toRow(e, !!opts['includeAll']))
      .filter((r): r is UsbRow => r !== null);
    for (const r of rows) if (r.action === 'Connected') r.user = userAt(r.event);

    // Fill vendor/product for rows keyed by serial from other sources describing the same device.
    const described = new Map<string, DeviceIdentity>();
    for (const r of rows) if (r.serial && (r.identity.vendor || r.identity.product)) described.set(r.serial, r.identity);
    for (const r of rows) {
      const known = r.serial ? described.get(r.serial) : undefined;
      if (known && !r.identity.vendor && !r.identity.product) r.identity = { ...r.identity, vendor: known.vendor, product: known.product, kind: r.identity.kind || known.kind };
    }

    const deviceRows = devices(rows);
    const notes = [];
    if (!ctx.select([{ provider: PARTITION, ids: [1006] }]).length && !ctx.select([{ provider: DFUM, ids: [2003, 2100, 2101, 2102] }]).length)
      notes.push({
        tone: 'info' as const,
        text: 'No connection history source loaded: Partition/Diagnostic (Windows 10 1703+) or DriverFrameworks-UserMode/Operational (disabled by default). Install events only show a device’s first connection.',
      });
    return {
      stats: [
        { label: 'Devices', value: deviceRows.length },
        { label: 'Connections', value: rows.filter(r => r.action === 'Connected').length },
        { label: 'Mass storage', value: deviceRows.filter(r => r.kind === 'USB mass storage').length },
        { label: 'Portable (MTP)', value: deviceRows.filter(r => r.kind.startsWith('Portable')).length },
      ],
      charts: [
        {
          kind: 'clock',
          title: 'Device connections by time of day',
          series: [
            { name: 'Connected', ts: rows.filter(r => r.action === 'Connected').map(r => r.event.ts) },
            { name: 'Disconnected', ts: rows.filter(r => r.action === 'Disconnected').map(r => r.event.ts) },
            { name: 'First install', ts: rows.filter(r => r.action === 'Driver installed').map(r => r.event.ts) },
          ],
        },
      ],
      views: [
        { id: 'devices', label: 'Devices', rows: deviceRows, columns: deviceColumns, event: r => r.sample, sort: { id: 'lastConnected', desc: true } },
        {
          ...eventView('history', 'History', rows, historyColumns),
          timeline: r =>
            r.action === 'Device configured' || r.action === 'Device started'
              ? undefined
              : {
                  title: `USB ${r.action.toLowerCase()}: ${deviceName(r.identity) || r.identity.kind || 'device'}`,
                  detail: [r.serial && `serial ${r.serial}`, Number.isFinite(r.capacity) && formatBytes(r.capacity), r.volumeSerial && `volume ${r.volumeSerial}`, r.detail].filter(Boolean).join(' · '),
                },
        },
      ],
      notes,
    };
  },
};
