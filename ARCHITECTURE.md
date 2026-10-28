# Architecture: AssetOS

Technical blueprint, 18 October 2026. The target design below is proposed implementation guidance for the accepted [PRD](PRD.md); it is not a description of completed features. See the [blueprint index](docs/TECHNICAL-BLUEPRINT.md), [data model](DATABASE.md), [workflows](docs/WORKFLOWS.md), [permissions](docs/PERMISSIONS.md) and [backlog](docs/IMPLEMENTATION-BACKLOG.md).

## Current implementation

The npm workspace contains React 18/Vite, React Router loaders/actions, an Express JSON API, PostgreSQL accessed with pg repositories, private Firebase asset storage and Cloudinary avatars. Node requirements and existing commands are in [README](README.md). Keep the root lockfile and workspace layout.

Current authorization resolves active organization memberships, roles and direct grants from PostgreSQL. Current grants have organization, department, location-descendant and self scopes. Asset/access writes serialize on an organization row, recheck grants inside the transaction and write audit/history atomically. Migrations 001 and 002 are checksum-protected. Catalog/opening pooled and consumable stock now use the shared ledger; custody and procurement remain planned.

Migrations 003/004 implement protected ownership, nullable legacy company settings, company versions and durable ownership commands. Owner continuity remains independent of the last-access-administrator guard. Migrations 005/006 add the encrypted delivery outbox/attempts/local captures, account tokens, session versions and email-change revocation. Durable command lookup now also covers onboarding, inventory configuration, catalog/opening and typed inventory attachments; later workflow families remain planned. Verification/recovery now run locally through captured mail and the separate worker. See [company evidence](docs/COMPANY-FOUNDATION-VERIFICATION.md), [identity/delivery evidence](docs/IDENTITY-DELIVERY-VERIFICATION.md) and [worker operations](docs/DELIVERY-OPERATIONS.md). A live mail provider and business notifications remain unimplemented; B04 onboarding is described below.

## Target architecture

B04 now adds verified self-service workspace creation, starter roles and invitation proposal/acceptance with current inviter/delegation rechecks and tenant FKs. Account/company command lookup covers those write families. Company commands acquire the organization lock before the actor-FK command insert; acceptance locks company then affected users in UUID order. Existing admin provisioning remains compatible, and no existing company's roles are broadened. See [onboarding evidence](docs/WORKSPACE-ONBOARDING-VERIFICATION.md). The remaining module descriptions below are targets rather than implemented claims.

Use one modular Express application and one PostgreSQL database. Add a separately runnable worker from the same server package for email/outbox delivery, scheduled reminders and recovery work. React remains a same-origin client through Vite in development or Nginx in deployment. No new microservices, message broker or separate frontend framework are needed for the first release.

| Module | Owns | Calls through services |
| --- | --- | --- |
| Identity | Verification/recovery tokens, session version, own profile | Mail outbox |
| Companies and access | Ownership, memberships, invitations, roles, scopes, company configuration | Identity and audit |
| Catalog and inventory | Categories, item definitions, purchase lots, units, ledger, balances, opening stock | Access and audit |
| Custody | Requests, handovers, confirmation/disputes, inspected returns | Inventory posting service |
| Purchasing | Requisitions, quotations, approvals, orders, receipts, supplier resolution, invoices/payment records | Inventory, documents and audit |
| Maintenance and lifecycle | Faults, schedules, work orders, warranty/support, loss, retirement/disposal | Inventory, custody and contacts |
| Counts and reporting | Stock checks, reviewed corrections, scoped reports and CSV | Inventory queries and authorization |
| Messaging and files | Durable delivery jobs, in-app notifications, private attachment metadata and cleanup | Provider adapters and access checks |

Modules may initially be folders under server/src with shared transaction infrastructure. Existing route/controller/repository files should be adapted incrementally. Add a service layer for business commands rather than placing multi-module workflows directly in route handlers. A service accepts an actor, validated command and database client; repositories never authorize solely by a role name.

## Command execution boundary

For each target command:

1. Authenticate the account; validate origin, organization context, shape, decimal strings and expected revision.
2. Start a transaction. Claim the idempotency key under organization/account and operation, rejecting a different payload for the same key.
3. Lock the organization using the current serialization pattern, then recheck active account, membership and current grants. Lock affected documents and inventory accounts in a stable order.
4. Check the exact source/destination/employee/document scope and allowed workflow transition. Validate all references within the same organization.
5. Record business documents, inventory journal/entries, balance changes, audit and outbox notifications together. Commit once.
6. Return the committed result. External delivery happens after commit. A failed provider call must not repeat the inventory command.

Organization serialization is a deliberate first-release reuse of current behavior. It limits parallel writes inside a company; measure before replacing it with finer authorization/version fencing. Do not remove this protection just to improve throughput without tests for revocation and last-owner/admin races.

## Inventory as a shared service

All receipts, opening balances, handovers, returns, transfers, repairs, supplier returns, losses, disposals and count corrections use one posting service. It enforces positive quantities, unit precision, balanced entries, nonnegative physical balances, individual-unit uniqueness and immutable posted history. Neither a PATCH of a quantity nor editing a status may bypass this service.

Catalog definitions, units, purchase lots, physical location, custody, condition and lifecycle are separate concepts. The existing products table remains the identity of individually tracked asset units. New catalog items represent reusable pooled stock and consumables as well as unit definitions. Legacy product fields become explicit compatibility projections rather than another inventory balance.

## Read and field authorization

Keep shared SQL scope predicates for collection, detail, overview and export queries. Extend them for location grants and the new resources. Never fetch all company balances and hide unauthorized rows only in React. Scope aggregation before computing quantities or totals; show that summaries reflect the viewer's scope.

