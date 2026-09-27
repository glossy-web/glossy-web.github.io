import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '@/core/csv';
import { formatIso, formatTime, formatDuration, filetimeToMs } from '@/core/time';
import { failureReason, logonTypeName, messageCode, isNoiseAccount } from '@/core/lookups';
import { ipScope, splitHostPort, pid, xmlElements } from '@/core/format';
import { parseDeviceId, normalizeSerial, hasRealSerial, volumeSerialFromVbr } from '@/plugins/usbStorage/device';
import { profiles, settingNumber } from '@/plugins/firewall';

describe('time', () => {
  const ts = Date.UTC(2024, 4, 1, 0, 30, 5, 123);
  it('formats in UTC and in a named zone with its offset', () => {
    expect(formatTime(ts, 'UTC')).toBe('2024-05-01 00:30:05.123');
    expect(formatTime(ts, 'Asia/Seoul')).toBe('2024-05-01 09:30:05.123');
    expect(formatIso(ts, 'UTC')).toBe('2024-05-01T00:30:05.123Z');
    expect(formatIso(ts, 'Asia/Seoul')).toBe('2024-05-01T09:30:05.123+09:00');
  });
  it('formats durations and FILETIMEs', () => {
    expect(formatDuration(90061000)).toBe('1d 1h 01m 01s');
    expect(formatDuration(-3600000)).toBe('-1h 00m 00s');
    expect(filetimeToMs('133580000000000000')).toBe(Date.UTC(2024, 3, 19, 11, 33, 20));
    expect(filetimeToMs('0')).toBeNull();
  });
});

describe('csv', () => {
  it('quotes and neutralizes spreadsheet formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('-')).toBe('-');
    expect(csvCell('-12')).toBe('-12');
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(toCsv(['a'], [['1']])).toBe('\uFEFFa\r\n1\r\n');
  });
});

describe('lookups', () => {
  it('decodes logon codes', () => {
    expect(failureReason('0xc000006d', '0xc000006a')).toBe('Wrong password (0xC000006A)');
    expect(failureReason('0xc0000234', '0x0')).toBe('Account locked out (0xC0000234)');
    expect(logonTypeName('10')).toBe('10 RemoteInteractive');
    expect(messageCode('%%1842')).toBe('Yes');
    expect(isNoiseAccount('WS01$')).toBe(true);
    expect(isNoiseAccount('DWM-1')).toBe(true);
    expect(isNoiseAccount('alice')).toBe(false);
  });
});

describe('format', () => {
  it('classifies IPs and splits host:port', () => {
    expect(ipScope('10.1.2.3')).toBe('private');
    expect(ipScope('203.0.113.7')).toBe('public');
    expect(ipScope('::1')).toBe('loopback');
    expect(ipScope('-')).toBe('');
    expect(splitHostPort('192.168.0.5:51234')).toEqual({ ip: '192.168.0.5', port: '51234' });
    expect(splitHostPort('[fe80::1]:3389')).toEqual({ ip: 'fe80::1', port: '3389' });
    expect(pid('0x1a2c')).toBe('6700');
    expect(xmlElements('<a><Command>x &amp; y</Command></a>', 'Command')).toEqual(['x & y']);
  });
});

describe('device ids', () => {
  it('parses USBSTOR, WPD and VID/PID forms', () => {
    expect(parseDeviceId('USBSTOR\\Disk&Ven_SanDisk&Prod_Cruzer_Blade&Rev_1.00\\4C530001231030115312&0')).toMatchObject({
      kind: 'USB mass storage',
      vendor: 'SanDisk',
      product: 'Cruzer Blade',
      revision: '1.00',
      serial: '4C530001231030115312&0',
    });
    expect(parseDeviceId('SWD\\WPDBUSENUM\\_??_USBSTOR#Disk&Ven_Kingston&Prod_DataTraveler&Rev_PMAP#08606E6D&0#{53f56307-b6bf-11d0-94f2-00a0c91efb8b}')).toMatchObject({
      kind: 'Portable device (MTP/WPD)',
      vendor: 'Kingston',
      serial: '08606E6D&0',
    });
    expect(parseDeviceId('USB\\VID_04E8&PID_6860\\R58M1234ABC')).toMatchObject({ kind: 'USB device', vid: '04E8', pid: '6860', serial: 'R58M1234ABC' });
    expect(normalizeSerial('4c530001&0')).toBe('4C530001');
    expect(hasRealSerial('7&1A2B3C4D&0')).toBe(false);
  });

  it('reads the volume serial number from a boot record', () => {
    const vbr = (fill: (b: Uint8Array) => void) => {
      const b = new Uint8Array(512);
      fill(b);
      return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    };
    const ascii = (b: Uint8Array, at: number, s: string) => [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)));
    const ntfs = vbr(b => {
      ascii(b, 3, 'NTFS    ');
      b.set([0x78, 0x56, 0x34, 0x12], 0x48);
    });
    expect(volumeSerialFromVbr(ntfs)).toEqual({ fs: 'NTFS', serial: '1234-5678' });
    const fat32 = vbr(b => {
      ascii(b, 3, 'MSDOS5.0');
      ascii(b, 0x52, 'FAT32   ');
      b.set([0xef, 0xbe, 0xad, 0xde], 0x43);
    });
    expect(volumeSerialFromVbr(fat32)).toEqual({ fs: 'FAT32', serial: 'DEAD-BEEF' });
    const exfat = vbr(b => {
      ascii(b, 3, 'EXFAT   ');
      b.set([0x04, 0x03, 0x02, 0x01], 0x64);
    });
    expect(volumeSerialFromVbr(exfat)).toEqual({ fs: 'exFAT', serial: '0102-0304' });
    expect(volumeSerialFromVbr('00')).toEqual({ fs: '', serial: '' });
  });
});

describe('firewall codes', () => {
  it('decodes profiles and DWORD settings', () => {
    expect(profiles('7')).toBe('All');
    expect(profiles('6')).toBe('Private, Public');
    expect(settingNumber('01000000')).toBe(1);
    expect(settingNumber('0')).toBe(0);
  });
});

describe('paths', () => {
  it('treats Defender folders under ProgramData as protected', async () => {
    const { isUserWritablePath } = await import('@/core/format');
    expect(isUserWritablePath('C:\\Users\\bob\\AppData\\Local\\Temp\\a.exe')).toBe(true);
    expect(isUserWritablePath('C:\\ProgramData\\x\\a.exe')).toBe(true);
    expect(isUserWritablePath('C:\\ProgramData\\Microsoft\\Windows Defender\\Definition Updates\\{1}\\MpKsl1.sys')).toBe(false);
    expect(isUserWritablePath('C:\\Windows\\System32\\cmd.exe')).toBe(false);
  });
});
