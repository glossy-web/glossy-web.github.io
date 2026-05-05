import { ref } from 'vue';
import { EvtxFile } from '@ts-evtx/core';
import { eventStore, type EventSource } from '@/core/store';
import type { EvtxEvent } from '@/core/evtx/types';
import { LEVEL_NAMES } from '@/core/evtx/types';

type AnyRec = Record<string, unknown>;

function parseXmlFields(xml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  const providerM = xml.match(/Provider Name=["']([^"']+)["']/);
  if (providerM) { result.provider = providerM[1]; }
  const guidM = xml.match(/Provider[^>]+Guid=["']\{?([^"'}]+)\}?["']/);
  if (guidM && guidM[1]) result.providerGuid = `{${guidM[1]}}`;

  const eventIdM = xml.match(/<EventID(?:\s+Qualifiers="\d+")?[^>]*>(\d+)<\/EventID>/);
  if (eventIdM) result.eventId = parseInt(eventIdM[1], 10);

  const levelM = xml.match(/<Level>(\d+)<\/Level>/);
  if (levelM) result.level = parseInt(levelM[1], 10);

  const channelM = xml.match(/<Channel>([^<]+)<\/Channel>/);
  if (channelM) result.channel = channelM[1];

  const computerM = xml.match(/<Computer>([^<]+)<\/Computer>/);
  if (computerM) result.computer = computerM[1];

  const taskM = xml.match(/<Task>(\d+)<\/Task>/);
  if (taskM) result.task = parseInt(taskM[1], 10);

  const opcodeM = xml.match(/<Opcode>(\d+)<\/Opcode>/);
  if (opcodeM) result.opcode = parseInt(opcodeM[1], 10);

  const keywordsM = xml.match(/<Keywords>([^<]+)<\/Keywords>/);
  if (keywordsM) result.keywords = keywordsM[1];

  const securityM = xml.match(/Security UserID="([^"]+)"/);
  if (securityM) result.securityUserId = securityM[1];

  const execM = xml.match(/Execution ProcessID="(\d+)" ThreadID="(\d+)"/);
  if (execM) { result.processId = parseInt(execM[1], 10); result.threadId = parseInt(execM[2], 10); }

  const edM = xml.match(/<EventData[^>]*>([\s\S]*?)<\/EventData>/);
  if (edM) {
    const data: Record<string, unknown> = {};
    const re = /<Data Name="([^"]+)"[^>]*>([^<]*)<\/Data>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(edM[1])) !== null) { data[m[1]] = m[2] || ''; }
    if (Object.keys(data).length === 0) {
      const plainRe = /<Data[^>]*>([^<]+)<\/Data>/g;
      const values: string[] = [];
      while ((m = plainRe.exec(edM[1])) !== null) { values.push(m[1] || ''); }
      if (values.length) data._values = values;
    }
    result.data = data;
  }

  return result;
}

function extractStringsFromBinary(data: Uint8Array): string[] {
  const strings: string[] = [];
  let i = 0;
  while (i < data.length - 1) {
    let str = '';
    while (i < data.length - 1) {
      const c = data[i] | (data[i + 1] << 8);
      i += 2;
      if (c === 0) break;
      if (c >= 0x20 && c < 0xFFFE) str += String.fromCharCode(c);
    }
    // Skip null terminators
    while (i < data.length - 1 && data[i] === 0 && data[i + 1] === 0) i += 2;
    if (str.length >= 2) strings.push(str);
  }
  return strings;
}

