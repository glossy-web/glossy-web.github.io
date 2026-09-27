import { describe, expect, it } from 'vitest';
import type { View } from '@/core/plugin';
import { loadStore, makeEvent, storeOf } from './helpers';
import { logon } from '@/plugins/logon';
import { rdpLogon } from '@/plugins/rdpLogon';
import { accountManagement } from '@/plugins/account';
import { systemOnOff } from '@/plugins/systemOnOff';
import { timeChange } from '@/plugins/timeChange';
import { eventReset } from '@/plugins/eventReset';
import { services, suspicion } from '@/plugins/services';
import { update } from '@/plugins/update';
import { processExecution } from '@/plugins/process';
import { applicationErrors } from '@/plugins/applicationErrors';
import { softwareInstall, productCode } from '@/plugins/softwareInstall';
import { usbStorage } from '@/plugins/usbStorage';
import { firewall } from '@/plugins/firewall';
import { autoruns, taskCommands } from '@/plugins/autoruns';
import { documentPrinting } from '@/plugins/documentPrinting';
import { wireless } from '@/plugins/wireless';
import { cdRecording } from '@/plugins/cdRecording';
import { showAll } from '@/plugins/showAll';
import { plugins } from '@/plugins';

const SEC = 'Microsoft-Windows-Security-Auditing';
const view = (views: View<any>[], id: string) => views.find(v => v.id === id)!;
const defaults = (p: { options?: { id: string; default: boolean }[] }) => Object.fromEntries((p.options ?? []).map(o => [o.id, o.default]));

describe('every plugin', () => {
  it('runs on real data without throwing and returns consistent views', () => {
    const { ctx } = loadStore('system-dirty.evtx', 'security-logon.evtx', 'security-process.evtx', 'application.evtx', 'rdp-rcm.evtx', 'forwarded-4625.evtx');
    for (const p of plugins) {
      const result = p.analyze(ctx, defaults(p));
      expect(result.views.length, p.name).toBeGreaterThan(0);
      for (const v of result.views) {
        for (const row of v.rows.slice(0, 50)) for (const c of v.columns) expect(() => c.value(row), `${p.name}/${v.id}/${c.id}`).not.toThrow();
      }
    }
  });

  it('have unique names and declare their log channels', () => {
    expect(new Set(plugins.map(p => p.name)).size).toBe(plugins.length);
    for (const p of plugins.filter(p => p.category !== 'All')) expect(p.sources.length, p.name).toBeGreaterThan(0);
  });
});

describe('logon', () => {
  const { ctx } = loadStore('security-logon.evtx', 'forwarded-4625.evtx');

  it('hides machine and service accounts by default', () => {
    const all = view(logon.analyze(ctx, { hideNoise: false }).views, 'events').rows;
    const filtered = view(logon.analyze(ctx, { hideNoise: true }).views, 'events').rows;
    expect(filtered.length).toBeLessThan(all.length);
    expect(filtered.some(r => /\$$/.test(r.user) || /SYSTEM$/.test(r.user))).toBe(false);
  });

  it('marks administrator logons from the matching 4672 and pairs sessions by Logon ID', () => {
    const result = logon.analyze(ctx, { hideNoise: false });
    const events = view(result.views, 'events').rows;
    expect(events.some(r => r.admin)).toBe(true);
    expect(events.some(r => r.event.eventId === 4672)).toBe(false);
    const sessions = view(result.views, 'sessions').rows;
    expect(sessions.some(s => s.end && s.end.ts >= s.event.ts)).toBe(true);
  });

  it('explains failed logons from SubStatus', () => {
    const failed = view(logon.analyze(ctx, { hideNoise: true }).views, 'events').rows.filter(r => r.event.eventId === 4625);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0].failure).toContain('User name does not exist');
    expect(failed[0].sourceIp).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });
});

