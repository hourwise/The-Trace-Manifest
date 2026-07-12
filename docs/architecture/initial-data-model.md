# Initial Data Model

Before ingestion code is merged, create a concrete SQL DDL, Drizzle schema, or Prisma schema defining keys, constraints, indexes, provenance, versioning, correction relationships, retention, and supersession.

## Minimum entities

- sources
- source_policies
- feed_items
- story_clusters
- story_cluster_members
- entities
- claims
- claim_evidence
- claim_conflicts
- corrections
- models
- model_versions
- providers
- provider_offerings
- provider_prices
- benchmarks
- benchmark_versions
- benchmark_runs
- research_items
- repositories
- repository_events
- briefings
- curated_questions
- curated_answers
- answer_citations
- users
- watchlists
- alerts

## Provenance requirements

Every factual record must include source URL, publication date, retrieval date, last checked date, source type, version applicability, evidence status, superseded status, and correction status.
