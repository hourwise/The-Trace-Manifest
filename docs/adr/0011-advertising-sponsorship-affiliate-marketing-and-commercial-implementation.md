# ADR 0011: Advertising, Sponsorship, Affiliate Marketing and Commercial Implementation

- **Status:** Accepted
- **Date:** 14 July 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** Advertising, direct sponsorship, newsletter sponsorship, affiliate links, commercial pages, curated discovery products, TRACE Guides, enquiries, analytics and editorial disclosures
- **Extends:** ADR 0005 Commercial Independence and `docs/product/monetisation.md`
- **Related decisions:** ADR 0004 Human Review Boundary; ADR 0008 TRACE Model API; ADR 0010 Expanded Editorial Scope; ADR 0013 TRACE Guides
- **Review trigger:** Before enabling an ad network, behavioural advertising, sponsored editorial, automatic affiliate-link insertion, paid rankings or inclusion in App Radar/Open Source Radar, user profiling, or commercial access to account or conversation data

## 1. Context

TRACE needs a credible route to cover infrastructure, email, data and model costs while funding better research and product development.

The existing repository permits:

- direct sponsors;
- newsletter sponsorship;
- carefully disclosed affiliate links;
- contextual developer advertising;
- supporter and professional plans.

The same organisations covered editorially may also wish to advertise, sponsor a newsletter or participate in an affiliate programme. This creates conflicts of interest and regulatory obligations.

The product also needs a clear public route for prospective advertisers rather than informal or hidden arrangements.

## 2. Decision

TRACE will implement commercial activity under a strict structural and visual firewall.

Initial commercial methods:

1. direct contextual sponsorship;
2. newsletter sponsorship;
3. house advertisements;
4. clearly labelled affiliate links and comparison pages;
5. supporter or professional subscriptions under separate implementation;
6. advertiser enquiry through an **Advertise with TRACE** page.

Initial commercial methods will not include:

- behavioural advertising;
- cross-site tracking;
- ads inside Ask TRACE answers;
- ads inside evidence or citation components;
- paid evidence ratings;
- paid rankings;
- paid inclusion in ordinary App Radar, Open Source Radar, Spotlight or TRACE Guide results;
- automatic affiliate-link rewriting across editorial copy;
- advertiser control of editorial conclusions;
- undisclosed sponsored content;
- sale of private conversation data;
- sale of user data to advertisers.

## 3. Commercial independence law

> **Commercial relationships may buy clearly labelled visibility. They may not buy evidence status, rankings, favourable conclusions, suppression of criticism, access to private user data, or influence over TRACE confidence calculations.**

ADR 0005 remains controlling where there is a conflict.

## 4. Initial commercial hierarchy

Preferred order:

```text
1. Direct site or vertical sponsor
2. Newsletter sponsor
3. House advertisements
4. Carefully selected affiliate links
5. Supporter memberships
6. Job listings or supplier directory
7. Contextual ad network only after separate review
```

Direct sponsorship is preferred because it can be:

- manually reviewed;
- contextually placed;
- contractually bounded;
- measured without invasive profiling;
- separated visibly from editorial material;
- disabled quickly.

## 5. “Advertise with TRACE” page

Create:

```text
/advertise
```

Place it in the footer or company/commercial menu, not primary editorial navigation.

The page should include:

- TRACE’s audience and subject areas;
- available placements;
- editorial-independence statement;
- prohibited categories;
- disclosure standards;
- traffic and newsletter figures once meaningful;
- campaign requirements;
- contact or enquiry form;
- privacy notice;
- statement that payment does not guarantee editorial coverage;
- statement that advertisers may be covered critically.

Suggested copy:

```text
Advertise with TRACE

Reach readers following AI, consequential technology, green energy
and future mobility.

TRACE offers a small number of clearly labelled, contextually relevant
sponsorship placements. Advertisers buy visibility, not editorial
influence. Commercial relationships never alter evidence ratings,
rankings, confidence labels or corrections.
```

## 6. Initial inventory

### 6.1 Site sponsor card

Permitted locations:

- homepage between clearly separated editorial modules;
- vertical landing page;
- article end;
- newsletter signup success page.

Requirements:

- visible `Sponsored` or `Advertisement` label;
- distinct component style;
- no resemblance to a normal story card;
- destination domain where useful;
- no auto-play;
- no deceptive controls;
- no placement inside citations.

### 6.2 Newsletter sponsor

