# Ask TRACE deterministic-first inference boundary

**Status:** Local implementation and fixture evaluation complete; no remote
runtime or data-plane action is part of this change.

## Boundary

TRACE retrieval is deterministic and governed. D1 admission, freshness,
correction/supersession state, assertion eligibility, provenance, position
grouping, competition relationships, citation eligibility, conclusion mode,
confidence, and lean selection are application-owned decisions.

The Ask TRACE gateway now consumes one KC-09 decision packet built before any
provider call. KC-09G remains the only conclusion policy. The packet fixes the
evidence mode, conclusion mode, confidence band and score, eligible positions,
lean position, evidence identifiers, assertion identifiers, and
`whatCouldChange` guidance. KC-09F grouping remains responsible for compatible
and competing positions; the gateway only adapts that packet to the provider
contract.

The LLM is an optional downstream synthesizer. It may explain the selected
answer and disagreement, but it cannot upgrade evidence, choose a conclusion
mode, choose a lean, invent positions or identifiers, change confidence, or
manufacture citations. Post-generation validation remains fail-closed.

Model-free completion is preferred whenever a response can be constructed
without semantic invention. Insufficient-evidence, refused, and out-of-scope
decisions complete through the durable no-model/idempotency path and consume
zero provider budget. Current supported, qualified-lean, and multiple-position
answers still require natural-language synthesis; this change does not invent
a general model-free supported-answer renderer.

The governing principle is:

> TRACE decides; inference explains.

## Local inference evaluation

This is a fixture-based architectural lower-bound report, not a production
traffic estimate. Provider counts are expected counts from the deterministic
routing decision.

| Scenario | Conclusion mode | Synthesis mode | Expected provider calls | Reason |
|---|---|---:|---:|---|
| Insufficient evidence | `insufficient_evidence` | `none` | 0 | No current eligible evidence reaches the KC-09G threshold. |
| Vendor-only | `insufficient_evidence` | `none` | 0 | A vendor/reporting position is not independent factual corroboration. |
| Independent corroboration | `supported` | `model` | 1 | The application can prove sufficiency, but the current contract still needs bounded prose. |
| Disputed evidence | `multiple_positions` | `model` | 1 | Reviewed competition remains explicit and no winner is selected. |
| Qualified lean | `qualified_lean` | `model` | 1 | KC-09G selects the winning position and the model explains that fixed lean. |
| Multiple positions | `multiple_positions` | `model` | 1 | Competing evidence is presented without a model-selected winner. |
| Stale/corrected evidence | `insufficient_evidence` | `none` | 0 | Stale, corrected, superseded, or otherwise ineligible evidence is excluded. |
| Resolved knowledge-backed answer | `supported` | `model` | 1 | Knowledge prose is zero-weight; resolved external assertions can support a conclusion, while prose remains downstream. |

No percentage of production requests is inferred from these fixtures. The
safe immediate cost opportunity is the zero-inference branch; the next
optimisation is a reviewed exact canonical-fact/template contract, if the
retrieval layer eventually exposes enough unambiguous structure to render one
without semantic invention.

## Deferred

- No new D1 telemetry migration was added. Existing durable request,
  reservation, usage, and idempotency records are sufficient for local routing
  tests; a richer synthesis-mode ledger can be proposed separately.
- No Vectorize retrieval activation, ingestion, source backfill, provider
  smoke, deployment, or production change is included.
