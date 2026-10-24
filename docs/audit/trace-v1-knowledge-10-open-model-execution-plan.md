# TRACE V1 — KNOWLEDGE-10 Workstream 5: open-model execution intelligence plan

**Date:** 23 October 2026
**Release line:** V1.2. It depends on the V1.1 evidence foundation.
**Authority:** ADR 0019 (accepted 22 July 2026). This plan does not replace or duplicate it.
**Disposition:** `OPEN_MODEL_EXECUTION_DATA_FOUNDATION_REQUIRED`
**Research basis:** `docs/research/ai-models-inference-agents-inventory.md` and `.json`, observed 23 October 2026. Every model, runtime and comparator fact below is cited there by record ID. Items marked RUMOURED or unverified are never used as catalogue facts.

## 1. ADR 0019 implementation gap analysis

| ADR 0019 component | Schema | Records (Production) | Code | UI | Status |
|---|---|---|---|---|---|
| Model family / release / variant | `models` (flat: `model_family`, `version` columns); `model_versions` | 27 models; **0** versions | `workers/ingestion/model-data.ts`: regex extraction from feed items against a **hard-coded July-era model list**, writing without evidence links | `/models`, `/models/[slug]` | **Partial, and not authoritative.** No release/variant/artefact hierarchy. Values need verification: `Qwen 2.5` and `Qwen 3` are recorded as `closed`, and `Qwen3.8` as `2.4T`. |
| Downloadable artefacts and files | none | none | none | none | **Missing** |
| Quantisation methods and artefact quantisation | `models.quantisation_options` (free text) | **0 / 27 populated** | none | none | **Missing** |
| Hardware profiles and context-sensitive requirements | `models.hardware_requirements` (free text) | **0 / 27 populated** | none | none | **Missing** |
| Runtime, backend and format compatibility | none | none | none | none | **Missing** |
| Performance observations | `benchmark_runs` (quality benchmarks, not execution performance) | 14 runs (11 vendor, 3 independent) | Rule-based extraction | `/benchmarks` | **Different concept.** Execution performance records are missing. |
| Harness / MCP / tool compatibility | `models.tool_use`, `structured_output` (booleans, from model cards) | Partial | none | Shown on model pages | **Missing** as compatibility tests |
| Guides (setup procedures) | `guides`, `guide_revisions`, `guide_sources` | 21 draft and internal guides (including Ollama and MCP); 0 sources | Guides Lab admin | `/admin/guides` | **Exists**, not yet linked to models |
| Diagnostics (symptoms, issues, fixes) | none | none | none | none | **Missing** |
| Deterministic recommendation engine | none | none | none | none | **Missing** |
| Bounded explanation | Ask gateway (deterministic-first) | n/a | Exists | Ask | **Reusable** |
| Knowledge Continuity evidence links | `canonical_claims`, `claim_assertions`, … | 0 links from the catalogue | Exists | Review UIs | **Reusable.** Catalogue → evidence links are missing (legacy-absorption doc, C4). |
| Queues, Vectorize | Preview-only bindings | Production: none | KC-03D, KC-09 | Recovery admin | Reusable, Preview only |
| Providers and pricing | `providers`, `provider_models`, `pricing_history` | 20 / 19 / **0 history** | Rule-based | `/providers` | Partial. Pricing has no history and no evidence. |

**Can reuse:**

- **TRACE Models:** the model and provider identities, slugs and public pages. Their facts are re-derived through evidence.
- **KC-08, KC-09 and KC-11:** capture, versioning, provenance, freshness, retrieval, citation and bounded backfill.
- **Guides Lab:** procedures.
- **The Ask gateway:** explanation.

**Needs later bounded missions:** every row marked Missing. The sequence is in §16.

**Do not extend `model-data.ts`.** Regex extraction from news feeds with a static model list cannot produce artefact-level, versioned and evidenced records. It is also a candidate D1 read hotspot: it uses `NOT IN (SELECT … FROM pipeline_stages)` over a 7-day window. Its writes are a legacy class D source for catalogue absorption.

## 2. Comparable products

Six live tools were reviewed (inventory `CMP-*`): canirun.ai, canitrun.net, canrunai.com, llmfit, the incoherency VRAM/context calculator and the flaviocopes calculator.

**Useful patterns:**

- hardware selection, with optional detection;
- fit grades;
- a choice of quantisation per model;
- calculators that solve backwards ("maximum context for this hardware");
- a "show your work" breakdown;
- a runtime-specific install hand-off.