Permitted positions:

- one block near the beginning;
- one optional block near the end.

Requirements:

- immediately labelled;
- visually separated;
- sponsor copy stored separately from editorial copy;
- sponsor cannot approve or amend the briefing;
- sponsor cannot suppress coverage;
- link measurement must follow privacy rules;
- email preferences and unsubscribe remain unaffected.

### 6.3 Vertical sponsor

Example:

```text
Green Tech briefing — supported by Example Energy
```

A vertical sponsor may receive:

- logo or name in a labelled area;
- short approved description;
- link;
- fixed campaign dates.

It may not receive:

- category exclusivity that suppresses competitor coverage;
- influence over story selection;
- veto rights;
- placement inside evidence ratings;
- favourable default rankings.

### 6.4 Article-end sponsor

Allowed only after editorial content and sources.

The component must not interrupt the evidence trail or imply that the advertiser supported the article’s conclusion.

### 6.5 House ads

TRACE may promote:

- supporter membership;
- newsletter;
- PCGsoft products;
- related TRACE features.

House ads must remain visually distinguishable from editorial content.

## 7. Prohibited placements

Do not place advertising:

- inside Ask TRACE generated answers;
- between a factual claim and its citation;
- in the evidence panel;
- in confidence explanations;
- inside correction notices;
- inside legal or safety warnings;
- as a fake search result;
- as an unlabeled story;
- in a way that obscures the destination;
- through notifications without separate permission.

Commercial prompts must not be injected into the model evidence packet. Ordinary stories, guides, app profiles, repository profiles and Spotlight records must not be converted into sponsored content types.

## 8. Sponsored content

Sponsored articles or advertorials are **not part of the initial implementation**.

A later proposal requires a separate decision covering:

- content type;
- labelling;
- advertiser control;
- claim substantiation;
- author identity;
- evidence treatment;
- corrections;
- indexing;
- distribution;
- archive and expiry;
- conflicts with editorial coverage.

No sponsored item may use the ordinary `story` content type.

## 9. Affiliate marketing

### 9.1 Permitted use

Affiliate links may appear in:

- `TRACE Selects`;
- `Tools & Offers`;
- original buying guides;
- original technical guides with generic requirements and non-affiliate alternatives;
- original comparisons;
- clearly identified commercial sections;
- occasional editorial text where genuinely relevant and individually disclosed.

### 9.2 Prohibited use

Do not:

- convert every merchant link automatically;
- rewrite source links as affiliate links;
- replace primary-source destinations;
- rank products by commission;
- hide alternatives without affiliate arrangements;
- use affiliate links in citations;
- insert links into Ask TRACE answers based on commission;
- publish thin merchant-description pages;
- copy retailer or manufacturer text as the substance of a page;
- imply independent testing that did not occur.

Commission must not influence inclusion, ranking, evidence status or technical instructions in App Radar, Open Source Radar, Spotlight or TRACE Guides.

### 9.3 Disclosure

Affiliate content must be obviously identifiable where the commercial content begins.

Recommended disclosure:

> **Affiliate disclosure:** TRACE may receive a commission if you buy through links on this page. This does not change the price you pay. Commission does not determine TRACE’s evidence ratings, conclusions or product ranking.

A footer-only disclosure is insufficient.

### 9.4 Link attributes

Use:

```html
<a
  href="https://merchant.example/product"
  rel="sponsored noopener noreferrer"
>
  View offer
</a>
```

### 9.5 Original value requirement

An affiliate page must provide meaningful original value:

- comparison criteria;
- verified specifications;
- independent test evidence;
- compatibility;
- practical limitations;
- advantages and disadvantages;
- who should and should not buy;
- price checked date;
- non-affiliate alternatives;
- methodology;
- correction route.

A product’s affiliate availability is not sufficient reason to cover it.

## 10. Advertising disclosure

Every paid placement must use an unambiguous label:

- `Advertisement`;
- `Sponsored`;
- `Affiliate advertising`;
- `Paid partnership`.

Avoid unclear labels such as:

- partner;
- promoted insight;
- featured;
- recommended;
- supported content;

unless accompanied by an explicit advertising label.

Disclosure must be:

- visible before engagement;
- understandable without a tooltip;
- high contrast;
- not only at the bottom;
- retained in shared previews where reasonably possible.

## 11. Commercial relationship registry

