# ADR 0009 Amendment 2: Social-Post Text, Quoted-Span Extraction, Linked-Source Proposals and Community Reports

- **Status:** Proposed
- **Date:** 25 October 2026
- **Amends:** ADR 0009 (Accepted 14 July 2026; Amendment 1 of 21 July 2026, recorded in ADR 0009 §25). If accepted, ADR 0009 gains a pointer to this file. The accepted text is not edited in place.
- **Decision owners:** The Trace Manifest maintainers
- **Related decisions:** ADR 0004; ADR 0008; ADR 0015; ADR 0019 (`community_report` evidence class); ADR 0021; ADR 0022; ADR 0024
- **Design:** `docs/audit/trace-knowledge-pipeline-design.md` (§8, §9)
- **Review trigger:**
  - before any platform other than Reddit uses route R-2;
  - before the Worker makes any automated request to a social platform other than those listed in §4;
  - when Reddit's Responsible Builder Policy or Data API Terms change.

## 1. Context

TRACE Capture (Android) now delivers owner-captured social posts to private `social_signals` and Desk intake. This was proven on Preview on 25 October 2026.

The owner intends about 20 such posts a day. Their main value for TRACE is **community reports**: speed by hardware, quantisation, runtime and settings, plus links to primary sources.

ADR 0009 §10 limits server-side extraction to one transient, editor-requested HTML fetch. It also prohibits:
- persisting the fetched page;
- following embedded links;
- creating signals, candidates or cards automatically.

Under those rules, every fact and linked source must be entered by hand.

**External constraint, checked 25 October 2026.** Reddit's Responsible Builder Policy requires explicit approval before accessing any Reddit data through its API. It also requires:
- written approval for commercial use;
- transparency about purpose;
- respect for access limits;
- no use of Reddit data to train machine-learning or AI models;
- no inference of sensitive user characteristics.

## 2. Decision summary

TRACE may store a **bounded excerpt** of a social post's text, obtained only through permitted routes, and extract facts from it with **quoted, re-findable spans**. From an owner-created signal, the system may:
- create **pending, private community-report records**;
- **propose** linked-source candidates, which the owner accepts in one tap.

It may look up linked **primary** sources through those platforms' own APIs. Social posts remain signals, not proof. Linked material remains independent. Every public card still requires owner approval.

## 3. Permitted routes for post text

| Route | Rule |
|---|---|
| **R-1 Owner-supplied text** | The owner supplies the post text, or the relevant part, through TRACE Capture or the Desk. Permitted from adoption of this amendment. |
| **R-2 Approved platform API** | Only after the platform grants access for TRACE's truthfully stated purpose. Reads are **single objects by id** (the submitted post or comment) only. No threads, listings, searches or user histories. Rate limits are respected. Removals are honoured (§7). |
| R-3 ADR 0009 §10 triage fetch | Unchanged and still transient. Not relied on for extraction. |
| **Prohibited** | Scraping or crawling social platforms; logged-in sessions; shared credentials; any route that circumvents a technical or contractual restriction (ADR 0009 §7 unchanged) |

## 4. Exact changes to ADR 0009

| ADR 0009 text | Change | Reason |
|---|---|---|
| §10: the extraction "must not … **persist the fetched page**" | Unchanged for pages fetched by R-3. **Added:** TRACE may persist a bounded excerpt of at most 2,000 characters of post or comment text obtained by R-1 or R-2, together with extracted fields and their character offsets. A full page, thread or media item is never persisted. | Quoted-span extraction needs stored text. Bounding it keeps TRACE from mirroring. |
| §10: must not "**create a signal, candidate or public card automatically**" | **Signals:** unchanged (only an owner action creates one). **Public cards:** unchanged (only an owner tap publishes one). **Candidates:** the system may *propose* linked-source candidates on the signal card; they are created only by the owner's explicit one-tap acceptance, in state `new`. **Added:** from an owner-created signal, the system may create **`performance_observation` records with evidence class `community_report` in a pending, private state**. | Removes manual data entry while keeping one human decision per signal. Nothing becomes public or evidence automatically. |
| §10: must not "**follow links embedded in the post**" | Unchanged for general URLs. **Added:** a linked URL that identifies a primary source on the source registry's primary-API allow-list (Hugging Face repositories and files; GitHub repositories, releases and tags) may be looked up **through that platform's own API** by primary-source acquisition (ADR 0021). The post's description of the linked source is never used as its content. | Primary facts come from primaries; the post is only a trigger. |
| §2 item 4 and §12: limited reviewer-supplied metadata; optional `limitedExcerpt` | The excerpt may be owner-supplied (R-1) or API-obtained (R-2), within the §4 bound. Extracted fields are stored with spans. | As above |
| §13: "avoid fetching a URL merely to validate syntax" | **Added:** a share link whose path does not contain the post identifier (Reddit `/s/` links) is resolved preferably **on the owner's device** by TRACE Capture. If the owner adopts it after a terms check, the Worker may instead make one request with manual redirect handling that reads only the `Location` header, from allow-listed hosts, without cookies, and without reading the body. | Canonical identity and deduplication need the post identifier |
| §20 Phase S5: "pilot one narrow integration" after a separate decision | **This amendment is that decision for Reddit, route R-2 only**, conditional on Reddit's approval | Narrow, single-object scope |
| §21 Security: "no arbitrary, automatic or linked-URL fetch occurs in the initial phase" | Replaced by: "no arbitrary, crawling or linked-URL page fetch occurs. The only automated requests are: (a) the optional `Location`-only share-link resolution; (b) R-2 single-object reads after approval; (c) primary-API lookups of allow-listed linked primaries. All are logged and rate-limited." | Matches the permitted routes exactly |

