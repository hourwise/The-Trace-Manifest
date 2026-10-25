# ADR 0022: Model, Runtime and Hardware Catalogue with Deterministic Fit and Throughput Estimators

- **Status:** Proposed
- **Date:** 25 October 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** TRACE Models structured records, the hardware-aware Ask, recommendation snapshots, community performance reports
- **Related decisions:** ADR 0019 Open Model Execution (extended, not replaced); ADR 0021; ADR 0024; ADR 0009 Amendment 2
- **Design:** `docs/audit/trace-knowledge-pipeline-design.md` (§6); `docs/audit/trace-v1-knowledge-10-open-model-execution-plan.md` (§3–§16)
- **Review trigger:** a new attention or KV architecture that the formulas cannot express; repeated divergence between ceilings and observed results; any request to show an estimated speed as an expectation

## 1. Context

ADR 0019 requires deterministic memory and compatibility evaluation and the visible separation of evidence classes, but it leaves the formulas and citation mechanics to implementation.

The KNOWLEDGE-10 evaluation fixture defines 16 hardware scenarios (H01–H16). All currently resolve to `insufficient_evidence`, because no artefact, runtime or hardware records exist.

GGUF headers, which can be read with range requests, contain the architecture fields a KV-cache calculation needs. Measured on 25 October 2026:

| File | KV section ends at byte |
|---|---|
| Qwen2.5-0.5B-Instruct Q4_K_M | 5,931,189 |
| Qwen3.5-9B Q4_K_M | 10,943,081 |

Hugging Face's repository-level GGUF summary disagreed with a file header on context length in one observed case.

## 2. Decision

### 2.1 Citation rule

1. Every numeric or enumerated catalogue field is stored as `{value, unit, evidence_class, citation, assertion_id?, observed_at}`. The citation is one of:
   - an immutable external identifier: HF file (repo, revision, path, SHA-256), GGUF header (file SHA-256 plus parsed-metadata hash), GitHub release (tag plus commit);
   - a Knowledge Continuity source-version locator;
   - `computed`: formula version plus cited inputs.
2. **A value without a citation is `unknown`** and renders as unknown.
3. A computed value is cited only if all its inputs are.
4. Public surfaces show only fields whose assertions are eligible. Admin surfaces may show provisional values, labelled "unreviewed".
5. **Artefact facts come from the artefact's own files** (GGUF header and tensor table, `config.json` at the pinned revision), never from a repository-level summary. Conflicts are review findings.

### 2.2 Fit estimator `trace-fit-v1`

6. Inputs, all cited:
   - artefact files;
   - header and tensor table;
   - runtime-version record;
   - hardware profile;
   - workload (context, concurrency, KV dtype);
   - placement mode.
7. **Memory terms:**
   - weights come from **actual tensor or file bytes** placed per device;
   - KV per token is the sum, over layers that carry KV, of 2 × KV heads × head dimension × dtype bytes;
   - architecture rules (hybrid or linear attention, sliding window, latent attention) come from versioned architecture records;
   - **an unknown rule makes KV `unknown`; it is never guessed;**
   - recurrent or SSM state, runtime overhead and reserved memory come from records or are `unknown`.
8. Levels are those of ADR 0019. **If runtime overhead or recurrent state is unknown, the highest level reported is `will_load`.** `recommended` needs at least 10 % headroom per device, and `production_or_agent_use` additionally needs a compatibility record.
9. **Devices are never pooled.** Split and offload modes follow the open-model plan §8. MoE memory uses stored weights.

### 2.3 Throughput ceiling `trace-decode-bound-v1`

10. The decode ceiling is the reciprocal of the minimum time per token:

    ```text
    time_per_token ≥ Σ_device ( bytes_read_per_token_d / cited_bandwidth_d )
    ```

    where bytes read per token are the weights used per token (excluding the token-embedding table; for MoE, shared plus the active expert fraction from the tensor table) plus the KV cache at the context.
11. **The ceiling is presented only as an upper bound** ("cannot exceed about X tokens per second; memory-bandwidth bound"), with evidence class `trace_deterministic_estimate`.
12. It is **never** presented as an expected or typical speed.
13. It never ranks a model above an observed record.
14. Prefill is not estimated.
15. A missing bandwidth citation makes the ceiling `unknown`.
16. A community report whose generation speed exceeds the ceiling for its stated configuration is **flagged automatically** as likely misreported. It is kept and attributed, never deleted.

### 2.4 Record types and ownership

17. TRACE Models owns these records:
    - `model_family`, `model_release`, `checkpoint`, `variant`;
    - `artefact`, `artefact_file`, `quantisation`;
    - `runtime_version`, `runtime_support`;
    - `hardware_device`, `hardware_profile`;
    - `performance_observation`, `compatibility_record`;
    - `estimate_snapshot`.

    Knowledge Continuity owns their evidence (ADR 0019).
18. `estimate_snapshot` stores inputs, formula version, cited input ids and outputs. A revoked input marks the snapshot `inputs_revoked` (ADR 0024).
19. Hardware profiles submitted by users are not retained and are never sent to a model provider.

### 2.5 Evaluation

20. The estimators are pure libraries with exhaustive tests, including fixtures from real pinned headers. They must satisfy the H01–H16 expectations relevant to memory and speed:
    - no pooling;
    - stored-weight MoE fit;
    - KV-driven context exclusion;
    - the ceiling never shown as a speed (H13, H16);
    - community claims shown with their class (H14).

## 3. Consequences

### Positive

- Hardware answers become explainable, reproducible and version-specific.
- The KV cache and MoE are handled from the architecture rather than guessed.
- Misreported community speeds are detectable deterministically.

### Negative

- New architectures need new records before they are supported.
- Bandwidth and overhead records must be captured and maintained.
- The output is often `will_load` or "unknown" until runtime records exist. That is deliberate.

## 4. Rejected alternatives

| Alternative | Reason for rejection |
|---|---|
| Parameters × bits for weights | Ignores real file layouts and mixed-precision maps |
| A flat KV percentage | Wrong by orders of magnitude for GQA and hybrid models |
| An "expected tokens per second" from a utilisation factor | It would present an estimate as an observation, which ADR 0019 forbids |
| Using third-party calculators' formulas or datasets | Licensing and provenance; TRACE derives from cited primaries |
