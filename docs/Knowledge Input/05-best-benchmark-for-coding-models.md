---
canonical_question: "Which benchmark should be trusted when comparing AI coding models?"
section: ai-agents
topics:
  - coding-benchmarks
  - model-evaluation
  - coding-agents
knowledge_type: comparison
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

**No single public benchmark should be trusted on its own.**

As of 19 July 2026, the strongest practical evaluation combines:

1. **Terminal-Bench 2.1** for terminal-based agentic work;
2. **DeepSWE** or another original, contamination-resistant repository benchmark for long-horizon engineering;
3. a **private held-out suite of tasks from the organisation's own repositories**;
4. fixed agent harnesses, permissions, budgets, and retry rules;
5. cost, latency, human correction, and defect measurements alongside pass rate.

**SWE-bench Verified should not be used as the sole frontier ranking.** OpenAI reports substantial contamination and flawed tests. SWE-Bench Pro is also useful only as one secondary signal after a later audit estimated that roughly 30% of its tasks are broken.

## Detailed explanation

Coding benchmarks fail in several predictable ways.

First, public tasks and their solutions may appear in model training data. A model can then receive credit for recall or familiarity rather than general software-engineering ability.

Second, tests may reject a correct alternative solution or accept an incomplete one. Repository tasks are often paired with tests that were written to verify one historical patch, not to evaluate every valid implementation.

Third, the agent harness can dominate the result. The model's prompt, available tools, file-editing method, context compaction, shell environment, time budget, retry policy, and patch-extraction rules can change performance dramatically. Claw-SWE-Bench reports a **27.4 percentage-point** change attributable to harness choice under fixed models.

Fourth, a pass rate hides operational cost. Two systems with similar accuracy may use very different numbers of tokens, take different amounts of time, or require very different levels of developer intervention.

Terminal-Bench 2.1 is currently useful because it evaluates agents in real terminal environments across software engineering, system administration, security, machine learning, and data tasks. Version 2.1 also corrected issues in 28 of the original 89 tasks and introduced continuous validation, which is evidence that the maintainers actively audit the benchmark.

DeepSWE is useful because its tasks were written from scratch, its reference solutions were kept out of the public record, and its verifiers were designed to accept functionally correct alternatives. Its authors report substantially lower disagreement between its verifier and an independent judge than for SWE-Bench Pro.

A responsible internal evaluation should:

- choose tasks that resemble actual work;
- keep tasks and solutions private;
- use hidden tests;
- run multiple seeds where model behaviour is stochastic;
- lock model versions when possible;
- hold the harness and permissions constant;
- record every tool call and approval;
- count successful completion, regressions, and review burden;
- report uncertainty rather than a single precise rank.

Public leaderboards are useful for discovering candidates. They are not a substitute for a deployment-specific evaluation.

## Evidence

- [OpenAI — Why SWE-bench Verified no longer measures frontier coding capabilities](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/) — reports flawed tests and training-data contamination and recommends discontinuing Verified as a frontier launch metric.
- [OpenAI — Separating signal from noise in coding evaluations](https://openai.com/index/separating-signal-from-noise-coding-evaluations/) — reports an audit estimating that roughly 30% of SWE-Bench Pro tasks are broken.
- [Terminal-Bench — Terminal-Bench 2.1](https://www.tbench.ai/news/terminal-bench-2-1) — establishes the benchmark revision, its 89-task base, corrected tasks, and continuous-validation approach.
- [DeepSWE paper](https://arxiv.org/abs/2607.07946) — describes an original long-horizon benchmark designed to reduce contamination and accept alternative correct implementations.
- [Claw-SWE-Bench paper](https://arxiv.org/abs/2606.12344) — demonstrates that model choice and agent-harness choice can each shift pass rates by tens of percentage points.
