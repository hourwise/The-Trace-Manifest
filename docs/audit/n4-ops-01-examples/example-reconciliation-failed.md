# N4 maintenance reconciliation — N4-EXAMPLE-P01

> **SYNTHETIC EVIDENCE — not a measurement of D1 and not Cloudflare billing.** This reconciliation exercises the tooling only.

**Disposition: STOP** (refused slot with confirmed absence; continuing needs an explicit owner acknowledgement)

- Machine-readable reconciliation SHA-256: `e8ff4b572a9533f0efd809a93c62204c7d853c9966a5d00ca7ce40e3e01d1615`
- Package `0da0a3a8cb513ecb2f16b06c93801c5f20e8b372775111b12b046f37d7e89110`, owner approval record `8139d908eed78cc51b8372cddb92f8a6e3064567b20c9a63807eda4cc60fc09f`, deployed profile `7dcdc4a3b282b51c0ff48ce15c21ea5afcef523349099948bd010d85edbdb577`
- Target: Preview `f312f662-2252-4005-8103-1a40d546e16b`, attestation `ee3cab28cfd96c18709864d2aab6a24f6a4d34f5340c17746c71eccff0af91bb`, implementation `8e12fbf90c0e745f257a0acdf22599d1cffc98c611dc7451aab2b8dc97dbc7de`
- Window: 2026-11-02T10:00:00.000Z to 2026-11-02T10:45:00.000Z; latest recorded execution 2026-11-02T10:06:00.900Z
- Deployment readbacks (recomputed): open PASS, closure PASS
- Committed logical changes: 5 (reserved 5); measured storage rows written: 14 (reserved units 23; 0 completed slot(s) unmeasured)
- Evidence basis: synthetic_fixture; observation time 2026-11-02T11:00:00.000Z (operator declared); certifies provider consumption: no
- Audit/nonce evidence: not supplied
- Resume cursor for the next profile: `"cand-0003-bad"`. A final inventory from `after: ""` is always required before closing the campaign.
- Campaign closure (a separate conclusion from this profile's disposition): **NOT_ESTABLISHED_NO_FINAL_INVENTORY**

| Slot | Request id | Rows | Class | Basis | Logical / reserved | Storage / reserved units | Findings |
|---|---|---|---|---|---|---|---|
| 0 | `fc7afe59-7bab-f43b-78d7-83ffb93203fc` | 3 | **COMPLETED_MATCHED** | durable_receipt_lookup | 5 / 5 | 14 (synthetic_fixture) / 23 | — |
| 1 | `8c81dac8-191a-36e0-a616-59bd985c95d0` | 3 | **EXPLICITLY_REFUSED** | precommit_refusal:identity_stale_selection | — / 5 | NOT_APPLICABLE / 23 | — |

**STOP reasons:** slot_1_EXPLICITLY_REFUSED
Nothing left unverified.

_Offline comparison of saved evidence. No request was sent, retried or replayed. A missing receipt is never treated as zero writes. Local evidence is not Cloudflare billing._
