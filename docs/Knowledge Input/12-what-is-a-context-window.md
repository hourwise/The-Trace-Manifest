---
canonical_question: "What is an AI model's context window, and is a larger context window always better?"
section: ai-agents
topics:
  - context-windows
  - long-context
  - model-selection
knowledge_type: definition
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

A model's **context window** is the maximum amount of tokenised information it can consider within one interaction or continuing model state. It may include instructions, conversation history, retrieved documents, tool calls, tool results, images represented as tokens, and the model's generated output.

A larger context window is useful, but **it is not automatically better**. More context usually costs more, increases latency, introduces irrelevant material, and can make important evidence harder for the model to locate. Research has shown that models may perform worse when relevant information is buried in the middle of a long input.

Use the smallest, most relevant context that reliably contains the information needed for the task. Combine long context with retrieval, summaries, structured state, and compaction rather than continually appending everything.

## Detailed explanation

Tokens are model-specific units that may represent words, parts of words, punctuation, code, or multimodal data. A one-million-token context window does not mean one million words, and the practical capacity depends on language, content type, formatting, and how much room must remain for the answer.

Modern frontier models can support approximately one million tokens. GPT-5.6 Sol, Terra, and Luna each publish a 1.05-million-token context window. Many Gemini models support one million tokens or more and apply the same long-context mechanism across text, images, audio, and video.

Large context is valuable for:

- analysing a long document or repository;
- comparing many records;
- maintaining a long conversation;
- processing lengthy video or audio;
- providing large reference collections in-context;
- preserving intermediate tool results during a long task.

However, context capacity and context utilisation are different. The peer-reviewed “Lost in the Middle” study found that models often perform best when relevant information appears near the beginning or end of the input and worse when it appears in the middle. Later research connected this effect to positional attention bias.

Very long prompts can also create operational problems:

- higher token costs;
- slower first-token latency;
- greater chance of conflicting instructions;
- duplicated or stale information;
- reduced source traceability;
- increased prompt-injection surface;
- harder debugging and reproduction;
- accidental exposure of data that the task did not need.

A well-designed agent separates several kinds of state:

1. **Instructions** — stable rules and role definitions.
2. **Working context** — material needed for the current step.
3. **Conversation state** — recent messages and tool results.
4. **Retrieved evidence** — selected source passages.
5. **Structured task state** — plans, decisions, identifiers, and progress.
6. **Long-term memory** — durable facts or lessons retrieved only when relevant.

When a thread grows, the system can summarise completed work, preserve durable decisions in structured records, discard superseded tool output, and retrieve original evidence on demand. Summaries should retain provenance or pointers to the source material because compression can omit qualifications or introduce errors.

A large context window is therefore capacity, not a substitute for information architecture.

## Evidence

- [OpenAI — GPT-5.6 model catalogue](https://developers.openai.com/api/docs/models) — records the 1.05-million-token context window and output limits of the GPT-5.6 family.
- [Google — Long context](https://ai.google.dev/gemini-api/docs/long-context) — explains million-token context windows and long-context text, image, audio, and video use cases.
- [OpenAI Agents SDK — Sessions](https://openai.github.io/openai-agents-python/sessions/) — documents persistent conversation history and automatic context compaction.
- [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/) — provides peer-reviewed evidence that relevant information may be used less reliably when buried within long inputs.
- [Google Research — Found in the Middle](https://research.google/pubs/found-in-the-middle-calibrating-positional-attention-bias-improves-long-context-utilization/) — connects long-context failures to positional attention bias and reports a mitigation approach.
