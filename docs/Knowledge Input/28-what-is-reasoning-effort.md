---
canonical_question: "What is reasoning effort, and when should it be increased?"
section: ai-agents
topics:
  - reasoning-models
  - inference-time-compute
  - model-settings
  - cost-latency
knowledge_type: how_to
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

**Reasoning effort** is an inference setting that controls how much internal computational work a reasoning-capable model is allowed or encouraged to perform before producing its answer or selecting actions.

Increase reasoning effort for difficult planning, mathematics, ambiguous coding, complex diagnosis, multi-source synthesis, or tasks where an error is costly.

Use low or no reasoning for straightforward extraction, classification, rewriting, simple retrieval, and latency-sensitive high-volume work.

Higher effort can improve quality on some tasks, but it usually increases latency and token use, and it may add little or nothing to easy tasks. Select the lowest effort that reliably passes a task-specific evaluation.

## Detailed explanation

Reasoning models may generate internal reasoning tokens or perform additional inference steps before returning visible output. Providers expose different controls such as `none`, `minimal`, `low`, `medium`, `high`, or `xhigh`, depending on the model.

Reasoning effort is separate from answer length. A model can reason extensively and produce a short answer, or reason little and produce a verbose one. OpenAI exposes separate reasoning-effort and verbosity controls for supported models.

Higher effort is most likely to help when the task involves:

- multi-step logical or mathematical reasoning;
- planning a long sequence of actions;
- diagnosing an unfamiliar failure;
- resolving conflicting constraints;
- difficult code changes;
- interpreting complex diagrams or scientific material;
- checking alternative hypotheses;
- deciding whether and how to use tools.

Lower effort is often sufficient for:

- extracting named fields;
- transforming a known format;
- summarising supplied text;
- routing a clear category;
- answering from an obvious retrieved passage;
- drafting routine copy;
- performing simple tool calls with strict schemas.

OpenAI's GPT-5 developer guidance reports that reasoning effort produces different gains across tasks: increasing effort above low added little to relatively simple long-context retrieval but improved a visual-reasoning benchmark by several percentage points. This illustrates why a universal “always use high” policy is wasteful.

Reasoning effort can affect agent behaviour as well as final answers. A model may plan more carefully, call more tools, explore alternatives, or recover from failures differently. It can also overcomplicate a simple workflow, continue searching after sufficient evidence exists, or incur excessive cost.

A production policy should combine routing and escalation:

1. begin with an effort level validated for the task class;
2. use low effort for routine deterministic work;
3. increase effort after validation failure, uncertainty, or task-complexity signals;
4. cap turns, tokens, time, and tool calls;
5. escalate high-risk tasks to a stronger model or human review rather than relying only on more reasoning;
6. record effort level in traces and evaluation results.

Do not infer truth from the amount of reasoning. A high-effort model can still hallucinate, use a faulty assumption, or follow malicious context. Retrieval, validation, tools, and approvals remain necessary.

Some open-weight models also expose configurable reasoning effort, allowing local deployments to trade latency for quality. The exact implementation and semantics vary by model, so effort labels should not be assumed equivalent across providers.

## Evidence

- [OpenAI — Introducing GPT-5 for developers](https://openai.com/index/introducing-gpt-5-for-developers/) — explains configurable reasoning effort and reports that benefits differ substantially by task.
- [OpenAI — Controlling response length](https://help.openai.com/en/articles/5072518-controlling-the-length-of-openai-model-responses) — distinguishes reasoning effort from verbosity and documents supported effort levels.
- [OpenAI — A practical guide to building with AI](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-with-ai/) — states that reasoning effort controls thinking and tool-call readiness.
- [OpenAI — gpt-oss model card](https://openai.com/index/gpt-oss-model-card/) — documents configurable reasoning effort in open-weight models.
- [OpenAI API — Graders](https://platform.openai.com/docs/api-reference/graders) — documents effort controls and the latency and reasoning-token trade-off in evaluation models.