Cost visibility is independent of stock access. Authorize cost fields, quotation/invoice documents, audit metadata, CSV columns and notification content against the same record scope. Employees receive a minimal requestable catalog and their own custody/tasks, not company stock or pricing. Ownership and custom roles do not imply cross-company access.

## Worker and provider boundaries

The API stores business events/outbox records in the transaction that causes them. A PostgreSQL-backed worker claims jobs with row locking, a lease, bounded attempts and next-attempt timestamps. In-app notifications have a unique event/recipient key. Emails are at-least-once delivery; logical deduplication does not promise exactly-once provider delivery after an unknown network outcome.

Email adapter selection is an implementation dependency, not an approved provider integration. Verification/recovery links contain high-entropy one-use tokens; only hashes are kept in token tables. Any token-bearing outbox payload is encrypted with a separately configured secret, access-restricted and scrubbed after delivery/expiry. Never log tokens or email bodies. Recheck current membership/read permission before rendering a business notification; deep links always authorize again.

Keep Firebase for private organizational attachments and Cloudinary for avatars initially. Generalize metadata/linking, not public URLs. Retain the existing durable cleanup-intent pattern. Stage uploads outside critical transactions, validate size/signature, and finalize references only after authorization. Provider failure leaves a recoverable pending upload/job or cleanup entry. Do not introduce direct browser cloud credentials.

## Frontend implementation

Organize feature pages around the [32 screen groups](UX-FLOWS.md), sharing list/detail/form/action components and existing design tokens. Keep the organization explicit in the shared API client. Clear resource caches on workspace switch or revocation; preserve unsaved forms with an explicit navigation warning.

Drive allowed actions from server-computed capabilities for the current record. Send the document revision and a stable idempotency key for each user intent. Disable duplicate submission while pending. On a lost response, query the command/result rather than inventing a second intent. Separate approval, physical receipt/handover, confirmation and payment states in the interface.

QR scanning is a browser capability with a manual lookup fallback. A label contains an opaque reference or application link, never an authentication credential or permanent private-file URL. Validate the current membership after login and before resolving the item.

## Compatibility and migration

Preserve product UUIDs, _id response fields and existing routes. Do not edit migrations 001/002. New migrations add the target structures, backfill an individually tracked catalog item/lot for each legacy product, and preserve original metadata. Use an Unspecified location when no physical location is known; do not invent a room or purchase cost.

Legacy assignment/status/delete routes require a reviewed compatibility adapter when ledger-backed units are activated. Metadata edits can remain ordinary edits. Any physical change must become an inventory/custody/lifecycle command; an unsafe legacy request must get an explicit WORKFLOW_REQUIRED conflict instead of silently bypassing confirmation or history. This behavior change must be described in the current API contract when shipped with the updated frontend.

Existing owner-role names are editable and cannot establish protected ownership. Review and map legacy organization owners before enabling ownership invariants; new self-service companies create protected ownership atomically. Existing memberships do not become newly verified merely because they predate email verification. Preserve historical assignments and gate new verified-account operations explicitly.

## Deployment and operational acceptance

Build API and worker from the same reviewed revision. Run migrations with the deployment identity; retain restricted runtime roles and migration checksum verification. Back up database/storage and rehearse restore before cutover. Follow [current operations](docs/RBAC-OPERATIONS.md), updating its rollout steps with each implementation milestone.

Observe request IDs, command IDs, command latency/conflicts, outbox backlog/attempts, failed reminders, storage cleanup and inventory reconciliation. Avoid sensitive bodies in logs. Retention periods, expected volumes, hosting/SLOs and provider credentials need deployment decisions; this blueprint makes no measured scale or uptime promise.

## Inventory configuration (B05)

Migration 008 and configurationRoutes/configuration services implement company locations, closure ancestry, category definitions with immutable revision snapshots, immutable quantity units and reviewed location moves. Commands use the shared company lock/version/idempotency/audit boundary. A 15-minute actor-bound preview fingerprints the tree, role permissions and location grants (including pending invitations); moves reject changed context. The UI shows named scope gains/losses before confirmation. Legacy assets retain nullable location_id without invented backfill; location-only grants cannot see unknown locations. Current SQL/object/directory/statistics checks union location, department and self scopes. [Verification](docs/INVENTORY-CONFIGURATION-VERIFICATION.md) records actual evidence; catalog, ledger and cost visibility remain later slices.

## Inventory ledger foundation (B06)

Migration 009 now provides internal catalog/lot/unit persistence, typed opening/adjustment posting sources, balanced immutable journals/entries, locked exact balance projections and a transactional domain-event outbox. The shared command boundary passes its durable command record to posting handlers. [Ledger verification](docs/INVENTORY-LEDGER-VERIFICATION.md) records 72 passing dedicated integration checks and current boundaries. B07 now provides the public catalog/opening-stock extension; legacy cutover remains B08, and the accepted business modules remain in scope. No generic public stock-writing endpoint, application-database migration, deployment or delivered business email is claimed.

## Catalog and private inventory files (B07)

Migrations 010/011 add current catalog/inventory/cost/file grants and immutable item/lot-support/private-link history. Catalog and attachment services use the same command/ledger boundaries. Every replay reserializes the current resource under current grants, preventing stale financial response caches from leaking. File stages create a durable cleanup intent before external I/O; typed links require current object/financial access, and cleanup preserves linked/unexpired staged objects. [Catalog verification](docs/CATALOG-INVENTORY-VERIFICATION.md) distinguishes actual database/HTTP/browser evidence from unverified provider calls. Legacy migration remains B08; no application database was changed.
