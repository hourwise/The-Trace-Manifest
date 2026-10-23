# TRACE research: inference engines and local-model fit tools

Observation date: 2026-10-23. Sources: the repository READMEs, docs and release pages, read with WebFetch or WebSearch. The structured claims, 106 records with IDs, are in `ai-models-inference-agents-inventory.json`.
Performance figures are the projects' own or community-reported numbers. TRACE has reproduced none of them.

## 1. Comparator tools (local-LLM hardware fit)

| Tool | Live | HW select / detect | GPU DB | Quant choice | Context est. | KV cache modelled | Multi-GPU | CPU offload | Runtime suggestion | Grades / ranking | Speed est. | Install guide | Methodology published |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| canirun.ai | Yes (results not populated in capture) | Detect (GPU/Mac) | Implied | Yes (Q2_K..F16) | Shows model context window | Breakdown fields are placeholders | GPU count only | Not seen | No | S–F grades, sortable | Sort by speed | Not seen | No (/about 404) |
| canitrun.net | Yes | Select (~107) + browser detect | Yes (~107 entries) | Yes (Ollama tags) | Not seen | Not seen | Not seen | Speed penalty on spill | Ollama only | S–F grades | Bandwidth model | Ollama "Get Started" | Brief notes; "all data estimated" |
| canrunai.com | Yes | Select GPU + model | GPU rankings | Yes | Yes (stated) | Not confirmed | Not confirmed | Not confirmed | Not confirmed | GPU/model rankings | Not confirmed | Not confirmed | No |
| llmfit (CLI/TUI) | Yes (38.3k★) | Detect (CUDA, ROCm, oneAPI, Apple) | Detected, not a DB | GGUF/AWQ/GPTQ/EXL2 dynamic | Uses model context | Not documented | "Supported"; a secondary guide says VRAM is **summed** | Not documented | Ollama, llama.cpp, MLX, DMR, LM Studio | 4-axis score + fit levels | Bandwidth model + `bench` | Many package managers | Partial |
| incoherency VRAM & context calc | Yes | Manual (GPU count, VRAM/GPU, reserve) | No | FP16..Q3 | Yes, solves backwards for max context/concurrency | Yes, architecture-based (layers × KV heads × head dim) | GPU count × VRAM | Partial offload share | No | Fit verdict | No | No | Yes (formula notes) |
| flaviocopes VRAM calc | Yes | Fit table of common GPUs/Apple tiers | Small list | Yes | Yes | Simplified per-1k factor (ignores GQA/MLA) | Not modelled | Advice only | No | Verdict + headroom | No | No | Yes ("show your work") |

Patterns and gaps (feature patterns only; no datasets or formulas copied):
- The tools almost always ignore the KV cache, add a flat percentage for it, or estimate it from parameter count. Only the incoherency calculator models GQA-style KV from the architecture. None of the tools model MLA, hybrid or linear attention, or KV-cache quantisation together with concurrency.
- Multi-GPU support means at most a GPU count, or summing VRAM across cards (reported for llmfit). None of the tools models layer split versus tensor parallelism, per-card fit, KV placement per split mode, or the rule against mixing vendors.
- None of the tools models MoE expert tiering across GPU, RAM and SSD, which is now the main technique in Strata, Maya, dsx, ds4 and KTransformers.
- Runtime suggestions are tied to one runtime (Ollama) or missing. None of the tools records engine × vendor × quant-format compatibility, for example that EXL3 is CUDA-only or that NInfer only builds for sm_120a.
- None of the tools covers Intel Arc B-series beyond listing the card.

## 2. Engine capability matrix

Legend: Y = documented; P = partial, experimental or beta; N = documented as absent or out of scope; ? = not verified.

