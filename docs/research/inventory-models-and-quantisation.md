# TRACE Task B: open-weight models and quantisation (observed 2026-10-23)

Companion to `ai-models-inference-agents-inventory.json` (MOD-/QNT- records). Metadata only. No weights were downloaded, nothing was run, and there was no sign-in.

**State key:** VERIFIED = confirmed on the publisher's primary page. ANNOUNCED = the publisher's own claim, for example a self-reported benchmark, not independently reproduced. COMMUNITY_REPORTED = third-party or secondary source only. RUMOURED = no primary evidence. DISPUTED = sources conflict. SUPERSEDED = replaced.

## 1. Model table

| Model (task name -> official) | Publisher (identity check) | Status / date | Arch | Params total / active | Context | Licence | Official artefacts | Runtime support (official) | State |
|---|---|---|---|---|---|---|---|---|---|
| Qwen 3.8 27B -> **Qwen3.8-27B** | Qwen / Alibaba (HF `Qwen`) | Weights released, Aug 2026 (repo updated 14 Aug) | Dense + vision encoder | 27B (Hub 28B) | 262,144 (1M via YaRN) | Apache-2.0 | BF16, FP8 | Transformers, vLLM, SGLang, TokenSpeed, Docker MR | VERIFIED |
| Qwen 3.8 Flash Next -> **Qwen3.8-Flash-Next** | Qwen | Weights released, late Aug 2026 | Hybrid DeltaNet/QSA MoE, 512 experts | 125B LM + 51B n-gram + 4B MTP (180B) / 6B | 262,144 (1M via YaRN) | **Qwen Community 1.0** (not Apache) | BF16, FP8 | Transformers, vLLM, SGLang, TokenSpeed | VERIFIED |
| DeepSeek V4.1 Flash -> **DeepSeek-V4.1-Flash** (+ **-1017** update) | DeepSeek (`deepseek-ai`, api-docs.deepseek.com) | Weights + API 10 Sep 2026; 1017 update 17 Oct | MoE, causal encoder-decoder 20+20 layers | 552B (Hub 763B) / 8B prefill, 16B decode | 1M | MIT | BF16/FP8/I8 safetensors; no Jinja template | vLLM, SGLang, Transformers | VERIFIED |
| GLM-5.3 Flash -> **GLM-5.3-Flash** | Z.ai / Zhipu (`zai-org`, links z.ai) | Weights, Aug 2026 (20 vs 26 Aug disputed) | MoE, sparse + linear attention, mHC, multimodal | 320B / 18B | 1M (API docs); card silent | MIT | BF16, FP8 | SGLang, vLLM (dedicated image), TokenSpeed, Transformers, KTransformers | VERIFIED |
| Recursive Flint 40B-A2.5B -> **Flint** (`flint-v1.0`) | Recursive Superintelligence, Inc. (recursive.com links `RecursiveSI`) | Weights 21 Oct 2026 | MoE 256 experts top-6 + shared | 39.8B / ~2.5B | 262,144 (512K blog claim DISPUTED) | Apache-2.0 | BF16 (~80 GB); NVFP4 and Apple builds referenced | SGLang kit (primary), vLLM; no Transformers modelling code yet | VERIFIED |
| Sage-A1.5 35B-A3B -> **Sage-A1.5** | InternScience / Shanghai AI Lab (arXiv 2610.28578) | Weights + paper 20 Oct 2026 | MoE (qwen3_5_moe), from Qwen3.6-35B-A3B + Agents-A1 | ~36B / ~3B (inferred) | 262,144 (512K YaRN) | Apache-2.0 | BF16 | Transformers, vLLM, SGLang | VERIFIED |
| Ornith-1.5 35B -> **Ornith-1.5-35B (A3B)** | Ornith Team (ornith.ai links `ornith-ai`); DeepReinforce link unconfirmed | Weights Aug 2026 | MoE (qwen3_5_moe) | ~35B (36B) / ~3B | 262,144 (1M YaRN) | MIT | BF16 + official GGUF | Transformers >=5.8.1, vLLM >=0.19.1, SGLang >=0.5.9, llama.cpp | VERIFIED |
| Qwen 3.6 35B-A3B -> **Qwen3.6-35B-A3B** | Qwen | Weights Apr 2026 | Hybrid DeltaNet MoE, 256 experts | 35B / 3B | 262,144 (~1M YaRN) | Apache-2.0 | BF16 | Transformers, vLLM >=0.19, SGLang >=0.5.10, KTransformers | VERIFIED |
| Qwen 4 (27B/Flash/Plus/Max) | Alibaba (Apsara, 22 Sep 2026) | Announced "in training"; no weights | n/a | n/a | n/a | n/a | none | n/a | ANNOUNCED (tiers RUMOURED) |
| Kimi K3 | Moonshot AI (`moonshotai`) | Hosted 16 Jul; weights ~27 Jul 2026 | MoE 896 experts (16 + 2 shared), KDA + MLA | 2.8T / 104B | 1,048,576 | Kimi K3 License (MIT-style + MaaS >$20M clause) | MXFP4 weights (QAT) / MXFP8 activations | vLLM, SGLang, TokenSpeed | VERIFIED |
| Kimi K3.1 | n/a | No card, weights or API | n/a | n/a | n/a | n/a | none | n/a | RUMOURED |
| LFM 2.5 24B-A2B -> **LFM2.5-24B-A2B** | Liquid AI (`LiquidAI`) | Weights ~13 Oct 2026 | MoE conv+GQA hybrid, 64 experts top-4 | 24.0B / 2.45B | 131,072 | LFM Open License v1.0 | BF16, FP8, GGUF, ONNX, MLX-4bit | Transformers, vLLM, SGLang, llama.cpp, MLX | VERIFIED |
| Tiel Coder 35B | Anonymous HF user (`peculiar-ragdoll`, duplicated by `dotnfc`) | Community GGUF | **Re-quant of Ornith-1.5** + custom template (not a new model) | 35B / 3B | inherits | MIT (inherited) | GGUF + MTP | llama.cpp | VERIFIED (as re-quant) |
| StepFun recent -> **Step-5-Preview** | StepFun (`stepfun-ai`) | Weights ~15 Oct 2026 (metadata present) | Sparse MoE | 600B (604B) / 27B | 1M (in+out) | StepFun Model License 1.0 (Apache-style + conditions) | BF16, FP8 | vLLM, SGLang, Transformers | VERIFIED |
| Gemma 4 | Google DeepMind (`google`) | Released 2 Apr 2026 | E2B, E4B, 12B Unified, 26B-A4B MoE, 31B dense | 31B: 30.7B dense; 26B: ~3.8B active | 128K (edge) / 256K | Apache-2.0 | BF16 | Transformers, vLLM, SGLang | VERIFIED |
| "Swift 1.5" Qwen variants -> **Swift-1.5-Qwen3.8-27b** | UkisAI (ukisai.com) | Fine-tune, ~Sep 2026 | Dense (Qwen3.8-27B base) | 27B | 262,144 | Swift Open License v1.0 (free up to $1M revenue) | BF16, GGUF, GSQ-RCO GGUF, AWQ/AutoRound INT4, NVFP4, Quark FP8, MLX | vLLM, SGLang, llama.cpp, MLX | VERIFIED (no other bases found) |
| Korean 30B MoE (gaming studio) -> **KRAFTON Raon-1 mini preview** | KRAFTON (`KRAFTON`, links krafton.ai) | Preview weights 21 Oct 2026, gated (auto-approve) | Hybrid MoE (Raon Delta Attention + MLA), 128 experts | 28.8B / 4.3B | 262,144 | **Apache-2.0 (confirmed)** | MXFP8 base, **NVFP4 (confirmed)**, MLX, GGUF, DFlash2 draft | Transformers, SGLang, vLLM (KRAFTON fork, beta), llama.cpp (KRAFTON branch) | VERIFIED |
| Muse Spark | Meta Superintelligence Labs | Apr 2026, proprietary (API/app) | n/a | n/a | n/a | proprietary | none | n/a | COMMUNITY_REPORTED |
| Muse Spark Open | Meta (`meta-models`; card names Meta Platforms) | Weights 15 Oct 2026, gated | MoE 256 experts top-8 | 816B (822B) / 42B | 1M | Muse Model License (attribution + MaaS >$20M) | BF16, NVFP4 | SGLang, vLLM, TRT-LLM, Transformers, llama.cpp, MLX | VERIFIED |