**Common gaps,** which are TRACE's opportunity:

- The KV cache is usually ignored, guessed as a flat percentage or estimated from parameter count. Only the incoherency calculator works it out from the architecture (layers × KV heads × head dimension).
- Multi-GPU support is at most a GPU count. Summing VRAM across GPUs is reported for one tool. None models layer split versus tensor parallelism, per-card fit or vendor mixing.
- None models MoE expert tiering (GPU, RAM, SSD), which is now central to Strata, Maya, dsx, ds4 and KTransformers.
- Runtime advice is tied to one runtime (often Ollama) or missing. None records engine × vendor × format compatibility.
- None covers Intel Arc B-series beyond listing the card.
- None links a recommendation to versioned evidence.

**Differentiation:** recommendations that are evidence-backed, versioned, workload-aware, explainable and linked to compatibility records. **No third-party dataset or scoring formula is copied.**

## 3. Hardware and workload input schema

The schema records `unknown` explicitly; nothing is guessed.

```json
{
  "schemaVersion": "trace-hw-profile-v1",
  "hardware": {
    "cpu": { "model": "unknown|string", "architecture": "x86_64|arm64|unknown", "isa": ["avx2","avx512","amx"] , "sockets": 1 },
    "systemRamGb": "number|unknown",
    "gpus": [ { "vendor": "nvidia|amd|intel|apple|unknown", "model": "string|unknown", "vramGb": "number|unknown", "count": 1,
                "pcie": { "gen": "number|unknown", "electricalLanes": "number|unknown" } } ],
    "memoryModel": "dedicated|unified|unknown",
    "os": "linux|windows|macos|unknown", "osVersion": "string|unknown",
    "driversBackends": ["cuda-13","rocm-7","oneapi-2026","vulkan","metal"],
    "diskFreeGb": "number|unknown",
    "constraints": { "powerW": "number|unknown", "noise": "low|any|unknown" }
  },
  "workload": {
    "primary": "chat|coding_assistant|coding_agent|research|creative|roleplay|long_documents|rag|tool_calling|mcp_agents|vision|image_video|concurrent_workers",
    "contextTokens": "number|unknown", "concurrentWorkers": "number|unknown", "harness": "opencode|claude_code_gateway|codex|other|unknown"
  },
  "preferences": { "optimiseFor": "speed|quality|balance|long_context|min_memory|privacy|power|easy_install|max_workers", "allowOffload": "yes|no|unknown" },
  "privacy": { "retain": false }
}
```

**Rules:**

- Browser detection (`navigator.gpu` / WebGL renderer strings) is **a convenience hint only**. It cannot establish VRAM, RAM or topology, so values from it are labelled `detected_unverified`.
- Profiles are **not retained** by default, and the profile is never sent to an inference provider.
- Retention needs a user-facing privacy policy (ADR 0019 security rules).

## 4. Catalogue fields

These follow the ADR 0019 hierarchy, with each level kept distinct:

```text
publisher → model family → model release → checkpoint (revision SHA) → variant (base | instruct | reasoning | coding | multimodal)
  architecture: dense | moe (experts, top-k, shared) | hybrid-attention notes
  parameters: total, active (MoE), embedding/MTP extras stated separately
  native context, tested context, modalities, tool-calling declaration, chat template, licence (+ conditions)
  → downloadable artefact (repo + revision, publisher | quantiser)
      format: safetensors-bf16 | fp8 | nvfp4 | mxfp4 | gguf | exl3 | awq | gptq | mlx | runtime-specific
      quantisation: method, bits (nominal / effective bpw), group size, imatrix, mixed-precision map
      files: names, sizes, SHA-256, shards
      verification date, review state, known incompatibilities, evidence links (assertion IDs)
```

**Formats and quantisations are not interchangeable.** NVFP4 is native only on Blackwell; elsewhere the gain is memory only. EXL3 is CUDA-only. MXFP4 support in mainline llama.cpp is **DISPUTED** in the inventory. An artefact is recommendable only when a runtime record supports its exact format and architecture.

## 5. Runtime and backend requirements

There is one runtime record per runtime **version**. Each record holds:

- architectures and model families;
- formats and quantisations;
- operating systems;
- GPU vendors and generations;
- backends (CUDA, ROCm/HIP, Vulkan, SYCL/oneAPI, Metal, CPU ISA);
- multi-GPU modes;
- offload modes (layers, MoE experts, KV);
- KV-cache dtypes;
- context limits;
- batching and concurrency;
- APIs (OpenAI, Responses, Anthropic `/v1/messages`);
- tool-call parsers and structured-output engines;
- install method and complexity;
- known regressions and fixed versions;
- maintenance status, licence and release date.

