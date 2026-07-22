# ADR 0019: TRACE Open Model Execution Intelligence and Cloudflare Data Architecture

**Status:** Accepted
**Date:** 22 July 2026

## Context

TRACE Models currently provides a model and benchmark catalogue, including model cards, benchmark results, provider information, and TRACE aggregate scores.

This foundation does not yet answer the practical questions users face when selecting and operating open models:

* which exact model release, variant, artefact, and quantisation should be downloaded;
* whether that artefact will run on a particular CPU, GPU, VRAM, system-memory, or unified-memory configuration;
* what context length and level of performance are realistic;
* which runtime supports the model format and hardware;
* whether the model works reliably with coding harnesses, agents, structured output, tools, and MCP;
* how to install and configure the selected combination;
* why a model fails to load, performs slowly, produces malformed output, or cannot call tools; and
* which fix, workaround, configuration change, or software version applies.

These requirements are related to ADR 0017 and the TRACE Knowledge Continuity and Story Memory workstream, but they are not ordinary knowledge-document requirements.

Knowledge Continuity supplies governed source capture, immutable source versions, claim-level provenance, freshness, contradiction handling, evidence inheritance, retrieval, and bounded answer synthesis. It does not by itself provide the specialist structured records, deterministic calculations, compatibility matrices, or diagnostic graph needed for hardware and execution recommendations.

TRACE must not answer hardware and compatibility questions solely through model-generated prose or retrieval from unstructured documents. Model memory requirements, runtime compatibility, tool reliability, and troubleshooting advice depend on exact combinations of model artefact, quantisation, context length, runtime version, operating system, hardware, drivers, harness, and configuration.

The existing deployment uses Cloudflare Pages and Workers with separate production and Preview D1 databases and R2 buckets. The Knowledge Continuity plan introduces Cloudflare Queues and Vectorize for asynchronous processing and semantic candidate retrieval.

External alternatives such as Neon/PostgreSQL and Backblaze B2 are available, but introducing them now would add additional credentials, migration systems, failure boundaries, synchronisation requirements, and uncertainty over system ownership without evidence that the current Cloudflare architecture is insufficient.

## Decision

TRACE Models will expand into an evidence-backed **Open Model Execution Intelligence** system.

It will represent model artefacts, quantisations, hardware requirements, runtimes, harnesses, MCP and tool compatibility, installation procedures, known issues, diagnostics, fixes, and workarounds as structured, versioned records.

The system will use the canonical Knowledge Continuity evidence graph for sources, claims, provenance, freshness, contradictions, corrections, and retrieval. It must not create a separate evidence or knowledge system for model execution information.

The initial production architecture will remain Cloudflare-native:

* **D1** is the canonical relational source of truth.
* **R2** stores large source bodies, uploaded documents, extracted content, logs, datasets, exports, and other object artefacts.
* **Vectorize** provides semantic candidate retrieval but is never authoritative.
* **Queues** perform asynchronous capture, extraction, indexing, backfill, recalculation, and repair work.
* **Workers** perform ingestion, deterministic compatibility evaluation, recommendation ranking, and controlled internal services.
* **Pages and Astro routes** provide public and administrative interfaces.

Neon, Supabase, Firebase, Backblaze, and other external databases or object stores are not part of the initial implementation.

## Domain Ownership

### Knowledge Continuity owns

Knowledge Continuity remains responsible for:

* admitted source identity;
* immutable source-document versions;
* permitted source capture;
* content hashes and locators;
* canonical claims and source assertions;
* provenance groups and independence;
* corrections, conflicts, and supersessions;
* freshness and expiry;
* evidence eligibility;
* retrieval;
* evidence packets;
* review state; and
* bounded evidence-backed answer synthesis.

Open Model Execution Intelligence must inherit these records rather than copying or recreating their truth semantics.

### TRACE Models owns

TRACE Models is responsible for:

* model families;
* model releases;
* model variants;
* model artefacts and files;
* quantisation formats;
* model capabilities;
* model licences;
* model-to-runtime compatibility;
* hardware profiles and requirements;
* context-sensitive memory profiles;
* observed performance measurements;
* harness compatibility;
* structured-output and tool-call test results;
* MCP compatibility;
* recommendation ranking; and
* model-specific execution status.

### Guides Lab owns

Guides Lab is responsible for reviewed human-readable procedures, including:

* prerequisites;
* installation commands;
* operating-system-specific instructions;
* runtime setup;
* driver and backend setup;
* model download and verification;
* configuration;
* safety notes;
* success checks;
* rollback; and
* troubleshooting escalation.

Structured compatibility records may link to Guides, but setup procedures must not be duplicated across model records.

### Diagnostic System owns

The diagnostic system is responsible for:

* symptoms;
* issue signatures;
* affected combinations;
* likely causes;
* diagnostic checks;
* remediation steps;
* reversible workarounds;
* fixed versions;
* regression versions;
* risk and difficulty classifications; and
* reviewed user-resolution reports.

## Canonical Model Structure

TRACE must distinguish the conceptual model from the downloadable artefact.

The minimum hierarchy is:

```text
model family
└── model release
    ├── base variant
    ├── instruct variant
    ├── reasoning variant
    ├── coding variant
    ├── multimodal variant
    └── downloadable artefacts
        ├── BF16 or FP16
        ├── FP8
        ├── AWQ
        ├── GPTQ
        ├── EXL2
        ├── GGUF Q8
        ├── GGUF Q6
        ├── GGUF Q5
        ├── GGUF Q4
        └── lower-bit or specialist quants
```

A model-level requirement must not be presented as an artefact-level guarantee.

Each artefact should be able to record:

* publisher;
* repository;
* quantiser or republisher;
* format;
* quantisation method;
* quantisation parameters;
* file size;
* file checksum;
* shard information;
* architecture;
* total and active parameters;
* tokenizer;
* chat template;
* native context;
* tested context;
* licence;
* capability declarations;
* source evidence;
* release date;
* verification date;
* review state; and
* known incompatibilities.

## Hardware Guidance

TRACE will distinguish at least four execution levels:

* `will_load`;
* `minimum_usable`;
* `recommended`;
* `production_or_agent_use`.

Training and fine-tuning requirements must be represented separately from inference requirements.

Hardware recommendations must account for more than model-weight size. Calculations and observations may include:

```text
model weights
+ KV cache
+ runtime overhead
+ temporary compute buffers
+ multimodal encoders
+ context length
+ batch size
+ concurrent requests
+ operating-system and display use
```

Hardware records may include:

* CPU architecture;
* CPU instruction requirements;
* system RAM;
* GPU vendor and family;
* VRAM;
* unified memory;
* storage;
* operating system;
* driver;
* backend;
* offload mode;
* context length;
* batch size;
* concurrency;
* prompt-processing speed;
* generation speed;
* power or thermal limitations;
* evidence source;
* test date;
* confidence; and
* review state.

TRACE must visibly distinguish:

* publisher requirement;
* runtime requirement;
* deterministic TRACE estimate;
* community report;
* independently reproduced result; and
* TRACE-tested result.

A community report must not be presented as a guaranteed hardware requirement.

## Runtime and Format Compatibility

Runtime support must be versioned and represented independently from model capability.

The system must be able to represent combinations such as:

```text
GGUF + llama.cpp + CUDA
GGUF + Ollama + ROCm
GGUF + Vulkan
AWQ + vLLM + NVIDIA
GPTQ + compatible GPU backend
EXL2 + ExLlamaV2
MLX + Apple Silicon
CPU-only + supported instruction set
```

Runtime records may include:

* runtime version;
* supported model architectures;
* supported formats;
* supported quantisations;
* operating-system support;
* GPU backend;
* CPU backend;
* driver requirements;
* context limitations;
* tool-role handling;
* structured-output handling;
* server API compatibility;
* known regressions; and
* fixed-version information.

