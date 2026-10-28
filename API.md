# API guide: AssetOS

## Current contract and planned additions

[docs/openapi.json](docs/openapi.json) is the authoritative contract for existing endpoints. [docs/openapi-planned.json](docs/openapi-planned.json) is a design-only delta for new first-release operations; every operation is marked planned and none is claimed to be served today. Its x-existing-operation-changes register describes required future adaptations to existing routes. It deliberately contains no replacement definitions of current operations.

The identity/onboarding foundation introduced in version 2.3 adds verification requests/consumption, recovery requests/password resets and account-context verification-command lookup to the ownership/settings foundation. Registration queues verification atomically; login/session authentication supports revocation; current-user returns emailVerified; profile email changes revoke old links and queue a new one. See [identity/delivery evidence](docs/IDENTITY-DELIVERY-VERIFICATION.md) and [configuration/limits](docs/DELIVERY-OPERATIONS.md). Mail is local capture only. Current contract version 2.6 additionally implements inventory setup, catalog/opening stock and typed private inventory attachments; [catalog evidence](docs/CATALOG-INVENTORY-VERIFICATION.md) records actual checks. Generic command rules also apply to those families, not every legacy write. Workspace creation/invitations are delivered as described below.

When delivering a slice, implement and test the intended behavior, move its operation into the current contract and remove its planned copy in the same change. Update compatibility notes/tests for existing-route changes. Do not maintain two competing runtime contracts. Local OpenAPI validation establishes artifact consistency, not running HTTP behavior. Neither file is a published API or an external Postman workspace.

Base path: /api/v1. The frontend uses the shared same-origin client. Authentication is the token cookie, not an assumed bearer token. State-changing requests need same-origin/CSRF protection; verify detailed middleware during implementation, including cookie and Origin behavior. Organization operations require X-Organization-Id and an active membership. Current-user and workspace discovery have documented identity-context exceptions.

The frontend stores the selected company in tab-specific sessionStorage. Each tab sends its own X-Organization-Id, including command retries and private attachment operations; switching another tab cannot retarget its forms. Refresh retains the tab's selection, while a fresh tab requires an explicit selection. The old shared localStorage selection is ignored, so reload existing tabs and reselect a company after this update. Server authorization and the OpenAPI interface are unchanged. See [BUG-001 verification](docs/testing/BUG-001-VERIFICATION.md).

## Existing operations and compatibility

Version 2.3 additionally implements POST /workspaces and invitation list/create/revoke/acceptance, with [onboarding evidence](docs/WORKSPACE-ONBOARDING-VERIFICATION.md). Creation/acceptance use verified identity context; invitation management uses selected-company membership.manage AND access.manage and current delegation scope. All four new writes are replay-safe and registered for command lookup. Seven-day invitations create no access before matching verified acceptance, and never overwrite/reactivate memberships. Existing legacy company settings may still be null. Live email remains a separate integration dependency.

- /auth: register/login/logout, authenticated verification requests, public one-use verification/reset and generic recovery requests. Registration creates an unverified account plus encrypted verification event without session/membership/grants; mail configuration failure returns 503 without creating an account. Recovery does not verify email or grant company access.
- /products: individual-asset list/create/detail/update/delete, overview, assignment history and private authorized files.
- /users: current profile/update and scoped directory/statistics.
- /access: organizations, departments, memberships, roles, grants, effective access and audit. Current organization creation requires an existing organization.create grant; it is not self-service onboarding.
- /ownership: replay-safe appointment/removal by a protected owner with ownership.manage; new owners must be verified active company members. A role name or capability alone cannot establish ownership.
- /commands: current actor's ownership/invitation-management commands in the selected company, or requestVerification/createWorkspace/acceptInvitation with context=account. Current result membership/permissions are rechecked. Configuration, catalog/opening and attachment command families are also delivered; custody/purchasing/service families remain planned.
- /health: database connectivity check.

Existing responses retain _id UUIDs and products routes. assignedToId is the relationship identifier; displayed assignedTo is a name. Existing product writes support multipart productImg/invoice fields. Preserve these interfaces unless an explicit tested adapter/change is delivered. Current grants support organization/department/location-descendant/self, with family-specific allowed scopes. Existing assignee writes require same department; the new workflow explicitly permits an authorized active verified recipient in the same company across departments.

When ledger-backed inventory is enabled, legacy metadata writes remain compatible, while physical creation/assignment/status/deletion must use safe workflow adapters or return WORKFLOW_REQUIRED (409). This is a planned behavior change requiring simultaneous current-contract/frontend updates. Never leave an old route able to write stock outside the ledger. Warranty_date currently means the first expired day; new expiresOn preserves that meaning, with a single UI conversion for Coverage through.

Current error middleware generally returns msg; some fallback routes use message. Missing organization context is 400, invalid membership/permission 403, scoped object miss 404, authentication 401, uniqueness 409 and rate limit 429. Existing file reads also need asset.file.read. Embedded product-file links may provide organizationId query context; this never bypasses membership/scope checks. No permanent public private-file URLs.