### Coding and agent benchmark claims (all ANNOUNCED unless marked otherwise)

| Model | Headline coding/agent claims | Harness | Independent? |
|---|---|---|---|
| Qwen3.8-27B | TB2.1 73.0; SWE-Pro 61.7 (refined set); LCB v6 90.3 | Claude Code / Terminus | No. KRAFTON re-ran: SWE-V 74.6, LCB 79.3 |
| Qwen3.8-Flash-Next | SWE-Pro 62.5; DeepSWE 58.7 (best of 2 harnesses); LCB v6 91.9 | Claude Code, mini-SWE | No |
| DeepSeek-V4.1-Flash | TB2.1 90.6; DeepSWE 74.2; NL2Repo 64.0 | DeepSeek Harness, mini-SWE | No |
| GLM-5.3-Flash | TB2.1 84.3; DeepSWE 63.4 | Claude Code 2.1.207, mini-swe-agent | No |
| Flint | **SWE-bench Pro v2** 89.7 (different benchmark version, so not comparable); SWE-V 74.2; TB2.1 54.9 | mini-swe-agent, Terminus 2 | No |
| Sage-A1.5 | SWE-Pro 61.2; BrowseComp 81.7 | mini-SWE-agent (open eval framework) | No |
| Ornith-1.5-35B | SWE-V 79; SWE-Pro 59.6; TB2.1 67.8 / 68.5 | OpenHands; Terminus-2 / Claude Code | No |
| Qwen3.6-35B-A3B | SWE-V 73.4; TB2.0 51.5 | internal scaffold | Others measure 63-66 SWE-V |
| Kimi K3 | TB2.1 88.3; DeepSWE 67.5; Arena Frontend Code #1 (COMMUNITY_REPORTED) | Kimi Code | Arena only |
| LFM2.5-24B-A2B | SWE-V 51.0 (OpenCode) | OpenCode | No |
| Raon-1 mini | SWE-V 70.8; LCB 81.6; TB-Lite 47.0 | n/s | No |
| Muse Spark Open | TB2.1 76.4; DeepSWE 60 | Terminus 2 / "preferred" | No |
| Swift 1.5 | LCB 81.71 vs 76.76 base (32K output cap); TB2.1 72.13 | vLLM 5 seeds | No |

