# Glossy Event Log Forensics

**[glossy-web.github.io](https://glossy-web.github.io/)** — Windows event log (`.evtx`) forensics that runs entirely in the browser. Files are parsed and analyzed locally; nothing is uploaded, and analysis makes no network requests.

A browser port of [Glossy](https://github.com/whatabeautifulmemory/glossy) (KDFS 2017, [paper in Korean](https://github.com/whatabeautifulmemory/glossy/files/13562844/KDFS.2017.v0.1.pdf)), rebuilt around current triage practice.

## What it does

**Parsing you can rely on**

- Records are decoded by the Rust [`evtx`](https://github.com/omerbenamram/evtx) crate (the parser behind Hayabusa and Chainsaw), compiled to WebAssembly and run in Web Workers, so large logs do not freeze the page.
- Every 64 KiB chunk is read, including chunks a *dirty* header (a log copied from a live system) does not count. Damaged chunks and records are reported instead of silently dropped.
- `EventData` (named and unnamed `Data`), `UserData` and forwarded-event `RenderingInfo` are all kept. Analysis never writes into the original record.
- The XML view re-reads the record from the source file, so it shows exactly what is stored.

**Evidence handling**

- SHA-256 per file; a file loaded twice is skipped, and records already loaded from another copy (shadow copies, archives) are not added twice.
- Gaps in each file's record numbering, records whose time runs backwards, and dirty/full headers are listed in the overview.
- Times are shown in the analyst's system time zone by default, with any IANA zone (including UTC) selectable. Every time carries its UTC offset (`2024-05-01 09:30:05.123 +09:00`), which stays correct across daylight saving changes. CSV exports use ISO 8601 with the offset and include channel, provider, event ID, record ID and source file for every row. Cells that a spreadsheet would run as a formula are prefixed with `'`.
- Every table also exports [Timesketch](https://timesketch.org/) JSONL: `message`, `datetime` (UTC), `timestamp_desc` and `timestamp` (µs), the visible columns as snake_case fields, and the record's trace under plaso's EVTX field names (`computer_name`, `source_name`, `event_identifier`, `record_number`, plus `channel` and `evtx_file`).
- A coverage panel shows which of the key logs are loaded and which are disabled by default on Windows, so absent logs are not read as absent activity.

**Timeline**

The Timeline page runs every module with its default options and puts their rows in one chronology (Event, Detail, Accounts, Remote address), in the spirit of EvtxECmd maps and Hayabusa timelines. An event two modules report (a type 10 logon is also an RDP stage) appears once, listing both. Bookkeeping events stay out: logoffs, process exits, service state changes, duplicate MSI lines and PowerShell module logging without indicators. Entries a module highlights (failed logons, suspicious services, protection turned off, …) can be shown alone. The Entities view lists every account, remote address and computer with counts and first/last seen; clicking one filters the timeline to it.

**Analysis modules**

| Module | What it shows | Main sources |
|---|---|---|
| System On/Off | Boots, shutdowns, crashes, sleep/resume, who requested a shutdown; boot sessions with uptime | Kernel-General 12/13, EventLog 6005/6006/6008/6009/6013, Kernel-Power 41/42/107/109, Power-Troubleshooter 1, User32 1074 |
| Autoruns & Persistence | Scheduled tasks with their command, autostart registry values, Startup folder writes, WMI consumers | TaskScheduler 106/140/141/142/200/201/129, Security 4698–4702, 4657, 4663, Sysmon 13, WMI-Activity 5861 |
| Services | Service installs with image path (suspicious paths flagged), start-type changes, crashes | SCM 7045/7034/7036/7040, Security 4697 |
| Firewall | Rule and profile changes (Windows 10 and 11 IDs), firewall turned off, rules replayed to their final state | Firewall 2002–2010, 2032/2033, 2052, 2059/2060, 2071/2073, 2082/2083, 2097/2099 |
| Time Change | Clock changes with jump size and the process responsible | Security 4616, Kernel-General 1 |
| Windows Update | Downloads, installs, failures, KB numbers | WindowsUpdateClient 19/20/43/44 |
| Log Clearing & Tampering | Cleared logs, logging stopped/full, audit policy changes, record-number gaps | Eventlog 1102/104/1100/1104/1105, Security 4719 |
| Microsoft Defender | Detections with their outcome, threats, failed remediation, protection disabled, exclusions added, tamper protection blocks | Defender/Operational 1006–1008, 1015, 1116–1119, 1009, 1013, 5001, 5004, 5007, 5010, 5012, 5013 |
| Account Logon | Logons with failure reasons, admin logons (4672 by Logon ID), sessions, failures by source; noise filter | Security 4624/4625/4634/4647/4648/4672/4778/4779/4800/4801 |
| RDP | Inbound chain (connection → authentication → logon → session) and outbound RDP, sessions, source addresses | RdpCoreTS 131, RCM 1149, Security 4624/4625 (type 10), 4778/4779, LSM 21–25/39/40, RDPClient 1024/1102 |
| Account Management | Account lifecycle, renames, lockouts, group membership (admin groups highlighted) | Security 4720–4726, 4738, 4740, 4767, 4781, 4728/4729/4732/4733/4756/4757, 4731/4734/4735, 4798/4799 |
| Process Execution | Processes with command line and parent (inferred for older 4688), rarest executables first | Security 4688/4689, Sysmon 1/5, Application-Experience 500 |
| PowerShell | Script blocks reassembled from their parts, blocks PowerShell itself flagged, triage indicators, decoded `-EncodedCommand`, PowerShell 2.0 downgrades, pipeline and module logging | PowerShell/Operational 4103/4104/40961/40962/53504, PowerShellCore/Operational 4103/4104, Windows PowerShell 400/403/600/800 |
| Application Errors | Crashes, hangs, error reports, .NET exceptions, with exception codes | Application Error 1000, Application Hang 1002, WER 1001, .NET Runtime 1026 |
| Software Install | Installs and removals with product, version, publisher, product code | MsiInstaller 1033/1034/1035/11707/11708/11724/11725, Program-Inventory 903–908, Shell-Core 28115, Security 4657 |
| USB Storage | Devices with serial, capacity and volume serial number; connection history; logged-on user (inferred) | Partition/Diagnostic 1006, Kernel-PnP 400/410/420/430, UserPnp 20001/20003, DriverFrameworks-UserMode 2003/2101/2102/10000 |
| CD/DVD Recording | Optical drive events used by the original Glossy research as a burn indicator | cdrom 133 |
| Document Printing | Printed documents with owner, client, printer, pages; spool file; default printer changes | PrintService 307/800/801/805/812/823/842 |
| Wireless & Networks | Wi-Fi connections, failures, networks and their security; network connections by name | WLAN-AutoConfig 8000–8003, NetworkProfile 10000/10001 |

Every module has an event table, and every page and view has its own address (`#/m/logon/sessions`), so the back button and links work. The tables follow Timeline Explorer and Kibana:

- A histogram of the filtered rows sits above the table; drag across bars (or click one) to filter to that time, and it zooms to the selection down to minutes.
- Pick-list columns filter on several values at once, with counts and an exclude switch; other columns filter on text; time columns take a from/to range in the selected zone.
- Right-click a cell to filter for or filter out its value, show events from or until a time, or copy the value or row. Active filters show as chips: click one to invert it, or remove it.
- Columns can be resized, dragged into a new order, pinned to the left and hidden; the layout is remembered per view in this browser.
- CSV and Timesketch JSONL export the filtered rows; **Report** writes a self-contained HTML report of them with each full record and your notes.

**Records, stars and context**

- Clicking a row opens the record in a side panel (General, XML re-read from the file, JSON). Arrow keys or the panel's arrows step through the table's current order; each field can search the table or all events for its value.
- **Surrounding events** opens All Events for ±1 minute to ±1 hour around the record, across every loaded log, with the record selected (Timesketch's context search).
- Star events (star column, panel, or **S**) and add a note; the **Starred** page lists them for a report. Stars are kept in this browser by record identity, so they return when the same logs (or other copies of them) are loaded again.

**Charts and networks**

- Every chart filters the table when clicked: a bar or calendar day sets the time range, a ranking bar or graph node sets that value.
- Account Logon and RDP draw a source → computer graph (as the original Glossy did for RDP): node size by volume, red links where logons failed.
- All Events and Software Install show a calendar heatmap of events per day.
- Public IPv4 addresses get their registered country and announcing network (AS number and name) from the [iptoasn.com](https://iptoasn.com/) database, in Account Logon, RDP, the Timeline's entities and the record panel. The database is packed into the site at build time and looked up in the browser; addresses are never sent anywhere. It describes routing today, not at the time of the event.

Findings are leads, not verdicts: check them against the original record (XML view) and other artifacts.

## Usage

Open the site, then drop `.evtx` files or a whole `C:\Windows\System32\winevt\Logs` folder onto the page (or use **Add files** / **Add folder**). Collect logs as raw copies (e.g. with KAPE); exporting through Event Viewer or `wevtutil epl` rewrites the files.

Keyboard: **Ctrl+K** opens the command palette (go to any module, add files, toggle dark mode), **Ctrl+B** collapses the sidebar; in a table, **↑/↓** move between records, **Enter** opens one, **S** stars it and **Esc** closes the panel. The page is dark by default; the sun/moon button switches it and the choice is remembered.

Several useful logs are off by default and must be enabled before an incident to exist: `TaskScheduler/Operational`, `PrintService/Operational`, `DriverFrameworks-UserMode/Operational`, process command-line auditing for 4688, and object-access auditing (SACLs) for 4657/4663.

## Development

Prerequisites: Node.js 22, Rust (stable) with the `wasm32-unknown-unknown` target, and [`wasm-pack`](https://github.com/rustwasm/wasm-pack).

```bash
rustup target add wasm32-unknown-unknown
npm ci
npm run build:wasm   # compiles wasm/ (Rust) into wasm/pkg
# IP country/AS data (optional locally; CI fetches it on every deploy):
curl -sSfLO https://iptoasn.com/data/ip2asn-v4-u32.tsv.gz
npm run build:ip2asn -- ip2asn-v4-u32.tsv.gz   # writes public/data/ip2asn-v4.bin.gz
npm run dev          # local dev server
npm test             # regression tests on real EVTX fixtures (tests/fixtures)
npm run build        # type check + production build into dist/
```

The Rust side is a thin wrapper in [`wasm/src/lib.rs`](wasm/src/lib.rs); everything else is Vue 3 + TypeScript:

- `src/core` — record normalization, the event store (dedupe, integrity checks), time zone handling, CSV and JSONL export
- `src/parser` — the Web Worker that runs the WebAssembly parser
- `src/plugins` — one folder per analysis module; each view's `timeline` mapping decides what reaches the Timeline
- `src/components` — UI: Tailwind CSS v4 with [shadcn-vue](https://www.shadcn-vue.com/) components (Reka UI, compact "Mira" style) in `src/components/ui`, tables on TanStack Table + Virtual, charts on ECharts

## Deployment

`.github/workflows/pages.yml` builds the WebAssembly parser, type-checks, runs the tests, builds the site and deploys `dist/` to GitHub Pages on every push to `main`. In the repository settings, **Pages → Build and deployment → Source** must be set to **GitHub Actions**.

## Credits

- Original Glossy and the KDFS 2017 analysis: [whatabeautifulmemory/glossy](https://github.com/whatabeautifulmemory/glossy)
- EVTX parsing: [omerbenamram/evtx](https://github.com/omerbenamram/evtx) (MIT/Apache-2.0); test fixtures are derived from its samples (see `tests/fixtures/README.md`)
- IP to ASN and country: [iptoasn.com](https://iptoasn.com/)
