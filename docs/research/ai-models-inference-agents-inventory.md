# TRACE research inventory: AI models, inference and agent systems

**Observed:** 23 October 2026.
**Method:** read-only metadata research from primary sources: official repositories, model cards, vendor specification pages, papers and benchmark sites. There were no weight downloads, installs, sign-ins or marketplace scraping. **No price data was collected** beyond API list prices and licence revenue thresholds.

**Status:** this is a **research inventory, not TRACE evidence.**

- Nothing here is admitted, reviewed or citable by Ask TRACE.
- Only `VERIFIED` or `REPRODUCED` items with a primary source are **candidates** for the seeding pilot and the open-model catalogue, and they still go through capture, admission, review and freshness.
- `COMMUNITY_REPORTED`, `ANNOUNCED` and `RUMOURED` items never become TRACE evidence directly.

| File | Content |
|---|---|
| `ai-models-inference-agents-inventory.json` | **354 atomic records** in the §9.4 format (ID, subject, claim, canonical and supporting sources, dates, version, evidence, reproducibility, confidence, relevance, limitations, next action, supersession, state). Merged and validated by `scripts/knowledge-10/merge-research.mjs`. |
| `inventory-engines-and-comparators.md` | Comparator feature table, 19-engine capability matrix, Strata and NInfer analysis, Project Maya Intel-port feasibility |
| `inventory-models-and-quantisation.md` | Model table, coding-claim table, DeepSeek API, quantisation and speculative-decoding table, rumour register |
| `inventory-hardware-benchmarks-agents.md` | GPU and workstation tables, multi-GPU explainer, benchmark methodology, agent-methodology and memory-provenance notes |

## 1. State counts

| Prefix | Area | VERIFIED | ANNOUNCED | COMMUNITY_REPORTED | DISPUTED | RUMOURED | SUPERSEDED |
|---|---|---:|---:|---:|---:|---:|---:|
| MOD | Models and APIs | 61 | 16 | 11 | 4 | 6 | 2 |
| QNT | Quantisation and speculative decoding | 16 | 7 | 3 | 2 | 2 | 0 |
| ENG | Engines and gateways | 82 | 10 | 2 | 0 | 1 | 0 |
| CMP | Comparator tools | 10 | 0 | 1 | 0 | 0 | 0 |
| HW | Hardware and platforms | 59 | 0 | 12 | 2 | 0 | 0 |
| BEN | Benchmarks | 18 | 0 | 2 | 1 | 1 | 0 |
| AGT | Agent methodology and memory | 20 | 0 | 3 | 0 | 0 | 0 |
| **Total** | | **266** | **33** | **34** | **9** | **10** | **2** |

`REPRODUCED`: 0. TRACE has reproduced nothing yet. That is a phase C/D local-acquisition activity.

## 2. Executive summary: findings that change the plan

1. **The DeepSeek API naming changed** (`MOD-deepseek-api-*`).
   - The research reports `deepseek-v4-flash` as a **retired alias** now served by DeepSeek-V4.1-Flash-1017. The current name is `deepseek-flash`.
   - Reported list prices ($0.30 input / $1.20 output per 1M tokens, peak) are **below** TRACE's configured 1/5 USD. That makes the budgets conservative, which is safe.
   - The routing of `deepseek-v4-pro` is **DISPUTED** between the news post and the pricing page.
   - **Action:** roadmap decision G-1, before any new provider-mode use. Editorial AI is enabled on Production.
2. **Most of the intake's P0 models are real and open-weight.**
   - Qwen3.8-27B (Apache-2.0), DeepSeek-V4.1-Flash (MIT), GLM-5.3-Flash (MIT), Flint (Apache-2.0, released 21 October), Sage-A1.5 (Apache-2.0), Ornith-1.5-35B (MIT) and Qwen3.6-35B-A3B (Apache-2.0) are all VERIFIED on the publishers' Hugging Face organisations.
   - **Qwen3.8-Flash-Next** is released, but under the **Qwen Community License 1.0**, not Apache. It is a 125B MoE with about 6B active parameters.
3. **Several intake names resolve to something other than expected:**
   - **Tiel Coder** is an anonymous re-quantisation of Ornith-1.5, not a new model.
   - The **Korean 30B MoE** is **KRAFTON Raon-1 mini preview** (28.8B / 4.3B active, Apache-2.0 and NVFP4 confirmed).
   - **Swift 1.5** is a single UkisAI fine-tune of Qwen3.8-27B with a revenue-capped licence.
   - **Muse Spark Open** (816B / 42B) is a separate open release from the closed Muse Spark.
4. **Unconfirmed:** the Qwen 4 tiers and Kimi K3.1 are **RUMOURED**. Qwen 4 is *announced as in training* only. They are excluded from the catalogue.
5. **Benchmark comparability is the main trap.**
   - Flint's 89.7% is on **SWE-bench Pro v2**, not comparable with other cards' SWE-bench Pro scores of about 50–62.
   - OpenAI stopped reporting SWE-bench Verified on 2026-02-23, citing contamination.
   - Terminal-Bench is now **4.0** (Harbor) and is not comparable with 2.x or 3.0.
   - Every coding claim on the model cards is vendor-run (`ANNOUNCED`).
   - **No leaderboard reviewed showed version, harness and date together**, so no scores were recorded.