The inventory's engine matrix (`ENG-*`) covers 19 engines and gateways. Highlights for the pilot:

| Engine | Why it matters | Caveat |
|---|---|---|
| llama.cpp | Widest backend coverage (CUDA, ROCm, Vulkan, SYCL, Metal, CPU); layer split; GGUF 1.5–8 bit; KV quantisation; OpenAI-style and Anthropic-style APIs | MoE CPU-offload flags not re-verified |
| vLLM | Tensor and pipeline parallelism, FP8, NVFP4, MXFP4, AWQ, GPTQ; tool parsers; Anthropic `/v1/messages`; Intel XPU path | Limited CPU offload |
| SGLang | Arc Pro B-series listed; XGrammar structured output | Some details seen only through search summaries |
| Ollama | Easiest install; Vulkan default; auto multi-GPU spread | Few controls |
| MLX / mlx-lm | Apple Silicon | Its API is not for production |
| ExLlamaV3 | EXL3 quality per bit; tensor and expert parallelism | CUDA only; served through TabbyAPI |
| KTransformers | CPU/GPU MoE hybrid (NUMA, AMX) | Intel GPU support is beta |
| Strata, Maya, dsx, ds4 | Specialist large-MoE tiering engines | Fixed model catalogues (§6) |

## 6. Strata and NInfer

| | **Strata** (Niko1221/Strata, 0.2.2, 21 Oct 2026, MIT) | **NInfer** (Neroued/ninfer, Apache-2.0, no release) |
|---|---|---|
| Design centre | One large MoE model on a heterogeneous consumer PC | One GPU (RTX 5090, sm_120a only) pushed to its limit |
| Models | Fixed catalogue (Qwen3.8-Flash-Next plus a few smaller ones) | A handful of Qwen checkpoints in its own `.ninfer` v3 format |
| Memory | Expert tiering: hot experts in VRAM (~4k of 24,576), all in RAM, table on SSD. RAM + VRAM fit minus an OS reserve. Low-RAM SSD streaming. | Typed KV pools fixed at startup; incremental KV pages; request pause/resume under pressure; budgeted pinned host memory; CPU/GPU expert offload; NF4 per-layer embeddings from disk |
| Performance | Draft-model speculative decoding (claimed 1.6–1.8×); 8K chunked prefill; vendor kernels (WMMA on RDNA4; XMX/ESIMD on Arc) | CUDA Graph decode; chunked prefill; MTP and DFlash speculative decoding; exact-prefix reuse for agents; five KV dtypes including NVFP4 |
| Backends | CUDA, HIP, Metal; **Linux-only SYCL** with Arc B-series evidence (B70 maintainer-tested; B50, B60, B580 community) | CUDA sm_120a only |
| Multi-GPU | 2–3 same-vendor cards, layer split, role per card; no vendor mixing | Out of scope |
| TRACE treatment | `runtime` records scoped to its published model list. Performance claims are `runtime_developer` class, `ANNOUNCED`. | Same. Exclude any non-5090 or non-listed model. |

**Neither engine is assumed to support models outside its published list.**

**The Project Maya Intel-port idea** (research intake) is recorded in the inventory as a feasibility note only:

- A Linux-only, layer-split, GGUF-only SYCL build for B60/B70, following Strata's SYCLomatic-plus-fixups pipeline, is plausible.
- CUDA parity, EXL3, tensor parallelism and the DeepSeek engine are unlikely without hand-written Arc kernels.
- Issue #37 was closed by its author with no maintainer plan.

## 7. Memory and context-fit calculation

**Deterministic and versioned.** Every result stores its inputs, the formula version and the evidence IDs.

```text
weights_bytes      = Σ artefact file sizes actually loaded on the device set (not params × bits; use the artefact's real files)
kv_bytes           = context_tokens × layers_with_kv × 2 (K,V) × kv_heads × head_dim × kv_dtype_bytes × concurrent_sequences
                     (architecture-specific: MLA/latent, linear/DeltaNet and sliding-window layers use their own terms; unknown → "kv_unknown", no guess)
compute_buffers    = runtime-version-specific (from runtime record or observed; else labelled estimate)
runtime_overhead   = runtime record value (e.g. CUDA context) or observed
modality_memory    = vision/audio encoder weights + activations when enabled
reserved           = display/OS reservation per GPU (configurable; default from hardware profile)
total_per_device   = placement(weights, kv, buffers) per split mode (§8) + overhead + reserved
```

