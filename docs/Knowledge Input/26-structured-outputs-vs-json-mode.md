---
canonical_question: "What are structured outputs, and how are they different from JSON mode?"
section: ai-agents
topics:
  - structured-outputs
  - json-schema
  - function-calling
  - data-extraction
knowledge_type: comparison
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

**JSON mode** asks a model to return syntactically valid JSON.

**Structured outputs** constrain the response to a specified schema, such as required fields, types, enumerations, arrays, and nested objects.

Use structured outputs when software must reliably parse the model's response, when extracting records, or when producing arguments for tools. JSON mode alone does not guarantee that required fields exist, values use the correct type, or the object matches the application's contract.

Schema compliance is still not semantic correctness. An output can perfectly match the schema while containing a wrong customer ID, unsupported claim, unsafe amount, or invalid business decision. Application code must validate meaning, permissions, and current state.

## Detailed explanation

Consider an application that expects:

```json
{
  "decision": "approve | reject | review",
  "confidence": 0.0,
  "reasons": ["string"]
}
```

JSON mode may return valid JSON such as:

```json
{"result": "looks good"}
```

The response is parseable but does not satisfy the contract.

Structured outputs use a schema to restrict the generated shape. Depending on the provider and feature, the schema can specify:

- object and array structure;
- required properties;
- string, number, integer, boolean, and null types;
- allowed enumerated values;
- nested objects;
- restrictions on additional properties;
- descriptions that help the model populate fields.

OpenAI's strict function calling guarantees that generated function arguments match the supported JSON Schema definition. Google's Gemini documentation distinguishes structured outputs, which constrain the final answer, from function calling, which requests an application action during a workflow.

Use structured outputs for:

- document and invoice extraction;
- classification;
- API-ready records;
- database staging objects;
- evaluation labels and scores;
- UI components;
- workflow routing;
- tool arguments;
- machine-readable research notes.

Use function calling when the model should select an operation for the application to execute. Use structured final output when the model should return a typed result to the application or user. Some workflows use both.

Important limitations remain:

### Schema support

Providers may support only a subset of JSON Schema. Very complex schemas can become difficult for the model and increase latency or failure rates.

### Refusals and truncation

The model may refuse, reach an output limit, or stop before completing the structure. Applications must handle incomplete and non-success states.

### Semantic errors

The schema does not prove that values are true, authorised, current, or internally consistent.

### Injection and security

A malicious document can influence schema-valid values. The application must still treat extracted data as untrusted.

### Versioning

Changing the schema can break downstream consumers. Store a schema or protocol version and test compatibility.

### Validation

Even when a provider advertises strict output, perform local parsing and validation before use. Business rules should include cross-field checks, database lookups, allowed-resource checks, and limits.

A safe flow is:

1. request a strict structured response;
2. parse it with a typed validator;
3. reject unknown or unsupported versions;
4. validate semantics and permissions;
5. require approval where necessary;
6. execute through an idempotent application service;
7. record the raw response, validated object, and outcome.

Structured outputs make model integration more reliable. They do not convert probabilistic generation into trusted business logic.

## Evidence

- [OpenAI — Introducing Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/) — explains schema-constrained responses, strict function calling, reliability, and limitations.
- [OpenAI — Function calling](https://help.openai.com/en/articles/8555517-function-calling-in-the-openai-api) — distinguishes JSON mode from strict schema-matching Structured Outputs.
- [Google — Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) — documents JSON Schema-constrained Gemini responses and supported use cases.
- [Google — Using tools](https://ai.google.dev/gemini-api/docs/tools) — distinguishes function calling for intermediate actions from structured final outputs.
- [Model Context Protocol — Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — defines JSON Schema input and optional output contracts for interoperable tools.
