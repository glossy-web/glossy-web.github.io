import type { EvtxEvent } from '@/core/evtx/types';
import type { Column, Plugin, PluginContext, SourceSpec, Tone } from '@/core/plugin';
import { account, clean } from '@/core/format';
import { messageCode } from '@/core/lookups';
import { d, eventView, groupBy, SECURITY, text, withBase, type EventRow } from '../common';

const AE = 'Microsoft-Windows-Application-Experience';
const SHELL = 'Microsoft-Windows-Shell-Core';

const SOURCES: SourceSpec[] = [
  { channel: 'Application', provider: 'MsiInstaller', ids: [1033, 1034, 1035, 11707, 11708, 11724, 11725] },
  { channel: 'Microsoft-Windows-Application-Experience/Program-Inventory', provider: AE, ids: [903, 904, 905, 906, 907, 908] },
  { channel: 'Microsoft-Windows-Shell-Core/Operational', provider: SHELL, ids: [28115] },
  { channel: 'Security', provider: SECURITY, ids: [4657] },
];

type Kind = 'Installed' | 'Removed' | 'Reconfigured' | 'Install failed' | 'Removal failed' | 'Changed' | 'Shortcut added';

const MSI: Record<number, Kind> = { 1033: 'Installed', 1034: 'Removed', 1035: 'Reconfigured', 11707: 'Installed', 11708: 'Install failed', 11724: 'Removed', 11725: 'Removal failed' };
// Program-Inventory labels as used by the original Glossy.
const INVENTORY: Record<number, [Kind, string]> = {
  903: ['Installed', 'non-MSI'],
  904: ['Installed', 'MSI'],
  905: ['Changed', ''],
  906: ['Changed', ''],
  907: ['Removed', 'non-MSI'],
  908: ['Removed', 'MSI'],
};

export interface InstallRow extends EventRow {
  kind: Kind;
  product: string;
  version: string;
  publisher: string;
  status: string;
  user: string;
  source: string;
  productCode: string;
}

const at = (e: EvtxEvent, i: number) => clean((e.list[i] ?? '').replace('(NULL)', ''));

/** The MSI product code travels in the Binary field as hex-encoded ASCII ("{GUID}..."). */
export function productCode(binary: string | undefined): string {
  if (!binary || !/^[0-9a-f]+$/i.test(binary)) return '';
  let ascii = '';
  for (let i = 0; i + 1 < binary.length && ascii.length < 38; i += 2) ascii += String.fromCharCode(parseInt(binary.slice(i, i + 2), 16));
  return /^\{[0-9A-F-]{36}\}$/i.test(ascii) ? ascii.toUpperCase() : '';
}

function toRow(e: EvtxEvent, ctx: PluginContext): InstallRow | null {
  const user = ctx.sidName(e.userSid) || e.userSid;
  const p = e.provider.toLowerCase();
  if (p === 'msiinstaller') {
    const kind = MSI[e.eventId]!;
    if (e.eventId >= 11000) {
      // "Product: <name> -- Installation operation completed successfully."
      const m = /^Product:\s*(.*?)\s*--\s*(.*)$/s.exec(at(e, 0));
      return { event: e, kind, product: m?.[1] ?? at(e, 0), version: '', publisher: '', status: m?.[2] ?? '', user, source: 'MsiInstaller', productCode: productCode(e.data['Binary']) };
    }
    // 1033/1034 carry the operation's result: 0 is success, anything else an MSI error code (e.g. 1603).
    const status = at(e, 3);
    const failed = status !== '' && status !== '0';
    return {
      event: e,
      kind: failed && e.eventId === 1033 ? 'Install failed' : failed && e.eventId === 1034 ? 'Removal failed' : kind,
      product: at(e, 0),
      version: at(e, 1),
      publisher: at(e, 4),
      status: status === '0' ? 'Success' : status && `Status ${status}`,
      user,
      source: 'MsiInstaller',
      productCode: productCode(e.data['Binary']),
    };
  }
  if (p === AE.toLowerCase()) {
    const [kind, flavor] = INVENTORY[e.eventId]!;
    return { event: e, kind, product: d(e, 'Name'), version: d(e, 'Version'), publisher: d(e, 'Publisher'), status: flavor, user, source: 'Program-Inventory', productCode: d(e, 'ProgramID') };
  }
  if (p === SHELL.toLowerCase()) {
    return { event: e, kind: 'Shortcut added', product: d(e, 'Name'), version: '', publisher: '', status: d(e, 'AppID'), user, source: 'Shell-Core', productCode: '' };
  }
  // Security 4657 on an Uninstall key (needs a SACL on the key).
  const key = d(e, 'ObjectName');
  if (!/\\CurrentVersion\\Uninstall\\/i.test(key)) return null;
  return {
    event: e,
    kind: 'Changed',
    product: key.split('\\').pop() ?? key,
    version: '',
    publisher: '',
    status: `${messageCode(d(e, 'OperationType'))}: ${d(e, 'ObjectValueName')} = ${d(e, 'NewValue')}`,
    user: account(e.data['SubjectDomainName'], e.data['SubjectUserName']),
    source: 'Registry (4657)',
    productCode: '',
  };
}

