# ADR 0008: TRACE Model API, Provider Selection, Endpoint Security and Cost Containment

- **Status:** Accepted
- **Date:** 2026-07-13
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** Ask TRACE, TRACE Analysis, TRACE Predicts, newsletter generation, internal AI-assisted editorial workflows
- **Review trigger:** Before public launch of Ask TRACE; whenever the primary provider, model family, billing arrangement, data-processing terms, or endpoint architecture changes

## 1. Context

The Trace Manifest is introducing model-assisted features during Phase 5, including:

- Ask TRACE;
- evidence-bounded article summarisation and editorialisation;
- TRACE Analysis;
- TRACE Predicts;
- weekly newsletter preparation;
- internal research and editorial support.

These features require a model API, but the model must not become TRACE's source of truth. TRACE's evidence corpus, provenance records, source classifications, claim records, corrections history, retrieval rules and deterministic validation remain authoritative.

The first provider must also be financially safe for an early-stage public service. The principal financial risks are not ordinary human questions. They are:

1. accidental exposure of an API key;
2. an unprotected public endpoint being called by bots;
3. client or server retries multiplying the same request;
4. a recursive model or tool loop;
5. a background job repeatedly processing the same item;
6. a streaming client reconnecting and starting duplicate generations;
7. unexpectedly large prompts or outputs;
8. an internal error causing multiple workers to process the same job;
9. a compromised dependency, deployment secret or log revealing credentials;
10. a provider model alias or pricing change silently increasing cost.

DeepSeek has been selected as the initial provider because an existing account is available and API usage is deducted from topped-up or granted balance. Exhausted balance produces an insufficient-balance error rather than an open-ended postpaid charge. This prepaid characteristic is useful as a final hard financial boundary, but it must not be treated as the primary security control.

## 2. Decision

TRACE will adopt the following model architecture and operating rules.

### 2.1 Initial provider and models

1. **Primary provider:** DeepSeek.
2. **Routine public model:** `deepseek-v4-flash`.
3. **Higher-cost reviewed model:** `deepseek-v4-pro`, restricted to approved administrative or scheduled editorial workflows where evaluation demonstrates a material quality benefit.
4. **Deprecated model names must not be introduced:** `deepseek-chat` and `deepseek-reasoner` must not be used in new TRACE code.
5. **No automatic model substitution:** TRACE must not silently switch to a new model, alias, preview model or fallback provider. Every model change requires configuration review, evaluation and an auditable deployment decision.
6. **Thinking mode is task-specific:** routine source-bounded summaries should use the least costly mode that passes evaluation. Higher reasoning settings are permitted only for approved tasks with explicit token and cost ceilings.
7. **The provider decision is reversible:** all application code must call TRACE's internal model interface rather than importing DeepSeek-specific request logic throughout the codebase.

### 2.2 Provider-neutral model gateway

TRACE will implement an internal provider-neutral gateway.

```ts
interface TraceModelProvider {
  generateAnswer(input: TraceAnswerInput): Promise<TraceAnswerDraft>;
  generateEditorial(input: TraceEditorialInput): Promise<TraceEditorialDraft>;
  generatePredictions(
    input: TracePredictionInput
  ): Promise<TracePredictionCandidate[]>;
}
```

The gateway must:

- expose TRACE-owned input and output types;
- contain provider-specific adapters;
- enforce model allowlists;
- enforce per-task token ceilings;
- assign request and idempotency identifiers;
- record usage and estimated cost;
- apply timeouts and bounded retries;
- validate structured output;
- reject unsupported tool calls;
- support a global circuit breaker;
- fail closed when budget or validation controls are unavailable.

Initial structure:

```text
src/ai/
├── provider.ts
├── model-router.ts
├── trace-model-gateway.ts
├── schemas.ts
├── validation.ts
├── usage-ledger.ts
├── budget-policy.ts
├── circuit-breaker.ts
└── providers/
    └── deepseek.ts
```