“Model fits in memory” must not be treated as equivalent to “selected runtime supports this artefact on this hardware.”

## Harness, MCP, and Tool Compatibility

TRACE must assess agentic suitability separately from general model quality.

Compatibility records may cover:

* coding harnesses;
* agent frameworks;
* local model servers;
* OpenAI-compatible gateways;
* Anthropic-compatible gateways;
* MCP hosts;
* MCP clients;
* MCP transports;
* tool-call parsers;
* structured-output validators;
* prompt templates; and
* reasoning-output adapters.

Tests should be able to record:

* basic tool-call success;
* valid JSON rate;
* schema adherence;
* nested argument reliability;
* multiple sequential tool calls;
* parallel tool calls;
* tool-result interpretation;
* context required;
* loop or repetition behaviour;
* stop-token behaviour;
* reasoning leakage into arguments;
* MCP transport compatibility; and
* harness-specific configuration.

Compatibility statuses must include:

* `works`;
* `works_with_configuration`;
* `partial`;
* `experimental`;
* `known_broken`;
* `unsupported`; and
* `unverified`.

A publisher declaration that a model supports tools does not establish reliable operation in every runtime or harness.

## Deterministic Recommendation Engine

Personalised hardware and model recommendations must be produced by a deterministic compatibility service before language-model explanation.

The flow is:

```text
user hardware and workload profile
→ remove incompatible artefacts
→ calculate or retrieve memory requirements
→ account for context, cache, overhead, and concurrency
→ verify runtime and backend compatibility
→ verify harness, MCP, and tool requirements
→ rank viable combinations
→ attach evidence, uncertainty, and compromises
→ optionally ask TRACE to explain the bounded result
```

The language model may explain a supplied recommendation but must not:

* invent compatibility;
* upgrade evidence confidence;
* override deterministic exclusions;
* claim untested performance;
* silently substitute another artefact; or
* present an estimate as an observed result.

Recommended outputs may include:

* best overall viable model;
* best quality that fits;
* fastest viable model;
* best coding model;
* best tool or agent model;
* largest artefact likely to load;
* recommended quantisation;
* recommended runtime;
* starting context;
* expected limitations;
* setup Guide;
* known issues; and
* highest-value hardware upgrade.

## Troubleshooting Model

Troubleshooting must use structured diagnosis rather than unbounded generated advice.

The diagnostic flow is:

```text
symptom
→ affected model/runtime/hardware/version combination
→ ranked likely causes
→ safe diagnostic checks
→ lowest-risk reversible fix
→ alternative workaround
→ fixed or known-good version
→ escalation or insufficient-evidence result
```

Issues must be able to reference:

* model family;
* model release;
* artefact;
* quantisation;
* runtime and version range;
* operating system;
* CPU or GPU family;
* driver;
* backend;
* harness;
* MCP transport;
* configuration option; and
* source evidence.

Remediation steps should record:

* expected effect;
* risk;
* reversibility;
* difficulty;
* prerequisites;
* success check;
* rollback;
* evidence strength;
* affected versions; and
* last verification date.

User-submitted fixes remain community evidence until reviewed and admitted.

## Cloudflare Storage Decision

### D1

D1 remains the canonical relational store for:

* model and artefact metadata;
* hardware profiles;
* compatibility matrices;
* performance observations;
* issue and workaround relationships;
* guide references;
* source and claim identifiers;
* processing state;
* review state;
* recommendation snapshots; and
* audit metadata.

Large bodies, logs, documents, or duplicated chunks must not be stored as oversized D1 rows.

D1 records should contain identifiers, hashes, bounded excerpts, locators, structured values, and relationships.

### R2

R2 stores:

* permitted source bodies;
* immutable source versions;
* uploaded documents;
* extraction results;
* chunk files;
* diagnostic logs;
* large benchmark datasets;
* generated exports;
* database backups; and
* cold historical artefacts retained under policy.

Objects should use immutable, content-addressed keys where practical.

No raw R2 object is public by default.

### Vectorize

Vectorize indexes approved retrieval candidates such as:

* model descriptions;
* source chunks;
* canonical claims;
* known-issue symptoms;
* workaround descriptions;
* Guide sections;
* benchmark summaries; and
* approved knowledge sections.

Vector records must contain stable D1 identifiers and minimal filtering metadata.

Vector similarity is a candidate-discovery signal only. It cannot establish compatibility, evidence strength, independence, or correctness.

The initial implementation may use one index with a mandatory `recordType` field. Separate knowledge and model indexes may be introduced only when retrieval testing demonstrates a material quality, isolation, or operational benefit.

### Queues

Queues are required for asynchronous work, including:

* source capture;
* source extraction;
* claim extraction;
* embedding;
* model-release import;
* artefact discovery;
* quantisation metadata extraction;
* runtime compatibility refresh;
* hardware-profile recalculation;
* known-issue indexing;
* Guide validation;
* historical backfill;
* recommendation-cache refresh; and
* failed-work repair.

Queue messages contain identifiers, hashes, and bounded metadata, not complete source bodies.

Consumers must be idempotent and must use a dead-letter queue and visible administrative repair state.

Production and Preview must use separately named queues, dead-letter queues, D1 databases, R2 buckets, and Vectorize indexes.

Preview queues must not perform production ingestion or scheduled mutation.

## External Database and Storage Providers

### Neon or other PostgreSQL service

Neon is deferred.

PostgreSQL may be introduced only when measured requirements demonstrate that D1 is no longer appropriate for a clearly bounded workload.

Possible triggers include:

* sustained write contention that cannot be resolved through queueing or schema design;
* required analytical or recursive queries that are unreasonably complex or expensive in D1;
* a required PostgreSQL extension;
* relational growth approaching an agreed operational threshold;
* external analytical tooling requiring PostgreSQL;
* evidence that D1 limits, rather than implementation errors, block delivery.

Before introducing PostgreSQL, the team must document:

* the exact workload being moved;
* the authoritative owner of each record;
* synchronisation rules;
* migration and rollback;
* backup and recovery;
* failure behaviour;
* cost;
* latency; and
* why another bounded D1 database is insufficient.

A second relational database must not create two competing sources of truth for the same model, evidence, or compatibility records.

Cloudflare Hyperdrive may be used if a future PostgreSQL workload is approved.

### Backblaze B2 or another object store

Backblaze B2 is deferred as a live primary store.

It may later be introduced for:

* encrypted off-platform backup;
* disaster recovery;
* infrequently accessed cold archives;
* superseded large datasets;
* historical source versions; or
* storage volumes where measured savings materially exceed operational complexity.

R2 remains the live object store for normal TRACE processing because it provides native Worker bindings, simpler environment isolation, and a single security and operational boundary.

An external object store must not be added merely because its unit storage price is lower at a scale TRACE has not reached.

### Firebase and Supabase

Firebase and Supabase are not part of this architecture.

Open Model Execution Intelligence does not require an additional application backend, authentication store, or general-purpose database provider while the Cloudflare platform satisfies the accepted requirements.

## Data-Duplication Rules

TRACE must avoid storing the same large text in several systems.

The intended pattern is:

```text
R2
  complete permitted source or extracted body

D1
  identity, hash, locator, bounded excerpt, state, and relationships

Vectorize
  vector, stable identifier, record type, and minimal filter metadata

public interface
  approved summary and permitted citation-safe excerpts
```

Complete source chunks should normally remain in R2.

Any D1 excerpt field must have a defined maximum length.

Generated knowledge prose, source assertions, and vector metadata must reference canonical source versions rather than duplicate complete bodies.