**Levels (ADR 0019):**

| Level | Meaning |
|---|---|
| `will_load` | Fits at the minimum context |
| `minimum_usable` | Fits at the workload's minimum context, concurrency 1 |
| `recommended` | Fits at the requested context and concurrency, with headroom of at least 10% per device |
| `production_or_agent_use` | `recommended` **and** a harness or tool-compatibility record of `works` or `works_with_configuration` |

**Memory fit stays separate from runtime compatibility, quality and speed.** A configuration can be `recommended` for memory and still excluded for agent use.

**MoE models:** stored weights determine memory. Active parameters affect speed only. Offloaded experts count against RAM (and SSD for streaming engines). Speed is then `unknown` unless observed.

## 8. Multi-GPU and offload rules

| Mode | Rule |
|---|---|
| One model split by layer (pipeline) | Per-device fit. KV is placed per the runtime's documented rule. The slowest link bounds throughput. **Never one pooled device.** |
| Tensor parallelism | Only where the runtime supports it for that architecture and vendor. Usually needs same-model, same-VRAM cards. |
| Separate models on separate GPUs | Each device is evaluated alone. This is the recommended pattern for supervisor plus worker or for two concurrent coding workers. |
| GPU + CPU/RAM offload | `minimum_usable` at most, unless observed performance evidence exists. Speed is labelled. |
| MoE expert offload or tiering | Only for runtimes documenting it for that model family (Strata, KTransformers, Maya, dsx, ds4, llama.cpp expert flags once verified) |
| Mixed vendors | Excluded, except where a runtime documents it (for example llama.cpp Vulkan multi-device). It is then `experimental` unless TRACE has tested it. |
| Undocumented combinations | `unverified`, never assumed to work |

**Two 16 GB GPUs are not one 32 GB GPU.** A 125B MoE with about 6B active parameters is sized by its stored weights.

**Small verifier plus large coder.** Two separate resident models (for example a 27–35B coder on the 32 GB card and a small reviewer on the 16 GB card) avoid cross-card transfer and allow independent review. This is generally more practical than splitting one very large model across mismatched cards. It is evaluated as scenario H11.

## 9. Workload-specific recommendation policy

| Pick | Ranking inputs (in order) |
|---|---|
| Best coding / agent | Tool-call and harness compatibility status; independent coding evaluations (version and harness matched); long-context behaviour; then memory fit, then speed |
| Best creative | Instruction following, coherence and style evidence; quantisation tolerance (higher bits preferred) |
| Best general | Reliability, responsiveness, ease of install |
| Best multi-agent | Number of resident workers that reach `recommended`; per-worker context; runtime batching support |
| Fastest usable | Observed speed only; otherwise "unknown" ranks below observed |
| Highest quality that fits | Independent quality evidence among `recommended` |
| Best low-memory | Smallest `recommended` artefact with acceptable quality evidence |
| Best experimental | Clearly labelled; never the default |
| Best upgrade path | The smallest hardware change that moves a workload up one level |

**Rules:**

- Never default to the largest model that fits.
- Low-bit quantisation (≤ 3 bpw) is excluded from `production_or_agent_use` without evaluation evidence for that workload. The inventory found **no source testing agentic coding per quant at equal file size**. GSQ-RCO reports only LiveCodeBench.

## 10. Agent, harness and tool-calling compatibility

**Targets:**

- OpenCode;
- Claude Code-compatible gateways (Anthropic `/v1/messages` on vLLM, SGLang, llama.cpp, LiteLLM);
- Codex-compatible tooling;
- MCP hosts and clients;
- OpenAI and Anthropic APIs;
- structured JSON;
- function calling;
- multi-step tools;
- concurrent requests.

**Test protocol** (TRACE-tested records):

- invalid-argument handling;
- format errors;
- reasoning leakage into arguments;
- looping and repetition;
- context exhaustion;
- stop tokens;
- schema validation;
- interpretation of tool results;
- task completion on a fixed task set;
- `pass^k` over repeated runs.

**Statuses:** `works`, `works_with_configuration`, `partial`, `experimental`, `known_broken`, `unsupported`, `unverified`.

Each record is keyed by artefact × runtime version × parser × harness version.

**A model card's "supports tools" is never a compatibility record.**