| Engine | Latest (date) | Licence | CUDA | ROCm/HIP | Vulkan | SYCL/Intel | Metal | CPU | Multi-GPU modes | CPU/RAM / MoE offload | Quant formats | OpenAI API | Anthropic API | Tool calls / structured |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Strata | 0.2.2 (2026-10-21) | MIT | Y (RTX 20–50) | Y (RX 6800+, R9700; RX6000 untested) | ? | P (Linux-only SYCL; A750, B50/B60/B70, B580) | Y | RAM tier | Layer split, 2–3 same-vendor cards; Main/Helper/Off roles; two models on two GPUs; no vendor mixing | Y: GPU/RAM/SSD expert tiers | GGUF (Q2_0, IQ2/IQ3, UD-IQ4_XS, Q8_0), NVFP4 | Y + Responses | Y | Y (tool calls, MCP) / ? |
| NInfer | no releases; master 2026-10-16 | Apache-2.0 | Y (sm_120a / RTX 5090 only) | N | N | N | N | N | N (out of scope) | Y for 35B-A3B and Qwen4Exp experts; disk NF4 PLE | .ninfer (groupwise-int, NVFP4, FP8 mix); KV BF16/INT8/FP8/NVFP4/K8V4 | Y + Responses | Y | Y parsed tool calls / ? |
| llama.cpp | b11829 (2026-10-22) | MIT | Y | Y | Y | Y (SYCL; OpenVINO in progress) | Y | Y | none / layer (default) / row (deprecated) / tensor (experimental) | Y (-ngl; MoE offload flags not re-verified) | GGUF 1.5–8 bit, KV quant | Y + Responses | Y | Y (Jinja) / Y (JSON schema, GBNF) |
| Ollama | v0.40.9 (2026-10-22) | MIT | Y | Y (ROCm v7) | Y (default) | via Vulkan only | Y (+MLX default on Apple) | Y | Auto spread if the model doesn't fit on one GPU | Partial (automatic) | GGUF; KV q8_0/q4_0 | Y | Y | ? (not re-verified) |
| LM Studio | 0.4.26 b5 (~2026-10-13) | Proprietary app | ? | ? | ? | ? | Y (Apple Silicon) | Y | GPU controls since 0.3.14; TP unverified | ? | GGUF (llama.cpp), MLX | Y + Responses | Y | Y / Y (JSON schema) |
| vLLM | v0.32.0 (2026-10-18) | Apache-2.0 | Y (CC 7.5+) | Y | N | Y (XPU; TP yes, PP beta) + Intel llm-scaler | Plugin only | Y | TP, PP, DP, EP, CP | Limited | FP8, MXFP8/MXFP4, NVFP4, INT8/INT4, GPTQ, AWQ, GGUF, compressed-tensors | Y + Responses | Y (/v1/messages) | Y parsers incl. `hf` / Y (xgrammar, guidance) |
| SGLang | v0.5.22 (2026-10-19) | Apache-2.0 | Y | Y (Instinct) | N | Y (Arc / Arc Pro B-Series, Xeon) | Y (Metal/MLX) | Y (Xeon) | Multi-GPU parallelism (TP/EP etc. not re-read) | Via KTransformers | MXFP4, NVFP4→MXFP4, FP8 | Y | Y (always on) | Y (parser needed) / Y (XGrammar default) |
| ExLlamaV3 | v1.6.4 (2026-10-20) | MIT | Y | N (not mentioned) | N | N | N | MoE offload (AVX2/512) | Tensor-parallel + expert-parallel | Y | EXL3 (QTIP-based), KV 2–8 bit | via TabbyAPI | ? | via TabbyAPI |
| ExLlamaV2 | archived | MIT | Y | ? | N | N | N | N | gpu_split | N | EXL2, GPTQ | via TabbyAPI | ? | ? |
| mlx-lm | v0.32.2 (2026-10-16) | MIT | N | N | N | N | Y | N | mx.distributed | N | MLX quants incl. NVFP4 MoE | OpenAI-like (not for production) | N | ? |
| KTransformers | v0.7.2 (2026-10-15) | Apache-2.0 | Y | Y | ? | P (Arc A770/B580 beta, no serving) | N | Y (AMX/AVX512/AVX2) | Multi-GPU | Y: hot experts on GPU, NUMA-aware CPU | INT4/INT8, GPTQ, FP8, MXFP4, RAWINT4, Unsloth GGUF | via SGLang | via SGLang | via SGLang |
| Project Maya | v1.1.24 (2026-10-22) | MIT (DFlash2 drafter CC BY-NC-ND) | Y (CC 7.0+) | P (ROCm 7) | N | N (requested in #37) | N | RAM tier | Layer split 1–16 GPUs; per-layer split on equal pairs; TP 4/8 (maya-ds4) | Y: GPU/RAM/NVMe experts; KV streaming | GGUF Maya quants, EXL3 | Y + Responses | Y | Y function tools / ? |
| dsx | main, 2026-10-23 | MIT | Y (CUDA 13) | separate MI325X runner | N | N | N | Y (AVX2/VNNI experts) | Up to 6 GPUs hold hot experts; main GPU for dense + KV | Y: GPU/RAM/SSD | T16 trellis, Q8_0, IQ4_NL | Y | Y | ? |
| DwarfStar / ds4 | no tag; docs 2026-09-17 | MIT | Y (Spark, generic) | Y (Strix Halo) | N | N | Y (primary) | Reference only | Two-Mac TP over RDMA, cross-machine PP, multi-CUDA serving | SSD expert streaming | Q2/Q4, IQ2_XXS, MXFP4 experts | ? | ? (client guides for Claude Code) | Native agent tool format |
| BaseRT | no release shown | Apache-2.0 repo; proprietary binary | GB10 only | N | N | N | Y | ? | N | ? | .base Q2–Q8, AWQ | Y | ? | Y tool calls / ? |
| llama-swap | v266 (2026-10-22) | MIT | (proxy) | | | | | | Matrix DSL for concurrent models | n/a | n/a | Y | Y | passthrough |
| Berth | v0.3.5 alpha | Apache-2.0 | Y (Linux; Windows experimental) | P (RDNA3/4) | | N | N | | One daemon per card (experimental) | Parks weights in RAM | n/a | Gateway Y | ? | n/a |
| LiteLLM | v1.106.2 (2026-10-21) | MIT (+ enterprise/) | gateway | | | | | | | | | Y | Y (/messages) | passthrough |
| OpenCode | v1.19.4 (2026-10-22) | MIT | client | | | | | | | | | consumes OpenAI-compat | | relies on the model |
| OpenHands | v1.32.0 (2026-10-23) | MIT | client | | | | | | | | | consumes OpenAI-compat | | recommends Qwen3.6-35B-A3B, context ≥ 22k |

Intel Arc B-series summary:
- Strata's SYCL engine has the most B-series evidence: B70 tested by the maintainers; B50, B60 (single and dual) and B580 (WSL2, device loss) from community reports.
- Intel llm-scaler-vllm officially supports the B60 and B70.
- SGLang lists Arc Pro B-Series as supported hardware.
- The llama.cpp SYCL doc lists the B580 as verified; the B570 appears only in a news item.
- KTransformers support is beta on the B580 and cannot serve on Intel GPUs.
- Ollama and LM Studio do not document B-series support beyond Ollama's Vulkan path.

## 3. Strata and NInfer analysis

### Strata (Niko1221/Strata)
Strata is built around one model. It packages a large MoE model (Qwen3.8-Flash-Next, plus a few smaller variants) for consumer PCs, with installers, a CLI and coding-agent integration (`strata connect`, MCP).

Memory management:
- The fit rule uses RAM + VRAM combined, minus about 5 GB reserved for the OS. The GPU holds a hot set of experts (about 4,000 of 24,576), all experts sit in RAM, and a large table is read from SSD.
- A low-RAM mode streams from SSD.
- Pin-by-need handles the Windows limit on locking RAM.
- Setup automatically shrinks context and prompt-chunk sizes.
- Fit checks include the draft model's VRAM.

Performance techniques:
- Speculative decoding with a small draft model (claimed 1.6–1.8x).
- Prompt processing in chunks of up to 8K tokens.
- Optional asynchronous expert-cache updates.
- Vendor-specific kernels: WMMA on RDNA4; XMX and ESIMD on Arc.

Multi-GPU:
- Two or three cards of the same vendor, using layer split.
- Each card gets a role (Main, Helper or Off).
- A split CPU expert pool on two-socket machines (untested on real hardware).

Differences from general-purpose runtimes:
- Strata is not a general GGUF runner. It ships a fixed catalogue of weights, and its scheduler assumes those models' expert structure.
- Its concurrency defaults to a single request.
- It reuses ggml/llama.cpp pieces but runs its own engine.

### NInfer (Neroued/ninfer)
NInfer is built around one GPU. It is a from-scratch C++/CUDA engine for a single RTX 5090 (only the sm_120a architecture is accepted) and a handful of Qwen checkpoints in its own `.ninfer` v3 format.

Memory management:
- KV pools are typed and fixed at startup, sized automatically from the memory left after the weights.
- KV pages are acquired incrementally.
- Under memory pressure, a request can be paused and resumed later, either from a snapshot or by replaying its tokens. Retained prefix checkpoints are reclaimed before any running request is paused.
- Device memory and pinned host memory are budgeted.
- MoE experts can be offloaded between CPU and GPU, and per-layer embeddings (PLE) can be read from disk in NF4.

Performance techniques:
- CUDA Graph decode for exact batch sizes.
- Chunked prefill.
- MTP and DFlash/DFlash2 speculative decoding.
- Exact-prefix reuse for agent multi-turn workloads.
- Five KV cache dtypes, including NVFP4 and the mixed K8V4.

Differences from general-purpose runtimes:
- NInfer gives up portability entirely: no multi-GPU, no other vendors, no arbitrary models, and no packaged binary.
- In exchange, it publishes per-model performance records and offers careful memory-pressure semantics.
- It is the reverse of Strata's approach. Strata stretches one model across a heterogeneous consumer PC; NInfer pushes one GPU to its limit.

Neither engine should be assumed to support models outside its published list.

## 4. Project Maya: Intel port feasibility (public material only)

- **Current state:** Maya has no Intel backend. The README names CUDA (primary) and ROCm 7 (experimental), and there is no SYCL, Intel or Metal mention. Issue #37 (2026-10-09) asked for an Arc Pro B70 SYCL target based on Strata's port. The author closed it the next day as "completed" without a maintainer reply, so no plan is evidenced.
- **Shared lineage:** Maya began as a fork of Strata and still has an `include/strata/` header path. Strata's SYCL port worked by machine-migrating its CUDA code with SYCLomatic (`dpct`), then applying `fixups.py`, without editing upstream files. That suggests a similar mechanical route could apply to Maya's `src/kernels/cuda/`. However, Maya was "rewritten for GLM-5.3-Flash" and has many model-specific kernels (DSA, KDA, KV streaming, n-gram/Engram, sparse attention), so divergence from Strata is substantial.
- **Possibly reusable pieces:**
  - The `src/kernels/` tree separates `cpu/` and `cuda/`.
  - A large set of `*_parity.cpp` tests (GLM layers, KV q4/q8/streaming, router, sampler, dequant) could act as the correctness gate for a port, as Strata's parity suite did.
  - `src/platform/` (file I/O and memory) and the plan/spec/prefill directories look backend-neutral by name. This is unverified because file contents were not read.
- **What Strata's SYCL work offers:**
  - A proven migrate-and-fix pipeline: `migrate.sh`, `fixups.py`, `merge_upstream.py`, and the Docker dev image.
  - The required oneAPI precision flags.
  - Level Zero queue and atomics workarounds.
  - A copy-engine queue.
  - Arc kernels for MoE experts (XMX launch, ESIMD int8 for Battlemage).
  - B-series operating notes: AOT target `bmg-g21`, `SYCL_CACHE_PERSISTENT=0`, about 1.5 GB VRAM headroom under `xe`, NaN guard with host-resident experts.
- **Things that will not translate directly:**
  - Inline PTX (`mma.sync`, `ldmatrix`, `cp.async`), the ggml MMQ paths and sm_90 cluster kernels have no SYCL equivalent in Strata either; they fall back to slower paths.
  - Maya's EXL3 path (exllamav3 is CUDA-only).
  - Its NCCL-style tensor parallelism in maya-ds4.
  - Its hipBLASLt/WMMA tuning.
  - Its memory-pinning assumptions. Linux `xe` overflow behaviour differs from CUDA.
  - Windows would be unsupported, as with Strata's SYCL.
- **Feasibility verdict (notes only):** A Linux-only, layer-split, GGUF-only SYCL build for B60/B70 looks plausible by following Strata's pipeline. Matching CUDA performance, EXL3, tensor-parallel and the DeepSeek engine looks unlikely without substantial hand-written Arc kernels. Validation would rely on Maya's parity tests and a dual-B70 tester, which the author of #37 offered.

## 5. URLs and items that could not be verified

- **Slipstream:** no inference engine with this name was identified after three searches. The nearest match is the PyPI package `air-rs` ("Slipstream Layer Inference Protocol"), which was not fetched. Marked RUMOURED; the intended project is needed.
- https://www.canirun.ai/about returned 404. canirun.ai results were not populated in the capture, so whether the tool works end-to-end is unconfirmed.
- https://canitrun.net/get-started returned 404. This path was guessed by TRACE; the real install-guide path was not found.
- canrunai.com: the methodology, breakdown and multi-GPU behaviour were not visible on the landing page.
- LM Studio: the 0.4.26 date (2026-10-13) comes from a search snippet, not the page. Runtime and vendor support (including Intel Arc via Vulkan) and the tensor-parallel strategy (claimed only by a third-party guide) are unverified.
- llama.cpp MoE CPU-offload flags (`--cpu-moe`, `--n-cpu-moe`, `-ot`) were not re-verified this session.
- SGLang: the Anthropic API and tool-parser details come from search summaries of docs.sglang.io; the pages were not fetched directly. Parallelism modes were not re-read.
- OpenHands: the local-LLM docs page was seen via search summary only.
- DwarfStar/ds4: there is no tagged release, and the "Server & API" compatibility page was not read.
- BaseRT and NInfer have no releases; dsx and ExLlamaV2 show no release tags.
- llmfit: how it combines multi-GPU VRAM and estimates the KV cache is not in the README (only a secondary source mentions summing).
- Release-page dates without a year are assumed to be 2026 from context.