```ts
type CommercialRelationshipType =
  | "advertiser"
  | "site-sponsor"
  | "newsletter-sponsor"
  | "vertical-sponsor"
  | "affiliate"
  | "gifted-product"
  | "paid-research"
  | "house-ad"
  | "other";

interface CommercialRelationship {
  id: string;
  organisationId: string;
  relationshipType: CommercialRelationshipType;

  startsAt: string;
  endsAt?: string;
  status:
    | "proposed"
    | "active"
    | "paused"
    | "ended"
    | "rejected";

  campaignName?: string;
  placementIds: string[];
  disclosureText: string;
  publicDisclosureRequired: boolean;

  contractReference?: string;
  approvedByUserId: string;
  createdAt: string;
  updatedAt: string;
}
```

Editorial ranking and evidence services must not receive:

- commission rate;
- campaign value;
- click-through target;
- conversion target;
- advertiser priority.

## 12. Placement data model

```ts
type CommercialPlacementType =
  | "homepage-card"
  | "vertical-card"
  | "article-end"
  | "newsletter-top"
  | "newsletter-bottom"
  | "house-ad";

interface CommercialPlacement {
  id: string;
  relationshipId: string;
  placementType: CommercialPlacementType;

  label: "Advertisement" | "Sponsored" | "Affiliate advertising";
  headline: string;
  body: string;
  destinationUrl: string;
  destinationDomain: string;

  startsAt: string;
  endsAt: string;
  status:
    | "draft"
    | "approved"
    | "active"
    | "paused"
    | "expired"
    | "rejected";

  allowedVerticals: string[];
  excludedStoryIds: string[];
  excludedTopics: string[];

  createdByUserId: string;
  approvedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}
```

Never accept executable advertiser HTML or arbitrary scripts.

Creative fields are plain text plus controlled image assets where enabled.

## 13. Editorial conflict disclosure

When TRACE covers an organisation with an active commercial relationship, show a disclosure where the relationship could reasonably affect perception.

Example:

> **Commercial disclosure:** TRACE currently has an affiliate relationship with this company. That relationship did not determine this article’s evidence classification or conclusion.

A commercial relationship must not prevent:

- critical coverage;
- corrections;
- negative findings;
- competitor coverage;
- inclusion in comparisons;
- removal from recommendations when evidence changes.

## 14. Roles and permissions

### Commercial administrator

May:

- manage enquiries;
- create draft relationships;
- create draft placements;
- view campaign reports.

May not:

- alter evidence ratings;
- alter source trust;
- alter confidence;
- suppress stories;
- approve corrections.

### Editorial administrator

May:

- review conflict disclosures;
- exclude inappropriate adjacency;
- approve or reject creative for editorial safety;
- publish critical coverage.

May not:

- change rankings based on commission;
- promise favourable coverage.

### System

Must:

- render commercial types separately;
- keep audit records;
- enforce dates and states;
- fail closed when disclosure is missing;
- never mix commercial items into editorial ranking.

During the solo-founder phase, one person may hold both roles, but the data model and logs must preserve logical separation.

## 15. Advertiser enquiry form

Recommended fields:

- name;
- business email;
- organisation;
- website;
- campaign type;
- relevant vertical;
- proposed dates;
- budget range, optional;
- campaign description;
- confirmation of prohibited-category policy;
- privacy acknowledgement.

Controls:

- `POST` only;
- strict schema;
- body-size limit;
- Turnstile or equivalent;
- rate limiting;
- spam filtering;
- no attachments initially;
- no arbitrary HTML;
- sanitised admin display;
- encrypted transport;
- retention limit.

Submission does not create an advertiser account or active placement.

## 16. Prohibited or restricted advertiser categories

Initially reject:

- illegal goods or services;
- malware, spyware or credential theft;
- deceptive financial schemes;
- unlicensed gambling;
- unlicensed or misleading medical claims;
- political campaign advertising;
- unsubstantiated greenwashing campaigns;
- counterfeit goods;
- exploitative surveillance products;
- weapons and prohibited products;
- adult sexual content;
- misleading AI “guaranteed income” schemes;
- services conflicting directly with TRACE trust and security principles.

Additional categories may require case-by-case review.

## 17. Claims in advertisements

Commercial copy must be:

- legal;
- decent;
- honest;
- truthful;
- substantiated;
- not materially misleading.

Request evidence for objective claims where appropriate.

Advertisements must not mimic TRACE evidence labels or say:

- TRACE verified;
- TRACE approved;
- evidence confirmed;
- highest confidence;

unless a separate real and disclosed assessment exists.

## 18. Contextual placement

Initial targeting may use page context:

```text
AI & Agents
    -> developer tools, hosting, security or training sponsor

Green Tech
    -> relevant engineering, energy or research sponsor

EV & Mobility
    -> charging, fleet or transport sponsor
```

Contextual placement uses the page taxonomy, not a personal profile.

Do not initially target by:

- private Ask TRACE questions;
- saved conversations;
- email content;
- sensitive interests;
- cross-site behaviour;
- precise location;
- inferred personal characteristics.

## 19. Analytics, cookies and tracking

### 19.1 Initial rule

Prefer privacy-preserving first-party aggregate measurement.

Potential metrics:

- placement impressions;
- clicks;
- date;
- placement ID;
- broad page vertical;
- aggregate device category where lawful and necessary.

Do not expose private user identifiers to advertisers.

### 19.2 Tracking technologies

Before adding third-party pixels, cross-site identifiers or retargeting:

- perform a privacy review;
- determine PECR and UK GDPR requirements;
- update consent management;
- update privacy and cookie notices;
- document processors and transfers;
- make rejection as easy as acceptance;
- prevent trackers loading before valid consent where required.

Behavioural advertising is not authorised by this ADR.

### 19.3 Affiliate attribution

Before adding an affiliate programme:

- review tracking behaviour;
- document cookies and recipients;
- ensure disclosures;
- implement consent where required;
- avoid destination cloaking;
- provide a non-affiliate alternative where practical;
- ensure rejection of tracking does not block editorial access.

## 20. Email and newsletter marketing

Requirements:

- explicit signup;
- clear description of content;
- unsubscribe in every marketing email;
- suppression list;
- no sale of subscriber addresses;
- no sponsor access to the list;
- link measurement only under approved privacy controls;
- signup separable from account creation;
- commercial email consent records retained appropriately.

An advertiser enquiry does not subscribe the enquirer to the newsletter.

## 21. Ask TRACE and account-data firewall

Advertisers and affiliate partners must never receive:

- private questions;
- conversation history;
- saved topics tied to identifiable users;
- email addresses;
- account identifiers;
- source-submission history;
- unpublished editorial plans.

Ask TRACE must not:

- choose products based on commission;
- alter an answer because a company is a sponsor;
- insert advertising into evidence;
- expose campaign data to the model;
- use conversations for ad targeting.

A separate sponsor component may appear elsewhere on the page, never inside the generated answer.

## 22. Commercial endpoints

Public:

```text
POST /api/commercial/enquiry
```

Administrative:

```text
POST   /api/admin/commercial/relationships
PATCH  /api/admin/commercial/relationships/:id
POST   /api/admin/commercial/placements
PATCH  /api/admin/commercial/placements/:id
POST   /api/admin/commercial/placements/:id/approve
POST   /api/admin/commercial/placements/:id/pause
```

Requirements:

- strong authentication;
- role checks;
- CSRF protection where applicable;
- audit logging;
- idempotency for writes;
- no advertiser scripts;
- destination validation;
- controlled image storage;
- server-side expiry.

## 23. Audit records

Record:

- relationship creation;
- approval;
- placement creation;
- creative edits;
- disclosure edits;
- activation and pause;
- destination changes;
- measurement configuration;
- conflict disclosures;
- complaints;
- refunds or termination where relevant.

Do not store card payment data. Use an appropriate payment processor if online payment is later added.

## 24. Complaints

Provide a route to report:

- unclear labelling;
- misleading claims;
- unsafe destination;
- inappropriate placement;
- undisclosed affiliate link;
- broken link;
- conflict-of-interest concern.

Commercial material can be paused immediately without deleting audit history.

Editorial corrections must not be negotiated in advertising contracts.

## 25. Implementation phases

### Phase C1 — Policy and public foundation

- Add ADR 0011.
- Update monetisation and editorial-independence documents.
- Create `/advertise`.
- Add enquiry form.
- Publish prohibited-category and independence statements.
- Add no commercial scripts.

### Phase C2 — Commercial registry

- Add organisation, relationship and placement tables.
- Add migrations and indexes.
- Add audit events.
- Add admin permissions.
- Add campaign state machine.
- Add conflict lookup by organisation.

### Phase C3 — Direct sponsorship components