### DeepSeek API (TRACE Ask gateway allowlist), observed 2026-10-23

Source: https://api-docs.deepseek.com/quick_start/pricing (page undated). USD per 1M tokens, peak price, with the off-peak price (50%) in brackets.

| API name | Served model | Cache hit | Cache miss | Output | Notes |
|---|---|---|---|---|---|
| `deepseek-flash` | DeepSeek-V4.1-Flash-1017 | 0.006 (0.003) | 0.30 (0.15) | 1.20 (0.60) | vision; concurrency 2500 |
| `deepseek-v4-pro` | DeepSeek-V4-Pro-0813 (per page) | 0.044 (0.022) | 1.32 (0.66) | 3.96 (1.98) | no vision; concurrency 500; **DISPUTED routing** (see below) |
| `deepseek-v4-flash` (legacy) | retired, served by V4.1-Flash-1017 at Flash price | | | | **SUPERSEDED**: migrate allowlist to `deepseek-flash` |

- Peak hours are 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday. Context is 1M and max output is 384K. Both models support tool calls, JSON output, the Anthropic-compatible API, and FIM (non-thinking only).
- **Conflict:** the 2026-09-10 news post says `deepseek-v4-pro` routes to V4.1-Flash at Flash rates from 2026-09-14 until V4.1-Pro launches. The current pricing page still lists V4-Pro-0813 with Pro prices.
- Search and Fetch tools cost $0.75 per 1,000 calls. Server-side harness use is free until 2026-10-31 16:00 UTC.

## 2. Quantisation and speculative-decoding table