An external AI gateway may be introduced later, but it is not required for the first implementation. Before adding one, TRACE must review its prompt logging, retention, privacy, regional processing, pricing, failure behaviour and credential handling.

## 3. Trust boundary

### 3.1 The model is not an authority

The model may:

- summarise supplied evidence;
- compare supplied claims;
- draft clearly labelled analysis;
- identify uncertainty;
- propose editorial wording;
- generate candidate predictions for human review.

The model may not:

- invent or select its own external evidence;
- access unrestricted web search from the public Ask TRACE path;
- alter source trust classifications;
- approve its own citations;
- calculate the final public confidence score;
- publish predictions automatically;
- modify the corrections ledger;
- call arbitrary URLs;
- execute code;
- write directly to production data;
- approve publication;
- create additional model requests by itself.

### 3.2 Evidence-bounded requests

Public Ask TRACE requests must use only evidence already admitted to TRACE's governed corpus.

The request flow is:

```text
Browser
  -> TRACE public API
  -> authentication/abuse checks
  -> input validation
  -> retrieval from approved TRACE corpus
  -> evidence filtering and token budgeting
  -> TRACE model gateway
  -> DeepSeek API
  -> structured-output validation
  -> citation and claim validation
  -> confidence calculation
  -> response
```

The model receives a bounded evidence packet containing only the minimum required:

- resolved question;
- interpreted time window;
- task instructions;
- selected excerpts;
- source IDs;
- claim IDs;
- source classifications;
- dates;
- known disagreements;
- output schema.

The model must not receive database credentials, private keys, deployment secrets, internal administration tokens, raw IP addresses, unnecessary account data or unrelated source material.

## 4. API key and secret protection

### 4.1 Server-side only

The DeepSeek API key must exist only in trusted server-side execution environments.

It must never be:

- embedded in browser JavaScript;
- included in a static site bundle;
- exposed through a public environment variable prefix;
- committed to Git;
- stored in repository examples using a real value;
- pasted into an issue, pull request, screenshot or support message;
- returned by an API response;
- printed to console or application logs;
- included in exception telemetry;
- stored in analytics;
- sent to the model;
- placed in client-side local storage, IndexedDB, cookies or service-worker caches.

For Cloudflare deployment, the key must be stored as an encrypted Worker secret, for example:

```bash
npx wrangler secret put DEEPSEEK_API_KEY
```

Local development must use a non-committed secret file or local secret facility. `.env*`, `.dev.vars` and equivalent files containing secrets must be excluded from version control.

### 4.2 Separate key and least exposure

TRACE must use a dedicated API key that is not shared with:

- personal DeepSeek experimentation;
- other PCGsoft products;
- development agents;
- local coding tools;
- CI jobs that do not require model access;
- third-party automation platforms.

Where provider controls permit, development, staging and production must use separate keys. Production secrets must not be available to pull-request builds.

### 4.3 Rotation

The API key must be rotated:

- immediately after suspected exposure;
- after accidental logging;
- after a collaborator with access leaves;
- after a security incident;
- when moving between hosting environments;
- periodically according to the project's secret-rotation policy.

Rotation must be documented in the incident record without recording the secret itself.

## 5. Public endpoint design

### 5.1 Approved endpoint

The browser must call a TRACE-owned endpoint such as:

```text
POST /api/trace/ask
```

The browser must never call the DeepSeek API directly.

The endpoint must:

- accept `POST` only;
- require `Content-Type: application/json`;
- reject oversized bodies before parsing;
- enforce a strict request schema;
- normalise and limit question length;
- reject unexpected fields;
- use an explicit same-origin or allowlisted CORS policy;
- apply bot and abuse controls;
- generate a server-side request ID;
- require or derive an idempotency key;
- reserve budget before model invocation;
- release or reconcile that reservation after completion;
- impose a hard execution timeout;
- return generic public errors without internal stack traces;
- never return provider credentials or raw provider error bodies.

### 5.2 Suggested launch limits

Initial limits should be conservative and configurable:

```text
Maximum question length:          1,000 characters
Maximum request body:             16 KB
Maximum evidence excerpts:        16
Maximum evidence input:           12,000 tokens
Maximum generated output:         1,500 tokens
Maximum model calls per question: 1
Maximum validation regeneration:  1, admin-only or disabled initially
Maximum active request/session:   1
Maximum active request/IP hash:   small bounded number
Public questions/visitor/day:     3 initially
Request timeout:                  bounded and below platform maximum
```

These are launch defaults, not permanent product promises. Changes require observed usage data and a recorded review.

### 5.3 Abuse resistance

The endpoint must combine several controls rather than relying on one identifier:

- Cloudflare rate limiting;
- Turnstile or equivalent bot challenge where appropriate;
- opaque session identifier;
- privacy-preserving IP hash with rotating salt;
- authenticated account limit if accounts are introduced;
- global daily request ceiling;
- global daily spend ceiling;
- per-session concurrency limit;
- per-IP-hash concurrency limit;
- request deduplication;
- temporary blocking after repeated malformed requests;
- administrative kill switch.

Provider concurrency limits are not TRACE's safety limits. TRACE's own limits must be far lower.

### 5.4 `user_id`

Where the provider's `user_id` parameter is used, TRACE must pass only an opaque, pseudonymous identifier. It must not contain a name, email address, IP address, user handle, question text or other personal information.

## 6. Financial controls

### 6.1 Prepaid balance

DeepSeek prepaid balance is adopted as the provider-level hard stop.

Rules:

- begin with a deliberately small manual top-up;
- do not enable automatic replenishment;
- do not store payment credentials in TRACE;
- review the provider billing page after initial testing;
- treat any promotional balance separately from topped-up funds;
- do not assume prices are fixed;
- do not assume a provider-side balance check is perfectly current.

A zero balance should halt new provider requests. TRACE must handle HTTP `402` as a terminal financial state, not as a retryable error.

### 6.2 Internal budget is authoritative

TRACE must maintain an internal usage ledger and budget policy. Prepaid balance is the last backstop, not the operating budget.

Suggested initial configuration:

```ts
const TRACE_AI_PUBLIC_ENABLED = true;
const TRACE_AI_GLOBAL_KILL_SWITCH = false;

const TRACE_AI_DAILY_PUBLIC_BUDGET_USD = 1.00;
const TRACE_AI_MONTHLY_PUBLIC_BUDGET_USD = 10.00;
const TRACE_AI_MAX_ESTIMATED_COST_PER_REQUEST_USD = 0.02;

const TRACE_AI_WARNING_BALANCE_USD = 2.00;
const TRACE_AI_RESTRICT_BALANCE_USD = 0.50;
const TRACE_AI_STOP_BALANCE_USD = 0.10;
```

Values must be environment configuration, not scattered constants.

When a threshold is reached:

- **warning:** notify the administrator and continue within internal limits;
- **restrict:** disable anonymous public requests and permit only authorised testing;
- **stop:** reject all non-essential model requests;
- **kill switch:** reject every model request, including scheduled jobs, until manually re-enabled.

### 6.3 Atomic reservation

Before calling the provider, TRACE must reserve the maximum permitted estimated cost in an atomic ledger operation.

The sequence is:

```text
calculate worst-case request cost
  -> atomically reserve budget
  -> call provider once
  -> record actual usage
  -> reconcile reservation
  -> release unused amount
```

If reservation fails, the model request must not begin.

This prevents concurrent workers from each observing the same remaining budget and overspending it.

### 6.4 Balance monitoring

TRACE may call the provider balance endpoint from a scheduled server-side job or before approved operations.

The balance check must:

- use the server-side API key;
- never be exposed publicly;
- run at a sensible interval;
- avoid becoming a request loop itself;
- cache the latest successful result;
- record when the value was checked;
- fail closed for non-essential requests when the balance state is stale beyond an agreed threshold.

## 7. Automated-loop prevention

Automated loops are considered a critical architecture risk.

### 7.1 No autonomous recursive generation