describe('rdpLogon', () => {
  it('reads RemoteConnectionManager 1149 from UserData', () => {
    const { ctx } = loadStore('rdp-rcm.evtx');
    const rows = view(rdpLogon.analyze(ctx, { hideLocal: true }).views, 'events').rows;
    const auth = rows.filter(r => r.event.eventId === 1149);
    expect(auth.length).toBe(5);
    expect(auth.every(r => r.user && r.address)).toBe(true);
  });

  it('keeps only RemoteInteractive Security logons and rebuilds LSM sessions', () => {
    const LSM = 'Microsoft-Windows-TerminalServices-LocalSessionManager';
    const t = (s: number) => new Date(Date.UTC(2024, 0, 1, 10, 0, s)).toISOString();
    const { ctx } = storeOf([
      makeEvent({ provider: SEC, eventId: 4624, time: t(0), data: { LogonType: '3', TargetUserName: 'bob', IpAddress: '10.0.0.5' } }),
      makeEvent({ provider: SEC, eventId: 4624, time: t(1), data: { LogonType: '10', TargetUserName: 'bob', IpAddress: '203.0.113.9' } }),
      makeEvent({ provider: LSM, eventId: 21, time: t(2), payload: 'UserData/EventXML', data: { User: 'CORP\\bob', SessionID: '2', Address: '203.0.113.9' } }),
      makeEvent({ provider: LSM, eventId: 24, time: t(3), payload: 'UserData/EventXML', data: { User: 'CORP\\bob', SessionID: '2', Address: '203.0.113.9' } }),
      makeEvent({ provider: LSM, eventId: 25, time: t(4), payload: 'UserData/EventXML', data: { User: 'CORP\\bob', SessionID: '2', Address: '203.0.113.9' } }),
      makeEvent({ provider: LSM, eventId: 23, time: t(9), payload: 'UserData/EventXML', data: { User: 'CORP\\bob', SessionID: '2' } }),
      makeEvent({ provider: LSM, eventId: 21, time: t(10), payload: 'UserData/EventXML', data: { User: 'CORP\\bob', SessionID: '1', Address: 'LOCAL' } }),
    ]);
    const result = rdpLogon.analyze(ctx, { hideLocal: true });
    const events = view(result.views, 'events').rows;
    expect(events.filter(r => r.event.eventId === 4624)).toHaveLength(1);
    expect(events.some(r => r.address === 'LOCAL')).toBe(false);
    const [session] = view(result.views, 'sessions').rows;
    expect(session.disconnects).toBe(1);
    expect(session.reconnects).toBe(1);
    expect(session.end.ts - session.event.ts).toBe(7000);
    const [source] = view(result.views, 'sources').rows;
    expect(source.scope).toBe('public');
  });
});

describe('account', () => {
  it('shows the member and the group for membership changes and builds account lifecycles', () => {
    const { ctx } = loadStore('security-logon.evtx');
    const result = accountManagement.analyze(ctx, { hideEnum: true });
    const added = view(result.views, 'events').rows.filter(r => r.event.eventId === 4732);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(r => r.group && r.target)).toBe(true);
    const accounts = view(result.views, 'accounts').rows;
    expect(accounts.some(a => Number.isFinite(a.created))).toBe(true);
  });

  it('flags additions to administrative groups', () => {
    const { ctx } = storeOf([
      makeEvent({ provider: SEC, eventId: 4732, data: { TargetUserName: 'Administrators', TargetDomainName: 'Builtin', TargetSid: 'S-1-5-32-544', MemberName: '-', MemberSid: 'S-1-5-21-1-2-3-1001', SubjectUserName: 'admin' } }),
    ]);
    const [row] = view(accountManagement.analyze(ctx, { hideEnum: true }).views, 'events').rows;
    expect(row.privileged).toBe(true);
    expect(row.target).toBe('S-1-5-21-1-2-3-1001');
  });
});

describe('systemOnOff', () => {
  it('rebuilds boot sessions and reads shutdown requests', () => {
    const { ctx } = loadStore('system-dirty.evtx');
    const result = systemOnOff.analyze(ctx, {});
    const events = view(result.views, 'events').rows;
    expect(events.filter(r => r.kind === 'boot').length).toBeGreaterThan(0);
    const request = events.find(r => r.event.eventId === 1074);
    expect(request?.detail).toMatch(/ by /);
    const sessions = view(result.views, 'sessions').rows;
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.some(s => s.how === 'Clean shutdown')).toBe(true);
  });
});