## Planned operation families

The planned OpenAPI file provides request/response schemas and operation IDs. This table explains workflow boundaries rather than duplicating individual paths.

| Family | Intended behavior |
| --- | --- |
| Identity/workspaces/invitations/ownership | One-use verification/recovery, verified new-company creation, matching-account invite acceptance and protected owner continuity |
| Locations/categories/units/catalog | Flexible structure and three tracking modes; safe employee requestable catalog separated from stock/cost views |
| Inventory/opening balances/lots/history | Exact batch/unit allocations, balanced posting and preserved acquisition/warranty history |
| Item requests/handovers/returns/transfers/lifecycle | Approval, physical movement, confirmation/dispute, partial inspected return, transit and loss/disposal |
| Purchase requests/quotes/approval policies/instances/orders | Currency-specific sequential approvals, immutable revisions, renewed final-order authorization and formal issued documents |
| Purchase receipts/supplier resolutions/invoices/payments | Accepted stock only, separate rejection/replacement obligations, financial matching, external payment/reversal records |
| Contacts/faults/plans/work orders | Internal/external service responsibility, affected-quantity intake/completion and expenses |
| Counts/reports/notifications/QR/attachments/commands | Stale-safe corrections, scoped CSV, durable tasks, authorized lookup/private files and lost-response recovery |

## Planned wire conventions

New JSON success responses use {data: resource}. Lists use {data: [], meta: {nextCursor, pageSize}} with opaque cursors and default 25/max 100. Sort order includes a stable ID tie-breaker. Filter and cursor scope must match the selected company and current authorization; an invalid/stale cursor requires restarting the list. Reports include an asOf timestamp and explicit scope label. Do not imply a multi-page live query is a repeatable database snapshot.

All business identifiers are UUIDs. Quantity/unit-cost values are nonnegative numeric(20,6) decimal strings with up to 14 integer digits and 6 fractional digits. Commands require positive moved quantities and enforce the item's stricter unit scale; an individual move is exactly 1 per identity. Money always has amount and currency. Totals use declared currency rounding and never add different currencies. Missing unknown historical costs are omitted/null in the appropriate projection, never silently zero.

Mutable resources expose version as an integer within JavaScript's safe integer range. Commands on existing documents send expectedVersion and reject stale intent. Document revision and mutable version are distinct: revision identifies a submitted/issued purchase snapshot; version fences current workflow state. Posted histories are immutable; correction commands link reversals rather than changing original facts.

Dates are YYYY-MM-DD civil dates; event timestamps are UTC ISO instants. Reminder calculation uses company time zone. Scope is resolved from current grants, with both resource authorization and independent field redaction. allowedActions helps display the UI but is never trusted as permission.

## Idempotency and retry contract

New authenticated writes require a 16-100 character Idempotency-Key using letters, digits, underscore or hyphen. Store it once per user intent across retries/reloads. Its namespace is account/company + actor + operationId. Different payload under the same key returns IDEMPOTENCY_MISMATCH. Same committed payload returns the existing result after current authorization; full response caching may expire, but durable result linkage prevents another stock/financial posting for the retained record lifetime.

Organization context, path, normalized body and relevant immutable upload identity contribute to the canonical hash. For multipart staging, hash validated metadata/file digest rather than random multipart boundaries. Draft edits are also idempotent commands; a later distinct edit needs a new key. Public single-use token consumption and anonymous recovery use token semantics/rate limiting instead, as marked in the contract.

After timeout, keep the key and recover through GET /commands/{operationId}/{idempotencyKey}. Lookup requires the original actor and organization header for organization commands; context=account omits company context for workspace/account-only commands. It returns a committed result reference; 404 is no visible committed record, not proof a previous attempt never began. Retrying the same operation/key remains safe. Concurrent pending intent returns COMMAND_IN_PROGRESS with bounded Retry-After guidance. Reauthenticate/recheck permission before showing saved results. Never create a new intent automatically after an unknown response.

External delivery is after commit. The implemented encrypted outbox/local capture tests include failure, retry and uncertain acknowledgement without repeating the originating action. A real mail provider and business/in-app notifications remain planned; live mail/storage behavior still needs configured tests. Future inventory commands must use the same separation of business completion and delivery completion.

## Planned errors and examples

New errors use {msg, code, requestId, details?}; details contain safe field errors or accessible conflict references, never raw SQL/secrets/hidden costs. X-Request-Id correlates diagnostics. Validation/missing context is 400; authentication 401; membership/capability 403; scoped miss 404; state/version/stock/idempotency conflict 409; throttling 429; unexpected failure 500; database/service unavailability 503. Retry-After is supplied where bounded retry is meaningful. Read retries and write recovery are different operations.

