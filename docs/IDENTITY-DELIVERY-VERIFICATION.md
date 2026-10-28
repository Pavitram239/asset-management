# Identity and delivery verification

Historical B02/B03 slice report. B04 has since delivered [workspace onboarding and invitations](WORKSPACE-ONBOARDING-VERIFICATION.md); references below to B04 being next describe this earlier snapshot.

19 October 2026. B02/B03 are implemented and checked locally against synthetic data. These foundations do not complete PRD A01/A02/A14: verified company creation, invitations, custody and business notifications still need their delivery slices. [Operations](DELIVERY-OPERATIONS.md) documents configuration and limitations.

## Delivered behavior

- Transactional encrypted mail jobs, logical deduplication, competing-worker leases, bounded retry/jitter, expiring leases, stale acknowledgement rejection, timeout/abort, terminal failure visibility and payload scrubbing.
- Encrypted local mail capture without a network provider or public inbox. Rendering is allowlisted; account recipients/token state are rechecked before delivery.
- Registration plus verification enqueue with no automatic session/membership/grants; authenticated replay-safe resend; recipient-bound single-use verification; generic recovery request; single-use reset with session revocation.
- Email changes clear verification and revoke links at the database boundary. Profile change and new-link enqueue commit together. Client-supplied verification flags cannot set the marker.
- Shared per-IP and per-recipient/account limits; same-origin protection; typed errors and request IDs for the new endpoints. Token hashes only in account_tokens, encrypted token payloads in the outbox, no message/body logging.
- Login recovery link, request/confirmation/error screens, verification notice and profile email-change state. Confirmation requires a button action; tokens use fragments, are cleared from the address bar and are never sent in request URLs. Opening a newer fragment in the same tab replaces the older page token.

## Persistence and contract

New migrations (001–004 unchanged):

| Migration | SHA-256 |
| --- | --- |
| 005_delivery_outbox.sql | 54137da6018d3d5bbb50b5ab0bae0c5f408f83b02cacae059028176308af6c62 |
| 006_account_identity.sql | de273576d433b9c723e57af6139e01e2ea36fcf2a87cd6554afe8d2976ee1f04 |

Current contract version 2.2 promotes requestVerification, verifyEmail, requestRecovery and resetPassword from the planned delta. lookupCommand now also supports context=account for the actor's requestVerification results. Registration/login/current-user/profile descriptions document the new behavior; compatibility routes and UUIDs remain. The remaining planned operations stay disjoint from current methods.

## Actual checks

| Check | Result |
| --- | --- |
| npm test without TEST_DATABASE_URL | 12 passed; four database-suite entry points skipped |
| npm run test:integration with dedicated TEST_DATABASE_URL | 43 passed, zero failed/skipped; PostgreSQL 18, generated test schemas |
| npm run build | Passed after account-screen changes and same-tab token fix |
| Worker CLI once | Passed against the synthetic review schema; migrations verified and pending account message captured |
| Current/planned OpenAPI validation | Both passed Swagger CLI validation |
| Documentation references/examples/coverage | verify-blueprint.cjs passed; planned operations remain marked planned |
| Browser review | Built app at desktop 1280 and phone 390/320; light/dark, account creation/login, resend feedback, revoked-link error then latest-link success in the same tab, fragment removal, recovery request, mismatch validation, reset success/new-password sign-in and profile email-change notice |

Database evidence includes transaction rollback, concurrent deduplication/claims/token consumption, crash/reclaim and exhausted leases, stale completion fencing, bounded delayed retry, unknown acknowledgement with two captured emails and one business write, expired payload/capture cleanup, unsupported/altered ciphertext, revoked delivery context and operation timeout. Existing tenancy, owner/admin, migration rerun/checksum, legacy UUID/assignment and invalid-upload/storage-configuration tests also pass.

Identity evidence includes no signup cookie/grants, verification bound to the intended account even when another account submits the link, token replay/expiry/revocation, disabled/demo accounts, old-address links, durable resend/cache removal, actor-only account lookup, generic unknown-account recovery, UTF-8 password bounds, reset without accidental verification, older version-0/current cookies rejected after reset, and profile rollback on mail configuration failure.

Screenshots: [phone verification notice](screenshots/identity-verification-phone.png), [320-pixel dark reset validation](screenshots/identity-reset-phone-dark.png), [desktop missing-link recovery](screenshots/identity-reset-desktop.png). Reviewed screens had no horizontal overflow; keyboard Tab moved from the recovery email input to its submit button. This is a focused browser review, not a complete accessibility audit.

## Limits

No application database was migrated, no existing account was verified, and nothing was deployed or published. Local capture is the only email adapter and is unavailable in production. No live email, Firebase or Cloudinary success/timeout/provider-failure claim is made. Existing private-file failure tests establish only local authorization/input checks and missing-storage-configuration behavior. No provider is selected, no real messages were sent and no external permissions changed.

No business reminder scheduler, delivery administration API, retention service for minimal job history, key rotation, in-app notifications or generic typed attachment links are claimed. These remain later workflow/deployment work. B04 (verified self-service workspace and invitations) is next; B05–B23 remain planned. The previously completed mockups are still separate from runtime acceptance.

Cleanup completed 20 October: both named synthetic review schemas and temporary helper/state files were removed; the dedicated test instance is stopped. Screenshots and reusable integration fixtures remain. A final JSON-hash refinement also passed its two encryption checks and nine delivery integration checks after the 43-test full run.