const installTone = (r: InstallRow): Tone | undefined => (r.kind.endsWith('failed') ? 'danger' : r.kind === 'Removed' ? 'warning' : undefined);

/** Windows Installer logs each operation twice: 1033/1034/1035 with details and status, 117xx as a summary line. */
const isMsiSummary = (r: InstallRow) => r.source === 'MsiInstaller' && r.event.eventId >= 11000;

const eventColumns: Column<InstallRow>[] = withBase<InstallRow>([
  text('kind', 'Action', r => r.kind, { size: 130, facet: true, tone: installTone }),
  text('product', 'Product', r => r.product, { size: 300 }),
  text('version', 'Version', r => r.version, { size: 120 }),
  text('publisher', 'Publisher', r => r.publisher, { size: 200, facet: true }),
  text('status', 'Status / detail', r => r.status, { size: 280 }),
  text('user', 'User', r => r.user, { size: 180, facet: true }),
  text('source', 'Source', r => r.source, { size: 140, facet: true }),
  text('productCode', 'Product code', r => r.productCode, { size: 300, kind: 'mono', hidden: true }),
]);

interface ProductSummary {
  product: string;
  version: string;
  publisher: string;
  computer: string;
  installed: number;
  removed: number;
  events: number;
  sample: EvtxEvent;
}

const productColumns: Column<ProductSummary>[] = [
  text('product', 'Product', r => r.product, { size: 320 }),
  text('version', 'Version', r => r.version, { size: 120 }),
  text('publisher', 'Publisher', r => r.publisher, { size: 200, facet: true }),
  text('computer', 'Computer', r => r.computer, { size: 150, facet: true }),
  { id: 'installed', label: 'Last installed', kind: 'time', value: r => r.installed, size: 230 },
  { id: 'removed', label: 'Last removed', kind: 'time', value: r => r.removed, size: 230, tone: r => (r.removed > r.installed ? 'warning' : undefined) },
  { id: 'events', label: 'Events', kind: 'number', value: r => r.events, size: 80 },
];

export const softwareInstall: Plugin = {
  name: 'softwareInstall',
  label: 'Software Install',
  category: 'Application',
  icon: 'box-seam',
  description:
    'Software installs and removals from Windows Installer (MsiInstaller), the Program-Inventory log (Windows 7/8), Start menu shortcuts (Shell-Core 28115) and audited Uninstall registry keys (4657).',
  sources: SOURCES,
  analyze(ctx) {
    const rows = ctx
      .select(SOURCES)
      .map(e => toRow(e, ctx))
      .filter((r): r is InstallRow => r !== null);
    const products: ProductSummary[] = [...groupBy(rows.filter(r => r.product && r.kind !== 'Shortcut added'), r => `${r.event.computer}\u0001${r.product.toLowerCase()}`).values()].map(
      list => {
        const last = (kind: Kind) => [...list].reverse().find(r => r.kind === kind)?.event.ts ?? NaN;
        const described = [...list].reverse().find(r => r.version || r.publisher);
        return {
          product: list[0]!.product,
          version: described?.version ?? '',
          publisher: described?.publisher ?? '',
          computer: list[0]!.event.computer,
          installed: last('Installed'),
          removed: last('Removed'),
          events: list.length,
          sample: list[list.length - 1]!.event,
        };
      },
    );
    // Windows Installer logs each operation twice (1033/1034 with details, 11707/11724 as a summary line),
    // so counts use one event per operation.
    const counted = rows.filter(r => !isMsiSummary(r));
    const installs = counted.filter(r => r.kind === 'Installed');
    const removals = counted.filter(r => r.kind === 'Removed');
    return {
      stats: [
        { label: 'Installs', value: installs.length },
        { label: 'Removals', value: removals.length },
        { label: 'Failed', value: counted.filter(r => r.kind.endsWith('failed')).length },
        { label: 'Products', value: products.length },
      ],
      charts: [
        {
          kind: 'timeline',
          title: 'Installs and removals',
          series: [
            { name: 'Installed', ts: installs.map(r => r.event.ts) },
            { name: 'Removed', ts: removals.map(r => r.event.ts) },
          ],
        },
      ],
      views: [
        {
          ...eventView('events', 'Events', rows, eventColumns),
          timeline: r =>
            isMsiSummary(r)
              ? undefined
              : { title: `Software ${r.kind.toLowerCase()}: ${r.product}`, detail: [r.version, r.publisher, r.status].filter(Boolean).join(' · '), users: [r.user], tone: installTone(r) },
        },
        { id: 'products', label: 'Products', rows: products, columns: productColumns, event: r => r.sample, sort: { id: 'installed', desc: true } },
      ],
      notes: [],
    };
  },
};