## Capacity and Migration Monitoring

The implementation must include monitoring for:

* D1 database size;
* D1 row and query growth;
* slow or failed queries;
* write contention;
* R2 object count and storage;
* Queue backlog and dead-letter volume;
* Vectorize dimensions and query use;
* extraction volume;
* backfill volume;
* AI processing cost; and
* recommendation-cache age.

External infrastructure must be considered through a reviewed architecture change, not introduced reactively during an incident.

Initial review thresholds should include:

* main D1 approaching 60–70% of its applicable size limit;
* repeated query-performance failures despite indexing and precomputation;
* sustained Queue backlog outside the accepted processing window;
* R2 storage reaching a level where external cold archiving produces meaningful savings;
* retrieval scale requiring tested index separation; or
* a documented feature that cannot be implemented safely within the current services.

Cross-domain D1 separation may be considered before introducing another database technology, but only where ownership boundaries are clear and cross-database transactional behaviour is not required.

## Security and Operational Rules

* Browser code must never receive direct D1, R2, Queue, Vectorize, or external database credentials.
* Pages administrative routes must use the existing signed internal-service boundary for Worker actions.
* Production and Preview resources must remain isolated.
* Queue consumers must be idempotent.
* Imports and backfills must have dry-run estimates, budgets, concurrency limits, and kill switches.
* Uploaded files and diagnostic logs are untrusted content.
* Diagnostic uploads require type, size, retention, privacy, and deletion controls.
* Secrets, API keys, private paths, usernames, hostnames, and personal information must be redacted before model processing or publication.
* Raw diagnostic logs are private by default.
* Community hardware reports must not expose personal or machine-identifying information.
* Recommendation and diagnostic output must retain the applicable policy, calculation, compatibility, and evidence versions.
* Failure to resolve required records must produce an explicit insufficient-evidence or unsupported result, not a guessed answer.

## Implementation Sequence

This ADR does not authorise Open Model Execution Intelligence to bypass Knowledge Continuity gates.

Implementation order is:

1. Complete the required Knowledge Continuity trust and source-foundation work.
2. Add the canonical model-release, variant, artefact, and quantisation schema.
3. Add runtime, format, backend, and operating-system compatibility records.
4. Add hardware profiles, deterministic memory calculations, and observed performance reports.
5. Add reviewed installation and configuration Guides.
6. Add harness, structured-output, tool-call, and MCP compatibility tests.
7. Add known issues, diagnostic signatures, fixes, and workarounds.
8. Add the deterministic recommendation engine.
9. Add bounded TRACE explanation over the deterministic result.
10. Backfill the existing model catalogue and publish only reviewed, evidence-linked records.

The initial work should not attempt automatic recommendations until artefact identity, runtime compatibility, and hardware calculations have validated data.

## Implementation Requirements

* Add model-family, release, variant, artefact, and artefact-file records.
* Add quantisation-method and artefact-quantisation metadata.
* Add hardware-profile and context-sensitive requirement records.
* Add runtime-version, backend, format, and compatibility records.
* Add performance-observation records with complete test configuration.
* Add harness, tool-call, structured-output, and MCP compatibility records.
* Add known-issue, affected-combination, diagnostic-check, remediation, workaround, regression, and fixed-version records.
* Add deterministic memory and compatibility evaluation.
* Add recommendation snapshots containing input, policy version, calculation version, evidence identifiers, exclusions, and ranked results.
* Link all factual execution claims to Knowledge Continuity evidence.
* Link procedures to reviewed Guides rather than duplicating commands.
* Add production and Preview Queue, dead-letter Queue, and Vectorize bindings.
* Keep complete source bodies and large artefacts in R2.
* Define maximum sizes for D1 excerpts and diagnostic records.
* Add monitoring and reviewed infrastructure-expansion thresholds.
* Add tests proving that unsupported combinations are excluded deterministically.
* Add tests proving that model-generated text cannot override compatibility or evidence state.
* Add tests proving that community reports are visibly distinguished from publisher, independently reproduced, and TRACE-tested results.
* Add tests proving that lower-bit artefacts, larger contexts, and partial offload are not treated as universally equivalent.
* Add tests proving that similarity does not create compatibility or evidence.
* Add tests proving Preview processing cannot mutate production resources.

