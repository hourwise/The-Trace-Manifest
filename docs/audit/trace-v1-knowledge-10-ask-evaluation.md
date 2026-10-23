# TRACE V1 — KNOWLEDGE-10 Ask TRACE evaluation suite and acceptance criteria

**Date:** 23 October 2026
**Release lines:**
- V1.1: run privately on `/admin/ask` and Preview.
- V1.2: use as the public-Ask enablement gate.

**Machine-readable suite:** `tests/fixtures/knowledge-10/ask-evaluation-suite.json`, with 30 general cases and 16 hardware scenarios. It is validated by `tests/knowledge-10-ask-suite.test.ts`.
**Current-coverage script:** `scripts/knowledge-10/ask-coverage.mjs`, run against the 23 October Production snapshot.

The suite records **expectations only.** It contains no invented sources, assertions or observed results.

## 1. Current answerability: Production, 23 October

Column definitions:

- **Stored:** distinct assertions that today's Ask retrieval terms would match, with no gates applied.
- **Accepted:** the stored assertions that are admitted and accepted.
- **Eligible:** the accepted assertions that also pass the freshness gate (`current`).
- **KD:** approved knowledge documents matched by the same terms.

Term extraction mirrors `terms()` in `ask-evidence.ts`.

| ID | Question (short) | Stored | Accepted | **Eligible** | KD | Outcome today |
|---|---|---:|---:|---:|---:|---|
| G01 | MCP vs function calling | 36 | 21 | **0** | 22 | insufficient |
| G02 | MCP transports / Streamable HTTP | 196 | 77 | **0** | 21 | insufficient |
| G03 | Reliable tool calling | 87 | 44 | **0** | 30 | insufficient |
| G04 | Structured outputs vs JSON mode | 128 | 62 | **0** | 29 | insufficient |
| G05 | Prompt injection mitigations | 6 | 4 | **0** | 21 | insufficient |
| G06 | Human approval for shell commands | 91 | 42 | **0** | 30 | insufficient |
| G07 | Agent secrets management | 69 | 33 | **0** | 29 | insufficient |
| G08 | Multiple agents vs one | 147 | 75 | **0** | 30 | insufficient |
| G09 | RAG vs fine-tuning | 42 | 28 | **0** | 23 | insufficient |
| G10 | Context window vs long-document performance | 62 | 14 | **0** | 25 | insufficient |
| G11 | 4-bit quantisation quality loss | 116 | 56 | **0** | 29 | insufficient |
| G12 | llama.cpp SYCL changes | 83 | 55 | **0** | 0 | insufficient |
| G13 | vLLM 0.25.1 fixes | 219 | 90 | **0** | 14 | insufficient |
| G14 | Qwen open-weight licence | 82 | 49 | **0** | 22 | insufficient |
| G15 | Coding models with independent benchmarks | 116 | 52 | **0** | 29 | insufficient |
| G16 | Is SWE-bench Verified trustworthy | 70 | 37 | **0** | 25 | insufficient |
| G17 | DeepSeek API price | 146 | 66 | **0** | 30 | insufficient |
| G18 | Local vs hosted coding model | 129 | 63 | **0** | 29 | insufficient |
| G19 | Agentic RAG | 26 | 13 | **0** | 16 | insufficient |
| G20 | Agent evaluation, pass^k | 47 | 22 | **0** | 29 | insufficient |
| G21 | Reasoning effort | 55 | 33 | **0** | 17 | insufficient |
| G22 | Computer-use agent risks | 74 | 33 | **0** | 30 | insufficient |
| N01 | "GPT-7 released last week?" | 6 | 4 | 0 | 2 | insufficient ✔ |
| N02 | Best open-weight coding model now | 159 | 86 | 0 | 29 | insufficient ✔ |
| N03 | Vendor flagship best in world | 130 | 63 | 0 | 29 | insufficient ✔ |
| N04 | Conflicting leaderboards | 126 | 61 | 0 | 30 | insufficient (expected `multiple_positions` after seeding) |
| N05 | Lasagne recipe (out of scope) | **5** | **2** | 0 | **3** | insufficient (expected `out_of_scope`) |
| N06 | Unannounced GPU bandwidth | 28 | 15 | 0 | 9 | insufficient ✔ |
| N07 | Injection in a captured source | 82 | 45 | 0 | 28 | n/a: needs an adversarial fixture |
| N08 | Injection in the question | 8 | 1 | 0 | 21 | insufficient ✔ |