6. **Quantisation quality evidence is thin.**
   - Only GSQ-RCO reports a task metric (LiveCodeBench v6) against Unsloth at equal file size.
   - BaseQuant's "15% more accurate" is a KL-divergence comparison (**DISPUTED** as a task-accuracy claim).
   - **No source evaluates agentic coding per quantisation.** A natural TRACE-tested study: Qwen3.8-27B at about 16.5 GB across Unsloth UD-Q4_K_M, BaseQuant Medium, ByteShape and GSQ-RCO.
7. **Intel Arc B-series paths exist but are specialist:**
   - Strata's Linux-only SYCL engine has the most evidence (B70 maintainer-tested);
   - Intel llm-scaler-vllm supports the B60 and B70;
   - SGLang lists Arc Pro B-series;
   - llama.cpp SYCL lists the B580, and users report **Vulkan beating SYCL** on the B60 and B70.

   **B60 and B50 are PCIe 5.0 x8 cards**, which run at Gen3 x8 in the older workstation bases. The MAXSUN B60 Dual needs x8/x8 bifurcation, which no reviewed workstation specification sheet documents.
8. **The reference workstation (B70 32 GB + RTX 5060 Ti 16 GB) is mixed-vendor.** The defensible pattern is **separate models per GPU**: for example, a coder on one card and a reviewer on the other. Splitting one model across vendors works only through llama.cpp's Vulkan multi-device path (merged in 2024). That path is `experimental` for TRACE until tested.
9. **Older NVIDIA data-centre cards are at end of line.** CUDA 13 dropped compute capability below 7.5, so the P100 and V100 are limited to CUDA 12.x on driver 580 (LTS to mid-2028). PyTorch 2.14 is the last release with sm_60/70 wheels.
10. **Agent-memory poisoning is an established research area:**
    - attacks: AgentPoison, PoisonedRAG, MINJA, MemoryGraft;
    - OWASP's Agentic Top 10.

    This supports the TRACE principle that *workers submit observations, and only evidenced facts are promoted*. The local-acquisition design adopts it (local acquisition, §7 and §10).

## 3. P0 research status

| P0 item | Status | Key records |
|---|---|---|
| B70 + Strata + Qwen Flash Next | Strata 0.2.2 (21 Oct) supports Flash-Next. Linux SYCL; B70 maintainer-tested. Performance claims `ANNOUNCED`, unreproduced. | `ENG-strata-*`, `HW-arc-b70-*`, `MOD-qwen38-flashnext-*` |
| Project Maya Intel backend | None today (CUDA; ROCm experimental). Issue #37 was closed by its author with no maintainer plan. A Linux-only, layer-split, GGUF-only SYCL port via Strata's SYCLomatic pipeline is plausible; parity is unlikely. | `ENG-maya-*` |
| DSX architecture and Intel compatibility | dsx: MIT, CUDA 13, up to 6 GPUs hold hot experts, CPU AVX2/VNNI experts, SSD tier. **No Intel support.** | `ENG-dsx-*` |
| Qwen 27B quantisation quality and coding reliability | Artefacts verified (Unsloth UD tiers, BaseQuant, GSQ-RCO, ByteShape, Swift). **No agentic-coding evaluation per quant exists.** | `QNT-*`, `MOD-qwen38-27b-*` |
| Flint, Sage, 35–40B alternatives | All verified; all coding claims vendor-run; the Flint benchmark version is not comparable | `MOD-recursive-flint-*`, `MOD-sage-*`, `MOD-ornith-*` |
| Hybrid RAM/VRAM performance and bandwidth | Engine mechanisms documented (Strata, KTransformers, Maya, dsx, ds4). Memory-channel and bandwidth data for workstation bases recorded. **No reproduced hybrid performance numbers.** | `ENG-*`, `HW-platform-*` |
| Independent worker verification and memory provenance | Methodology recorded (pass^k, Stryker, JUnit XML as the common evidence format, worktree isolation limits); memory-poisoning and provenance literature recorded | `AGT-*` |

P1 and P2 items (BitNest, SubSpec, QSpec, Berth, V100/P100 forks, workstation cooling, SSD-streamed MoE) are partly covered (`QNT-*`, `ENG-berth-*`, `HW-repo-*`). The rest stay as backlog.

## 4. Model and runtime combinations worth TRACE testing (candidates, not recommendations)

