# Workspace onboarding and invitations

20 October 2026. B04 is delivered locally on top of the [company foundation](COMPANY-FOUNDATION-VERIFICATION.md) and [identity/delivery foundation](IDENTITY-DELIVERY-VERIFICATION.md). This records implementation evidence, not production readiness or acceptance of the remaining inventory/custody modules.

## Delivered flow

A signed-in verified non-demo account can create its own company with name, supported currency and IANA time zone. The transaction creates only a new company, active membership, protected ownership, owner grants and four starter roles. Signup itself still grants no company access or session. An organization header never selects an existing company for this operation. No platform operator approval is required for the new self-service flow.

New companies have Organization owner, Administrator, Asset manager and Employee starter roles. They contain only implemented permissions. Ownership remains a protected membership marker; a role name cannot establish it. Administrator excludes ownership.manage/organization.create; Asset manager contains current asset/file/directory/statistics permissions; Employee contains asset.read/file.read and is offered self scope by the invitation form. No existing company's roles or grants are broadened. New departments are configured explicitly; legacy bootstrap/review commands remain compatible.

Verified managers with both membership.manage and access.manage can invite an email, including one not registered yet. Pending invitations create no employee membership. API proposals support 1–50 role/direct grants with organization, department or self scope. Location scope is still B05. The initial form sends one role/scope; further access can be managed explicitly after joining. Self scope is relative to the recipient. A delegator must hold each permission at organization scope or the exact proposed department scope; their own self access is not a delegation source. Administrative permissions require organization scope. ownership.manage is never delegated by invitation.

Acceptance requires the matching active verified non-demo account. It rechecks the inviter's current active membership/account/verification, both management capabilities, delegated scopes, active company/roles/departments and saved role-permission snapshot after acquiring the company lock. Role permission changes require a replacement invitation. Acceptance inserts one membership and reviewed grants, consumes the invitation and records audit together. The directory department begins unset; administrators configure it explicitly. Existing active or inactive memberships conflict, so an invitation cannot silently reactivate or overwrite access.

Invitations expire after seven days. Revoke requires expectedVersion and a reason; replacement revokes the old proposal/token rather than editing grants. Expired pending records are closed when replaced. Token hashes persist; token-bearing outbox content is encrypted and scrubbed through existing delivery transitions. The worker rechecks invitation and inviter/grant state before rendering. Invitation subjects contain no company-sensitive details; the link authorizes again. All mail still uses local capture, with no network provider or public inbox.

The workspace, invite, revoke and accept commands use stable intent keys and durable result references. Successful repeats do not create another company, membership or email job, including after response-cache removal. Changed payload under the same key conflicts. Company commands now acquire the company lock before inserting their FK-backed command identity, avoiding an actor key-share lock while waiting for the company. Account acceptance locks the company then the two affected users in UUID order. A lost response can be recovered through the actor-only command lookup; current membership/permissions are checked before showing results. The browser stores opaque intent hashes/keys rather than invitation tokens.

## Database and contract

Migration [007_workspace_invitations.sql](../server/db/migrations/007_workspace_invitations.sql) adds organization_invitations, invitation_grants and membership invitation provenance with tenant foreign keys. SHA-256: `14646f41e38d0c91a6c1c47c5d9f42a9b8cbf80fc72f1a422d8cbfa9049d4383`. Applied migrations 001–006 were not edited.

[Current OpenAPI](openapi.json) version 2.3 promotes createWorkspace, listInvitations, inviteEmployee, revokeInvitation and acceptInvitation. The [planned delta](openapi-planned.json) removes those operations. Current command lookup includes the four new write families. Company settings awaiting legacy review may be null in acceptance/recovery responses; new creation requires known values. Invitation lists use tenant-bound UUID cursors, default 25/max100, and never return token material. Onboarding writes are limited to 30 per account per 15 minutes, with Retry-After on 429. No new permission capability is seeded.

Existing authorized /access/members and grant-management APIs remain for compatibility. They are administrative provisioning, not signup or invitation acceptance; they do not become public, self-service membership selection. The new onboarding UI uses invitations. Deactivation keeps the membership and historical asset/custody references; it does not return items. Full new custody accountability still needs B09/B10.

## Actual validation

| Check | Result |
| --- | --- |
| npm test without TEST_DATABASE_URL | 12 passed; five database-suite entry points skipped |
| Full database/HTTP suite | 57 passed, zero failed/skipped, in generated schemas on dedicated PostgreSQL 18 |
| Focused onboarding suite | 14 passed including contract-validated success/error responses |
| npm run build | Passed for the new pages and navigation |
| Current and planned OpenAPI | Both passed Swagger CLI structural validation |
| Documentation checks | Current/planned examples, references, local links and A01–A16/S01–S32/B00–B23 coverage checked |
| Browser review | Built app; desktop and 390/320 phone widths, light/dark; creation validation/success, starter-role invitation, invalid-scope recovery, revocation/reissue, wrong-account denial, old-token denial/latest-link recovery, correct employee acceptance and resulting scoped workspace |

Database cases cover unverified/disabled/demo denial, two concurrent workspace submissions, same-key mismatch and cache removal, no foreign-company membership, matching verification, two acceptance keys competing for one membership, invite-before-registration, existing inactive membership preservation, foreign roles/tenant cursors, scope escalation, role snapshot changes, expiry/replacement, scoped versioned revocation and outbox rollback. Acceptance races prove that invitation revocation and inviter permission revocation committed while it waits prevent a new membership. Existing owner/admin, audit, migration/checksum/UUID, identity/session and private-file failure checks still pass.

Screenshots: [phone invitation management](screenshots/onboarding-invitations-phone.png), [phone acceptance](screenshots/onboarding-accept-phone-dark.png) and [desktop workspace setup](screenshots/onboarding-workspaces-desktop.png). Reviewed views had no horizontal overflow. Token fragments were removed from the address bar, and opening a replacement link in the same tab refreshed the pending token. Browser review also proved that an employee could create/own a second company and switch back without owner permissions carrying over; an unverified account saw no creation form. No real email/account/company data was used.

## Remaining limits

Nothing was deployed, no application database was migrated and no external permissions changed. Live email and configured Firebase/Cloudinary success/failure behavior remain unverified. Local capture is refused in production; see [delivery operations](DELIVERY-OPERATIONS.md). Existing users are not silently verified, and existing company ownership still needs the documented operator review.

B05 locations/categories/units/scopes is next. B05–B23 remain planned; these checks do not mark all of PRD A01/A02/A14 accepted or claim commercial readiness. Invite reminders/resend scheduling and in-app business notices belong to later messaging work. A pending invite is replaced through revoke/reissue; no separate resend endpoint is claimed. UI offers one role/scope per invitation; the API supports multiple grants and access management supports later explicit changes.

The synthetic browser-review schema/helper files were removed and the dedicated test instance stopped. Reusable fixtures and screenshots remain. The focused 14-test onboarding suite was also rerun after final exactly-one-grant-field validation hardening.