function extractBasicInfoFromBinary(data: Uint8Array): Record<string, unknown> {
  const strings = extractStringsFromBinary(data);
  // Sample: log first 5 and last 5 strings
  if (strings.length > 0) {
    console.log(`Binary fallback: found ${strings.length} strings, sample:`,
      strings.slice(0, 5), '...', strings.slice(-5));
  }
  const result: Record<string, unknown> = {};
  const dataFields: Record<string, unknown> = {};

  const knownProviders = [
    'Microsoft-Windows-Security-Auditing',
    'Microsoft-Windows-Sysmon',
    'Microsoft-Windows-Kernel-General',
    'Microsoft-Windows-Kernel-Power',
    'Service Control Manager',
    'Microsoft-Windows-WindowsUpdateClient',
    'Microsoft-Windows-Windows Firewall With Advanced Security',
    'Microsoft-Windows-TerminalServices-LocalSessionManager',
    'Microsoft-Windows-TerminalServices-RemoteConnectionManager',
    'Microsoft-Windows-TaskScheduler',
    'Microsoft-Windows-UserPnp',
    'Microsoft-Windows-DriverFrameworks-UserMode',
    'Microsoft-Windows-PrintService',
    'Microsoft-Windows-WLAN-AutoConfig',
    'MsiInstaller',
    'Application Error',
    'Windows Error Reporting',
    '.NET Runtime',
    'Microsoft-Windows-Eventlog',
    'Microsoft-Windows-Power-Troubleshooter',
    'Microsoft-Windows-Application-Experience',
    'Microsoft-Windows-Partition',
    'Microsoft-Windows-CDROM',
  ];

  for (const s of strings) {
    for (const p of knownProviders) {
      if (s.includes(p)) { result.provider = s; break; }
    }
    if (result.provider) break;
  }

  // Try to find EventID: look for small numbers after known patterns
  for (let j = 0; j < strings.length; j++) {
    const s = strings[j];
    // XML-like patterns that precede EventID
    if ((s === 'EventID' || s === 'EventIDQualifiers') && j + 1 < strings.length) {
      const n = parseInt(strings[j + 1], 10);
      if (!isNaN(n) && n > 0 && n < 100000) {
        result.eventId = n;
        break;
      }
    }
  }

  // Find Channel
  for (const s of strings) {
    if (['Security', 'System', 'Application', 'Microsoft-Windows-Sysmon/Operational',
         'Windows PowerShell', 'Microsoft-Windows-Windows Defender/Operational',
         'Setup', 'Forwarded Events', 'HardwareEvents', 'Internet Explorer',
         'Key Management Service', 'OAlerts'].includes(s)) {
      result.channel = s;
      break;
    }
  }

  // Find Level as number
  for (let j = 0; j < strings.length; j++) {
    if (strings[j] === 'Level' && j + 1 < strings.length) {
      // next might be a number string, or the token value
      const n = parseInt(strings[j + 1], 10);
      if (!isNaN(n) && n >= 0 && n <= 5) {
        result.level = n;
      }
    }
  }

  // Find Computer (typically a hostname, often all uppercase or starts with capital)
  for (const s of strings) {
    if (/^[A-Z][A-Za-z0-9-]+$/.test(s) && s.length > 3 && s.length < 30
        && !s.startsWith('Microsoft') && !s.includes('\\')) {
      const skip = ['Security', 'System', 'Application', 'EventID', 'Level',
                    'Channel', 'Computer', 'Provider', 'Task', 'Opcode', 'Keywords',
                    'Version', 'EventRecordID', 'Correlation', 'Execution', 'Subject',
                    'Target', 'Logon', 'NewProcess', 'Process', 'Image', 'Source', 'Service'];
      if (!skip.includes(s)) {
        result.computer = s;
        break;
      }
    }
  }

  // Try to extract Data fields
  const nameValPairs: Array<[string, string]> = [];
  for (let j = 0; j < strings.length - 1; j++) {
    const a = strings[j];
    const b = strings[j + 1];
    // Skip known XML tokens
    const tokens = new Set(['Event', 'System', 'EventData', 'UserData', 'Data',
      'Provider', 'EventID', 'Level', 'Channel', 'Computer', 'Version', 'Task',
      'Opcode', 'Keywords', 'TimeCreated', 'EventRecordID', 'Correlation',
      'Execution', 'Security', 'SubjectUserSid', 'SubjectUserName',
      'SubjectDomainName', 'SubjectLogonId', 'TargetUserSid', 'TargetUserName',
      'TargetDomainName', 'TargetLogonId', 'LogonType', 'LogonProcessName',
      'AuthenticationPackageName', 'WorkstationName', 'LogonGuid',
      'TransmittedServices', 'LmPackageName', 'KeyLength', 'ProcessId',
      'ProcessName', 'NewProcessId', 'NewProcessName', 'CommandLine',
      'ProcessCommandLine', 'ParentProcessName', 'TokenElevationType',
      'MandatoryLabel', 'IpAddress', 'IpPort', 'ImpersonationLevel',
      'RestrictedAdminMode', 'TargetOutboundUserName', 'TargetOutboundDomainName',
      'VirtualAccount', 'TargetLinkedLogonId', 'ElevatedToken',
    ]);
    if (a === 'Name' && !tokens.has(b)) continue;
    if (tokens.has(a)) continue;
    if (a.length > 60 || b.length > 2000) continue;
    // Skip if a looks like XML
    if (/[<>]/.test(a)) continue;
    // Accept pairs where 'a' looks like a field name and 'b' is a value
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(a) && b.length > 0 && !/[<>]/.test(b)) {
      nameValPairs.push([a, b]);
    }
  }
  for (const [name, value] of nameValPairs) {
    if (!dataFields[name]) dataFields[name] = value;
  }

  result.data = dataFields;
  return result;
}

