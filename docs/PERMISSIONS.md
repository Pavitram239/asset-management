# Target permissions and ownership

Design proposal, 18 October 2026; new names/scopes below are not seeded or implemented yet. Current behavior is documented in [RBAC-IMPLEMENTATION](RBAC-IMPLEMENTATION.md) and [current contract](openapi.json). Reuse current grant resolution, mutation locks and last-administrator protection. Read [workflows](WORKFLOWS.md) for actor restrictions that apply in addition to grants.

Implemented exception: ownership.manage and protected owner markers/continuity are now delivered in migration 003. They require both the current organization-wide grant and active protected ownership. Existing companies need explicit reviewed owner mapping; no editable role name is inferred as ownership. B05 now also delivers location.manage/category.manage/unit.manage and location-descendant scope; future business capabilities remain planned. [Current evidence](COMPANY-FOUNDATION-VERIFICATION.md) describes this subset.

## Scope evaluation

Each grant has exactly one scope: organization, department, location or self. Grants combine by union, not intersection. Every required capability is checked independently against the actual record/line; a read grant does not imply a write grant. Directory department is not an authorization grant. Cross-company references always fail, including for owners.

Location grants cover the named node and descendants. Resolve ancestry from current data, with cycle checks; moving a subtree requires organization-wide location.manage, an access-impact preview and explicit acknowledgement of affected grants before save. Record the move and scope impact in audit; do not move silently through a generic metadata edit. Inactivation blocks new routing but preserves historic scope/read decisions. Never use user-supplied hierarchy paths for authorization.

Item-definition reads depend on authorized category/requestability or stock allocations, not on granting an employee company-wide stock access. Department scope uses the record's explicit owning department; location scope uses current physical location for inventory and explicit destination for requests. Self means the current requester, recipient/custodian, reporter or notification recipient, as appropriate; it never grants company configuration. Historical custody remains visible to its named person only while membership is active. Document reads require all sensitive lines in scope; list summaries cannot disclose hidden line totals. A mixed-scope document is denied unless a purpose-built redacted projection is explicitly defined.

Transfer dispatch checks source; receipt checks destination. Creator must have source dispatch authority and an allowed active destination, but no full destination stock read is implied. Cross-location personal handover also checks the recipient's organizational context through a minimal recipient-selection permission. Cost and private-document permissions are evaluated against the same target scope as the underlying operation.

## Capability catalog

Existing asset.* names continue to govern legacy individual-product endpoints. New capabilities below do not silently expand existing custom roles; migrate explicit starter-role grants through reviewed seeds/mappings. New collection/resource operations use these capabilities, even when their detail response contains a linked product UUID.

| Capability family | Proposed names / meaning | Allowed scopes |
| --- | --- | --- |
| Company configuration | organization.manage (existing), ownership.manage (protected-owner action), location.manage, category.manage, unit.manage | Organization |
| Access | membership.manage, department.manage, role.manage, access.manage (existing) | Organization |
| Employee-safe lookup | catalog.requestable.read, custody.recipient.select | Organization/department/location; recipient access limited to eligible names/IDs |
| Catalog | catalog.read, catalog.manage | Organization/department/location; manage checks owning context |
| Inventory | inventory.read, inventory.opening, inventory.transfer.dispatch, inventory.transfer.receive, inventory.adjust, inventory.lifecycle | Organization/department/location |
| Cost | cost.read | Organization/department/location; never implied by ordinary inventory read |
| Requests | item_request.read, item_request.create, item_request.decide | Read/create: all scopes including self; decide: organization/department/location |
| Custody | custody.read, custody.issue, custody.confirm, custody.resolve, custody.return.receive, custody.return.inspect | Read: all; confirm: self only; other actions: organization/department/location |
| Contacts | contact.read, contact.manage | Organization/department/location; explicit owning context |
| Purchasing | purchase_request.read, purchase_request.create, purchase.manage, purchase.approve, purchase.receive, purchase.resolve | Read/create: all including self; other actions: organization/department/location |
| Approval configuration | approval_policy.manage | Organization |
| Finance records | invoice.read, invoice.manage, payment.record | Organization/department/location; financial writes also require cost.read |
| Fault/service | fault.read, fault.create, maintenance.read, maintenance.manage, maintenance.expense | Fault read/create: all including self; service: organization/department/location; expense also cost.read |
| Counts | stock_check.read, stock_check.count, stock_check.review | Organization/department/location; posting also inventory.adjust |
| Reporting | report.inventory, report.custody, report.purchasing, report.maintenance, report.usage, report.export | Organization/department/location; custody self can use its own nonfinancial view |
| Files | attachment.read, attachment.write | Same scope as linked record, plus target read/manage capability |
| History | audit.read (existing), scoped resource history through resource read | Audit organization scope initially; redact costs/files separately |
| Personal messaging | notification.read, notification.preferences | Self only; recipient must match session identity |

Read names above specify business-record visibility. cost.read controls fields and download categories in addition to record capability. Purchasers who write prices/quotes require purchase.manage plus cost.read; receiving staff can receive expected quantities without quotation totals. Purchase approval necessarily requires cost.read plus purchase.approve and current policy-role eligibility. A requester can see their own submitted estimate and approval result through a bounded own-request view; this does not reveal supplier offers, stock unit costs or other employees' spending. Without cost.read an employee submits an optional estimate they supplied and sees only that estimate, never computed procurement totals.

