# Threat model

## Assets

Provider and internal-service secrets, prepaid balance, D1 publication integrity, reviewer identity, audit history, corrections, source provenance, user privacy, and service availability.

## Trust boundaries

```text
browser -> Cloudflare edge/Pages -> D1
                                  -> signed internal request -> ingestion Worker -> D1/R2
                                  -> model gateway -> DeepSeek
administrator -> Cloudflare Access -> Pages admin/proxy
scheduled event -> ingestion Worker -> external source -> D1/R2
```

External source text and model output are untrusted data. Access assertions are trusted only after local signature and claim verification. Internal Worker requests are trusted only after HMAC, timestamp, nonce, replay, route, and role checks.

## Principal threats and controls

| Threat | Controls | Residual risk |
|---|---|---|
| Provider key disclosure/browser bypass | Server-only adapter, secret scanning, no public env names, first-party endpoints | Platform or maintainer credential compromise |
| Cost storm, double click, retry loop | D1 ownership/idempotency, visitor quota, concurrency lease, atomic reservation, attempt count 1, zero automatic retries, circuit breakers | Provider may bill an ambiguous timed-out request; estimate is retained |
| Prompt injection from sources | Governed corpus only, bounded excerpts, explicit untrusted-data prompt, no tools/web, strict output/citation validation | Semantically misleading source material still requires editorial/evaluation review |
| Hallucinated citation or confidence | Supplied-ID validation, evidence-linked claims, deterministic confidence, safe non-answer | Automated support checking is structural, not full semantic proof |
| Admin token theft/CSRF | Cloudflare Access JWT verification, no browser master token, same-origin mutations, role map | Access account compromise; mitigate with Access policy/MFA |
| Direct Worker mutation/replay | Signed exact request, timestamp, nonce table, role/route matrix, no CORS | Shared signing-secret compromise |
| Draft/raw data exposure | Explicit column queries and reviewed publication predicates; catalogue defaults draft | A future route may bypass helpers; static CI scan and review remain necessary |
| Ingestion false success or unsafe remote input | Awaited source processing, explicit succeeded/failed/unsupported/rejected outcomes, bounded/content-typed RSS reads, validated redirect limits, remote-URL filtering, and bounded stored fields | Parser quality, DNS rebinding, and upstream semantic changes require deployment monitoring |
| Stored/DOM injection | Astro escaping, safe URL parsing, bounded admin fields, removed unsafe recent-publish interpolation | Reviewed static HTML fields in knowledge content remain repository-trusted |
| Audit tampering/gaps | D1 audit before mutation, idempotent outcome event, denial audit | Privileged D1 administrator can alter records; external export/alerting is pending |

## Privacy

Raw IP addresses and full questions are not stored by the AI control tables. A daily visitor identifier and question digest are keyed with a server secret. On the first governed AI request after a seven-day retention deadline, stored responses and the visitor, question, and evidence identifiers are scrubbed; minimal request ownership and accounting records remain. Aggregate usage/audit retention must be set operationally. Provider-bound excerpts are restricted to public published evidence.

## Launch-blocking residual work

Turnstile/WAF policy, external alert delivery, deployed Access tests, provider terms/pricing review, D1 concurrency verification, log retention, backup restore drill, and independent security review.