- Create distinct sponsor components.
- Add homepage, vertical and article-end slots.
- Add newsletter sponsor block.
- Add feature flags.
- Add accessibility checks.
- Add server-side expiry.

### Phase C4 — Measurement

- Add minimal aggregate impressions and clicks.
- Add bot filtering.
- Add internal dashboard.
- Do not add cross-site tracking.
- Review privacy requirements before expansion.

### Phase C5 — Affiliate pilot

- Select one or two relevant programmes.
- Review terms and tracking.
- Add disclosure component.
- Add `rel="sponsored"`.
- Build one original, high-value comparison page.
- Include non-affiliate alternatives.
- Audit rendered links.

### Phase C6 — Later expansion

Separate decisions are required for:

- ad networks;
- behavioural targeting;
- sponsored articles;
- paid directories;
- commercial API;
- automatic affiliate-link insertion;
- marketplace or transactions.

## 26. Acceptance criteria

### Independence

- commercial values are inaccessible to ranking code;
- evidence and confidence services cannot read commission;
- advertisers cannot suppress stories;
- active relationships generate disclosure prompts;
- paid items use a distinct content type.

### Disclosure

- every placement shows an unambiguous label;
- affiliate disclosure appears before links;
- previews do not disguise paid content;
- newsletter sponsor blocks remain separate;
- material relationships are disclosed.

### Security

- enquiry form is rate-limited and bot-protected;
- advertiser HTML and scripts are rejected;
- destinations are validated;
- admin writes are authorised and audited;
- expiry is enforced server-side;
- no card data is stored.

### Privacy

- no conversation data reaches advertisers;
- no behavioural tracking loads;
- newsletter lists are not shared;
- aggregate analytics do not expose identity;
- affiliate tracking is documented and consent-controlled where required.

### Editorial UX

- ads cannot resemble story cards;
- ads never interrupt citations;
- no ads appear inside Ask TRACE answers;
- commercial content is immediately identifiable;
- commercial pages are excluded from editorial feeds.

## 27. Consequences

### Positive

- credible early revenue route;
- low dependence on invasive ad networks;
- professional commercial enquiries;
- auditable relationships;
- contextually relevant inventory;
- trust rules encoded in software.

### Negative

- direct sales require founder effort;
- strict rules may reduce revenue;
- inventory may remain small;
- affiliate tracking can complicate consent;
- critical coverage may cause advertisers to withdraw.

### Accepted trade-off

TRACE prioritises long-term trust and independence over maximum short-term advertising yield.

## 28. Required documentation updates

Update:

- `docs/adr/0005-commercial-independence.md` with a link to this ADR;
- `docs/product/monetisation.md`;
- `docs/trust/editorial-independence.md`;
- privacy notice;
- cookie notice;
- terms;
- newsletter policy;
- `README.md`;
- `ROADMAP.md`;
- master build plan;
- admin roles documentation.

The repository does not yet version the privacy notice, cookie notice, terms, newsletter policy or dedicated admin-role documentation. They are required launch artefacts before any commercial feature is enabled.

## 29. External references checked

Checked on 14 July 2026:

- ASA/CAP — Online Affiliate Marketing:
  https://www.asa.org.uk/advice-online/affiliate-marketing.html
- ASA/CAP — Recognising ads: Advertisement features:
  https://www.asa.org.uk/advice-online/recognising-ads-advertisement-features.html
- ASA/CAP — Recognising ads: Social media and influencer marketing:
  https://www.asa.org.uk/advice-online/recognising-ads-social-media.html
- ICO — Cookies and similar technologies:
  https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/
- ICO — Guidance on storage and access technologies:
  https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/
- ICO — Electronic mail marketing:
  https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/
- Google Search Central — Affiliate programmes and added value:
  https://developers.google.com/search/blog/2014/01/affiliate-programs-and-added-value
- Google Search Central — Qualifying outbound links:
  https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links

Rules and guidance can change. Recheck before enabling ad networks, tracking pixels, new affiliate programmes or sponsored editorial.

## 30. Decision summary

TRACE will begin with direct, contextual and clearly labelled sponsorship plus carefully disclosed, original-value affiliate content. It will create an Advertise with TRACE page and a separate commercial registry. Commercial data will remain inaccessible to evidence, confidence and ranking systems. Behavioural advertising, ads inside Ask TRACE, sponsored editorial and automatic affiliate insertion are not authorised.