A model response must never directly trigger another model request.

Specifically prohibited:

```text
model answer -> model reviews answer -> model rewrites answer -> repeat
model tool call -> tool result -> model tool call without hard step bound
prediction job -> discovers more topics -> creates more prediction jobs
failed validation -> regenerate indefinitely
client reconnect -> create a fresh generation
provider timeout -> retry forever
```

The public Ask TRACE path permits one provider generation per accepted request. A single bounded regeneration may be introduced later only if:

- it is explicitly budgeted;
- it uses the same idempotency record;
- it cannot exceed the per-request call ceiling;
- evaluation proves it materially improves reliability;
- it is recorded as a separate attempt.

### 7.2 Hard step counters

Every workflow must have immutable limits:

```ts
maxProviderCallsPerRequest
maxToolCallsPerRequest
maxWorkflowSteps
maxRetries
maxElapsedTimeMs
maxInputTokens
maxOutputTokens
maxEstimatedCostUsd
```

Counters must be enforced by application code, not prompt instructions.

### 7.3 Retry policy

Retries must be explicit and status-aware.

| Condition | Retry policy |
|---|---|
| `400` invalid format | Never retry automatically |
| `401` authentication failure | Never retry; disable provider path and alert |
| `402` insufficient balance | Never retry; trip financial circuit breaker |
| `422` invalid parameters | Never retry automatically |
| `429` rate limit | At most a small bounded retry count with exponential backoff and jitter |
| `500` provider error | At most a small bounded retry count |
| `503` overloaded | At most a small bounded retry count |
| timeout before confirmed response | Retry only when idempotency and duplicate-cost risk are understood |
| validation failure | Do not loop; fail safely or perform one explicitly budgeted regeneration |
| client disconnect | Do not automatically start a replacement provider request |

There must be no generic `catch { retry(); }` behaviour.

### 7.4 Idempotency and deduplication

Each accepted user action must have one stable request identity.

The endpoint must:

- accept or generate an idempotency key;
- persist request state before provider invocation;
- recognise duplicate submissions;
- return the existing result or in-progress status;
- prevent two workers from processing the same request;
- use leases or locks with expiry for queued work;
- record attempt count;
- mark terminal states explicitly.

Suggested states:

```text
RECEIVED
VALIDATED
BUDGET_RESERVED
RETRIEVING
MODEL_IN_PROGRESS
VALIDATING
COMPLETED
FAILED
REJECTED
CANCELLED
CIRCUIT_OPEN
```

A job may move only through allowed transitions. `COMPLETED`, `FAILED`, `REJECTED`, `CANCELLED` and `CIRCUIT_OPEN` are terminal.

### 7.5 Streaming and reconnects

Streaming is not required for the initial release.

If introduced later:

- the server, not the browser, owns the provider connection;
- client reconnection must attach to the existing TRACE request;
- reconnecting must not create another provider generation;
- the request result must be persisted independently of the client connection;
- SSE keep-alive messages must not be mistaken for model output;
- client-side timeout logic must not resubmit automatically without the same idempotency key.

### 7.6 Scheduled jobs

TRACE Predicts, newsletter generation and editorial jobs must use a durable queue or equivalent single-owner job mechanism.

Each scheduled unit must have:

- deterministic job key;
- scheduled period;
- corpus snapshot/version;
- input hash;
- attempt count;
- lease owner;
- lease expiry;
- maximum attempts;
- terminal status;
- actual token usage and cost.

The scheduler must not create a second job when the first is still active or already completed for the same period and input hash.

## 8. Prompt, token and output controls

### 8.1 Prompt limits

The large provider context window is not permission to send unlimited material.

TRACE must:

- cap retrieved excerpt count;
- cap excerpt length;
- remove duplicated passages;
- avoid entire documents where extracts suffice;
- separate trusted instructions from untrusted source text;
- label source text as data, not instructions;
- strip or neutralise prompt-injection content during ingestion and packaging;
- reject evidence packets exceeding policy;
- record input token usage.

