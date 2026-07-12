# ADR 0003: Initial Technical Direction

**Status:** Accepted  
**Date:** 12 July 2026

## Context

The MVP must remain inexpensive, SEO-friendly, and able to support scheduled ingestion, static content, lightweight dynamic features, and a future citation-grounded ask box.

## Decision

Begin with:

- Astro
- TypeScript
- Cloudflare Pages
- Cloudflare Workers
- Cloudflare D1
- Cloudflare Cron Triggers
- Cloudflare R2 where required

## Consequences

### Positive

- Low initial operating cost
- Strong static performance
- Good SEO
- Simple scheduled ingestion
- Easy RSS generation
- Clear path to hybrid rendering

### Risks

- D1 may become limiting for complex analytics or account features.
- Semantic search may require an additional service.
- Team and enterprise functionality may justify Supabase or PostgreSQL later.

## Revisit when

- User accounts become central
- Complex vector search is required
- Team workspaces are introduced
- Data volume or query complexity exceeds D1 suitability