## 11. Source acquisition and evidence governance

**Evidence classes (ADR 0019):** `publisher_stated`, `runtime_developer_stated`, `trace_deterministic_estimate`, `community_report`, `independently_reproduced`, `trace_tested`.

**Performance records hold:**

- the artefact and quantisation;
- engine and version;
- GPUs, CPU, RAM and OS;
- backend and driver;
- context and batch size;
- prompt-processing and generation speed;
- concurrency and offload;
- methodology, date and source;
- verification status.

**Sources:**

| Class | Sources |
|---|---|
| Primary | Hugging Face card and API metadata (revision SHA, file hashes); GitHub releases and docs; vendor specifications (CUDA, ROCm and oneAPI support matrices) |
| Independent | Reproducible benchmarks and tests |
| Community | Reddit, issues and user configurations: always `community_report` and routed to review |

**Update triggers** (local acquisition, §5–6, or manual while STOP-BURN is active):

- new model revision or artefact;
- quantisation withdrawn;
- runtime release adding or dropping support;
- driver regression;
- benchmark correction;
- bug fixed in version X.

**Review intervals:** runtime support 90 days; artefacts on revision change; performance 180 days or on runtime major version.

## 12. Initial catalogue pilot (proposed selection; verified 23 October)

**Models: 14 releases, all with open weights and VERIFIED in the inventory:**

| Group | Models |
|---|---|
| Dense ~27–31B | Qwen3.8-27B (Apache-2.0); Gemma 4 31B (Apache-2.0) |
| Small MoE ~24–40B | Qwen3.6-35B-A3B (Apache-2.0); Ornith-1.5-35B (MIT); Sage-A1.5 (Apache-2.0); Flint (Apache-2.0; SWE-bench Pro **v2** score not comparable); LFM2.5-24B-A2B (LFM Open License); KRAFTON Raon-1 mini preview (Apache-2.0; NVFP4) |
| Large MoE (hybrid / tiering) | Qwen3.8-Flash-Next (Qwen Community License 1.0); GLM-5.3-Flash (MIT); DeepSeek-V4.1-Flash (MIT) |
| Very large (upgrade-path and "won't fit" cases) | Kimi K3 (Kimi K3 License; MXFP4); Muse Spark Open (Muse Model License); Step-5-Preview (StepFun Model License) |

**Excluded:**

- Qwen 4 tiers and Kimi K3.1 (rumoured);
- Tiel Coder (a re-quantisation of Ornith-1.5, recorded as an artefact, not a model);
- Swift 1.5 (a fine-tune, recorded as a variant with its own licence).

**Artefacts:** official BF16/FP8 releases; Unsloth UD GGUF (Q4_K_M, Q5_K_M, Q6_K, Q8_0); one GSQ-RCO and one BaseQuant tier for Qwen3.8-27B (the equal-file-size comparison); the official NVFP4 artefacts where published.

**Runtimes (8):** llama.cpp, vLLM, SGLang, Ollama, MLX-lm, ExLlamaV3, KTransformers, Strata. NInfer is added as a scoped specialist record.

**Hardware profiles:** the 13 in §14, including the reference workstation.

**Ownership under ADR 0019:**

| Fact type | Owner |
|---|---|
| Model, release, artefact, quantisation, runtime support, performance, compatibility | **TRACE Models** structured records |
| Sources, claims, provenance, freshness for every fact above | **Knowledge Continuity** |
| Installation and configuration procedures (llama.cpp / Ollama / vLLM / MLX setup; the existing Ollama guide) | **Guides Lab** |
| Known failures (for example tool-call parser mismatches, driver regressions, B-series `xe` VRAM headroom) | **Diagnostics** |

## 13. Hardware and model evaluation matrix

The **16 scenarios** with expected deterministic outcomes are in `tests/fixtures/knowledge-10/ask-evaluation-suite.json` (`hardware`, H01–H16) and the Ask evaluation doc, §3. They cover:

- fit;
- context overflow;
- runtime incompatibility;
- chat versus agent;
- dense versus MoE;
- splitting;
- offload;
- AMD and Intel gaps;
- Apple unified memory;
- creative versus coding;
- two workers;
- low-bit quantisation;
- missing benchmarks;
- misleading community claims;
- licences;
- refusing a precise speed.

**No observed results are invented.** The current outcome of every scenario is `insufficient_evidence`.

## 14. Hardware profiles for the pilot

