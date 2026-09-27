# Test fixtures

Real EVTX files used by the regression tests. All come from the sample set of the
[`evtx`](https://github.com/omerbenamram/evtx) crate (MIT License, © 2019 Omer Ben-Amram),
at commit `f072319`, directory `samples/`.

| Fixture | Source sample | Notes |
|---|---|---|
| `system-dirty.evtx` | `system.evtx` | Unmodified. Dirty header claiming 3 chunks while the file holds 15; 1,881 records. |
| `bad-chunk-magic.evtx` | `sample_with_a_bad_chunk_magic.evtx` | Unmodified. Contains chunks with corrupted signatures. |
| `security-logon.evtx` | `security.evtx` | File header plus chunk slots 0–3, 8, 9. |
| `security-process.evtx` | `security_big_sample.evtx` | File header plus chunk slots 0, 373 (4688/4689/4698/1102). |
| `application.evtx` | `Application.evtx` | File header plus chunk slots 0–3, 5, 6, 16, 17, 20 (MsiInstaller, Application Error, WER). |
| `rdp-rcm.evtx` | `2-vss_0-Microsoft-Windows-TerminalServices-RemoteConnectionManager%4Operational.evtx` | File header plus chunk slots 0, 1, 3. |
| `forwarded-4625.evtx` | `Archive-ForwardedEvents-test.evtx` | File header plus chunk slot 0 (forwarded events with RenderingInfo). |

Trimmed fixtures keep the original 4 KiB file header and copy whole 64 KiB chunks, so they
parse like the originals; the header's chunk count no longer matches, which the parser handles.

MIT License text: https://github.com/omerbenamram/evtx/blob/master/LICENSE-MIT
