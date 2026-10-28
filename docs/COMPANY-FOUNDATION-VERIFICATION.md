# Company foundation verification

Historical slice report: the checks below record B00/B01 on 18 October. B02/B03 have since added [identity/delivery verification](IDENTITY-DELIVERY-VERIFICATION.md); statements below about those features being planned describe the earlier snapshot.

18 October 2026. Delivered scope: B00 migration/baseline checks and the B01 protected-ownership/company-settings foundation. This is part of the [first implementation milestone](TECHNICAL-BLUEPRINT.md), not completion of onboarding, inventory or the first release.

## Implemented behavior

- Company currency/time zone are explicitly configurable through Access management, with a current version required for the new settings. Legacy name/active-only requests remain compatible. Unknown legacy settings remain null.
- Protected owner records are independent of editable role names. Ownership actions require both current active ownership and organization-wide ownership.manage. New appointments require a verified active member in the same company; they grant ownership.manage only, not unrelated administrative capabilities.
- Removing ownership preserves membership and other grants. A last active owner cannot be removed or deactivated, independently of the existing last-access-administrator rule. Deferred database checks cover membership/global-account deactivation as well as owner-record changes.
- Owner commands retain an intent key, request hash and immutable committed result pointer. Replays never repeat an appointment/removal, including after clearing the cached response. Current authorization is checked again after acquiring the organization lock. Lookup currently supports only the current actor's ownership commands in the selected company.
- Existing companies have no inferred owner. An operator explicitly maps the reviewed active member; this does not mark their email verified or widen unrelated business access. Empty-installation bootstrap records its explicit review automatically.
- An email change clears the verification marker; an unchanged normalized email retains it. Client-supplied verification fields cannot set it. The email verification/recovery flow itself is still planned.
- The access screen supports the new settings/owner controls. Mobile account navigation now reaches Access management, and the workspace header wraps without horizontal overflow at reviewed phone widths.

## Database and contract changes

New migrations: [003_company_foundation.sql](../server/db/migrations/003_company_foundation.sql) and [004_command_recovery.sql](../server/db/migrations/004_command_recovery.sql). Existing migrations 001/002 were not edited. Migration 004 separates durable command completion from disposable response caching; an existing completed command keeps its reference when the cached response is removed. Cache expiry scheduling/retention policy is not configured yet.

[Current OpenAPI](openapi.json) version 2.1 promotes three operations: appointOwner, removeOwner and ownership-command lookup. The company-settings/management operations document their new fields. The [planned contract](openapi-planned.json) removes those duplicate operations and records the future lookup extensions. All other planned operations remain design artifacts.

## Actual checks

| Check | Result |
| --- | --- |
| npm test | 10 passed; 2 database-suite entry points skipped when TEST_DATABASE_URL was absent |
| npm run test:integration with dedicated TEST_DATABASE_URL | 23 tests passed, 0 failed/skipped, on an isolated PostgreSQL 18 test database |
| npm run build | Passed after frontend changes |
| Current and planned OpenAPI structural validation | Both passed Swagger CLI validation |
| Blueprint reference/example/link checks | Passed after contract promotion; remaining operations marked planned and disjoint from current methods |
| Browser review using synthetic data | Desktop 1280, phone 390 and 320 widths; light/dark presentation; settings save, owner appointment/removal, disabled final-owner removal, mobile navigation and overflow checked |

Browser evidence: [desktop settings/ownership](screenshots/company-foundation-desktop.png) and [phone ownership controls](screenshots/company-foundation-phone.png). The final build also exercised invalid-currency recovery and an explicitly unreviewed company. Review servers and test database instances were stopped afterward.

The integration suites create and remove their own schemas in a database whose name ends in _test; they never fall back to DATABASE_URL. Evidence includes fresh/legacy migration runs, reruns and checksum rejection, preserved UUID/assignment/custom-department fixtures, foreign-company FK rejection, pending-lock revocation, concurrent owner removal, stale settings, unauthorized actors, typed errors, email-marker reset and cached-response recovery. The earlier race-test probe was corrected to observe both PostgreSQL's FK lock and the explicit organization lock; the final suite passes.

## Limits and deployment

No application database was migrated and nothing was deployed or published. The initial application database was offline. Tests used a separate local instance and synthetic accounts only. Live Firebase/Cloudinary/email success or failure recovery were not newly verified; the existing suite still checks invalid uploads/missing storage configuration only. No commercial readiness, throughput or complete accessibility audit is claimed.

B02 worker/outbox, B03 verification/recovery, B04 verified self-service workspaces/invitations and B05-B08 inventory/cutover remain open. Consequently existing employees cannot complete a new email-verification flow in this slice. Only ownership.manage was seeded; other proposed business permissions will ship with their enforcing modules. None of PRD A01-A16 is marked fully accepted by these foundation checks alone.

Before upgrading an application environment, back up database/storage, review ownership mapping, apply the new migrations with the deployment identity and deploy matching binaries. Runtime needs the new tables/functions but must not receive TRUNCATE on api_commands or audit_events. Retain command identities/result pointers for the lifetime of referenced records. Operator review must be performed deliberately in the intended environment, not against a guessed organization or by recognizing a role name. See [operations](RBAC-OPERATIONS.md).
