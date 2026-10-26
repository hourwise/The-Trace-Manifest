# TRACE Weekly: privacy and PECR readiness review

**Status:** engineering review, **not legal advice and not an approval.** The signup stays disabled (`TRACE_NEWSLETTER_SIGNUP_ENABLED` unset) until the owner, with legal advice where needed, approves the items marked **Outstanding**.

**Scope:** UK GDPR and the Privacy and Electronic Communications Regulations (PECR) for a free editorial email newsletter sent to individuals. TRACE's own policy (ADR 0011 §5) already lists a **privacy notice** as a prerequisite for newsletter work. ADR 0011 also requires that commercial features never weaken email preferences or unsubscribing.

## What the implementation already does

| Requirement | Implementation (#13) |
|---|---|
| Consent for electronic marketing to individuals (PECR reg. 22). There is no existing customer relationship, so the "soft opt-in" does not apply. | Explicit signup with **double opt-in**: nothing is sent except the confirmation until the person clicks and confirms. |
| Consent is specific, informed and unambiguous | One purpose (TRACE Weekly), described next to the form; no pre-ticked boxes; no bundling with other purposes. |
| Records of consent | `consent_version` (`trace-weekly-consent-2026-10-v1`) and `consented_at` for every subscriber; re-subscribing records fresh consent. |
| Easy withdrawal | An unsubscribe link in every issue, plus a `List-Unsubscribe` header; it works even when signup is closed, and the address is removed on unsubscribe. |
| Suppression | Unsubscribed and suppressed addresses are never sent marketing email; this is checked again at send time, and the keyed hash keeps blocking re-sends without keeping the address. |
| Data minimisation and security | Only the address, consent record and hashed tokens are stored. Lookups use a keyed hash. The address never appears in logs, admin pages or public responses. Responses do not reveal who is subscribed. |
| No marketing use beyond the newsletter | The consent text says so; there is no sponsorship or tracking in the issue template. |

## Outstanding before public activation

1. **A privacy notice** (UK GDPR Articles 13 and 14), linked from `/newsletter` and from every email. It must state:
   - the controller's identity and contact details;
   - the purpose and lawful basis (consent);
   - the recipients (the email provider, as processor);
   - any international transfer and its safeguards (most providers process in the US);
   - retention periods;
   - the rights to access, rectify, erase and withdraw consent at any time;
   - the right to complain to the ICO.

   TRACE has no privacy page today.
2. **Sender identity in the emails:** PECR requires the sender's identity and a valid address for opting out. The unsubscribe link meets the opt-out part. **Add the controller's name and a contact address to the email footer** once the owner provides them; it is not invented here.
3. **The consent wording:** the owner must approve `NEWSLETTER_CONSENT_TEXT` (or replace it). If it changes, bump `NEWSLETTER_CONSENT_VERSION`; it should link the privacy notice.
4. **A processor agreement** with the chosen provider (a data processing agreement and transfer terms) before any real address is stored with it.
5. **Retention rules** (not yet automated):
   - pending addresses that never confirm: proposed purge after 30 days;
   - per-network signup attempt rows: proposed purge after 2 days;
   - the hash of an unsubscribed or suppressed address: kept only to honour the opt-out.

   The two purges are to be implemented as a bounded, publisher-run maintenance action before activation, or the retention periods documented if they are kept longer.
6. **Bounces and complaints:** importing provider suppression events (hard bounces, spam complaints) should be in place before volume grows; today an administrator sets suppression.
7. **ICO data protection fee:** the controller should confirm registration with the ICO, an owner obligation outside the code.
8. **Accessibility and clarity check** of the final copy and the confirmation email.

## Not in scope here

Sponsorship and commercial content in the newsletter are governed by ADR 0011 and need their own disclosure and approval; nothing in #13 or #14 adds them.
