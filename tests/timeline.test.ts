import { describe, expect, it } from 'vitest';
import type { Column, View } from '@/core/plugin';
import type { EvtxEvent } from '@/core/evtx/types';
import { tableToCsv, tableToJsonl, type TableSnapshot } from '@/core/tableExport';
import { plugins, pluginByName } from '@/plugins';
import { buildTimeline } from '@/plugins/timeline';
import { loadStore, makeEvent, storeOf } from './helpers';

const SEC = 'Microsoft-Windows-Security-Auditing';
const t = (s: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, s)).toISOString();
const view = (views: View<any>[], id: string) => views.find(v => v.id === id)!;
const modules = plugins.filter(p => p.name !== 'showAll' && p.name !== 'timeline');
const timeline = pluginByName.get('timeline')!;

function logon(s: number, type: string, ip: string, user = 'bob') {
  return makeEvent({
    provider: SEC,
    eventId: 4624,
    channel: 'Security',
    time: t(s),
    data: { TargetUserName: user, TargetDomainName: 'CORP', TargetUserSid: 'S-1-5-21-1-2-3-1001', LogonType: type, IpAddress: ip, TargetLogonId: `0x${s}` },
  });
}

describe('timeline', () => {
  const { ctx } = storeOf([
    logon(1, '10', '203.0.113.7'),
    logon(2, '3', '10.0.0.5', 'alice'),
    makeEvent({ provider: SEC, eventId: 4634, channel: 'Security', time: t(3), data: { TargetUserName: 'bob', TargetDomainName: 'CORP', TargetLogonId: '0x1', LogonType: '10' } }),
    makeEvent({ provider: 'Service Control Manager', eventId: 7036, channel: 'System', time: t(4), data: { param1: 'Spooler', param2: 'running' } }),
    makeEvent({ provider: 'Service Control Manager', eventId: 7045, channel: 'System', time: t(5), data: { ServiceName: 'x', ImagePath: 'cmd.exe /c whoami', StartType: 'demand start', AccountName: 'LocalSystem' } }),
  ]);
  const rows = buildTimeline(modules, ctx);

  it('merges an event several modules report', () => {
    const rdp = rows.find(r => r.event.data['LogonType'] === '10')!;
    expect(rdp.modules).toEqual(['Account Logon', 'RDP']);
    expect(rdp.title).toBe('Logon (type 10 RemoteInteractive)');
    expect(rdp.users).toEqual(['CORP\\bob']);
    expect(rdp.remote).toBe('203.0.113.7');
    expect(rdp.tone).toBe('warning'); // public source, raised by the RDP module
    expect(rows.filter(r => r.event.eventId === 4624)).toHaveLength(2);
  });

  it('leaves bookkeeping events out', () => {
    expect(rows.map(r => r.event.eventId)).toEqual([4624, 4624, 7045]);
    expect(rows[2]).toMatchObject({ title: 'Service installed: x', tone: 'danger' });
  });

  it('lists entities and pivots them into the timeline', () => {
    const result = timeline.analyze(ctx, { highlightedOnly: false });
    const entities = view(result.views, 'entities');
    const bob = entities.rows.find((e: { value: string }) => e.value === 'CORP\\bob');
    expect(bob).toMatchObject({ kind: 'Account', entries: 1, highlighted: 1 });
    expect(entities.pivot!(bob)).toEqual({ view: 'timeline', filters: { users: 'CORP\\bob' } });
    const ip = entities.rows.find((e: { value: string }) => e.value === '10.0.0.5');
    expect(entities.pivot!(ip)).toEqual({ view: 'timeline', filters: { remote: '10.0.0.5' } });

    const highlighted = timeline.analyze(ctx, { highlightedOnly: true });
    expect(view(highlighted.views, 'timeline').rows).toHaveLength(2);
  });

  it('builds from real logs without errors', () => {
    const { ctx } = loadStore('security-logon.evtx', 'rdp-rcm.evtx', 'system-dirty.evtx');
    const all = buildTimeline(modules, ctx);
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map(r => r.event.id)).size).toBe(all.length);
    for (let i = 1; i < all.length; i++) expect(all[i]!.event.ts).toBeGreaterThanOrEqual(all[i - 1]!.event.ts);
  });
});