Examples include 20 ordered/12 delivered/10 accepted/2 rejected, a two-pan handover, one damaged partial return, an approval decision, employee-safe catalog and committed-command lookup. Invalid allocation, requester self-approval, duplicate intent and stale count remain mandatory behavioral tests; valid JSON examples do not prove business invariants.

CSV export has the same rows/fields as the screen, escapes spreadsheet formula-leading values and enforces a documented server row limit without silent truncation. Issued PO downloads are generated from immutable snapshots. Attachments stream through the authorized private gateway; invoice/quotation documents also require restricted-cost visibility.

## Verification and delivery

Run contract structure, local reference, example/schema and operation-uniqueness checks for documentation. With implementation, add HTTP/database concurrency/recovery tests and browser checks. Storage-backed examples require configured services; record skipped external checks. [Blueprint verification](docs/BLUEPRINT-VERIFICATION.md) records this design's actual artifact checks. The [backlog](docs/IMPLEMENTATION-BACKLOG.md) defines implementation evidence still required.

## Delivered inventory setup (B05, introduced in contract 2.4.0)

`GET/POST /locations`, `GET/PATCH /locations/{id}`, `POST /locations/{id}/move-previews`, `POST /locations/{id}/moves`, `GET/POST /categories`, `GET/PATCH /categories/{id}` and `GET/POST /units-of-measure` are implemented under `/api/v1`. Reads currently require the matching location.manage/category.manage/unit.manage capability; future catalog permissions are not seeded early. Lists use company/type-bound UUID cursors, pageSize 1–100 and include archived configuration. Writes require stable Idempotency-Key; edits/moves require expectedVersion. All seven configuration command operation IDs support authorized durable lookup.

Moves require an unexpired actor-bound impactPreviewId and explicit acknowledgement. Scope/tree/role-permission changes invalidate previews with SCOPE_PREVIEW_STALE; stale record versions return VERSION_CONFLICT. The preview names scope gains/losses and counts without disclosing employee identities. Archiving retains historical scope but blocks new routing below inactive ancestors. Category field revisions are retained, and unit definitions cannot be edited. Quantity parsing uses exact decimal strings with declared precision 0–6; stock endpoints are not yet delivered.

Role/direct/invitation grants now accept location scope with same-company locationId. Legacy product lists/details/files/overview, directory suggestions and statistics apply current location-descendant scope in union with other grants. Location directory scope returns active assignees at covered legacy products; unknown location does not confer access. See [configuration verification](docs/INVENTORY-CONFIGURATION-VERIFICATION.md).

## Inventory ledger foundation (B06)

Migration 009 now provides internal catalog/lot/unit persistence, typed opening/adjustment posting sources, balanced immutable journals/entries, locked exact balance projections and a transactional domain-event outbox. The shared command boundary passes its durable command record to posting handlers. [Ledger verification](docs/INVENTORY-LEDGER-VERIFICATION.md) records 72 passing dedicated integration checks and current boundaries. B07 now provides the public catalog/opening-stock extension; legacy cutover remains B08, and the accepted business modules remain in scope. No generic public stock-writing endpoint, application-database migration, deployment or delivered business email is claimed.

## Delivered catalog/opening stock and private files (B07, 2.6.0)

Catalog list/create/detail/update, employee-safe requestable lookup and item revision history are current. Inventory lists scoped positive balances and complete acquisition lots; opening-balances posts verified existing stock exactly once. Category changes flag incompatible item data; new acquisition requires review. Unit/tag/date/currency rules and independent cost visibility are enforced before posting. Known cost requires cost.read in item/destination scope; unknown cost stays null only for cost-authorized readers and is omitted for others. Every committed replay rebuilds the currently authorized DTO instead of trusting a stored response.

Typed private attachment stage/link/remove/list/download supports item, lot and individual-unit targets. Financial categories/classification require cost.read, including filenames and replay. Stages are uploader-only for 24 hours, and removals retain history and queue cleanup. Downloads require authenticated company context from header or the validated organizationId query fallback; provider object keys are never returned. Storage configuration failures return STORAGE_UNAVAILABLE (503). No configured-provider success is claimed.

New catalog-linked individual units return WORKFLOW_REQUIRED on legacy PATCH/DELETE and hide those legacy UI actions; unlinked compatibility behavior remains until B08. Fields _id, serialNumber and assignment identifiers remain intact. See [B07 verification](docs/CATALOG-INVENTORY-VERIFICATION.md) for actual checks, promoted operations and scoped/full-lot limits. Supplier/contact fields and further file targets are extended with their owning modules, preserving the accepted first-release scope.


Migration compatibility repair (012/013): explicitly unlinked legacy products retain the current /products create/update/soft-delete contract and existing authorization/history checks. Catalog-linked units remain gated by WORKFLOW_REQUIRED through legacy mutation routes. This restores the declared boundary, without changing paths, responses or OpenAPI 2.6.0. The remaining B08 adapter/workflows are not claimed complete. See [backend regression repairs](docs/testing/BACKEND-REGRESSION-FIXES.md).
