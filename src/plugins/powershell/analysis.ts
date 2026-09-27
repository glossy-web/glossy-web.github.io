import type { EvtxEvent } from '@/core/evtx/types';

/**
 * Parses the "Key=Value" blocks Windows PowerShell writes into its classic events
 * (400/403/600/800 Data[2]) and module logging (4103 ContextInfo). Keys lose their
 * spaces so both spellings match ("Host Application" → "HostApplication").
 */
export function keyValues(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z][A-Za-z ]*?)\s*=\s?(.*)$/.exec(line);
    if (m) out[m[1]!.replace(/\s+/g, '')] = m[2]!.trim();
  }
  return out;
}

/** Any unambiguous prefix of -EncodedCommand (-e, -en, -enc, … and the -ec alias) followed by Base64. */
const ENCODED = /(?:^|\s)[-/](?:e|ec|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)\s+["']?([A-Za-z0-9+/]{16,}={0,2})/i;

/** Decodes the UTF-16LE Base64 argument of -EncodedCommand in a command line ('' if none or unreadable). */
export function decodeEncodedCommand(commandLine: string): string {
  const b64 = ENCODED.exec(commandLine)?.[1];
  if (!b64) return '';
  try {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const text = new TextDecoder('utf-16le').decode(bytes);
    // Reject decodes that are mostly non-printable (not actually UTF-16LE text).
    const printable = text.replace(/[^\x09\x0a\x0d\x20-\x7e -￿]/g, '').length;
    return printable >= text.length * 0.9 ? text : '';
  } catch {
    return '';
  }
}

/**
 * Patterns that deserve a look in PowerShell activity. These are triage leads, not detections:
 * each one also appears in legitimate administration scripts.
 */
const INDICATORS: [RegExp, string][] = [
  [/FromBase64String|(?:^|\s)[-/]e(?:nc\w*|c)?\s+[A-Za-z0-9+/]{20,}/i, 'Encoded content'],
  [/Net\.WebClient|DownloadString|DownloadFile|DownloadData|Invoke-WebRequest|\biwr\b|Start-BitsTransfer|Invoke-RestMethod/i, 'Download'],
  [/Invoke-Expression|\bIEX\b|&\s*\(\s*\$\w+\[/i, 'Dynamic execution'],
  [/AmsiUtils|amsiInitFailed|AmsiScanBuffer/i, 'AMSI bypass'],
  [/Reflection\.Assembly\]::Load|VirtualAlloc|GetDelegateForFunctionPointer|GetProcAddress|DllImport/i, 'In-memory code'],
  [/IO\.Compression\.(?:Gzip|Deflate)Stream/i, 'Compressed payload'],
  [/Invoke-Mimikatz|sekurlsa|MiniDumpWriteDump|\blsass\b/i, 'Credential access'],
  [/Set-MpPreference|Add-MpPreference|DisableRealtimeMonitoring|ExclusionPath/i, 'Defender tampering'],
  [/(?:^|\s)[-/]w(?:indowstyle)?\s+(?:h(?:idden)?|1)\b|(?:^|\s)[-/](?:ep|exec\w*)\s+bypass|(?:^|\s)[-/]nop(?:rofile)?\b/i, 'Hidden or policy bypass'],
  [/\[char\]\s*\d+\s*\+|-join\s*\(|-bxor\b|\w`\w`\w/i, 'Obfuscation'],
  [/Register-ScheduledTask|New-ScheduledTask|New-Service|schtasks(?:\.exe)?\s+\/create/i, 'Persistence'],
];

export function indicators(text: string): string[] {
  if (!text) return [];
  return INDICATORS.filter(([re]) => re.test(text)).map(([, label]) => label);
}

export interface ScriptBlock {
  /** First part (the row opens this event). */
  event: EvtxEvent;
  events: EvtxEvent[];
  id: string;
  total: number;
  complete: boolean;
  text: string;
  path: string;
  /** PowerShell logs suspicious script blocks at Warning level even when logging is off. */
  flagged: boolean;
}

/**
 * Joins 4104 events that carry one script block in several parts (MessageNumber/MessageTotal,
 * same ScriptBlockId on the same computer). Missing parts are marked, never guessed.
 */
export function assembleScriptBlocks(events: EvtxEvent[]): ScriptBlock[] {
  const groups = new Map<string, EvtxEvent[]>();
  for (const e of events) {
    const id = e.data['ScriptBlockId'] || `record-${e.src}-${e.seq}`;
    const key = `${e.computer}\u0001${id}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(e);
  }
  const blocks: ScriptBlock[] = [];
  for (const list of groups.values()) {
    const parts = new Map<number, EvtxEvent>();
    for (const e of list) parts.set(Number(e.data['MessageNumber'] ?? 1), e);
    const ordered = [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => e);
    const total = Math.max(...list.map(e => Number(e.data['MessageTotal'] ?? 1)), 1);
    const text = ordered.map(e => e.data['ScriptBlockText'] ?? '').join('');
    const first = [...list].sort((a, b) => a.ts - b.ts)[0]!;
    blocks.push({
      event: first,
      events: ordered,
      id: list[0]!.data['ScriptBlockId'] ?? '',
      total,
      complete: parts.size >= total,
      text,
      path: list.find(e => e.data['Path'])?.data['Path'] ?? '',
      flagged: list.some(e => e.level === 3),
    });
  }
  return blocks.sort((a, b) => a.event.ts - b.event.ts);
}