describe('timeChange', () => {
  it('computes the jump and hides sub-second sync adjustments', () => {
    const { ctx } = loadStore('system-dirty.evtx', 'security-logon.evtx');
    const all = view(timeChange.analyze(ctx, { hideSmall: false }).views, 'events').rows;
    const shown = view(timeChange.analyze(ctx, { hideSmall: true }).views, 'events').rows;
    expect(shown.length).toBeLessThan(all.length);
    expect(shown.every(r => Math.abs(r.delta) >= 1000)).toBe(true);
    const security = all.filter(r => r.event.eventId === 4616);
    expect(security.length).toBeGreaterThan(0);
    expect(security[0].process).toBeTruthy();
    expect(Number.isFinite(security[0].delta)).toBe(true);
  });
});

describe('eventReset', () => {
  it('names the cleared log and the account from UserData', () => {
    const { ctx } = loadStore('system-dirty.evtx', 'security-process.evtx');
    const rows = view(eventReset.analyze(ctx, { showShutdown: false }).views, 'events').rows;
    const system = rows.find(r => r.event.eventId === 104)!;
    expect(system.log).toBeTruthy();
    expect(system.by).toBeTruthy();
    const security = rows.find(r => r.event.eventId === 1102)!;
    expect(security.by).toBeTruthy();
  });
});

describe('services', () => {
  it('shows the image path of installed services', () => {
    const { ctx } = loadStore('system-dirty.evtx');
    const rows = view(services.analyze(ctx, { showStates: false }).views, 'events').rows.filter(r => r.event.eventId === 7045);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.service && r.image)).toBe(true);
  });

  it('flags image paths typical of remote execution and payloads', () => {
    expect(suspicion('%COMSPEC% /Q /c echo cd ^> \\\\127.0.0.1\\C$\\__output 2^>^&1')).toContain('command shell');
    expect(suspicion('powershell.exe -nop -w hidden -enc SQBFAFgA')).toContain('encoded command');
    expect(suspicion('\\\\10.0.0.9\\ADMIN$\\a1b2c3.exe')).toContain('network path');
    expect(suspicion('C:\\Users\\bob\\AppData\\Local\\Temp\\svc.exe')).toContain('user-writable location');
    expect(suspicion('"C:\\Program Files\\Vendor\\agent.exe"')).toBe('');
  });
});

describe('update', () => {
  it('extracts KB numbers and install results', () => {
    const { ctx } = loadStore('system-dirty.evtx');
    const result = update.analyze(ctx, {});
    const rows = view(result.views, 'events').rows;
    expect(rows.filter(r => r.event.eventId === 19).length).toBeGreaterThan(0);
    expect(rows.some(r => /^KB\d+$/.test(r.kb))).toBe(true);
    expect(view(result.views, 'updates').rows.length).toBeGreaterThan(0);
  });
});

describe('process', () => {
  it('reads 4688 image, parent and user', () => {
    const { ctx } = loadStore('security-process.evtx');
    const rows = view(processExecution.analyze(ctx, {}).views, 'events').rows.filter(r => r.event.eventId === 4688);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.image && r.pid && r.user)).toBe(true);
    expect(rows.some(r => r.parent)).toBe(true);
  });

  it('infers the parent from the process alive under that PID when the event lacks it', () => {
    const t = (s: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, s)).toISOString();
    const create = (s: number, image: string, pidHex: string, ppidHex: string) =>
      makeEvent({ provider: SEC, eventId: 4688, time: t(s), data: { NewProcessName: image, NewProcessId: pidHex, ProcessId: ppidHex, SubjectUserName: 'bob' } });
    const { ctx } = storeOf([
      create(0, 'C:\\Windows\\explorer.exe', '0x100', '0x4'),
      create(1, 'C:\\Windows\\System32\\cmd.exe', '0x200', '0x100'),
      makeEvent({ provider: SEC, eventId: 4689, time: t(2), data: { ProcessName: 'C:\\Windows\\explorer.exe', ProcessId: '0x100' } }),
      create(3, 'C:\\Temp\\evil.exe', '0x100', '0x4'), // PID 0x100 reused
      create(4, 'C:\\Windows\\System32\\whoami.exe', '0x300', '0x100'),
    ]);
    const rows = view(processExecution.analyze(ctx, {}).views, 'events').rows.filter(r => r.event.eventId === 4688);
    expect(rows[1].parent).toBe('C:\\Windows\\explorer.exe');
    expect(rows[1].pid).toBe('512');
    expect(rows[3].parent).toBe('C:\\Temp\\evil.exe');
    expect(rows[3].parentInferred).toBe(true);
  });
});

