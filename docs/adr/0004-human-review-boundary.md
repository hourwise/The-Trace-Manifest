# ADR 0004: Human Review Boundary

**Status:** Accepted  
**Date:** 12 July 2026

## Context

AI systems can classify and summarise sources efficiently but may misread claims, miss conflicts, or reproduce source manipulation.

## Decision

The following require human review before publication:

- High-impact security claims
- Legal or regulatory claims
- Claims accusing organisations or individuals of misconduct
- Major benchmark conclusions
- “Best model” or “best provider” rankings
- Corrections affecting prominent stories
- Sponsored comparisons
- Claims based mainly on community reports
- Stories with strong contradictory evidence

Routine low-risk ingestion may be auto-published when confidence, source quality, and deterministic checks meet defined thresholds.

## Consequences

- Publication may be slower for high-risk stories.
- Editorial quality and accountability improve.
- Admin review tooling is part of the MVP.