describe('table export', () => {
  interface Row {
    event: EvtxEvent;
    user: string;
    end: number;
  }
  const events = [
    { ...makeEvent({ provider: SEC, eventId: 4624, channel: 'Security', time: '2024-05-01T09:30:00.123Z' }), id: 1, src: 0 },
    { ...makeEvent({ provider: SEC, eventId: 4624, channel: 'Security', time: '2024-05-01T10:00:00.000Z' }), id: 2, src: 0 },
  ];
  const columns: Column<Row>[] = [
    { id: 'time', label: 'Time', kind: 'time', value: r => r.event.ts },
    { id: 'user', label: 'Account', value: r => r.user },
    { id: 'end', label: 'Logoff', kind: 'time', value: r => r.end },
    { id: 'eventId', label: 'Event ID', kind: 'number', value: r => r.event.eventId },
  ];
  const table: TableSnapshot<Row> = {
    columns,
    rows: [
      { event: events[0]!, user: 'CORP\\bob', end: Date.parse('2024-05-01T11:00:00Z') },
      { event: events[1]!, user: '', end: NaN },
    ],
    event: r => r.event,
    sourceName: () => 'Security.evtx',
  };

  it('writes Timesketch JSONL', () => {
    const { text, skipped } = tableToJsonl(table, columns.filter(c => c.kind === 'time'), 'glossy:logon_sessions');
    expect(skipped).toBe(0);
    const [first, second] = text.trim().split('\n').map(l => JSON.parse(l));
    expect(first).toEqual({
      message: 'Account: CORP\\bob',
      datetime: '2024-05-01T09:30:00.123+00:00',
      timestamp: Date.parse('2024-05-01T09:30:00.123Z') * 1000,
      timestamp_desc: 'Event Time',
      data_type: 'glossy:logon_sessions',
      user: 'CORP\\bob',
      end: '2024-05-01T11:00:00.000+00:00',
      computer_name: 'HOST1',
      channel: 'Security',
      source_name: SEC,
      event_identifier: 4624,
      record_number: events[0]!.recordId,
      evtx_file: 'Security.evtx',
    });
    expect(second).not.toHaveProperty('end');
    expect(second.message).toBe('');
  });

  it('dates a row by its first time that has a value', () => {
    const summary: Column<{ created: number; last: number }>[] = [
      { id: 'created', label: 'Created', kind: 'time', value: r => r.created },
      { id: 'last', label: 'Last logon', kind: 'time', value: r => r.last },
    ];
    const { text, skipped } = tableToJsonl(
      { columns: summary, rows: [{ created: NaN, last: 0 }, { created: NaN, last: NaN }], sourceName: () => '' },
      summary,
      'glossy:test',
    );
    expect(skipped).toBe(1);
    expect(JSON.parse(text)).toMatchObject({ datetime: '1970-01-01T00:00:00.000+00:00', timestamp_desc: 'Last logon' });
  });

  it('adds trace columns to CSV only when the view does not show them', () => {
    const header = tableToCsv(table, 'UTC').split('\r\n')[0]!;
    expect(header).toBe('﻿Time (UTC),Account,Logoff (UTC),Event ID,Computer,Channel,Provider,EventRecordID,SourceFile');
  });

  it('never lets a column shadow a Timesketch field', () => {
    const reserved = new Set(['message', 'datetime', 'timestamp', 'timestamp_desc', 'data_type']);
    const { ctx } = storeOf([]);
    for (const p of plugins) {
      const opts = Object.fromEntries((p.options ?? []).map(o => [o.id, o.default]));
      for (const v of p.analyze(ctx, opts).views) {
        for (const c of v.columns) expect(reserved.has(c.id.replace(/[A-Z]/g, ch => `_${ch.toLowerCase()}`)), `${p.name}/${v.id}/${c.id}`).toBe(false);
      }
    }
  });
});
