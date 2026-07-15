# Architecture decision records

| ADR | Status | Decision |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Accepted | Record architecture decisions. |
| [0002](0002-product-name-and-domains.md) | Accepted | Product name and canonical domains. |
| [0003](0003-initial-technical-direction.md) | Accepted, partly superseded by runtime needs | Initial technical direction. |
| [0004](0004-human-review-boundary.md) | Accepted | Human review boundary. |
| [0005](0005-commercial-independence.md) | Accepted | Commercial independence. |
| [0006](0006-database-validation-and-migration.md) | Accepted | Database validation and migration. |
| [0007](0007-early-ask-validation.md) | Historical/retired implementation | Early static Ask validation; fabricated prototype answers have been removed. |
| [0008](0008-trace-model-api-endpoint-security-and-cost-containment.md) | Accepted, implementation partly superseded by ADR 0012 | Model API, provider security, and cost containment. |
| [0009](0009-governed-social-media-signal-intake-linked-source-discovery-and-outbound-linking.md) | Accepted | Governed social signals, linked-source discovery, and outbound linking. |
| [0010](0010-expanded-editorial-scope-curated-products-and-governed-auto-publication.md) | Accepted | Editorial scope, curated products, and governed automatic publication. |
| [0011](0011-advertising-sponsorship-affiliate-marketing-and-commercial-implementation.md) | Accepted | Commercial implementation and editorial firewall. |
| [0012](0012-durable-controls-access-admin-and-publication-boundaries.md) | Accepted; rollout pending | Durable controls, Access administration, and publication gates. |
| [0013](0013-trace-guides-lab-authorship-verification-and-ask-trace-knowledge-integration.md) | Accepted | Guides, TRACE Lab, authorship, verification, and Ask knowledge retrieval. |
| [0014](0014-context-preserving-sharing-versioned-snapshots-and-social-preview-integrity.md) | Accepted | Context-preserving sharing, snapshots, and social-preview integrity. |

ADR status describes the decision, not proof that production deployment or acceptance tests have completed.

## Planning assessment

- ADR 0001–0007 establish the product, evidence and review baseline.
- ADR 0008 remains the model-provider and cost policy; ADR 0012 supplies the durable runtime controls that make its public operation safe.
- ADR 0009–0011 govern future source expansion, automatic publication and commercial activity. Their controls must be implemented before the associated features are enabled.
- ADR 0012 is launch-critical: its migration, Access, audit, publication and Ask TRACE controls require deployment verification before public AI is enabled.
- ADR 0013 is the first planned content expansion. Guides require named ownership, verification, freshness monitoring and six reviewed launch-ready records before a prominent public route.
- ADR 0014 is a later enhancement. It requires canonical correction-aware metadata first; public snapshots, public Ask sharing and automated social posting are not launch features.