No separate capability is needed for reading one's own profile, listing one's active workspaces, verifying an account or creating a new workspace as a verified user. These identity operations do not grant access to an existing company. Existing organization.create continues to govern the old restricted provisioning endpoint until explicitly changed.

## Starter roles and ownership

| Starter | Initial intended grants |
| --- | --- |
| Owner | Protected ownership plus organization-wide business/access grants; owner-management actions require active protected ownership, not a role name |
| Administrator | Organization-wide configuration/access and operational grants; no protected-owner transfer solely by being administrator |
| Asset manager | Assigned scope for catalog/inventory/custody/maintenance/counts and relevant contacts; no automatic cost, finance, purchase approval or access-management grants |
| Employee | Requestable catalog, own requests/custody/faults/notifications/profile; own receipt confirmation; no company balances, prices or directory |

Purchasing/finance/approver responsibilities are assignable custom roles or explicit capabilities; they are not forced onto every asset manager. Custom roles remain editable. Protected ownership cannot be deleted by renaming/removing a role. Require verified active members for new owner appointment and at least one active protected owner. Owner status authorizes ownership actions; ordinary business actions still use current explicit grants. Preserve at least one active organization-wide access administrator independently, including during concurrent role/membership changes.

Retain current no-self-access-edit constraints for ordinary access management. Owner may appoint another eligible administrator through controlled operations, but cannot bypass the same-company boundary or requester self-approval rule. Delivered invitation management requires verified membership.manage AND access.manage. Each delegated permission needs an organization-level source grant the same department scope, or a location subtree wholly covered by their current location grant; an inviter's own self permission is not a delegation source. ownership.manage cannot be delegated through invitations. Role/scope/permission snapshots and current inviter authority are checked on creation, acceptance and delivery. No account can choose an existing company at registration. See [onboarding verification](WORKSPACE-ONBOARDING-VERIFICATION.md).

## Field, action and query enforcement

- SQL predicates constrain list/detail, counts, search, recipient suggestions, reminders, QR, report/export and attachment targets before aggregation. Object authorization rechecks commands after locks; do not trust capabilities sent by React.
- Response DTOs omit restricted cost fields entirely; do not return hidden prices in generic attributes, audit JSON, signed URLs, PDF invoices, CSV, error details, pagination totals or notification bodies. Private invoices/quotes require both file read and appropriate financial/purchasing visibility with cost.read.
- Server returns allowedActions for a record to improve UI clarity. Action hints are not authorization tokens and expire with grants/versions.
- Check every line/allocation and referenced employee/supplier/location within the company. Guessing an inaccessible UUID returns a scoped miss; malformed context and inactive membership retain current documented error distinctions.
- Invalidate organization-local client caches on switching context. Command lookups and idempotent replay results authorize again, including redaction under the viewer's current grants.
- Removing a membership never deletes audit attribution or outstanding custody. Archived contacts/locations stay referencable from history; no new workflow routes to inactive records.

## Required negative tests

For every operation family: no login; inactive/unverified actor where verification is required; missing/foreign organization; inaccessible object/line; revoked role while waiting for a write lock; location/department boundary; same UUID in download/export/notification/QR; denied cost field in metadata/history; self-confirmation by wrong person; requester purchase self-approval; last owner/admin races; invite acceptance after inviter revocation; location move access expansion. Include department+location grants that prove additive union and that a capability in one scope does not authorize another capability everywhere.

## B05 configuration and location scope

location.manage/category.manage/unit.manage are now enforced organization-scoped configuration capabilities. Migration 008 adds these to reviewed protected owners only; existing custom roles are unchanged. New workspace starter administrators include currently implemented capabilities. Location grants include current descendants and combine additively with department/self scope. Archived trees retain historical reads; new grants/invites and child routing require active ancestors. A move requires named scope-impact review and a fresh actor-bound preview, including pending invitation grants. Location-scoped directory/statistics project only assignees of covered legacy assets rather than all employees. [Configuration evidence](INVENTORY-CONFIGURATION-VERIFICATION.md) records current limits; future inventory and cost permissions remain planned.

## B07 catalog/inventory/cost/private-file capabilities

Implemented organization/department/location capabilities are catalog.read/catalog.manage/catalog.requestable.read, inventory.read/inventory.opening, cost.read and attachment.read/attachment.write. These are separate current grants; inventory or file access never implies cost access. New starter asset managers exclude cost.read. Reviewed protected owners receive the explicit new mapping; existing custom roles are unchanged. New Employee starter permissions remain asset.read/asset.file.read and do not silently acquire company-wide catalog/stock access.

Category specifications reject conventional financial fields; prices belong in dedicated cost-protected workflows. Whole-lot detail requires all opening/positive-stock contexts to be visible. Requestable projections contain no quantities/unit identities. File target access and attachment permission are independently required; financial filenames/content require cost.read. Stage metadata is uploader-only and expires; link targets are typed item/lot/unit FKs. Current-grant serialization applies on every replay, even while a cached response exists. [Catalog verification](CATALOG-INVENTORY-VERIFICATION.md) records current limits; safe partial stock/custody projections arrive with their enforcing movement modules.
