# N4 maintenance reconciliation — N4-EXAMPLE-P01

**Disposition: NOT_VERIFIED**

- Machine-readable reconciliation SHA-256: `8268d25de284d603d32fa13a5050a4a556786c51b26670107349eeb53356417a`
- Package `cb36bc7a9c344058ae497b51bfb579c090a86f448564838c51cfe8c048fc0685`, owner approval record `7f8e36ed535160cf6b1baf651466ece6bebe7b54b42236633b2fe1732673859c`, deployed profile `7dcdc4a3b282b51c0ff48ce15c21ea5afcef523349099948bd010d85edbdb577`
- Target: Preview `f312f662-2252-4005-8103-1a40d546e16b`, attestation `ee3cab28cfd96c18709864d2aab6a24f6a4d34f5340c17746c71eccff0af91bb`, implementation `8e12fbf90c0e745f257a0acdf22599d1cffc98c611dc7451aab2b8dc97dbc7de`
- Window: 2026-11-02T10:00:00.000Z to 2026-11-02T10:45:00.000Z
- Deployment verification: open PASS, closure PASS
- Committed logical changes: 5 (reserved 5); measured storage rows written: 14 (reserved units 23; 0 completed slot(s) unmeasured)
- Audit/nonce evidence: not supplied
- Resume cursor for the next profile: `"cand-0003-bad"`. A final inventory from `after: ""` is always required before closing the campaign.

| Slot | Request id | Rows | Class | Basis | Logical / reserved | Storage / reserved units | Findings |
|---|---|---|---|---|---|---|---|
| 0 | `fc7afe59-7bab-f43b-78d7-83ffb93203fc` | 3 | **COMPLETED_MATCHED** | durable_receipt_lookup | 5 / 5 | 14 / 23 | — |
| 1 | `8c81dac8-191a-36e0-a616-59bd985c95d0` | 3 | **MISSING_OR_UNCERTAIN** | uncertain_response_without_post_window_lookup | — / 5 | NOT_APPLICABLE / 23 | — |

No STOP reason.
**Not verified:** slot_1_uncertain

_Offline comparison of saved evidence. No request was sent, retried or replayed. A missing receipt is never treated as zero writes. Local evidence is not Cloudflare billing._
