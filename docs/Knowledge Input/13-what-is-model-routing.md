---
canonical_question: "What is model routing, and why should an AI system use more than one model?"
section: ai-agents
topics:
  - model-routing
  - model-selection
  - cost-optimisation
knowledge_type: guide
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

**Model routing** is the process of selecting the most appropriate AI model or inference service for each request or stage of a workflow.

A routed system might send:

- routine extraction and classification to a small low-cost model;
- normal generation and coding to a balanced model;
- difficult reasoning or recovery tasks to a frontier model;
- private work to a local model;
- image, audio, or realtime tasks to specialised models;
- failed or high-risk tasks to a stronger model or human reviewer.

The purpose is not to use as many models as possible. It is to achieve a better balance of **quality, cost, latency, privacy, availability, and risk** than one fixed model can provide.

## Detailed explanation

Models vary substantially in intelligence, speed, price, context window, supported modalities, tool use, hosting location, and safety characteristics. A model that is justified for an ambiguous architecture migration may be wasteful for extracting an invoice number.

Current OpenAI guidance explicitly presents GPT-5.6 Sol for complex professional work, Terra for balancing capability and cost, and Luna for cost-sensitive high-volume workloads. This tiering illustrates the basic routing principle even when all models come from one provider.

Routing can happen at several levels:

1. **Request routing** — classify the incoming task and choose one model.
2. **Stage routing** — use different models for planning, retrieval, execution, review, or summarisation.
3. **Escalation routing** — start cheaply and escalate after low confidence, failed validation, or repeated attempts.
4. **Capability routing** — choose models that support image, audio, computer use, long context, or specialised tools.
5. **Policy routing** — keep sensitive data local or within an approved provider and region.
6. **Availability routing** — fail over when a provider or model is unavailable.
7. **Ensemble routing** — request independent answers and adjudicate when the expected value justifies the extra cost.

The router itself may be deterministic code, a small classifier, a language model, or a hybrid. Deterministic routing is preferable when rules are clear: for example, audio always goes to the speech model, and payment actions always go to a governed workflow. A learned router is useful when task difficulty is difficult to identify with fixed rules.

Routing introduces new risks:

- the router can misclassify a difficult task as easy;
- providers may have incompatible tool semantics;
- model upgrades can change routing behaviour;
- fallback models may not share the same safety controls;
- prompts and outputs may expose data to additional processors;
- different models may produce inconsistent schemas;
- observability becomes more complicated.

A production router should record the routing reason, model and snapshot, cost, latency, validation result, retries, escalation path, and final human correction. The routing policy should be evaluated against a held-out task set and compared with a strong single-model baseline.

The correct metric is usually **cost per acceptable completed task**, not cost per token. A cheap model that repeatedly fails can be more expensive than a frontier model used once.

## Evidence

- [OpenAI — Models](https://developers.openai.com/api/docs/models) — presents Sol, Terra, and Luna as separate capability-cost tiers for model selection.
- [OpenAI — Compare models](https://developers.openai.com/api/docs/models/compare) — provides model pricing, context, feature, and capability information needed by a router.
- [Google Cloud — Networking for AI inference on all backends](https://docs.cloud.google.com/architecture/networking-for-ai-inference) — describes a unified endpoint that routes requests across on-premises and provider-hosted inference backends.
- [Google Cloud — Networking for AI inference on GKE](https://docs.cloud.google.com/architecture/networking-for-ai-inference-gke) — documents intelligent routing, central authorisation, and shared guardrails for multiple model servers.
- [OpenAI Agents SDK — Agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/) — distinguishes model-driven orchestration from deterministic code-driven routing and explains their trade-offs.