## Consequences

### Positive

* TRACE becomes useful after a model announcement, not merely informative about it.
* Users can identify the exact model artefact, runtime, settings, and setup path suitable for their hardware.
* Hardware recommendations remain explainable and version-specific.
* Tool, harness, and MCP suitability are assessed separately from general benchmark quality.
* Fixes and workarounds can be matched to exact affected combinations.
* The Knowledge Continuity evidence system is reused instead of duplicated.
* Cloudflare remains the primary operational boundary.
* External PostgreSQL and object-storage options remain available if measured scale later requires them.
* The system can distinguish publisher claims, estimates, community reports, reproductions, and TRACE testing.

### Negative

* The model catalogue requires substantial additional schema and backend work.
* Compatibility records require continuous version maintenance.
* Hardware estimates cannot replace observed testing.
* Community hardware reports require validation and privacy controls.
* Queues, Vectorize, extraction, and backfill introduce operational and cost monitoring requirements.
* Deterministic recommendation logic adds more engineering work than a purely generated answer.
* Cloudflare-native services create some platform coupling.
* Deferring PostgreSQL means future migration work remains possible if D1 becomes insufficient.

### Risks

* Incomplete artefact identity could produce unsafe or useless recommendations.
* Runtime or driver updates may rapidly stale compatibility records.
* Community reports may omit important settings.
* Quantisation quality varies by architecture and quantiser.
* A model may advertise tool support but fail in a particular harness.
* Memory estimates may understate runtime overhead.
* Source duplication could cause unnecessary D1 and Vectorize growth.
* External provider expansion could create conflicting sources of truth if introduced without a new decision.

These risks are mitigated through versioned records, freshness controls, deterministic exclusion, evidence labels, reviewed Guides, explicit uncertainty, monitoring, and fail-closed recommendations.

## Rejected Alternatives

### Store all execution guidance as Knowledge Builder documents

Rejected because prose alone cannot reliably support filtering, calculation, compatibility joins, version ranges, deterministic exclusions, or personalised recommendations.

### Let the language model infer hardware compatibility

Rejected because the answer depends on exact artefact, context, runtime, backend, driver, and hardware details. The model may explain a deterministic result but cannot be the authority.

### Add Neon immediately

Rejected because no demonstrated D1 limitation currently justifies a second relational system.

### Replace R2 with Backblaze B2 immediately

Rejected because the likely near-term savings do not justify losing native bindings and adding another operational boundary. B2 remains a future backup or cold-archive option.

### Use Firebase or Supabase

Rejected because TRACE already has an accepted Cloudflare architecture and does not require another general application backend.

### Store complete source and chunk text in D1

Rejected because it would duplicate R2 content, increase database growth, and weaken storage boundaries.

### Create a separate model-execution evidence system

Rejected because it would duplicate Knowledge Continuity source, claim, provenance, freshness, and correction semantics.

## Review Triggers

This ADR must be reviewed when:

* D1 reaches an agreed capacity threshold;
* measured workload demonstrates sustained D1 contention;
* a required PostgreSQL-only capability emerges;
* R2 storage scale makes off-platform cold archiving materially beneficial;
* Vectorize retrieval testing requires index separation;
* a new model format or execution backend cannot fit the current compatibility model;
* recommendation calculations repeatedly diverge from observed results;
* external provider use is proposed;
* Cloudflare changes a relevant service limit or capability materially; or
* privacy, copyright, licence, or security requirements change.

Any decision to add Neon, Backblaze, or another external data provider requires a new ADR or an explicit superseding amendment to this decision.
