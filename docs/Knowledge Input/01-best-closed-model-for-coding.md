---
canonical_question: "What is the best closed model for coding?"
section: ai-agents
topics:
  - coding-models
  - closed-models
knowledge_type: comparison
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

As of 19 July 2026, **GPT-5.6 Sol is the best default closed model for coding**, but it is not the uncontested winner for every type of software-engineering work.

GPT-5.6 Sol leads the Artificial Analysis Coding Agent Index used in OpenAI's launch evaluation and records the strongest published Terminal-Bench 2.1 and DeepSWE results in that comparison. **Claude Fable 5 is the strongest alternative**, particularly for difficult repository-level issue resolution, large migrations, and very long autonomous tasks. Fable 5 substantially outperforms GPT-5.6 Sol on SWE-Bench Pro in OpenAI's own comparison.

The practical answer is therefore:

- choose **GPT-5.6 Sol** as the strongest general-purpose coding-agent default;
- choose **Claude Fable 5** when long-horizon repository work is the dominant requirement;
- run a controlled evaluation on your own repositories before standardising on either.

## Detailed explanation

There is no single benchmark that represents all coding work. Coding models may be asked to generate a small function, navigate an unfamiliar repository, repair a bug, operate a terminal, migrate an architecture, write tests, review a pull request, or continue autonomously for hours. Different evaluations reward different combinations of reasoning, tool use, context management, test discipline, and agent-harness quality.

OpenAI reports that GPT-5.6 Sol scores **80** on the Artificial Analysis Coding Agent Index v1.1, compared with **77.2** for Claude Fable 5. In the same launch table, GPT-5.6 Sol scores **88.8%** on Terminal-Bench 2.1 and **72.7%** on DeepSWE v1.1. These results support choosing Sol for broad agentic coding and terminal work.

The same OpenAI table also shows why the conclusion must remain qualified. Claude Fable 5 scores **80%** on SWE-Bench Pro, while GPT-5.6 Sol scores **64.6%**. Anthropic additionally reports that Fable 5 performs especially well as tasks become longer and more complex, and describes an early deployment in which it completed a codebase-wide migration across a 50-million-line Ruby codebase.

These figures are not directly interchangeable. The model may be evaluated in a different agent harness, with different tool permissions, reasoning settings, retry budgets, context-management strategies, or scoring rules. Research on coding-agent evaluation has shown that the harness itself can move pass rates by tens of percentage points.

A sensible adoption process is to test both models against a private suite containing:

1. representative bug fixes from your own repositories;
2. multi-file feature work;
3. tests, linting, and type-checking;
4. dependency and configuration changes;
5. long-running tasks that require recovery after failed attempts;
6. security-sensitive tasks in a restricted sandbox;
7. measured cost, elapsed time, token use, and human correction effort.

The best model is the one that produces the highest rate of reviewable, correct changes under the same permissions, harness, budget, and validation rules—not simply the model with the highest launch-day headline.

## Evidence

- [OpenAI — GPT-5.6](https://openai.com/index/gpt-5-6/) — reports GPT-5.6 Sol's Coding Agent Index, Terminal-Bench 2.1, DeepSWE, and SWE-Bench Pro results alongside competing models.
- [Artificial Analysis — GPT-5.6 benchmarks](https://artificialanalysis.ai/articles/gpt-5-6-has-landed/) — independently reports that GPT-5.6 Sol leads the Coding Agent Index in OpenAI's Codex harness while remaining close to Fable 5 on broader intelligence.
- [Anthropic — Claude Fable 5 and Claude Mythos 5](https://www.anthropic.com/news/claude-fable-5-mythos-5) — describes Fable 5's software-engineering focus, long-horizon performance, FrontierCode result, and large-codebase migration example.
- [OpenAI — Separating signal from noise in coding evaluations](https://openai.com/index/separating-signal-from-noise-coding-evaluations/) — establishes that widely cited coding benchmarks can contain substantial task defects and should not be treated as definitive.
