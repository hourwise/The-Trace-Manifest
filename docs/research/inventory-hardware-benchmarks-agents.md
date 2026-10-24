# TRACE research: hardware, benchmarks and agent methodology (Task C)

Observation date: 2026-10-23. Every line maps to a record in `ai-models-inference-agents-inventory.json` (IDs in brackets). Read-only metadata research: nothing was downloaded beyond what the fetch tool cached, nothing was installed, there were no sign-ins, and no marketplace prices were collected.

State key: **V** = VERIFIED (primary or vendor source), **CR** = COMMUNITY_REPORTED, **D** = DISPUTED, **R** = RUMOURED.

## 1. GPU table

| GPU | VRAM / type | Bus / bandwidth | Power | Host link | Form / cooling | AI software support | State |
|---|---|---|---|---|---|---|---|
| Intel Arc Pro B70 | 32 GB GDDR6, ECC | 256-bit / 608 GB/s | 230 W TBP (160-290 W on partner cards) | PCIe 5.0 x16 | 2-slot reference card, 1x 8-pin | oneAPI yes; Vulkan 1.3; OpenCL 3.0; LLM Scaler and vLLM XPU | V [HW-arc-b70-001..003] |
| Intel Arc Pro B65 | 32 GB GDDR6 | 256-bit / 608 GB/s | 200 W | PCIe 5.0 x16 | not on ARK (partner cards only) | oneAPI; Vulkan 1.3 | V [HW-arc-b65-*] |
| Intel Arc Pro B60 | 24 GB GDDR6 | 192-bit / 456 GB/s | 200 W (120-200 W) | **PCIe 5.0 x8** | not on ARK | oneAPI; Vulkan 1.3; LLM Scaler 0.26.0-b2 | V [HW-arc-b60-001] |
| MAXSUN Arc Pro B60 Dual 48G | 2x 24 GB | 2x 456 GB/s | reported 400 W, 12V-2x6 | x16 edge = **2x x8; needs x8/x8 bifurcation** | reported 2-slot blower, >30 cm | as B60 | CR / D [HW-arc-b60dual-*] |
| Intel Arc Pro B50 | 16 GB GDDR6 | 128-bit / 224 GB/s | 70 W, no external power | PCIe 5.0 x8 | 2-slot, 6.6 in | oneAPI; Vulkan 1.4 | V [HW-arc-b50-001] |
| RTX 5060 Ti 16GB | 16 GB GDDR7 | 128-bit / 448 GB/s (CR) | 180 W | PCIe 5.0 (x8 per reviews) | partner-dependent | CUDA CC 12.0 | V + CR [HW-rtx5060ti-*] |
| RTX 4060 Ti 16GB | 16 GB GDDR6 | 128-bit / 288 GB/s (CR) | 165 W | PCIe 4.0 (x8 per reviews) | 2-slot (Founders) | CC 8.9 | V + CR [HW-rtx4060ti-*] |
| RTX 3090 | 24 GB GDDR6X | 384-bit | 350 W | PCIe 4.0 | 3-slot (Founders) | CC 8.6; NVLink | V [HW-rtx3090-001] |
| TITAN RTX | 24 GB GDDR6 | 384-bit / 672 GB/s | 280 W, 2x 8-pin | PCIe 3.0 x16 | dual-slot | CC 7.5; NVLink 100 GB/s | V [HW-titanrtx-001] |
| Quadro RTX 5000 | 16 GB GDDR6 | 256-bit / 448 GB/s | 265 W board | PCIe 3.0 x16 | dual-slot, active | CC 7.5; NVLink 50 GB/s | V [HW-quadrortx5000-001] |
| Tesla V100 PCIe | 32/16 GB HBM2 | 900 GB/s | 250 W (SXM2: 300 W) | PCIe 3.0 | FHFL, **passive** | CC 7.0; **CUDA 12.x only** | V [HW-v100-001] |
| Tesla P100 PCIe | 16 GB HBM2 (12 GB variant) | 732 GB/s (549 GB/s) | 250 W | PCIe 3.0 | FHFL, data-centre passive | CC 6.0; **CUDA 12.x only** | V [HW-p100-001] |
| Quadro RTX 8000 | 48 GB GDDR6, ECC | 384-bit / 672 GB/s | 295 W board | PCIe 3.0 x16 | dual-slot, active (passive variant exists) | CC 7.5; NVLink 100 GB/s | V [HW-rtx8000-001] |
| RTX A6000 | 48 GB GDDR6, ECC | 384-bit / 768 GB/s | 300 W, EPS 8-pin | PCIe 4.0 x16 | dual-slot, active | CC 8.6; NVLink 112.5 GB/s | V [HW-a6000-001] |
| Radeon AI PRO R9700 | 32 GB GDDR6 | 256-bit / 640 GB/s | 300 W | PCIe 5.0 x16 | 2-slot blower | ROCm supported (gfx1201) | CR specs, V ROCm [HW-r9700-*] |
| RX 9060 XT 16GB | 16 GB GDDR6 | 128-bit / ~320 GB/s | 160 W or 182 W (sources disagree) | PCIe 5.0 x16 (some boards x8) | partner | ROCm supported (gfx1200) | D specs, V ROCm [HW-rx9060xt-*] |
| RX 7600 XT 16GB | 16 GB GDDR6 | 128-bit / 288 GB/s | ~190 W | PCIe 4.0 x8 | partner | **Not in ROCm support list** (only RX 7600 gfx1102 listed) | CR specs, V ROCm [HW-rx7600xt-*] |
| Radeon PRO W6800 | 32 GB GDDR6, ECC | 256-bit / 512 GB/s | 250 W | PCIe 4.0 x16 | double-slot, full height | ROCm supported (gfx1030); Vulkan 1.2 (launch) | V [HW-w6800-*] |
| Instinct MI50 / MI60 | MI50 16 GB (32 GB variant); MI60 32 GB HBM2 | 4096-bit / 1 TB/s (MI60) | 300 W | PCIe 4.0 x16 | passive | **MI50 gfx906 unsupported; MI60 unlisted** | V [HW-mi50-*] |
| RX 7900 XTX | 24 GB GDDR6 | 384-bit / 960 GB/s | 355 W | not captured | partner | ROCm supported (gfx1100) | V [HW-7900xtx-*] |