describe('applicationErrors', () => {
  it('decodes positional Application Error 1000 data', () => {
    const { ctx } = loadStore('application.evtx');
    const rows = view(applicationErrors.analyze(ctx, {}).views, 'events').rows;
    const crash = rows.find(r => r.kind === 'Crash' && r.app === 'adberdr813.exe')!;
    expect(crash.exception).toContain('Access violation');
    expect(crash.module).toContain('msvcrt.dll');
    expect(crash.path).toContain('\\Downloads\\adberdr813.exe');
    expect(crash.detail).toContain('PID 2748');
    expect(rows.some(r => r.kind === 'Error report')).toBe(true);
  });
});

describe('softwareInstall', () => {
  it('reads MSI product, version, publisher and distinguishes removal from install', () => {
    const { ctx } = loadStore('application.evtx');
    const rows = view(softwareInstall.analyze(ctx, {}).views, 'events').rows;
    const installed = rows.find(r => r.event.eventId === 1033 && r.product === 'VMware Tools')!;
    expect(installed.kind).toBe('Installed');
    expect(installed.version).toBe('8.4.2.12623');
    expect(installed.publisher).toBe('VMware, Inc.');
    expect(installed.productCode).toBe('{FE2F6A2C-196E-4210-9C04-2B1BC21F07EF}');
    expect(rows.find(r => r.event.eventId === 1034)!.kind).toBe('Removed');
    expect(rows.find(r => r.event.eventId === 1035)!.kind).toBe('Reconfigured');
    const summary = rows.find(r => r.event.eventId === 11707 && r.product === 'VMware Tools')!;
    expect(summary.status).toBe('Installation operation completed successfully.');
    expect(summary.user).toBeTruthy();
  });

  it('counts each MSI operation once', () => {
    const { ctx } = loadStore('application.evtx');
    const result = softwareInstall.analyze(ctx, {});
    const events = view(result.views, 'events').rows;
    const installs = result.stats.find(s => s.label === 'Installs')!.value;
    expect(installs).toBe(events.filter(r => r.event.eventId === 1033).length);
  });

  it('reads a non-zero 1033 status as a failed install, counted once with its 11708', () => {
    const msi = (eventId: number, list: string[]) => makeEvent({ provider: 'MsiInstaller', eventId, channel: 'Application', list });
    const { ctx } = storeOf([
      msi(1033, ['Bad App', '1.0', '1033', '1603', 'Evil Corp']),
      msi(11708, ['Product: Bad App -- Installation failed.']),
      msi(1033, ['Good App', '2.0', '1033', '0', 'Good Corp']),
    ]);
    const result = softwareInstall.analyze(ctx, {});
    const rows = view(result.views, 'events').rows;
    expect(rows.map(r => r.kind)).toEqual(['Install failed', 'Install failed', 'Installed']);
    expect(rows[0].status).toBe('Status 1603');
    expect(result.stats.find(s => s.label === 'Failed')!.value).toBe(1);
    expect(result.stats.find(s => s.label === 'Installs')!.value).toBe(1);
  });

  it('decodes the product code carried in Binary', () => {
    expect(productCode('7B46453246364132432D313936452D343231302D394330342D3242314243323146303745467D')).toBe('{FE2F6A2C-196E-4210-9C04-2B1BC21F07EF}');
    expect(productCode('00FF')).toBe('');
  });
});

