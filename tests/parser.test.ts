import { describe, expect, it } from 'vitest';
import { loadStore, parseFixture } from './helpers';

describe('EVTX parsing', () => {
  it('reads records in chunks a dirty header does not count', () => {
    // The header claims 3 chunks; the file holds 15 chunks of records.
    const { events, report } = parseFixture('system-dirty.evtx');
    expect(report.header.dirty).toBe(true);
    expect(report.header.headerChunkCount).toBe(3);
    expect(events).toHaveLength(1881);
    expect(report.recordsBeyondHeader).toBeGreaterThan(1500);
    expect(report.chunkErrors).toHaveLength(0);
  });

  it('keeps going past corrupt chunks and reports them', () => {
    const { events, report } = parseFixture('bad-chunk-magic.evtx');
    expect(report.chunkErrors.length).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(200);
  });

  it('normalizes named EventData', () => {
    const { events } = parseFixture('security-logon.evtx');
    const logon = events.find(e => e.eventId === 4624)!;
    expect(logon.provider).toBe('Microsoft-Windows-Security-Auditing');
    expect(logon.channel).toBe('Security');
    expect(logon.payload).toBe('EventData');
    expect(logon.data['LogonType']).toMatch(/^\d+$/);
    expect(logon.data['TargetUserName']).toBeTruthy();
    expect(logon.time).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z$/);
    expect(logon.ts).toBe(Date.parse(logon.time.slice(0, 23) + 'Z'));
    expect(logon.pid).not.toBeNull();
  });

  it('keeps unnamed EventData values in order', () => {
    const { events } = parseFixture('application.evtx');
    const msi = events.find(e => e.provider === 'MsiInstaller' && e.eventId === 1033)!;
    expect(msi.list.length).toBeGreaterThanOrEqual(5);
    expect(msi.list[0]).toBeTruthy();
    expect(msi.userSid).toMatch(/^S-1-5-/);
  });

  it('flattens UserData', () => {
    const { events } = parseFixture('rdp-rcm.evtx');
    const auth = events.find(e => e.eventId === 1149)!;
    expect(auth.payload).toBe('UserData/EventXML');
    expect(Object.keys(auth.data)).toEqual(expect.arrayContaining(['Param1', 'Param2', 'Param3']));

    const cleared = parseFixture('system-dirty.evtx').events.find(e => e.eventId === 104)!;
    expect(cleared.payload).toBe('UserData/LogFileCleared');
    expect(cleared.data['Channel']).toBeTruthy();
    expect(cleared.data['SubjectUserName']).toBeTruthy();
  });

  it('reads forwarded events with string-typed values and rendered messages', () => {
    const { events } = parseFixture('forwarded-4625.evtx');
    const failed = events.find(e => e.eventId === 4625)!;
    expect(failed.channel).toBe('Security');
    expect(failed.data['SubStatus']).toMatch(/^0x/);
    expect(failed.message).toContain('An account failed to log on');
    // System/EventRecordID is the source computer's; the file has its own sequence.
    expect(failed.recordId).not.toBe(failed.seq);
  });
});

describe('EventStore', () => {
  it('drops records already loaded from another copy of the same log', () => {
    const { store, sources } = loadStore('security-logon.evtx', 'security-logon.evtx');
    expect(sources[1]!.added).toBe(0);
    expect(sources[1]!.duplicates).toBe(sources[0]!.added);
    expect(store.size).toBe(sources[0]!.added);
  });

  it('reports record number gaps within a file', () => {
    // The trimmed fixture keeps only some chunks, so records in between are missing.
    const { sources } = loadStore('security-logon.evtx');
    expect(sources[0]!.gaps.length).toBeGreaterThan(0);
    expect(sources[0]!.missingRecords).toBeGreaterThan(0);
  });

  it('selects by provider and event id, sorted by time', () => {
    const { store } = loadStore('security-logon.evtx');
    const logons = store.select([{ provider: 'microsoft-windows-security-auditing', ids: [4624, 4634] }]);
    expect(logons.length).toBeGreaterThan(100);
    expect(logons.every(e => e.eventId === 4624 || e.eventId === 4634)).toBe(true);
    for (let i = 1; i < logons.length; i++) expect(logons[i]!.ts).toBeGreaterThanOrEqual(logons[i - 1]!.ts);
  });
});
