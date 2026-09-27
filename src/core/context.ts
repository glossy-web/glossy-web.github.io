import type { EvtxEvent } from './evtx/types';
import type { PluginContext } from './plugin';
import { account, clean } from './format';
import { wellKnownSid } from './lookups';
import type { EventStore } from './store';

const SID_FIELDS: [sid: string, domain: string, user: string][] = [
  ['TargetUserSid', 'TargetDomainName', 'TargetUserName'],
  ['SubjectUserSid', 'SubjectDomainName', 'SubjectUserName'],
  ['TargetSid', 'TargetDomainName', 'TargetUserName'],
];

/** SID -> DOMAIN\user pairs observed in Security events. */
function learnSids(events: readonly EvtxEvent[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const e of events) {
    if (e.channel !== 'Security') continue;
    for (const [sidField, domainField, userField] of SID_FIELDS) {
      const sid = clean(e.data[sidField]);
      if (!sid || names.has(sid)) continue;
      const name = account(e.data[domainField], e.data[userField]);
      if (name) names.set(sid, name);
    }
  }
  return names;
}

export function createContext(store: EventStore): PluginContext {
  let sids: Map<string, string> | null = null;
  return {
    select: selectors => store.select(selectors),
    all: () => store.all(),
    sidName(sid) {
      if (!sid) return '';
      sids ??= learnSids(store.events);
      return sids.get(sid) ?? wellKnownSid(sid);
    },
    source: e => store.sources.find(s => s.index === e.src),
    files: () => store.sources,
  };
}