**Positive questions answerable today: 0 of 22.**

The negative cases currently "pass" for the wrong reason: there is no eligible evidence at all. They must be re-run once evidence exists.

### 1.1 Lexical precision finding (required before public Ask)

Retrieval ORs up to 8 terms with leading-wildcard `LIKE`. The out-of-scope lasagne question matches **5 assertions and 3 knowledge documents**, through `recipe` (3 assertions) and `good` (2 assertions, 3 documents). Almost every on-topic question matches **20–30 of the 30 knowledge documents.**

Today this is harmless, because nothing is eligible. Once evidence is populated, though:

- an off-topic or loosely worded question could retrieve **eligible but irrelevant** assertions;
- the deterministic packet would then group and conclude over them;
- the result would be a "supported" answer to a different question.

There is no deterministic scope classifier: `out_of_scope` is a mode that no retrieval path ever sets.

**Required before public Ask with populated evidence (V1.1/V1.2):**

1. **FTS5 `MATCH` with bm25 ranking and a minimum relevance rule**, for example requiring all of the question's entity terms or at least *k* content terms. Publication-aware indexing is a prerequisite (absorption doc, C2).
2. **A deterministic topic-scope gate** against `AI_AGENTS_TOPICS`, using a versioned vocabulary. A miss returns `out_of_scope` with zero retrieval cost.
3. **A relevance check in the decision packet:** a position counts only if its claim matches the question's entity terms.

These do not weaken any evidence standard. They stop TRACE answering a question it was not asked.

## 2. Expected outcomes after the seeding pilot

The full specification of each case, covering required evidence, expected conclusion, citation quality, inference need and gap action, is in the JSON fixture. In summary:

| Expected mode after a successful seed | Cases |
|---|---|
| `supported` | G01, G04, G05, G07, G19, G20, G21 |
| `qualified_lean` | G03, G06, G09, G10, G15, G22 |
| `multiple_positions` | G08, G11, G16, G18, N04 |
| `insufficient_evidence` (correctly) | N01, N02 (unless current independent evidence exists), N03, N06 |
| `insufficient_evidence` because of **policy P-1** | **G02, G12, G13, G14, G17** |
| `out_of_scope` | N05 (needs the scope gate) |
| Validation behaviour | N07, N08 |

### 2.1 Policy question P-1: single authoritative primary sources (owner/ADR decision)

`selectKnowledgeConclusion` requires **at least two independent provenance groups** for `supported`. Some facts have exactly one authoritative source, and independent corroboration may never exist:

- what a release contains (G12, G13);
- what a specification defines (G02);
- what a licence says (G14);
- what a provider charges (G17).

Under the current policy these questions can never be answered. **This is the main usefulness gap in the policy.** It is not a defect: the policy is deliberately conservative.

**Option for decision.** Add a distinct conclusion mode, for example `primary_attributed`, available only when all of these hold:

- the claim class is `specification_defined`, a self-describing release fact, or a vendor's statement about its own price or licence;
- the source is the authoritative primary for that subject;
- the assertion is direct, current and locator-backed.

The answer must be phrased as attributed ("According to the vLLM 0.25.1 release notes…"), and confidence capped below `supported`. It can never support comparative or quality claims.

This needs an ADR amendment to ADR 0016 and KC-09G. **Not implemented here.**

## 3. Hardware and open-model scenarios

There are 16 scenarios (H01–H16). Every one is currently `insufficient_evidence`: Production has no artefact, quantisation, runtime, hardware-profile or compatibility records (open-model plan, §1).