### 8.2 Output limits

Every request must set a finite `max_tokens`.

Structured JSON output must also include an explicit prompt instruction requiring JSON. This is essential because provider documentation warns that requesting JSON format without an instruction to produce JSON may result in a long whitespace generation until the token limit.

TRACE must reject:

- truncated JSON;
- invalid JSON;
- unknown fields where strict validation is required;
- citations to unknown source IDs;
- unsupported claims;
- tool calls not explicitly enabled;
- provider output that exceeds the public response contract.

### 8.3 Tool calls

Tool calling is disabled for the initial public Ask TRACE implementation.

If enabled for an internal workflow later:

- tools must be explicitly allowlisted;
- arguments must be schema-validated;
- hallucinated arguments must be rejected;
- tools must have independent authorisation;
- no tool may expose credentials;
- no tool may call arbitrary URLs;
- no tool may recursively invoke the model;
- every tool call counts against a hard step ceiling;
- mutating tools require separate governance and must not be introduced through this ADR alone.

## 9. Retrieval, citations and confidence

The model's final answer must be derived only from the supplied evidence packet.

The model returns a structured draft containing:

- direct answer;
- key points;
- claim IDs;
- source IDs;
- confirmed facts;
- reported claims;
- TRACE analysis;
- disagreements;
- caveats;
- what could change the answer;
- proposed confidence.

TRACE code must then verify:

- every cited source ID was supplied;
- every cited claim ID exists;
- material factual statements are linked to evidence;
- the cited evidence supports the statement;
- disagreements are not suppressed;
- analysis is labelled as analysis;
- dates and time windows are correctly represented;
- no excluded or superseded source was used;
- output is complete and not truncated.

The final confidence level is calculated by TRACE's deterministic policy. The model's proposed confidence is advisory only.

A validation failure must result in:

- a safe non-answer;
- an explicitly bounded single regeneration where enabled; or
- administrative review.

It must never result in unvalidated publication.

## 10. Logging, observability and privacy

TRACE must record enough information to audit cost and behaviour without creating another secret or privacy leak.

Recommended `ai_runs` fields:

```text
id
request_id
idempotency_key_hash
task_type
provider
model
model_mode
prompt_version
schema_version
retrieval_version
corpus_snapshot
source_ids
claim_ids
input_tokens
output_tokens
cached_tokens
estimated_cost
actual_cost
attempt_number
latency_ms
provider_status
validation_status
validation_failures
fallback_used
budget_reservation
created_at
completed_at
```

Logs must not contain:

- API keys;
- authorisation headers;
- full raw provider request bodies by default;
- unnecessary full user questions;
- raw IP addresses;
- personal data in `user_id`;
- complete chain-of-thought or reasoning content;
- private unpublished source material unless explicitly approved and protected.

Production diagnostics should prefer hashes, IDs, counts, status codes and redacted excerpts.

Prompts and evidence excerpts sent to any external provider are external data disclosures. Therefore:

- public-source excerpts should be minimised;
- personal data should be removed where not essential;
- private or embargoed material must not be sent without a separate decision;
- provider data-processing, retention and jurisdiction terms must be reviewed before production;
- user-facing privacy information must accurately describe model processing.

## 11. Circuit breakers and failure behaviour

TRACE must provide:

1. global AI kill switch;
2. public Ask TRACE switch;
3. scheduled-job switch;
4. per-provider switch;
5. per-model switch;
6. daily and monthly budget circuit breakers;
7. balance circuit breaker;
8. authentication-error circuit breaker;
9. elevated-failure-rate circuit breaker;
10. elevated-latency circuit breaker.

When a circuit opens, TRACE must fail visibly and safely:

```json
{
  "status": "temporarily_unavailable",
  "message": "Ask TRACE is temporarily unavailable. No request was charged by TRACE after this response was issued.",
  "requestId": "opaque-public-id"
}
```

The public response must not reveal the provider name, remaining balance, internal limits, stack trace or security details unless intentionally disclosed elsewhere.

