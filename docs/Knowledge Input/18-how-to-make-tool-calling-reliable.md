---
canonical_question: "How can AI tool calling be made reliable?"
section: ai-agents
topics:
  - tool-calling
  - structured-outputs
  - validation
  - agent-reliability
knowledge_type: how_to
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

Reliable tool calling requires the model to **propose** an action while deterministic application code validates, authorises, executes, and records it.

The core controls are:

- a small, clearly named tool set;
- precise descriptions of when each tool should and should not be used;
- strict JSON Schema inputs and structured outputs;
- local type and business-rule validation;
- explicit identity and permission checks;
- idempotency keys for retried writes;
- timeouts, rate limits, and bounded retries;
- approval for consequential calls;
- structured error results the model can act on;
- complete traces and task-specific evaluations.

A schema-valid tool call is not necessarily safe or correct. It only proves that the arguments match the declared shape.

## Detailed explanation

Function calling allows a model to return a structured request for an application-defined function rather than ordinary prose. The application—not the model—is responsible for executing that function and returning the result.

Reliable tool design begins with narrow interfaces. A tool named `manage_account` with a free-form instruction is difficult to validate and authorise. Separate tools such as `read_account_balance`, `prepare_refund`, and `execute_approved_refund` create clearer risk and permission boundaries.

### Schema design

Use JSON Schema with:

- explicit object types;
- required fields;
- enumerations for closed choices;
- formats or patterns where supported;
- minimum and maximum values;
- `additionalProperties: false` where appropriate;
- structured output schemas.

The MCP specification requires a valid JSON Schema input object and optionally supports a structured output schema.

### Semantic validation

After schema validation, application code must confirm:

- the referenced resource exists;
- the caller may access it;
- the value is within policy limits;
- dates, currencies, identifiers, and units are consistent;
- the operation is permitted in the current state;
- no approval or prerequisite has expired;
- the call does not violate tenant or data boundaries.

### Execution safety

Read operations and write operations should be distinguishable. Destructive and external actions should be separately permissioned. Use transactional execution where possible, idempotency keys for retried actions, and dry-run or prepare/commit patterns for high-impact changes.

### Error handling

Return structured, bounded errors such as `not_found`, `permission_denied`, `validation_failed`, `conflict`, `rate_limited`, or `approval_required`. Do not return stack traces, secrets, or uncontrolled internal text. The agent may revise an invalid request, but retries need a fixed limit.

### Tool selection

Giving a model hundreds of poorly differentiated tools increases selection errors and context cost. Filter tools by the user's permissions, current workflow state, and task. Use deterministic routing when the required tool is known.

### Validation and evaluation

Test more than whether the model emits valid JSON. Evaluate correct tool selection, correct arguments, refusal to call when unnecessary, behaviour after failures, resistance to malicious tool descriptions, and final task outcome. Replay traces when models, prompts, or schemas change.

## Evidence

- [Google — Function calling with the Gemini API](https://ai.google.dev/gemini-api/docs/function-calling) — defines function declarations, structured arguments, tool-selection modes, parallel calls, and application-controlled execution.
- [Google — Using tools](https://ai.google.dev/gemini-api/docs/tools) — distinguishes function calling for intermediate actions from structured outputs for schema-constrained final responses.
- [Model Context Protocol — Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — defines tool names, descriptions, JSON Schema inputs, optional output schemas, and structured results.
- [OpenAI Agents SDK — Human in the loop](https://openai.github.io/openai-agents-python/human_in_the_loop/) — demonstrates approval gates bound to individual tool calls and arguments.
- [OpenAI Agents SDK — Guardrails](https://openai.github.io/openai-agents-python/guardrails/) — documents validation tripwires for agent inputs and outputs.