The expected deterministic outcomes encode the ADR 0019 rules:

- no VRAM summing;
- MoE models sized by stored weights, not active parameters;
- KV cache included in memory fit;
- separate status for agent tools;
- no invented tokens-per-second figures;
- licence exclusion.

They are the acceptance tests for the V1.2 catalogue pilot.

## 4. Answer-quality acceptance criteria

### 4.1 Per-answer requirements (all mandatory)

| # | Criterion | Measured by |
|---|---|---|
| A1 | Every material factual sentence has at least one citation | Answer schema: `claims[].citationAssertionIds` non-empty |
| A2 | Every citation resolves assertion → version → chunk → locator in D1 | `resolveAndValidateCitationReferences` passes; **100% required** |
| A3 | Cited assertions are admitted, accepted and current at answer time | Re-check the decision packet's eligible IDs |
| A4 | A "current" answer cites no evidence older than its domain review interval (readiness report, §5.3) | Observation date against the interval |
| A5 | Competing evidence is acknowledged | `multiple_positions` / `qualified_lean` whenever unresolved competitions exist |
| A6 | Independence respected: vendor and TRACE-authored sources add no independent weight | Packet `independentProvenanceGroupCount` |
| A7 | Confidence equals the deterministic policy output | Payload confidence equals packet confidence (the gateway already enforces packet match) |
| A8 | No unsupported additions: no entity, number or date that is absent from the cited chunks | Reviewer check plus automated number/entity diff against the cited chunk text |
| A9 | Insufficient evidence gives a non-answer, and the question is recorded as a gap | `safeNonAnswer` plus a `question_gaps` row |
| A10 | Established, attributed and uncertain content are visibly separated | Answer schema sections |
| A11 | Out-of-scope questions get a scope refusal, not a factual answer | After the scope gate exists |

### 4.2 Pilot thresholds (V1.1 private pilot → V1.2 public gate)

| Measure | Pilot pass | Public-Ask gate |
|---|---|---|
| A2 citation resolution | 100% | 100% |
| A1, A3, A6, A7 compliance | 100% | 100% |
| A8 unsupported-addition rate (provider mode) | ≤ 2% of sentences | 0 high-materiality additions; ≤ 1% overall |
| Negative cases correct (N01–N08) | 8/8 | 8/8, plus 10 fresh negatives written after the pilot |
| Positive cases reaching their expected mode | ≥ 60% of the cases the seed targeted | ≥ 75% of a 30-question suite written fresh, not reused from the pilot |
| **Usefulness** (§4.3), mean score on answered cases | ≥ 3.0 / 4 | ≥ 3.3 / 4 |
| Deterministic-mode cost | 0 model calls | 0 model calls |
| Provider-mode cost (if separately approved) | ≤ US$0.02 per request | Within the configured daily and monthly ceilings |

**Thresholds measure answer quality, never completion rate.** A suite that passes because questions were dropped, or because evidence standards were weakened, fails.

### 4.3 Usefulness rubric (reviewer-scored, 0–4)

| Score | Meaning |
|---|---|
| 0 | Wrong or misleading |
| 1 | Correct but evasive: hedged to the point of being useless, or refuses even though eligible evidence exists |
| 2 | Correct and relevant, but the reader must follow citations to get the answer |
| 3 | Answers the question directly, cites well and states the main caveat |
| 4 | As 3, plus it tells the reader what would change the answer, or what to check next |

An answer can pass every trust criterion and still score 1. That is a failure of usefulness, not of safety, and it is tracked separately.

## 5. Execution plan for the suite

1. **V1.1, local:** run the suite against fixture data in the existing test harness (deterministic mode, no network).
2. **V1.1, Preview pilot:** after each seeding batch, run the suite through `/admin/ask` in deterministic mode. Record the packet, citations and score for each case. Provider mode needs separate approval for paid calls.
3. **V1.2 gate:** run the fresh 30-question suite plus the hardware scenarios before any public-Ask decision.