| # | Profile |
|---|---|
| 1 | CPU-only, 16–32 GB RAM |
| 2 | NVIDIA 8 GB |
| 3 | NVIDIA 16 GB (for example RTX 5060 Ti / 4060 Ti) |
| 4 | NVIDIA 24 GB (RTX 3090) |
| 5 | 32 GB workstation card |
| 6 | 2 × 16 GB |
| 7 | 2 × 24 GB |
| 8 | 32 GB + 16 GB (mixed) |
| 9 | Mixed-generation NVIDIA (for example Volta + Ada) |
| 10 | AMD 24–32 GB (7900 XTX, R9700) |
| 11 | Intel Arc 16–32 GB (B50, B60, B70) |
| 12 | Apple Silicon 64–128 GB unified |
| 13 | **Reference workstation:** Arc Pro B70 32 GB + RTX 5060 Ti 16 GB + 128 GB RAM (mixed vendor, so the "separate models per GPU" pattern applies) |

The vendor specification and software-support details for each are in the inventory's hardware section (`HW-*`).

## 15. Interaction concept and freshness policy

**Interaction concept.** Worked example: "RTX 3090 24 GB, 64 GB RAM, Linux, autonomous coding."

1. **Clarify** only what changes the answer: context size, concurrent workers, speed versus quality, and willingness to offload. Unknowns are kept as unknown.
2. **Deterministic service** applies, in order: candidates, memory eligibility (§7), runtime compatibility (§5), agent compatibility (§10), ranking (§9), then alternatives and uncertainty.
3. **The answer card** shows:
   - the recommended release and variant;
   - the artefact (repository, revision, format, quantisation, size);
   - the runtime, backend and version, with the reason;
   - the memory breakdown and headroom;
   - performance, as an observed record with its configuration or labelled "estimate" / "unknown";
   - agent compatibility status;
   - three alternatives (faster, higher quality, easier install);
   - the setup Guide link;
   - confidence and provenance (which facts are publisher-stated, reproduced or TRACE-tested).
4. **Optional LLM explanation** of the card. It cannot change the card.

**With insufficient records the result is "TRACE can't recommend an exact configuration for this yet",** plus the nearest verified facts and a question-gap entry. The existing open gap, "best open model for running on ram not gpu", is exactly this case.

**Freshness policy:**

| Record | Review |
|---|---|
| Runtime support | 90 days |
| Artefact | On revision change |
| Pricing | 30 days |
| Performance | 180 days or on runtime major version |
| Compatibility | On runtime or harness version change |
| Hardware specification | 365 days |

Superseded artefacts are kept as history.

## 16. Implementation slices (smallest first; each needs its own approval)

| # | Slice | Depends on | Size |
|---|---|---|---|
| OM-1 | Schema (migration): family / release / variant / artefact / artefact-file / quantisation, plus catalogue → claim/assertion links | V1.1 evidence route proven (seeding pilot) | M |
| OM-2 | Runtime-version, backend, format and OS compatibility records; review UI | OM-1 | M |
| OM-3 | Hardware profiles plus the deterministic memory calculator (pure functions, exhaustive unit tests: no VRAM summing, MoE stored weights, KV by architecture) | OM-1 (can be built in parallel as a library) | M |
| OM-4 | Manual catalogue pilot on Preview: the §12 selection, captured through the KC-11 route, reviewed | OM-1, OM-2, seeding pilot | M |
| OM-5 | Harness and tool compatibility records plus a TRACE-tested protocol (workstation; local) | OM-2; local acquisition phase C | L |
| OM-6 | Diagnostics records; Guides linkage | OM-2 | M |
| OM-7 | Deterministic recommendation service plus `/admin` preview; Ask integration with explanation | OM-3, OM-4 | M |
| OM-8 | Public hardware-aware Ask | OM-7 plus the hardware evaluation suite passing | S |

**Smallest practical first step after KNOWLEDGE-10:** **OM-3 as a pure library with tests.** It needs no schema, no data and no deployment, and it encodes the ADR rules immediately. OM-1 follows once the V1.1 seeding pilot has proven the evidence route the catalogue must link to.

## 17. Disposition

**`OPEN_MODEL_EXECUTION_DATA_FOUNDATION_REQUIRED`.**

ADR 0019's architecture fits the existing system with no conflict: no architectural gap. Almost none of its data structures exist, and the current catalogue is regex-extracted and unevidenced.

**The pilot needs:**

- the artefact, runtime and hardware schema (OM-1 to OM-3);
- a verified catalogue captured through Knowledge Continuity (OM-4).