## 12. Incident response

### 12.1 Suspected key leak

Immediately:

1. activate the global kill switch;
2. revoke the exposed key;
3. create a replacement key;
4. inspect provider usage and balance;
5. inspect TRACE request and deployment logs;
6. identify the leak path;
7. remove the secret from logs, artefacts and repository history where possible;
8. redeploy affected environments;
9. document scope, cost and corrective actions;
10. restore service only after verification.

### 12.2 Request storm or automated loop

Immediately:

1. activate the relevant circuit breaker;
2. stop queue consumers and scheduled jobs;
3. preserve request-state and usage records;
4. identify duplicate idempotency keys, retries or job leases;
5. reconcile internal usage against provider usage;
6. patch the loop cause;
7. add a regression test;
8. lower temporary limits before controlled restoration.

### 12.3 Unexpected spend

Immediately:

1. stop public and scheduled model traffic;
2. inspect usage by task, model, endpoint and API key;
3. verify price and model configuration;
4. verify token ceilings;
5. check for model alias changes;
6. check for leaked credentials;
7. check retry and queue behaviour;
8. reduce prepaid balance exposure and internal limits;
9. document the event.

## 13. Testing and acceptance criteria

Ask TRACE must not be publicly enabled until all following tests pass.

### Secret safety

- production bundle contains no DeepSeek key;
- repository secret scan passes;
- logs redact authorisation headers;
- error responses contain no secrets;
- pull-request deployments cannot access production keys.

### Endpoint safety

- GET and unsupported methods are rejected;
- oversized bodies are rejected;
- invalid JSON is rejected without provider invocation;
- unexpected schema fields are rejected;
- CORS policy is enforced;
- rate limiting works;
- Turnstile or equivalent abuse control works where configured;
- duplicate idempotency requests produce at most one provider generation.

### Cost safety

- internal budget reservation is atomic;
- daily limit stops new calls;
- monthly limit stops new calls;
- maximum per-request estimate stops oversized calls;
- low-balance restriction works;
- `402` opens the financial circuit and is never retried;
- kill switch prevents every provider call;
- production defaults are conservative.

### Loop safety

- client double-click creates one generation;
- browser reconnect does not create another generation;
- worker timeout does not cause unlimited retries;
- `429`, `500` and `503` retries are bounded;
- invalid output does not regenerate indefinitely;
- scheduled duplicate job keys execute once;
- expired job leases cannot create uncontrolled parallel work;
- model output cannot initiate another model call.

### Trust safety

- model cannot cite an unsupplied source;
- unsupported claims are rejected;
- prompt injection inside source text does not change system policy;
- tool calls are rejected while disabled;
- final confidence is system-calculated;
- insufficient evidence produces a non-answer;
- deprecated or unapproved models cannot be selected by request input.

## 14. Operational configuration

The following configuration names are recommended:

```text
DEEPSEEK_API_KEY
TRACE_AI_PROVIDER
TRACE_AI_PUBLIC_MODEL
TRACE_AI_EDITORIAL_MODEL
TRACE_AI_PUBLIC_ENABLED
TRACE_AI_SCHEDULED_ENABLED
TRACE_AI_GLOBAL_KILL_SWITCH
TRACE_AI_MAX_INPUT_TOKENS
TRACE_AI_MAX_OUTPUT_TOKENS
TRACE_AI_MAX_PROVIDER_CALLS_PER_REQUEST
TRACE_AI_MAX_RETRIES
TRACE_AI_REQUEST_TIMEOUT_MS
TRACE_AI_DAILY_PUBLIC_BUDGET_USD
TRACE_AI_MONTHLY_PUBLIC_BUDGET_USD
TRACE_AI_MAX_COST_PER_REQUEST_USD
TRACE_AI_WARNING_BALANCE_USD
TRACE_AI_RESTRICT_BALANCE_USD
TRACE_AI_STOP_BALANCE_USD
```

Only server-side configuration may select a provider or model. Public request fields such as `provider`, `model`, `thinking`, `reasoning_effort`, `max_tokens`, `tools` or `base_url` must be ignored or rejected.

