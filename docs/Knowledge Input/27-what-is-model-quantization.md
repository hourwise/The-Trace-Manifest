---
canonical_question: "What is AI model quantization, and does it reduce quality?"
section: ai-agents
topics:
  - quantization
  - local-models
  - inference
  - model-compression
knowledge_type: definition
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

**Quantization** reduces the numerical precision used to store or compute a model's parameters and sometimes its activations—for example, converting from 16-bit values to 8-bit or 4-bit representations.

The main benefits are:

- lower memory use;
- smaller model files;
- faster or cheaper inference on supported hardware;
- the ability to run larger models on local devices.

Quantization can reduce quality, but the effect varies greatly by model, method, bit width, calibration data, hardware, and task. An 8-bit version may be close to the original for many uses, while aggressive 4-bit or lower quantization can harm reasoning, coding, multilingual ability, rare knowledge, or long-context behaviour. The quantized build must be evaluated on the intended workload.

## Detailed explanation

Neural-network parameters are commonly trained or distributed using floating-point formats such as FP32, FP16, or BF16. Quantization represents them using fewer bits, often integers or compact floating-point formats.

A rough storage illustration for one billion parameters is:

- 32-bit: about 4 GB before overhead;
- 16-bit: about 2 GB;
- 8-bit: about 1 GB;
- 4-bit: about 0.5 GB.

Actual runtime memory is higher because inference also needs activations, caches, temporary buffers, runtime code, and sometimes multiple copies or auxiliary weights.

Common approaches include:

### Post-training quantization

Convert a trained model without full retraining. Some methods require a calibration dataset to estimate ranges and minimise error.

### Quantization-aware training

Simulate lower precision during training or fine-tuning so the model adapts to quantisation effects.

### Weight-only quantization

Compress model weights while leaving activations or some calculations at higher precision.

### Mixed precision

Keep sensitive layers or values at higher precision while quantising the rest.

### Dynamic or on-the-fly quantization

Apply conversion when loading or running the model rather than distributing a permanently converted checkpoint.

Methods such as GPTQ, AWQ, bitsandbytes, GGUF-based quantisation, and hardware-specific formats make different trade-offs. A label such as “4-bit” is not sufficient to compare two builds.

Quality loss may appear unevenly. Average benchmark scores can hide regressions in:

- exact calculations;
- code generation;
- function calling;
- long context;
- low-frequency languages;
- safety behaviour;
- calibrated confidence;
- deterministic structured output.

Performance also depends on hardware support. A lower-bit model can be slower if the device lacks optimised kernels or must repeatedly convert values. Memory bandwidth, GPU architecture, CPU vector instructions, batch size, and context length all matter.

A responsible selection process should compare the original and quantised models using:

1. representative tasks;
2. identical prompts and decoding settings;
3. multiple runs;
4. output-quality and task-success measures;
5. memory consumption;
6. tokens per second and latency;
7. energy or infrastructure cost;
8. structured-output and tool-call reliability;
9. safety and refusal tests.

Quantization is one of the most important techniques for practical local AI, but it is a deployment transformation rather than a free compression step.

## Evidence

- [Hugging Face — Quantization concepts](https://huggingface.co/docs/transformers/quantization/concept_guide) — explains how quantization reduces model memory and compute and describes core concepts.
- [Hugging Face — Quantization overview](https://huggingface.co/docs/transformers/quantization/overview) — compares supported methods, bit widths, hardware, calibration, and fine-tuning support.
- [Hugging Face — Quantization API](https://huggingface.co/docs/transformers/main_classes/quantization) — documents quantisation configurations and method-specific requirements.
- [Google AI Edge](https://developers.google.com/edge) — documents hardware-accelerated on-device deployment and model quantisation tooling.
- [Small Language Models: Survey, Measurements, and Insights](https://arxiv.org/abs/2409.15790) — evaluates small-model memory footprints, latency, and efficiency trade-offs.