| Workload on the reference workstation | Candidate combination | Why | Open question |
|---|---|---|---|
| Primary coder (32 GB B70) | Qwen3.8-27B or Ornith-1.5-35B GGUF Q5–Q6 on llama.cpp (Vulkan or SYCL) | Dense or small-MoE, fits with KV headroom | B70 Vulkan versus SYCL throughput; tool-call reliability in OpenCode |
| Reviewer (16 GB 5060 Ti) | A smaller model or a 4-bit 27–35B variant on llama.cpp CUDA or vLLM | Independent second model | Whether a 16 GB reviewer catches defects (`pass^k`) |
| Large MoE, hybrid | Qwen3.8-Flash-Next on Strata (SYCL on the B70, RAM tier 128 GB) | The engine is designed for this | Licence (Qwen Community 1.0); speed is `ANNOUNCED` only |
| Large MoE, CUDA | GLM-5.3-Flash on Maya, or DeepSeek-V4.1-Flash on dsx (5060 Ti plus RAM) | Expert tiering | 16 GB hot-expert budget; no Intel path |

## 5. Compatibility matrix (vendor × engine), summarised

| Engine | NVIDIA | AMD | Intel Arc B | Apple | Notes |
|---|---|---|---|---|---|
| llama.cpp | Y | Y (ROCm, Vulkan) | Y (SYCL, Vulkan) | Y | Broadest; mixed-vendor Vulkan |
| vLLM | Y | Y | Y (XPU; llm-scaler) | plugin | TP/PP; best quant breadth |
| SGLang | Y | Y | Y (listed) | Y | XGrammar |
| Ollama | Y | Y | Vulkan only | Y (MLX) | Easiest |
| ExLlamaV3 | Y | N | N | N | CUDA only |
| KTransformers | Y | Y | beta (B580; no serving) | N | MoE hybrid |
| Strata | Y | Y | Y (Linux SYCL) | Y | Fixed model list |
| Maya / dsx | Y | experimental / runner | N | N | Specialist MoE |
| NInfer | 5090 only | N | N | N | Single-GPU specialist |
| MLX-lm | N | N | N | Y | Apple only |

Full detail is in `inventory-engines-and-comparators.md` (§2).

## 6. Register of disputed and rumoured claims (19)

| ID | State | Claim (short) |
|---|---|---|
| MOD-qwen4-002, -004 | RUMOURED | Qwen 4 four-tier line-up; Qwen 4.5/5 at 5–10T parameters |
| MOD-kimi-k31-001, -002 | RUMOURED | Kimi K3.1 release and Arena sightings |
| MOD-kimi-k3-007 | RUMOURED | Pre-launch "Kivine" Arena checkpoint |
| MOD-swift15-005 | RUMOURED | Swift 1.5 on other Qwen bases |
| MOD-deepseek-api-005 | DISPUTED | `deepseek-v4-pro` routing to V4.1-Flash |
| MOD-qwen38-flashnext-006 | DISPUTED | Flash-Next "outperforms Claude-4.6-Opus" (Unsloth, no method) |
| MOD-recursive-flint-004 | DISPUTED | Flint 512K context versus 262,144 on the card |
| MOD-swift15-003 | DISPUTED | Swift 1.5 speed-up 1.95× versus 9.18× |
| QNT-basequant-003 | DISPUTED | "15% more accurate than Unsloth" is KL, not accuracy |
| QNT-fp-llamacpp-001 | DISPUTED | NVFP4 / MXFP4 status in mainline llama.cpp |
| QNT-gsq-rco-005 | RUMOURED | GLM-5.3-Flash under 140 GB via GSQ-RCO |
| QNT-strata-002 | RUMOURED | "Strata"-branded HF quantisations |
| ENG-slipstream-001 | RUMOURED | "Slipstream" engine: not identified |
| HW-arc-b60dual-002 | DISPUTED | MAXSUN B60 Dual power and form factor |
| HW-rx9060xt-001 | DISPUTED | RX 9060 XT board power and link width |
| BEN-arena-004 | DISPUTED | "Leaderboard Illusion" critique of Arena |
| BEN-swebv-003 | RUMOURED | Datacurve audit of SWE-bench Pro grading |

## 7. Register of implementation and contribution opportunities

| Opportunity | Evidence | Feasibility | Gate |
|---|---|---|---|
| TRACE-tested equal-file-size agentic coding study of Qwen3.8-27B quantisations | §2.6 gap | High (workstation, local) | Local acquisition phase D |
| Project Maya Intel SYCL port (Linux, layer split, GGUF) | `ENG-maya-*`, `ENG-strata-*` | Plausible; parity unlikely | Owner decision; external contribution, outside TRACE scope |
| B70 Vulkan-versus-SYCL measurement in llama.cpp | `HW-arc-llamacpp-001` (community) | High | Workstation |
| Mixed-vendor Vulkan split (B70 + 5060 Ti) measurement | `HW-mgpu-llamacpp-002` | Medium | Workstation |
| A TRACE KV-cache-aware, split-aware fit calculator (OM-3) | Comparator gaps (`CMP-*`) | High | None (pure library) |

## 8. Next research actions

- **Re-verify within 30 days:** DeepSeek pricing and routing; Flint context; the Qwen 4 status.
- **Resolve:** the Slipstream identity (owner to name the intended project); the NVFP4/MXFP4 status in mainline llama.cpp; the AMD product pages that timed out.
- **Owner input:** confirm whether the Project Maya contribution is in scope for TRACE or a personal project.
