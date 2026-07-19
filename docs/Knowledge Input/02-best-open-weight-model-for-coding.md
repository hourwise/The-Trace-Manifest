---
canonical_question: "What is the best open-weight model for coding?"
section: ai-agents
topics:
  - coding-models
  - open-weight-models
  - local-models
knowledge_type: comparison
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

As of 19 July 2026, **GLM-5.2 is the strongest defensible default recommendation for an actually downloadable open-weight coding model**. It is the highest-ranked open-weight model on the current Artificial Analysis Intelligence Index, has a one-million-token context window, is released under the MIT licence, and is explicitly designed for long-horizon and coding-agent work.

**Kimi K2.7 Code** is the strongest clearly coding-specialised alternative. Its weights are downloadable, it is designed for long-horizon software engineering, and Moonshot reports meaningful gains over Kimi K2.6 on coding and agent benchmarks.

**Kimi K3 should not yet be described as open-weight in a dated knowledge entry for 19 July 2026.** Its API model is available and highly capable, but its weights are not publicly downloadable at this date.

## Detailed explanation

“Open source” and “open weight” are often used too loosely. For this comparison, an open-weight model must have downloadable model weights and a licence that clearly states how they may be used. An API that uses an allegedly open architecture is not sufficient.

GLM-5.2 is the clearest overall leader under that definition. Z.ai describes it as a long-horizon model with a stable one-million-token context window, stronger coding capability, multiple reasoning-effort levels, and an MIT licence. Artificial Analysis independently classifies it as open weight and ranks it first among current open-weight models on its broad Intelligence Index.

Kimi K2.7 Code deserves separate consideration because it is trained and presented specifically for coding-agent work rather than as a general model that happens to code well. Moonshot reports improvements over K2.6 on Program-Bench, MCP Mark Verified, and SWE Marathon, as well as lower reasoning-token use. The model card and weight files are publicly available on Hugging Face under a modified MIT licence.

The choice between them should depend on the deployment:

- choose **GLM-5.2** for the strongest overall open-weight capability, long context, and a permissive standard MIT licence;
- choose **Kimi K2.7 Code** when coding-specific training and agent workflows matter more than broad capability;
- choose a smaller quantised model when the available hardware cannot realistically host a model of this scale.

Both models are extremely large. GLM-5.2 has hundreds of billions of total parameters, and Kimi K2.7 Code is approximately a trillion-parameter model. “Open weight” therefore does not mean “easy to run on a consumer laptop.” Local deployment may require aggressive quantisation, multiple high-memory GPUs, specialised inference software, or rented infrastructure.

Kimi K3 illustrates why TRACE should record availability separately from marketing language. It ranks near the frontier as an API model and Moonshot has described it as open, but Artificial Analysis currently classifies it as proprietary because the weights are not yet public. The knowledge record should be revised when the complete weights, licence, and reproducible deployment instructions are actually available.

## Evidence

- [Z.ai — GLM-5.2: Built for Long-Horizon Tasks](https://z.ai/blog/glm-5.2) — establishes the one-million-token context, coding focus, long-horizon design, and MIT “Pure Open” release.
- [Artificial Analysis — GLM-5.2](https://artificialanalysis.ai/models/glm-5-2/) — independently classifies GLM-5.2 as open weight and records its ranking, context window, parameter count, and licence.
- [Moonshot AI — Kimi K2.7 Code](https://www.kimi.com/resources/kimi-k2-7-code) — describes the coding-specialised model and reports its coding and agent benchmark improvements.
- [Hugging Face — Kimi K2.7 Code model card](https://huggingface.co/moonshotai/Kimi-K2.7-Code) — establishes that downloadable weights are available and records the modified MIT licence.
- [Artificial Analysis — Kimi K3](https://artificialanalysis.ai/models/kimi-k3/) — records Kimi K3's current capability and API availability while stating that its weights are not publicly available.