describe('usbStorage', () => {
  it('finds USB storage installs in the System log', () => {
    const { ctx } = loadStore('system-dirty.evtx');
    const result = usbStorage.analyze(ctx, { includeAll: true });
    expect(view(result.views, 'history').rows.length).toBeGreaterThan(0);
  });

  it('tracks connections and removals from Partition/Diagnostic 1006', () => {
    const P = 'Microsoft-Windows-Partition';
    const parent = 'USB\\VID_0781&PID_5581\\4C530001231030115312';
    const t = (h: number) => new Date(Date.UTC(2024, 0, 1, h)).toISOString();
    const { ctx } = storeOf([
      makeEvent({ provider: SEC, eventId: 4624, time: t(0), data: { LogonType: '2', TargetUserName: 'alice', TargetDomainName: 'PC' } }),
      makeEvent({ provider: P, eventId: 1006, time: t(1), data: { Capacity: '32015679488', Manufacturer: 'SanDisk', Model: 'Cruzer Blade', Revision: '1.00', SerialNumber: '4C530001231030115312', ParentId: parent } }),
      makeEvent({ provider: P, eventId: 1006, time: t(2), data: { Capacity: '0', Manufacturer: 'SanDisk', Model: 'Cruzer Blade', SerialNumber: '4C530001231030115312', ParentId: parent } }),
    ]);
    const result = usbStorage.analyze(ctx, { includeAll: false });
    const [device] = view(result.views, 'devices').rows;
    expect(device.device).toBe('SanDisk Cruzer Blade');
    expect(device.serial).toBe('4C530001231030115312');
    expect(device.connections).toBe(1);
    expect(device.lastDisconnected).toBeGreaterThan(device.lastConnected);
    expect(device.users).toBe('PC\\alice');
  });
});

describe('firewall', () => {
  it('decodes rule fields, detects the firewall being turned off, and replays rules', () => {
    const FW = 'Microsoft-Windows-Windows Firewall With Advanced Security';
    const t = (s: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, s)).toISOString();
    const { ctx } = storeOf([
      makeEvent({ provider: FW, eventId: 2004, time: t(0), data: { RuleId: '{1}', RuleName: 'backdoor', Direction: '1', Action: '3', Protocol: '6', LocalPorts: '4444', ApplicationPath: 'C:\\Temp\\nc.exe', Profiles: '7', ModifyingApplication: 'C:\\Windows\\System32\\netsh.exe' } }),
      makeEvent({ provider: FW, eventId: 2097, time: t(1), data: { RuleId: '{2}', RuleName: 'temp', Direction: '2', Action: '2', Protocol: '17' } }),
      makeEvent({ provider: FW, eventId: 2052, time: t(2), data: { RuleId: '{2}', RuleName: 'temp' } }),
      makeEvent({ provider: FW, eventId: 2003, time: t(3), data: { Profiles: '4', SettingType: '1', SettingValue: '00000000' } }),
    ]);
    const result = firewall.analyze(ctx, {});
    const changes = view(result.views, 'events').rows;
    expect(changes[0]).toMatchObject({ action: 'Rule added', direction: 'Inbound', verdict: 'Allow', protocol: 'TCP', profiles: 'All' });
    expect(changes[3].disablesFirewall).toBe(true);
    const rules = view(result.views, 'rules').rows;
    expect(rules.find(r => r.rule === 'temp')!.status).toBe('Deleted');
    expect(rules.find(r => r.rule === 'backdoor')!.status).toBe('Present');
  });
});

