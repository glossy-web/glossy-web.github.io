# Glossy Event Log Forensics

**[glossy-web.github.io](https://glossy-web.github.io/)** — no download, no install. Just open the link.

Browser-based Windows Event Log (`.evtx`) forensics analysis tool. No server required — all processing happens locally in your browser.

This is a vibecoding port of the 9-year-old [Glossy](https://github.com/whatabeautifulmemory/glossy) project to a pure browser application. **Output not reviewed. Bugs and unexpected behavior may occur. Not maintained.**

## Features

- Drag & drop `.evtx` files — parsed entirely in-browser using [`@ts-evtx/core`](https://github.com/NickSmet/ts-evtx)
- **18 analysis modules** across 5 categories, based on the [research paper (Korean)](https://github.com/whatabeautifulmemory/glossy/files/13562844/KDFS.2017.v0.1.pdf)

| System | Account | Application | Hardware |
|--------|---------|-------------|----------|
| System On/Off | Account Logon | Process Execution | USB Storage |
| Autoruns | RDP Logon | Application Error | CD/DVD Recording |
| Firewall | Account Events | Software Install | Document Printing |
| Time Change | | | Wireless Connect |
| Windows Update | | | |
| Event Reset | | | |
| Services | | | |

- Per-plugin filters (user, IP, process name, SSID, etc.)
- Interactive tables with search, sort, pagination, CSV export
- Dashboard summaries and timeline charts
- Event detail view with full JSON

## Usage

Serve the `docs/` folder with any static server:

```bash
npx serve docs
```

Then drag `.evtx` files onto the page and select an analysis plugin from the sidebar.

## Build

```bash
npm install
npm run build    # outputs to docs/
```

## Tech Stack

- Vue 3 + TypeScript
- [@ts-evtx/core](https://github.com/NickSmet/ts-evtx) — EVTX binary parser
- Bootstrap 5, ECharts, Day.js
- Vite

## Links

- Original Glossy: [github.com/whatabeautifulmemory/glossy](https://github.com/whatabeautifulmemory/glossy)
- Research paper (Korean): [Link](https://github.com/whatabeautifulmemory/glossy/files/13562844/KDFS.2017.v0.1.pdf)