| Item | What it is | Key claims | Evidence type | Coding eval at equal file size? | State |
|---|---|---|---|---|---|
| BaseQuant V1 (basecompute) | Qwen3.8-27B GGUF and baseRT bundles at 10.93 / 16.41 / 20.82 GB, matched to Unsloth sizes; method undisclosed | KL 17-34% closer to BF16 than same-size Unsloth (about 15% on public prompts) | Vendor KL measurement; sample sizes not stated | **No**. The "15% more accurate" headline is KL, not task accuracy | ANNOUNCED / headline DISPUTED |
| GSQ-RCO (ISTA DASLab) | Gumbel-Softmax scalar quant plus Riemannian budgeted type allocation, output as standard GGUF; 8.4-11.8 GB tiers | Beats Unsloth UD at matched size on LCB v6 (+4.57 at 8.4 GB, +1.71 at 12 GB), AIME25 and GPQA (mixed at 12 GB) | Academic lab card plus arXiv 2604.18556 | **Yes (LiveCodeBench v6 only)**; seeds and subset size unknown | VERIFIED / ANNOUNCED |
| Q-Strata ("Strata") | MoE bi-level mixed-precision bit allocation (arXiv 2608.30564, EMNLP 2026) | Lower WikiText2 PPL than GPTQ, MxMoE, GEMQ | Paper | No (perplexity only) | VERIFIED; no HF "Strata" quants found |
| ByteShape ShapeLearn | Per-tensor learned datatypes; Qwen3.8-27B GGUF 2.56-3.84 bpw (8.8-13.1 GB) plus MTP | Relative-to-BF16 quality including LCB v6 and HumanEval; 147-176 tok/s on RTX 5090 with MTP / DFlash 2 | Vendor charts (image only) | Charted vs other GGUFs but **no numbers** | ANNOUNCED |
| Unsloth Dynamic GGUF | imatrix and per-layer mixed K/IQ quants. Qwen3.8-27B: UD-Q4_K_M 16.5 GB, UD-Q5_K_M 19.8 GB, UD-Q6_K 22 GB, Q8_0 29 GB; also NVFP4 | ">10% top-1% better accuracy at same size" | Vendor KLD and top-1 charts | No (fidelity only) | VERIFIED files / ANNOUNCED claim |
| EXL3 (ExLlamaV3) | QTIP-variant trellis quant, CUDA only | Perplexity and HumanEval vs bpw and VRAM | Developer docs (v1.4.4) | HumanEval vs size on older Llama/Mistral only | VERIFIED |
| NVFP4 | E2M1 + E4M3 scale per 16 + FP32 tensor scale (~4.5 b) | Native on Blackwell; memory-only gains elsewhere | NVIDIA blog | n/a | VERIFIED |
| MXFP4 | OCP, E8M0 scale per 32 (~4.25 b) | Native on Blackwell and AMD MI350; Hopper via Triton | NVIDIA/vLLM blogs plus community | n/a | VERIFIED; llama.cpp status DISPUTED |
| FP8 | E4M3 W8A8 | vLLM: Ada, Hopper, AMD; Marlin weight-only on Turing/Ampere | vLLM docs (2026-09-14) | n/a | VERIFIED |
| BitNest (arXiv 2610.02800) | Bit-nested self-speculative decoding with residual refinement | 95.2% acceptance; 1.48-1.61x vs FP16 on 7-8B | Preprint (v2 6 Oct 2026) | Unknown (abstract lists none) | VERIFIED |
| SubSpec (arXiv 2509.18344) | Low-bit substitute-layer draft for offloaded LLMs | 9.1x (Qwen2.5-7B, 8 GB), 12.5x average (32B, 24 GB) vs offloading | NeurIPS 2025 | Not stated | VERIFIED |
| QSpec (EMNLP 2025) | W4A4 draft with weight-only verify, shared weights and KV | Up to 1.64x, lossless | Peer-reviewed | Not stated | VERIFIED |
| twobit-residual-spec (HF) | Research code: 2-bit VRAM draft plus CPU residual verifier | No results published | Anonymous code repo | No | COMMUNITY_REPORTED |
| Tiel Coder GGUF | Re-quant of Ornith-1.5 with a custom template | 12/25 SWE-bench-Live (1 run) | Community | Tiny sample, confounded by the template | COMMUNITY_REPORTED |