**Unchanged:**
- §3.1: signals are not proof; popularity has no evidential weight.
- §3.2: linked material is independent.
- §7: public-content boundary.
- §8: public presentation.
- §9: summaries, quotations, no media rehosting.
- §11: evidence states.
- §14 and §15: linked articles and repositories.
- §16: platform rules, including "minimise username storage".
- §17: deletions and complaints.
- §19: social posts always admin-approved.
- §25: future public submissions never trigger fetches.

The model still never fetches URLs (§10).

## 5. Extraction rules

1. Extraction is deterministic first:
   - a versioned grammar for hardware, model and artefact, quantisation, runtime and version, speeds, context and settings;
   - a parser for `llama-bench` tables.
2. A model may be used only as a fallback that returns **verbatim spans**. Values that do not re-find exactly in the stored excerpt are dropped. Normalised or paraphrased values are rejected (ADR 0021).
3. Every extracted value stores its character offsets and a hash of its span.
4. A deterministic completeness score records which configuration fields are present. Reports below the threshold are kept but excluded from comparisons and rankings.
5. A reported generation speed above the deterministic memory-bandwidth ceiling for the stated configuration is flagged (ADR 0022).

## 6. Evidence and independence

6. Community reports keep the `community_report` class and ADR 0004 human review. They are **never** system-admitted (ADR 0024).
7. Deterministic grouping merges a post with any origin it links or quotes, posts by the same (hashed) author, and cross-posts of the same text. Splitting is human.
8. Community groups never satisfy `supported` for non-community claim classes. **The two-independent-provenance-groups requirement is unchanged.**

## 7. Privacy, rights and removal

9. Authors are stored as a keyed hash for grouping. A display handle is stored only when the owner chooses attribution by name. No profile data is stored, and no sensitive characteristic is inferred.
10. Availability is re-checked at publication. Under R-2 it is also re-checked at 30 days. A removed or deleted post leads to:
    - card withdrawal;
    - deletion of the stored excerpt;
    - **revocation for rights** of its community reports (ADR 0024).

    Linked sources and primary-source facts are unaffected.
11. **Reddit data is never used to train models.** Excerpts may be sent to a drafting model for inference only if that provider does not train on API inputs. This must be confirmed before use.

    Checked on 25 October 2026:
    - DeepSeek's API terms do not exclude training on inputs.
    - Its privacy policy permits training, with an email opt-out, and stores data in the PRC.

    Owner-supplied excerpts are therefore **not** sent to DeepSeek until the opt-out is confirmed in writing and the owner accepts PRC processing. Until then, social extraction is deterministic only.
12. Material sent to any model is limited to public post text and public linked material.

## 8. Consequences

### Positive

- Owner-captured posts become structured, attributed community reports and primary-source triggers with seconds of owner time.
- No dependence on platform API approval for the default route.
- Linked primaries enter through their own APIs.

### Negative

- Stored excerpts add rights and removal obligations.
- R-1 depends on the owner supplying text.
- R-2 depends on Reddit's approval and terms, which may change or be refused.

## 9. Rejected alternatives

| Alternative | Reason for rejection |
|---|---|
| Scraping Reddit pages locally or in the Worker | Reddit requires approval for access to its data; ADR 0009 §7 |
| Persisting full fetched pages or threads | Mirroring; disproportionate to the extraction need |
| Automatic public community cards | ADR 0004 and ADR 0009 §19 |
| Treating agreeing community reports as corroboration of publisher-class facts | Independence and evidence-class rules |