describe('autoruns', () => {
  it('extracts the command from a 4698 task definition', () => {
    const { ctx } = loadStore('security-process.evtx');
    const rows = view(autoruns.analyze(ctx, { showRuns: false, hideBuiltin: false }).views, 'events').rows;
    const created = rows.find(r => r.event.eventId === 4698)!;
    expect(created.name).toBeTruthy();
    expect(created.command).toBeTruthy();
  });

  it('keeps only autostart registry values and Startup folder writes', () => {
    const { ctx } = storeOf([
      makeEvent({ provider: SEC, eventId: 4657, data: { ObjectName: '\\REGISTRY\\MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', ObjectValueName: 'updater', NewValue: 'C:\\Temp\\u.exe', OperationType: '%%1904', ProcessName: 'C:\\Windows\\regedit.exe' } }),
      makeEvent({ provider: SEC, eventId: 4657, data: { ObjectName: '\\REGISTRY\\MACHINE\\SOFTWARE\\Vendor\\Settings', ObjectValueName: 'x', NewValue: '1' } }),
      makeEvent({ provider: SEC, eventId: 4663, data: { ObjectName: 'C:\\Users\\bob\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\run.lnk', AccessMask: '0x2', ProcessName: 'C:\\Windows\\explorer.exe' } }),
      makeEvent({ provider: SEC, eventId: 4663, data: { ObjectName: 'C:\\Users\\bob\\Documents\\a.docx', AccessMask: '0x2' } }),
    ]);
    const rows = view(autoruns.analyze(ctx, { showRuns: false, hideBuiltin: false }).views, 'events').rows;
    expect(rows.map(r => r.mechanism)).toEqual(['Registry', 'Startup folder']);
    expect(rows[0].action).toContain('New registry value created');
  });

  it('joins task commands and arguments', () => {
    const xml = '<Task><Actions><Exec><Command>C:\\Windows\\System32\\cmd.exe</Command><Arguments>/c whoami &gt; C:\\x.txt</Arguments></Exec></Actions></Task>';
    expect(taskCommands(xml)).toBe('C:\\Windows\\System32\\cmd.exe /c whoami > C:\\x.txt');
  });
});

describe('documentPrinting', () => {
  it('reads 307 parameters and the spool file of the same job', () => {
    const PS = 'Microsoft-Windows-PrintService';
    const t = (s: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, s)).toISOString();
    const common = { pid: 1200, tid: 3400, payload: 'UserData/DocumentPrinted' };
    const { ctx } = storeOf([
      makeEvent({ provider: PS, eventId: 801, time: t(0), ...common, data: { JobId: '5' } }),
      makeEvent({ provider: PS, eventId: 812, time: t(1), ...common, data: { Source: 'C:\\Windows\\System32\\spool\\PRINTERS\\00005.SPL' } }),
      makeEvent({ provider: PS, eventId: 307, time: t(2), ...common, data: { Param1: '5', Param2: 'salary.xlsx', Param3: 'bob', Param4: '\\\\PC01', Param5: 'HP LaserJet', Param6: 'IP_10.0.0.20', Param7: '120000', Param8: '3' } }),
    ]);
    const [job] = view(documentPrinting.analyze(ctx, {}).views, 'jobs').rows;
    expect(job).toMatchObject({ document: 'salary.xlsx', user: 'bob', client: '\\\\PC01', printer: 'HP LaserJet', pages: 3, bytes: 120000 });
    expect(job.spoolFile).toContain('00005.SPL');
  });
});

describe('wireless', () => {
  it('treats 8001 as connected and 8002 as failed', () => {
    const W = 'Microsoft-Windows-WLAN-AutoConfig';
    const { ctx } = storeOf([
      makeEvent({ provider: W, eventId: 8001, data: { SSID: 'CafeWiFi', AuthenticationAlgorithm: 'Open', CipherAlgorithm: 'None' } }),
      makeEvent({ provider: W, eventId: 8002, data: { SSID: 'CafeWiFi', FailureReason: 'The network is not available' } }),
    ]);
    const result = wireless.analyze(ctx, {});
    expect(result.stats.find(s => s.label === 'Wi-Fi connections')!.value).toBe(1);
    expect(result.stats.find(s => s.label === 'Failed connections')!.value).toBe(1);
    const [network] = view(result.views, 'networks').rows;
    expect(network).toMatchObject({ ssid: 'CafeWiFi', connections: 1, failures: 1, security: 'Open / None' });
  });
});

describe('cdRecording and showAll', () => {
  it('reads the cdrom device and summarizes payloads', () => {
    const { ctx } = storeOf([makeEvent({ provider: 'cdrom', eventId: 133, list: ['\\Device\\CdRom0'] })]);
    expect(view(cdRecording.analyze(ctx, {}).views, 'events').rows[0].device).toBe('\\Device\\CdRom0');
    expect(view(showAll.analyze(ctx, {}).views, 'events').rows).toHaveLength(1);
  });
});
