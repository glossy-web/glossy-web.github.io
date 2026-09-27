/** Parsing of Windows device instance IDs and volume boot records for USB storage analysis. */

export interface DeviceIdentity {
  kind: 'USB mass storage' | 'Portable device (MTP/WPD)' | 'USB device' | '';
  vendor: string;
  product: string;
  revision: string;
  serial: string;
  vid: string;
  pid: string;
}

const EMPTY: DeviceIdentity = { kind: '', vendor: '', product: '', revision: '', serial: '', vid: '', pid: '' };

const tidy = (s: string) => s.replace(/_/g, ' ').trim();

/**
 * USB mass storage serials end with "&<LUN>" in USBSTOR IDs; a second character of "&"
 * means Windows generated the ID because the device reports no serial number.
 */
export function normalizeSerial(serial: string): string {
  return serial.replace(/&\d+$/, '').toUpperCase();
}

export function hasRealSerial(serial: string): boolean {
  return !!serial && serial[1] !== '&';
}

/**
 * Understands the forms used by UserPnp, Kernel-PnP, DriverFrameworks-UserMode and Partition/Diagnostic:
 *   USBSTOR\Disk&Ven_SanDisk&Prod_Cruzer_Blade&Rev_1.00\4C530001231030115312&0
 *   SWD\WPDBUSENUM\_??_USBSTOR#Disk&Ven_...&Prod_...&Rev_...#<serial>&0#{53f56307-...}
 *   WPDBUSENUMROOT\UMB\2&37C186B&0&STORAGE#VOLUME#_??_USBSTOR#DISK&VEN_...#<serial>&0#
 *   USB\VID_04E8&PID_6860\<serial>
 */
export function parseDeviceId(raw: string): DeviceIdentity {
  if (!raw) return EMPTY;
  const id = raw.trim();
  const usbstor = /USBSTOR[\\#]([^&\\#]+)&VEN_([^&\\#]*)&PROD_([^&\\#]*)(?:&REV_([^\\#&]*))?[\\#]([^\\#{]+)/i.exec(id);
  if (usbstor) {
    const wpd = /WPDBUSENUM|SWD\\/i.test(id);
    return {
      kind: wpd ? 'Portable device (MTP/WPD)' : 'USB mass storage',
      vendor: tidy(usbstor[2]!),
      product: tidy(usbstor[3]!),
      revision: tidy(usbstor[4] ?? ''),
      serial: usbstor[5]!.replace(/#$/, ''),
      vid: '',
      pid: '',
    };
  }
  const usb = /USB[\\#]VID_([0-9A-F]{4})&PID_([0-9A-F]{4})(?:&MI_\d+)?(?:[\\#]([^\\#{]+))?/i.exec(id);
  if (usb) {
    return { kind: 'USB device', vendor: '', product: '', revision: '', serial: usb[3] ?? '', vid: usb[1]!.toUpperCase(), pid: usb[2]!.toUpperCase() };
  }
  return EMPTY;
}

/** Common MTP/phone vendor IDs (as the original Glossy listed them). */
export const USB_VENDORS: Record<string, string> = {
  '04E8': 'Samsung',
  '1004': 'LG',
  '05AC': 'Apple',
  '18D1': 'Google',
  '0BB4': 'HTC',
  '2717': 'Xiaomi',
  '0781': 'SanDisk',
  '0951': 'Kingston',
  '090C': 'Silicon Motion',
  '058F': 'Alcor Micro',
  '13FE': 'Phison',
};

const hexBytes = (hex: string) => {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const ascii = (b: Uint8Array, from: number, len: number) => String.fromCharCode(...b.subarray(from, from + len));

function serialAt(b: Uint8Array, offset: number): string {
  const v = (b[offset]! | (b[offset + 1]! << 8) | (b[offset + 2]! << 16) | (b[offset + 3]! << 24)) >>> 0;
  const hex = v.toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

/**
 * Volume serial number from a volume boot record (Partition/Diagnostic 1006 Vbr0), as
 * shown by `vol` and stored in LNK files and jump lists. Returns '' unless the VBR is
 * recognized as NTFS, exFAT, FAT32 or FAT12/16.
 */
export function volumeSerialFromVbr(vbrHex: string): { fs: string; serial: string } {
  const hex = vbrHex.replace(/[^0-9a-f]/gi, '');
  if (hex.length < 200) return { fs: '', serial: '' };
  const b = hexBytes(hex);
  const oem = ascii(b, 3, 8);
  if (oem === 'NTFS    ') return { fs: 'NTFS', serial: serialAt(b, 0x48) };
  if (oem === 'EXFAT   ') return { fs: 'exFAT', serial: serialAt(b, 0x64) };
  if (ascii(b, 0x52, 8) === 'FAT32   ') return { fs: 'FAT32', serial: serialAt(b, 0x43) };
  if (/^FAT1[26] {3}$/.test(ascii(b, 0x36, 8))) return { fs: ascii(b, 0x36, 5), serial: serialAt(b, 0x27) };
  return { fs: '', serial: '' };
}