Software baselines:
- **CUDA 13.0** removed offline compilation and library support for compute capability below 7.5 (Maxwell, Pascal, Volta) [HW-cuda-001]. Driver branch 580 is the last LTS branch for those GPUs, supported until mid-2028 [HW-cuda-002]. Current release notes show CUDA 13.4 Update 2 [HW-cuda-003].
- **PyTorch 2.14** is the last release with prebuilt sm_50/60/70 wheels (notice dated 2026-09-04) [HW-cuda-004]. NVIDIA's open kernel modules require Turing or newer, so P100 and V100 need the proprietary driver [HW-cuda-005].
- Titan RTX and Quadro RTX 5000/8000 (CC 7.5) are at the CUDA 13 floor. No Turing deprecation notice was found [HW-cuda-006].
- **ROCm**: the release notes are titled "ROCm Core SDK 10.1.0" (2026-10-05). However, the install-on-linux requirements page still refers to 7.14.0 as production, so the version numbering is inconsistent [HW-rocm-001]. The Radeon OS list is Ubuntu 24.04.4 and 22.04.5, and RHEL 10.1 and 9.7 [HW-rocm-002].
- **Intel Linux**: Intel's Xe KMD table lists the B60 as "Ubuntu 24.04+ (6.15)" and leaves its minimum-kernel column blank [HW-arc-linux-001]. One forum user reports a Gen1 x1 link-training issue [HW-arc-linux-002]. llama.cpp users report Vulkan beating SYCL on B60/B70 [HW-arc-llamacpp-001].

Community repositories (all exist; all claims are self-reported):
- **4claps/llama.cpp_3plus-node-optimization @ p100-optimizations**: a fork of Kmic-68/llama.cpp tuned for 2x P100. It claims about 1.86x decode, about 2x prefill, and 262k context. It has 0 stars [HW-repo-4claps-001].
- **qr0n/p100-llama-cpp**: an MIT patch set on llama.cpp b10660 for GP100, covering MMVQ tuning, an fp16 matvec path, and AllReduce for `-sm tensor`. Test conditions are documented (2x P100, CUDA 12.4, driver 580, 250 W cap). It warns that `GGML_CUDA_P2P` caused a regression [HW-repo-qr0n-001].
- **bradrlaw/ai-server**: a build log for an X99 home server with 2x V100-32GB plus a Titan X, running driver 580 and CUDA 12.x with llama.cpp, llama-swap and LiteLLM [HW-repo-bradrlaw-001].

