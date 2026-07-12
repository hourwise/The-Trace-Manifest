# ADR 0001: Record Architecture Decisions

**Status:** Accepted  
**Date:** 12 July 2026

## Context

The project is expected to evolve across ingestion, retrieval, editorial workflows, AI models, monetisation, and public APIs. Important decisions must not be lost inside chat histories or implementation commits.

## Decision

Maintain Architecture Decision Records in `docs/adr`.

Each ADR should include:

- Status
- Date
- Context
- Decision
- Consequences
- Alternatives considered

ADRs are immutable historical records. Superseded decisions remain in the repository and link to their replacement.

## Consequences

- Architectural reasoning remains visible.
- New contributors can understand why choices were made.
- Changes can be reviewed against prior assumptions.
- Documentation must be updated as part of architectural changes.