**Gap:** no source reviewed evaluates agentic coding (SWE-bench or Terminal-Bench) per quant at equal file size. A natural TRACE-owned test is Unsloth UD-Q4_K_M (16.5 GB) vs BaseQuant Medium (16.41 GB) vs ByteShape and GSQ-RCO tiers.

## 3. Rumoured / unconfirmed register

| Item | Status | Why |
|---|---|---|
| Qwen 4 tiers (27B / Flash / Plus / Max) | RUMOURED | Traces to an X post; Alibaba materials reportedly do not name them; no HF repos |
| Qwen 4.5 / 5 at 5-10T params | RUMOURED | Single tweet plus secondary attribution |
| Qwen3.8-Flash-Next as "Qwen4 preview" | COMMUNITY_REPORTED | Unsloth and press framing, not on the Qwen card |
| Kimi K3.1 (release, Arena sightings, SGLang commit) | RUMOURED | No card, weights or API; commit not locatable; no Arena sighting found |
| Kimi K3 pre-launch "Kivine" / "Keyine" Arena checkpoint | RUMOURED (superseded) | Leak reporting |
| Swift 1.5 on other Qwen bases (e.g. 35B-A3B) | Not found | Only the Qwen3.8-27B line exists |
| Swift 1.5 9.18x speed-up | DISPUTED | Card says 1.95x |
| Flint 512K context | DISPUTED | Card documents 262,144 |
| DeepSeek `deepseek-v4-pro` routing to V4.1-Flash | DISPUTED | News post vs current pricing page |
| GLM-5.3-Flash API price $0.15/$0.50 and "Ox Alpha" identity | COMMUNITY_REPORTED | Secondary only |
| GSQ-RCO GLM-5.3-Flash under 140 GB | RUMOURED | Blog only |
| "Strata" HF quant releases | Not found | Only the Q-Strata paper exists |
| Muse Spark (closed, Apr 2026) details | COMMUNITY_REPORTED | Meta primary page not fetched |
| Muse Glimmer 30B (Apache 2.0) | COMMUNITY_REPORTED | Mentioned in competitor cards only |
| Step 3.5 Flash (196B/11B, Apache 2.0) | COMMUNITY_REPORTED | Third-party page only |
| llama.cpp MXFP4 only in ik_llama.cpp | DISPUTED | Conflicts with mainline gpt-oss MXFP4 support (prior knowledge) |

## 4. URLs that could not be verified or were not retrievable

- https://z.ai/blog/glm-5.3-flash returned empty content to the fetcher, so the release date is unconfirmed from Z.ai.
- https://qwen.ai/research returned only the word "Qwen". No official Qwen 4 announcement was retrieved.
- https://raw.githubusercontent.com/turboderp-org/exllamav3/master/doc/exl3.md returned 404. The v1.4.4 tag path was used instead.
- https://developer.nvidia.com/blog/introducing-nvfp4-for-efficient-and-accurate-low-precision-inference: only an excerpt was seen, via search.
- https://arxiv.org/abs/2605.00649 (RCO paper) is cited by the GSQ-RCO card but was not fetched.
- github.com/snu-mllab/Q-Strata: code location reported by a third party, not checked.
- The Liquid AI launch blog for LFM2.5-24B-A2B was not located. The release date of 13 Oct is from secondary sources.
- Meta's own Muse Spark (April) and Muse Spark Open announcement pages were not located. The `meta-models` org was not cross-linked from a meta.com page.
- The DeepSeek-V4.1-Flash-1017 Hugging Face repo or revision name was not located. The news post says the weights are open.
- The Arena (lmarena / arena.ai) Frontend Code leaderboard page itself was not fetched. Kimi K3's rank comes from press reports.
- Ornith to DeepReinforce corporate relationship: deep-reinforce.com is linked from the card but was not checked.
- The InternScience to Shanghai AI Laboratory identity was not cross-checked on a lab website.
- The StepFun Step-5-Preview file listing and licence text were not viewed. Weight presence is inferred from Hub metadata.
