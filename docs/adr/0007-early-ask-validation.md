# ADR 0007: Validate the Ask Experience Before Full RAG

**Status:** Accepted  
**Date:** 12 July 2026

## Context

The citation-grounded ask box is both the main differentiator and the largest technical risk. Building a full retrieval-augmented generation pipeline before validating demand could waste significant effort.

## Decision

Build a Phase 1 static prototype containing 20–30 manually curated, cited questions and answers before implementing the full retrieval pipeline.

This validates demand, establishes answer formatting, reveals recurring questions, tests freshness and confidence labels, and creates an evaluation set for the later RAG system.

## Consequences

- The ask box appears in Phase 1 as a static, curated experience rather than a dynamic RAG system.
- The full RAG pipeline moves to Phase 5 with a validated answer-quality benchmark.
- Early user feedback on answer quality, formatting, and usefulness informs the RAG design.
- Reduces the risk of building a complex system that doesn't meet user needs.
