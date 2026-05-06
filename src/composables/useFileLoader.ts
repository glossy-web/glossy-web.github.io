import { ref } from 'vue';
import { EvtxFile } from '@ts-evtx/core';
import { eventStore, type EventSource } from '@/core/store';
import type { EvtxEvent } from '@/core/evtx/types';
import { LEVEL_NAMES } from '@/core/evtx/types';

type AnyRec = Record<string, unknown>;

function parseXmlFields(xml: string): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  const pm = xml.match(/Provider Name=["']([^"']+)["']/);
  if (pm) r.provider = pm[1];
  const em = xml.match(/<EventID[^>]*>(\d+)<\/EventID>/);
  if (em) r.eventId = parseInt(em[1], 10);
  const lm = xml.match(/<Level[^>]*>(\d+)<\/Level>/);
  if (lm) r.level = parseInt(lm[1], 10);
  const cm = xml.match(/<Channel[^>]*>([^<]+)<\/Channel>/);
  if (cm) r.channel = cm[1];
  const om = xml.match(/<Computer[^>]*>([^<]+)<\/Computer>/);
  if (om) r.computer = om[1];
  const edm = xml.match(/<EventData[^>]*>([\s\S]*?)<\/EventData>/);
  if (edm) {
    const d: Record<string, unknown> = {};
    const re = /<Data Name=["']([^"']+)["'][^>]*>([^<]*)<\/Data>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(edm[1])) !== null) d[m[1]] = m[2] || '';
    r.data = d;
  }
  return r;
}

function buildEvent(rec: AnyRec, sourceFile: string, globalId: number): EvtxEvent | null {
  try {
    const ts = (rec as unknown as { timestampAsDate: () => Date }).timestampAsDate();
    const rn = (rec as unknown as { recordNum: () => bigint }).recordNum();

    let xml = '';
    try { xml = (rec as unknown as { renderXml: () => string }).renderXml(); } catch {}

    const fields = parseXmlFields(xml);
    const level = (fields.level as number) ?? 0;

    return {
      id: globalId, recordId: rn, timestamp: ts,
      provider: (fields.provider as string) || '',
      providerGuid: '', eventId: (fields.eventId as number) ?? 0,
      qualifiers: null, version: 0, level,
      levelName: LEVEL_NAMES[level] || `Level(${level})`,
      task: 0, opcode: 0, keywords: '0x0',
      channel: (fields.channel as string) || '',
      computer: (fields.computer as string) || '',
      securityUserId: null, processId: null, threadId: null, activityId: null,
      data: (fields.data as Record<string, unknown>) || {}, rawXml: xml, sourceFile,
    };
  } catch { return null; }
}

export function useFileLoader() {
  const isLoading = ref(false);
  const loadProgress = ref(0);
  const errors = ref<string[]>([]);
  const sources = ref<EventSource[]>([]);

  async function loadFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    isLoading.value = true; loadProgress.value = 0; errors.value = [];
    const evtxFiles = files.filter(f => f.name.toLowerCase().endsWith('.evtx'));
    if (evtxFiles.length === 0) { errors.value.push('No .evtx files'); isLoading.value = false; return; }
    let completed = 0; const total = evtxFiles.length;

    for (const file of evtxFiles) {
      try {
        const buf = await file.arrayBuffer();
        const uint8 = new Uint8Array(buf);
        const ef = new (EvtxFile as unknown as new (b: Uint8Array) => AnyRec)(uint8);
        const evts: EvtxEvent[] = []; let gid = 0;
        for (const rec of (ef as unknown as { records: () => Iterable<AnyRec> }).records()) {
          const ev = buildEvent(rec, file.name, gid);
          if (ev) { evts.push(ev); gid++; }
        }
        const sid = eventStore.addSource(file.name, { events: evts, errors: [] });
        sources.value.push({ id: sid, name: file.name, eventCount: evts.length, errors: [] });
      } catch (e) { errors.value.push(`${file.name}: ${String(e)}`); }
      finally { completed++; loadProgress.value = Math.round((completed / total) * 100); }
    }
    isLoading.value = false;
  }
  function clearAll() { eventStore.reset(); sources.value = []; errors.value = []; loadProgress.value = 0; }
  return { isLoading, loadProgress, errors, sources, loadFiles, clearAll };
}
