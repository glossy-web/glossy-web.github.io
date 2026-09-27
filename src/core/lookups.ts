/** Code tables shared by plugins (Microsoft audit event documentation). */

export const LOGON_TYPES: Record<number, string> = {
  0: 'System',
  2: 'Interactive',
  3: 'Network',
  4: 'Batch',
  5: 'Service',
  7: 'Unlock',
  8: 'NetworkCleartext',
  9: 'NewCredentials',
  10: 'RemoteInteractive',
  11: 'CachedInteractive',
  12: 'CachedRemoteInteractive',
  13: 'CachedUnlock',
};

export function logonTypeName(v: string | undefined): string {
  if (!v) return '';
  const n = Number(v);
  const name = LOGON_TYPES[n];
  return name ? `${n} ${name}` : v;
}

/** NTSTATUS codes seen in 4625 Status/SubStatus and 4776/4771 Status. */
export const LOGON_FAILURE: Record<string, string> = {
  C0000064: 'User name does not exist',
  C000006A: 'Wrong password',
  C000006C: 'Password does not meet policy',
  C000006D: 'Bad user name or authentication information',
  C000006E: 'Account restriction',
  C000006F: 'Outside allowed logon hours',
  C0000070: 'Workstation not allowed',
  C0000071: 'Password expired',
  C0000072: 'Account disabled',
  C000009A: 'Insufficient system resources',
  C0000133: 'Clock skew too large',
  C000015B: 'Logon type not granted',
  C0000192: 'Netlogon service not started',
  C0000193: 'Account expired',
  C0000224: 'Password must be changed',
  C0000234: 'Account locked out',
  C0000413: 'Authentication firewall: not allowed',
};

/** Failure reason from SubStatus (more specific) falling back to Status. */
export function failureReason(status: string | undefined, subStatus: string | undefined): string {
  for (const code of [subStatus, status]) {
    if (!code) continue;
    const key = code.replace(/^0x/i, '').toUpperCase().padStart(8, '0');
    if (key === '00000000') continue;
    return LOGON_FAILURE[key] ? `${LOGON_FAILURE[key]} (0x${key})` : `0x${key}`;
  }
  return '';
}

/** Replacement strings Windows writes as "%%NNNN" message references. */
const MESSAGE_CODES: Record<string, string> = {
  '%%1832': 'Identification',
  '%%1833': 'Impersonation',
  '%%1840': 'Delegation',
  '%%1842': 'Yes',
  '%%1843': 'No',
  '%%1936': 'Default (full token, UAC off or built-in admin)',
  '%%1937': 'Elevated',
  '%%1938': 'Limited',
  '%%1904': 'New registry value created',
  '%%1905': 'Existing registry value modified',
  '%%1906': 'Registry value deleted',
  '%%8448': 'Success removed',
  '%%8449': 'Success added',
  '%%8450': 'Failure removed',
  '%%8451': 'Failure added',
};

export function messageCode(v: string | undefined): string {
  if (!v) return '';
  return v
    .split(/,\s*|\s+/)
    .filter(Boolean)
    .map(part => MESSAGE_CODES[part] ?? part)
    .join(', ');
}

const WELL_KNOWN_SIDS: Record<string, string> = {
  'S-1-0-0': 'NULL SID',
  'S-1-1-0': 'Everyone',
  'S-1-5-7': 'ANONYMOUS LOGON',
  'S-1-5-18': 'NT AUTHORITY\\SYSTEM',
  'S-1-5-19': 'NT AUTHORITY\\LOCAL SERVICE',
  'S-1-5-20': 'NT AUTHORITY\\NETWORK SERVICE',
  'S-1-5-32-544': 'BUILTIN\\Administrators',
  'S-1-5-32-545': 'BUILTIN\\Users',
  'S-1-5-32-546': 'BUILTIN\\Guests',
  'S-1-5-32-551': 'BUILTIN\\Backup Operators',
  'S-1-5-32-555': 'BUILTIN\\Remote Desktop Users',
  'S-1-5-32-562': 'BUILTIN\\Distributed COM Users',
};

const WELL_KNOWN_RIDS: Record<string, string> = {
  '500': 'Administrator (RID 500)',
  '501': 'Guest (RID 501)',
  '512': 'Domain Admins',
  '513': 'Domain Users',
  '518': 'Schema Admins',
  '519': 'Enterprise Admins',
};

export function wellKnownSid(sid: string): string {
  if (WELL_KNOWN_SIDS[sid]) return WELL_KNOWN_SIDS[sid];
  const rid = /^S-1-5-21-\d+-\d+-\d+-(\d+)$/.exec(sid)?.[1];
  return rid ? (WELL_KNOWN_RIDS[rid] ?? '') : '';
}

/** Accounts that generate routine noise in logon data. */
export function isNoiseAccount(user: string, sid?: string): boolean {
  const u = user.toUpperCase();
  if (!u || u === '-') return true;
  if (u.endsWith('$')) return true;
  if (u === 'SYSTEM' || u === 'LOCAL SERVICE' || u === 'NETWORK SERVICE' || u === 'ANONYMOUS LOGON') return true;
  if (/^(DWM|UMFD)-\d+$/.test(u)) return true;
  if (sid && /^S-1-5-(18|19|20|7)$/.test(sid)) return true;
  // Per-service virtual accounts (S-1-5-80-*, S-1-5-90-*, S-1-5-96-*)
  if (sid && /^S-1-5-(80|90|96)-/.test(sid)) return true;
  return false;
}