## 2. Workstation table

| Platform | Max RAM / channels | PCIe slots (electrical, generation) | PSU | Bifurcation / Above 4G | Source revision |
|---|---|---|---|---|---|
| HP Z8 G4 | 24 DIMM; 6 ch per CPU; 768 GB RDIMM, 3 TB LRDIMM | 7 slots Gen3: x4 (x8 with CPU2), x16, x16 (CPU2), x16, x4, x16 (CPU2), x4; x4/x8 slots open-ended; plus 2 internal x8 | 1125 / 1450 W (100 V); 1700 W (200 V) | not documented | QuickSpecs c05527763 v4, 2017-11-19 [HW-hpz8g4-*] |
| HP Z6 G4 | 6 + 6 DIMM (riser); 6 ch per CPU; 768 GB DDR4-2933 / 384 GB DDR4-2666 | slot0 mechanical; x4 open-ended; x16; x4 PCH open-ended; x8 open-ended (x4 if M.2 #2 fitted); x16; x4 PCH open-ended | 1000 W | not documented | c05527761 v51, 2023-02-01 [HW-hpz6g4-*] |
| Dell Precision 7820 | 12 DIMM; 6-channel; 768 GB DDR4-2933 | Gen3: 2x x16, x16@x8, x16@x4, x16@x1, 1 PCI | 950 W Gold | not documented | spec sheet [HW-dell7820-001] |
| Dell Precision 7920 | 24 DIMM; 6-channel; 1.5 TB (2666), 3 TB select CPUs | Gen3: 2x x16 + 2x x16 (CPU2), x8 open-ended, x16@x4, x16@x1; up to 3x 300 W GPUs | 1400 W (181-240 VAC), 1100 W (100-180 VAC) | KB 000146802 covers bus allocation, not bifurcation | spec sheet [HW-dell7920-001, HW-dell-bif-001] |
| Lenovo P920 | 16 DIMM; 12 ch; 1 TB | 8 slots Gen3: x16, x4 open-ended, x16, x4 open-ended, x4 PCH, x16, x16, x16 (last three need CPU2) | 1400 W Platinum (1125 W below 115 V) | not documented | PSREF [HW-p920-*] |
| Lenovo P620 | 8 DIMM; 8 ch DDR4-3200; 1 TB (512 GB with 5000WX, temporary) | 6 slots Gen4: x16, x8, x16, x16, x16, x8 | 1000 W Platinum | not documented | PSREF [HW-p620-001] |
| Supermicro H12SSL-i (EPYC 7002/7003) | 8 DIMM; 8 ch; 2 TB DDR4-3200 | 5x Gen4 x16 + 2x Gen4 x8 | board only (ATX) | not on product page; per-board, per-BIOS (Supermicro FAQ) | product page [HW-supermicro-*] |
| EPYC 9005 | 12 ch DDR5 (6400) | 128 Gen5 lanes 1P / 160 2P | n/a | n/a | [HW-platform-epyc9005-001] |
| Threadripper PRO 9000 WX | 8 ch DDR5-6400 | 128 Gen5 (148 total) | n/a | n/a | [HW-platform-trpro9000-001] |
| Xeon W-3500 / W-2500 | 8 ch, 4 TB / 4 ch, 2 TB | 112 / 64 Gen5 lanes | n/a | n/a | [HW-platform-xeonw-001] |

Key gap [HW-platform-docgap-001]: none of the official spec documents fetched mention **Above 4G decoding** or **bifurcation**. These features determine whether 32-48 GB cards (which need large BARs) and dual-GPU-on-one-slot boards such as the B60 Dual will work. Check the BIOS or user manuals, or test on the real machine.

## 3. Multi-GPU explainer

- **Layer (pipeline) split** is llama.cpp's default (`-sm layer`). Each GPU holds a contiguous block of layers plus its share of the KV cache, and only activations cross PCIe at block boundaries. This tolerates slow links and mismatched cards, including mixed vendors. The cost is that, for one request stream, the GPUs mostly take turns rather than work at the same time [HW-mgpu-llamacpp-001, HW-mgpu-theory-002].
- **Tensor parallelism** (Megatron-LM intra-layer parallelism) splits each layer's weight matrices across GPUs. All GPUs work on every token, but they must synchronize, via an all-reduce, inside every layer. That makes it sensitive to interconnect bandwidth and latency [HW-mgpu-theory-001]. llama.cpp offers `-sm row` and an experimental `-sm tensor`. vLLM recommends pipeline over tensor parallelism on nodes without NVLink [HW-mgpu-vllm-001]. Community P100 patches report about +17% from `-sm tensor` after adding AllReduce, while `GGML_CUDA_P2P` regressed on their machine [HW-repo-qr0n-001].
- **PCIe arithmetic matters.** x8 cards (B60, B50, 4060 Ti, 7600 XT) in PCIe 3.0 workstation slots run at Gen3 x8.
- **Mixed-vendor Vulkan** was added in PR #5321, merged 2024-02-07. It was shown splitting a model across an RTX 3090, a Radeon Pro VII and an Arc A770, with data copied through system RAM and devices chosen with `GGML_VK_VISIBLE_DEVICES` [HW-mgpu-llamacpp-002]. Several backends, such as CUDA plus Vulkan, can be built into one binary (`GGML_BACKEND_DL`, `--device`) [HW-mgpu-llamacpp-003]. Community forks run CUDA and Vulkan in the same process (CR) [HW-mgpu-llamacpp-004]. Upstream build docs do not describe mixed-vendor tuning.

## 4. Benchmark methodology table

| Benchmark | Measures | Current version | Harness / method | Run by | Reproducibility and caveats |
|---|---|---|---|---|---|
| SWE-bench (Full/Lite) | resolving real GitHub issues with a patch, judged by repo tests | Full 2,294 tasks from 12 Python repos | Docker `swebench eval`; sb-cli | Princeton/Stanford authors | Docker grading is reproducible; agent runs are stochastic; Python-only [BEN-swebench-*] |
| SWE-bench Verified | 500-task human-validated subset | 500 | same harness | OpenAI with the SWE-bench authors (2024-08) | **OpenAI stopped reporting it on 2026-02-23**, citing contamination; its audit found 59.4% of 138 hard tasks flawed [BEN-swebv-*] |
| SWE-bench Pro | long-horizon multi-file tasks | 1,865 tasks (731 public / 858 held-out / 276 commercial), arXiv v2 2025-11-14 | Scale leaderboard: mini-swe-agent, 250-turn uncapped or 50-turn capped; resolve rate with confidence intervals | Scale AI | copyleft and private sets are the contamination defence; a grading-error claim is unconfirmed (R) [BEN-swebpro-*, BEN-swebv-003] |
| Terminal-Bench | end-to-end terminal tasks with tests | **4.0** (Aug 2026): 66 tasks, 5 trials, 8 h timeout (CR details) | Harbor (`harbor run -d terminal-bench/terminal-bench@4.0.0`); oracle validation | Stanford, Laude Institute, Harbor | not comparable to 3.0/2.x; `@latest` is unpinned [BEN-tbench-*] |
| LiveCodeBench | code generation, self-repair, execution, test-output prediction | release_v6: 1,055 problems, May 2023-Apr 2025 | `lcb_runner`; pass@1 and pass@5 | UC Berkeley, MIT, Cornell | filters by problem date for contamination; no release after Apr 2025 seen [BEN-lcb-*] |
| Aider polyglot | code editing across 6 languages | 225 Exercism exercises (2024-12-21) | aider harness; percent correct (second attempt), edit format recorded | Paul Gauthier / aider | leaderboard last updated 2025-11-20; Exercism solutions are public [BEN-aider-*] |
| Arena (ex-LMArena) | human pairwise preference | live; rebranded 2026-01-28 | Bradley-Terry with style control | Arena Inc. (Chiang, Angelopoulos, Stoica) | canonical URL **https://arena.ai/leaderboard** (lmarena.ai returns 301); measures preference, not correctness; "Leaderboard Illusion" critique (D) [BEN-arena-*] |
| Luke's Dev Lab | local model and agent tests | live site, configs repo with 39 commits | llama.cpp/llama-swap profiles (`model-configs.ini`, RTX 2000 16 GB + 32 GB DDR4) | single creator | configs are public, but no methodology is shown on the site [BEN-lukes-*] |

Recording rule [BEN-meta-001]: store a score only together with its benchmark version, harness or scaffold, turn and cost limits, trial count and date. No scores were recorded in this pass, because none of the leaderboards showed all of these.

## 5. Agent methodology notes

- **Mutation testing**: Stryker covers JS/TS, C# and Scala. Its mutation score is detected ÷ valid × 100, where detected = killed + timeout and undetected = survived + no coverage. Runtime errors, compile errors and ignored mutants are excluded [AGT-stryker-*].
- **Test artefacts**: pytest has built-in JUnit XML output (`--junit-xml`). JSON output needs the `pytest-json-report` plugin, whose latest release is 1.5.0 from 2022-03-15, so maintenance is uncertain [AGT-pytest-*]. Vitest v5 has a Jest-compatible `json` reporter (with `coverageMap` since v3) and a `junit` reporter [AGT-vitest-*]. Use JUnit XML as the common cross-language evidence format.
- **Isolation**: each git worktree has its own HEAD, index and working files. Refs (except bisect, worktree and rewritten), objects and config (unless `extensions.worktreeConfig` is set) are shared, and the same branch cannot be checked out twice without `--force` [AGT-worktree-*]. Give each agent its own branch, and do not let agents write shared config.
- **Metrics**: pass@k (Chen et al. 2021) is 1 − E[C(n−c,k)/C(n,k)] and measures capability. pass^k (tau-bench, Yao et al. 2024) is E[C(c,k)/C(n,k)] and measures reliability across repeated trials. In June 2024, tau-bench found top agents below 25% pass^8 in the retail domain [AGT-metric-*].
- **DocBrain** exists. It is a self-hosted decision and knowledge system with citations, freshness re-checks and signed `.dbev` evidence bundles. The repo is MIT and the server is BSL 1.1 (CR) [AGT-docbrain-001]. **KnowledgeDrift** exists. It is an offline, LLM-judge-free benchmark for memory systems covering currency, contradiction, drift and deletion, with self-reported scores (CR) [AGT-knowledgedrift-001].
- **Memory contamination and poisoning**:
  - AgentPoison (2407.12784), PoisonedRAG (2402.07867, USENIX Security 2025), MINJA (2503.03704) and MemoryGraft (2512.16962) describe attacks on agent memory or knowledge bases.
  - Sunil et al. (2601.05504) show that MINJA weakens when memory already holds benign records, and that trust-scored sanitization is poorly calibrated.
  - OWASP's Agentic Top 10 (2026 edition, December 2025) includes memory and context poisoning (ASI06, per secondary sources) [AGT-memsec-*].
- **Provenance**:
  - W3C PROV (2013) supplies the vocabulary of entities, activities and agents [AGT-prov-004].
  - Recent preprints: Agent Zero Memory (2608.29606) tags each memory with origin, timestamp and a source pointer; Ground Truth First (2607.21962) builds answer keys that are correct by construction and finds rankings that reverse over time [AGT-prov-001/002].

## 6. URLs not verified (or only partly verified)

| URL | Outcome |
|---|---|
| https://www.maxsun.com/products/intel-arc-pro-b60-dual-48g-turbo | HTTP 429; specs taken from press |
| https://www.lttlabs.com/articles/2026/05/15/maxsun-intel-arc-pro-b60-dual-48g-turbo-review | HTTP 403 |
| amd.com product pages (R9700, RX 9060 XT, RX 7900 XTX, W6800) | timed out; values from search extracts or third parties |
| https://openai.com/index/introducing-swe-bench-verified/ and /why-we-no-longer-evaluate-swe-bench-verified/ | HTTP 403; content from search extracts and secondary coverage |
| https://arena.ai/leaderboard | HTTP 403 to the fetcher; existence confirmed by the 301 from lmarena.ai |
| https://www.youtube.com/@lukesdevlab | redirected to a consent page, which was not accepted; channel content not verified |
| https://h20195.www2.hp.com (HP QuickSpecs) | TLS error; third-party-hosted copies of the HP PDFs were used (document IDs and revisions recorded) |
| japancatalog.dell.com (7920 Technical Guidebook) | DNS failure |
| techpowerup.com GPU database | HTTP 403 (not used) |
| https://dgpu-docs.intel.com/overview/supported-hardware/xe-driver-gpus.html | not fetched directly; search extract only |
| Datacurve SWE-bench Pro audit | primary source not located (R) |
| daimonionnn/multi-gpu-llm-toolkit, therattto/GSllama, pypi.org/project/veracium | seen only in search results |
