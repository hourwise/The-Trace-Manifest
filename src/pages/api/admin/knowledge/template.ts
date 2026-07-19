// ADR 0017: Knowledge document template download.
// Publisher-only. Returns the canonical Markdown template for knowledge documents.

import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../../security/access-auth";

export const prerender = false;

const TEMPLATE = `---
canonical_question: "Your question here — this becomes the primary lookup key"
section: ai-agents
topics:
  - your-topic-slug
knowledge_type: explainer
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

# Question

<!-- Repeat the canonical question here for readability -->

## Direct answer

<!-- One to three paragraphs that directly answer the question -->

## Detailed explanation

<!-- Full explanation with context, nuance, and use-case distinctions -->

## How TRACE assessed this

<!-- Describe the methodology: sources consulted, criteria used, weighting -->

## Evidence

<!-- Bullet-point list of sources with URLs and what each contributes:
- [Source Name](https://...) — What this source establishes
- [Source Name](https://...) — What this source establishes
-->

## Important limitations

<!-- What this knowledge does NOT cover, edge cases, scope boundaries -->

## What remains uncertain

<!-- Known unknowns, disputed points, areas needing future research -->

## Related TRACE knowledge

<!-- Links to related knowledge documents, stories, or guides:
- [Related doc title](/knowledge/related-slug)
-->

## Review and expiry

<!-- When should this be reviewed? What would invalidate it? -->
`;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(TEMPLATE, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="trace-knowledge-template.md"',
      "Cache-Control": "no-store",
    },
  });
};
