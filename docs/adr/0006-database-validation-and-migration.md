# ADR 0006: Database Validation and Migration Triggers

**Status:** Accepted  
**Date:** 12 July 2026

## Context

D1 is the cost-minimising MVP choice, but the relational model has many interconnected entities and projected daily volumes of 300–1,500 raw items generating 50–300 clusters.

## Decision

Use Cloudflare D1 only after a projected-load stress test covering 100 sources, 1,500 raw items per day, 300 clusters per day, one year of metadata, concurrent ingestion and editorial reads, and multi-table claim/benchmark queries.

Maintain a migration path to PostgreSQL/Supabase.

## Migration triggers

- P95 core query latency above 500 ms
- Recurring write-contention delays
- User accounts and teams becoming central
- PostgreSQL-native semantic retrieval becoming necessary
- Complex analytics becoming operationally awkward
- Data-integrity or migration tooling becoming a material risk

## Consequences

- D1 is a cost-saving option, not a permanent ideological commitment.
- Migration path must be documented and tested before accounts launch.
- Schema design should avoid D1-specific features where PostgreSQL compatibility matters.