## 15. Consequences

### Positive

- prepaid balance limits worst-case provider spend;
- DeepSeek V4 Flash offers a low-cost initial path;
- provider-neutral code avoids application-wide lock-in;
- deterministic controls protect TRACE's evidence and citation standards;
- strict endpoint design reduces key leakage and bot abuse;
- atomic budgets and idempotency protect against concurrency overspend;
- bounded workflows prevent recursive and retry loops;
- model changes remain auditable.

### Negative

- additional gateway, ledger and validation code is required;
- public answers may be temporarily unavailable when safety state is uncertain;
- strict limits may reject legitimate complex questions;
- no unrestricted web search reduces apparent chatbot flexibility;
- no automatic fallback may reduce availability;
- privacy and provider-term reviews remain necessary;
- DeepSeek remains an external dependency whose pricing, models and terms can change.

### Accepted trade-off

TRACE prioritises bounded cost, reproducibility, evidence integrity and safe failure over maximum conversational freedom or uninterrupted model availability.

## 16. Alternatives considered

### Gemini API

Rejected for the initial release because the existing cloud account has an outstanding balance and does not provide the preferred clean starting position.

### OpenAI or Anthropic as the initial provider

Deferred. They may be evaluated later through the same provider-neutral interface, but introducing another account and billing path is unnecessary for Phase 5.

### Browser-to-provider API calls

Rejected because the API key would be exposed and abuse could not be safely controlled.

### Unrestricted provider web search

Rejected for public Ask TRACE because it bypasses TRACE ingestion, provenance, corrections, trust classification and reproducibility controls.

### Automatic provider fallback

Deferred because fallback can conceal outages, produce inconsistent answers, complicate privacy disclosures and unexpectedly increase cost.

### Unlimited agentic tool loop

Rejected because it creates unacceptable spending, security and reproducibility risk.

### Relying only on prepaid balance

Rejected because a leaked key or automated loop could consume the entire balance and disrupt unrelated use before detection.

## 17. Implementation sequence

1. Add TRACE-owned model interfaces and schemas.
2. Add the DeepSeek adapter using `deepseek-v4-flash`.
3. Store a dedicated key as a server-side secret.
4. Add internal usage ledger and atomic budget reservation.
5. Add kill switches and circuit breakers.
6. Add the balance-check integration.
7. Build the protected `POST /api/trace/ask` endpoint.
8. Add retrieval and evidence-packet limits.
9. Add structured-output and citation validation.
10. Add idempotency and request-state persistence.
11. Add bounded retry handling.
12. Add abuse controls and conservative public limits.
13. Add tests listed in this ADR.
14. Run a private evaluation set.
15. Enable administrator-only use.
16. Review real token usage and failure behaviour.
17. Enable a tightly limited public beta.
18. Evaluate V4 Pro only for reviewed editorial workflows.

## 18. Review conditions

This ADR must be reviewed when:

- DeepSeek changes model names or retires a selected model;
- pricing changes materially;
- automatic top-up becomes enabled or required;
- provider billing changes from prepaid behaviour;
- a fallback provider is added;
- an external AI gateway is introduced;
- tool calling or web search is enabled;
- private documents or personal data are sent to the provider;
- public usage limits are materially increased;
- a security, privacy or unexpected-spend incident occurs;
- TRACE introduces multi-turn conversation memory;
- TRACE permits autonomous publication.

## 19. External references checked for this decision

- DeepSeek API Docs — Models & Pricing
- DeepSeek API Docs — DeepSeek V4 Preview Release
- DeepSeek API Docs — Create Chat Completion
- DeepSeek API Docs — Rate Limit & Isolation
- DeepSeek API Docs — Error Codes
- DeepSeek API Docs — Get User Balance
- DeepSeek API Docs — FAQ

References were checked on 2026-07-13. Provider documentation is operational input, not a permanent contract; current documentation and account settings must be rechecked before production deployment.