function buildEvent(rec: AnyRec, sourceFile: string, globalId: number): EvtxEvent | null {
  try {
    const recObj = rec as unknown as {
      timestampAsDate: () => Date;
      recordNum: () => bigint;
      renderXml: () => string;
      data: () => Uint8Array;
      size: () => number;
    };

    const timestamp = recObj.timestampAsDate();
    const rn = recObj.recordNum();

    let xml = '';
    try { xml = recObj.renderXml(); } catch (e) { console.warn('renderXml threw:', e); }

    const fields = parseXmlFields(xml);

    if (!fields.provider && !fields.eventId) {
      try {
        const raw = recObj.data();
        if (raw && raw.length > 0) {
          const binFields = extractBasicInfoFromBinary(raw);
          if (binFields.provider || binFields.eventId) {
            fields.provider = binFields.provider || fields.provider;
            fields.eventId = binFields.eventId || fields.eventId;
            fields.channel = binFields.channel || fields.channel;
            fields.computer = binFields.computer || fields.computer;
            fields.level = binFields.level ?? fields.level;
            fields.data = binFields.data || fields.data;
          }
        }
      } catch (e) { console.warn('binary fallback threw:', e); }
    }

    const level = (fields.level as number) ?? 0;

    return {
      id: globalId,
      recordId: rn,
      timestamp,
      provider: (fields.provider as string) || '',
      providerGuid: (fields.providerGuid as string) || '',
      eventId: (fields.eventId as number) ?? 0,
      qualifiers: null,
      version: 0,
      level,
      levelName: LEVEL_NAMES[level] || `Level(${level})`,
      task: (fields.task as number) ?? 0,
      opcode: (fields.opcode as number) ?? 0,
      keywords: (fields.keywords as string) || '0x0',
      channel: (fields.channel as string) || '',
      computer: (fields.computer as string) || '',
      securityUserId: (fields.securityUserId as string) || null,
      processId: (fields.processId as number) ?? null,
      threadId: (fields.threadId as number) ?? null,
      activityId: null,
      data: (fields.data as Record<string, unknown>) || {},
      rawXml: xml,
      sourceFile,
    };
  } catch {
    return null;
  }
}

export function useFileLoader() {
  const isLoading = ref(false);
  const loadProgress = ref(0);
  const errors = ref<string[]>([]);
  const sources = ref<EventSource[]>([]);

  async function loadFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;

    isLoading.value = true;
    loadProgress.value = 0;
    errors.value = [];

    const evtxFiles = files.filter(f => f.name.toLowerCase().endsWith('.evtx'));

    if (evtxFiles.length === 0) {
      errors.value.push('No .evtx files selected');
      isLoading.value = false;
      return;
    }

    let completed = 0;
    const total = evtxFiles.length;

    for (const file of evtxFiles) {
      try {
        const arrayBuf = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuf);

        const evtxFile = new (EvtxFile as unknown as new (buf: Uint8Array) => AnyRec)(uint8);
        const events: EvtxEvent[] = [];
        const parseErrors: string[] = [];
        let globalId = 0;
        let recordCount = 0;
        let emptyXmlCount = 0;

        const recordsIter = (evtxFile as unknown as { records: () => Iterable<AnyRec> }).records();
        for (const rec of recordsIter) {
          recordCount++;
          try {
            const event = buildEvent(rec, file.name, globalId);
            if (event) {
              if (!event.provider && !event.eventId) emptyXmlCount++;
              events.push(event);
              globalId++;
            }
          } catch (e) {
            parseErrors.push(`Record error: ${String(e)}`);
          }
        }

        if (emptyXmlCount > 0) {
          parseErrors.push(`${emptyXmlCount}/${recordCount} records had empty fields`);
        }

        const sourceId = eventStore.addSource(file.name, { events, errors: parseErrors });
        sources.value.push({
          id: sourceId,
          name: file.name,
          eventCount: events.length,
          errors: parseErrors,
        });
      } catch (err) {
        errors.value.push(`${file.name}: ${String(err)}`);
      } finally {
        completed++;
        loadProgress.value = Math.round((completed / total) * 100);
      }
    }

    isLoading.value = false;
  }

  function clearAll(): void {
    eventStore.reset();
    sources.value = [];
    errors.value = [];
    loadProgress.value = 0;
  }

  return { isLoading, loadProgress, errors, sources, loadFiles, clearAll };
}
