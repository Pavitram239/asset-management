# Database design: AssetOS

Technical target, 18 October 2026. Proposed tables/constraints below are design work, not applied migrations. Migrations in [server/db/migrations](server/db/migrations) remain the authority for what currently exists. Read 001 and 002 together. [ARCHITECTURE.md](ARCHITECTURE.md) defines service boundaries; [workflows](docs/WORKFLOWS.md) define transitions.

Implementation update: migrations 003/004 add protected ownership, company settings/version, email verification marker and durable command identities/results. Migration 005 adds outbox_events, delivery_attempts and encrypted expiring captured_mail. Migration 006 adds account_tokens, users.session_version and email-change token/job revocation. These implemented structures have [company](docs/COMPANY-FOUNDATION-VERIFICATION.md) and [identity/delivery](docs/IDENTITY-DELIVERY-VERIFICATION.md) evidence; the remaining target structures below are proposed. Only isolated test schemas were migrated; no application database migration is claimed.

## 1. Shared conventions

Migration 007 implements organization_invitations, invitation_grants with permission snapshots, and membership invitation provenance. Tokens are hash-only and encrypted outbox payloads carry delivery links. Company creation and acceptance write memberships/grants/ownership/audit transactionally. [Onboarding evidence](docs/WORKSPACE-ONBOARDING-VERIFICATION.md) records checks and the remaining target structures below. Migrations 001–006 were preserved.

- Business records use UUID identities; append-only event/ledger sequences may additionally use bigint cursors.
- Every tenant-owned row carries organization_id. Cross-record foreign keys include organization_id and reference a corresponding unique tenant/id key. Never trust a supplied organization_id over request context.
- Mutable documents have version bigint >= 1 and created_at/updated_at timestamptz. Commands compare expectedVersion before mutation. Posted history is immutable; corrections use new linked records.
- Quantities and unit costs use numeric(20,6), never floating point. JSON carries decimals as strings. An item's unit definition declares allowed scale 0-6; individual assets always move exactly 1. Disallow more precision than the item's unit supports.
- Monetary totals use exact decimals, a currency code and currency rounding rules. Unit cost can retain extra precision; round line totals, then add documented tax/charge totals. Unknown historical cost is NULL, not zero.
- Civil dates such as purchase/due/warranty dates are date columns; event times are UTC instants. Preserve the current first-expired-day meaning of legacy warranty_date. New wire field expiresOn also means the first uncovered day; a UI labelled Coverage through converts once at its boundary. Reminder schedules use the company time zone.
- Inactivation/archiving preserves references. No implicit cascading deletion of inventory, purchase, custody or audit history.

## 2. Existing structures and intended evolution

| Existing table(s) | Target treatment |
| --- | --- |
| users | Keep UUID/email/password/profile; add email_verified_at and session_version for new verification/recovery behavior |
| organizations | Add currency/time-zone/settings and ownership migration state; retain active flag |
| memberships | Keep active account membership and directory department; add invitation provenance where relevant |
| roles, role_permissions, user_roles, user_permissions, permissions | Reuse; extend validated location scope and the capability catalog |
| organization_departments | Keep tenant-scoped codes and active state |
| products | Retain UUIDs as individually tracked asset-unit identities; add catalog_item_id, lot_id, location/condition/lifecycle projection and version |
| asset_assignment_history | Retain all legacy history; link new custody/movement records where available, without reconstructing unknown past events |
| audit_events | Reuse append-only events; add command correlation and field-redacted read DTOs |
| authentication_attempts | Reuse shared authentication limits; extend to verification/recovery rate-limit purposes |
| storage_cleanup | Retain durable cleanup intents and live-reference protection |
| departments | Preserve legacy reference during the compatibility period; do not use it for target authorization |

## 3. Identity, companies and organization structure

| Proposed structure | Main columns / references | Required invariant |
| --- | --- | --- |
| organization_owners | organization_id, user_id, created_by, created_at; membership FK | At least one active owner once ownership is activated; independent of editable role names |
| account_tokens | id, user_id, purpose, token_hash, expires_at, consumed_at, revoked_at | Unique hash; one-use verification/recovery; token material never stored here |
| organization_invitations | id, organization_id, normalized_email, inviter_id, token_hash, expires_at, state, version | Recipient-bound acceptance; pending invitation is not an active membership |
| invitation_grants | invitation_id, organization_id, role_id or permission_id, scope and department/location reference | Same-tenant references; reviewed scope; no grant before acceptance |
| locations | id, organization_id, parent_id, name, kind, active, version | Same-tenant acyclic hierarchy; moving a parent must not silently expand access |
| category_definitions | id, organization_id, name, field_schema JSONB, active, version | Schema uses a supported field vocabulary; never executable expressions |
| unit_definitions | id, organization_id, code, name, quantity_scale | Immutable scale/unit meaning once stock history exists |

Location kinds can include branch/building/floor/room/store/offsite/unspecified. They are optional labels, not a fixed required tree depth. Ownership of an employee's home location is still organizational; avoid storing unnecessary personal address information.

Invitation role/scope changes revoke the old invite and issue a new token. At acceptance, recheck inviter authority, target account email verification, active role/location references and invitation state under lock. Membership, grants, consumption of the token and audit commit together.

Extending grant tables requires nullable location_id, updated scope checks, tenant FK, indexes and uniqueness including the nullable scope reference. A grant has exactly one scope type: organization, department, location or self. Multiple grants combine additively; they do not accidentally become a department-by-location intersection.

## 4. Catalog, purchase lots and individual units

| Proposed structure | Main columns / references | Required invariant |
| --- | --- | --- |
| catalog_items | id, organization_id, category_id, unit_id, owning department/location, name, tracking_mode, attributes JSONB, requestable, active, version | Mode is individual, reusable_stock or consumable; mode/unit cannot be casually changed after posting |
| inventory_lots | id, organization_id, catalog_item_id, source_type, receipt_line_id/opening_id, supplier_id, purchased_on, unit_cost, cost_basis/source, currency, expires_on, support_metadata | Acquisition and warranty preserved per lot; cost nullable only when unknown; issued-order net unit price distinct from invoiced totals/taxes/charges |
| products additions | catalog_item_id, lot_id, asset_tag, serial_number, condition/lifecycle and display projections | Exactly one individual unit per product UUID; unique normalized asset tag within company |

A serial number need not be globally unique; asset tags are company-unique. Catalog grouping is explicit. Do not merge two legacy product records just because their names match. A pooled lot retains its original warranty and supplier even after moving or being partly repaired.

Item/unit/lot files use the shared typed attachment_links structure, not a second independent file registry. Warranty/support updates retain history and never overwrite acquisition costs through a generic metadata command.

Backfill each legacy product into its own individual catalog definition/lot at first, preserve product.id and metadata, and mark unsupported historical fields unknown. Existing assignment becomes an imported custody baseline with confirmation state legacy_imported; do not invent employee acknowledgement. New handovers require confirmation. Reconciliation or deliberate catalog consolidation can follow with audit evidence.

## 5. One inventory journal

| Proposed structure | Main columns / references | Required invariant |
| --- | --- | --- |
| inventory_accounts | id, organization_id, item_id, lot_id, optional unit_id, kind, location_id, custody_line_id/work_line_id/transfer_line_id | Account dimensions identify one physical/terminal bucket; unit/item/lot must agree |
| inventory_journals | id, organization_id, command_key, action, actor_id, source_document reference, reversal_of, created_at | One posted result per durable command/source posting; immutable |
| inventory_entries | journal_id, account_id, organization_id, item_id, lot_id, unit_id, signed_quantity | Each journal balances to zero separately for each item/lot/unit group |
| inventory_balances | organization_id, account_id, quantity, version | Locked projection of entries; nonnegative except explicit external/variance accounts |

Account kinds: external acquisition/variance, available, custody, inspection, damaged, maintenance, in_transit, retired, consumed, lost, disposed and returned_to_supplier. External/variance accounts explain opening receipts and reviewed corrections and are excluded from physical counts. Terminal accounts retain traceability but are excluded from available/owned-stock metrics as appropriate.

Each movement has a source and destination entry. A receipt debits the acquisition source and credits available stock. A reusable handover moves available -> custody; consumable issue moves available -> consumed. Inspection moves received custody -> inspection -> available/damaged. Maintenance and transfers move only affected quantities. A single transaction writes journals, entries, balances, workflow state and audit/outbox records.

Use a typed inventory_journal_sources link with exactly one same-tenant foreign key to the opening, handover, return, transfer, receipt, supplier resolution, work order, lifecycle or stock-adjustment source. A free-text source type/UUID alone is not referential integrity. Maintenance accounts may retain a custody-line dimension so moving to a provider does not silently clear employee responsibility.

Database checks reject invalid precision and negative physical balances. Individual-unit physical/terminal balances are 0 or 1; a unique positive unit balance ensures the same unit cannot occupy two accounts. Lock the product identity while moving an individual unit. Deferred consistency enforcement or restricted posting functions verify journal balance; ordinary CHECK constraints cannot enforce an aggregate across entries. Restrict direct writes so service code cannot bypass posting invariants.

Default allocation is explicit lot/unit selection with deterministic oldest-receipt suggestion for pooled stock. Record actual allocation; this is physical stock allocation, not an accounting valuation policy. Returns must reference original custody allocations and lots. No automatic pack/unit conversions in the first release; quantities are entered in the item's base unit.

## 6. Custody, requests and movement

| Proposed structure | Main columns / references | Required invariant |
| --- | --- | --- |
| item_requests, item_request_lines | requester membership, purpose, dates, status/version; item/quantity/destination | Approval does not post inventory; request remains distinct from purchase requisition |
| handovers, handover_lines | issuer, recipient, optional request, dates, confirmation_state/version; item/lot/unit allocations | Active verified recipient; exact issued allocation; no re-issue on confirmation |
| handover_confirmations, handover_disputes | handover, recipient, accepted/disputed reason, resolution event and actor | Append-only responses/resolutions; only the recipient confirms their receipt |
| returns, return_lines, return_inspections | original handover allocation, received quantity, location, condition split, actor | Partial returns bounded by outstanding custody; no available stock before usable inspection |
| transfers, transfer_lines | source/destination, dispatcher/receiver, status/version; item/lot/unit allocations | Transit is unavailable; accepted, damaged and lost quantities reconcile with dispatch |
| lifecycle_records | item/lot/unit/custody source, outcome, quantity, reason/evidence, actor | Loss/retirement/disposal is explicit; no silent erasure of custody or stock |

Employee directory department is not a tenant integrity constraint on custody. New commands require an active verified membership in the same company and authorized recipient visibility. The existing same-department assignee restriction is a legacy behavior that needs an explicit adapter/change note when the new workflow is enabled.

## 7. Purchasing and approvals

| Proposed structure | Main columns / references | Required invariant |
| --- | --- | --- |
| contacts, contact_documents | organization_id, type, company/name, contact/support data, active | External supplier/provider is not an employee login |
| purchase_requests, purchase_request_lines | requester, department/location, reason, required date, currency, revision/status; item/description/quantity/estimate | Submitted revision is immutable for its approval instance |
| quotations, quotation_lines | request revision, supplier, currency, terms/expiry, costs, attachments | Compare like currency and requested quantities; preserve unselected offers |
| approval_policies, approval_policy_versions, approval_policy_steps | currency, amount ranges, ordered role steps and final-order rule | Non-overlapping covering ranges; no implicit fallback for an unknown currency |
| approval_instances, approval_steps, approval_decisions | one request or order revision FK, fingerprint, amount/currency, policy version, step/decision actor | Requester cannot approve; one current sequential decision; immutable decision history |
| purchase_orders, purchase_order_lines | supplier, request/quote revision, currency, terms, status/version; quantity/unit price/tax/charges | Final amount/scope must match current approval evidence before issue |
| purchase_receipts, purchase_receipt_lines | order/line, delivery reference, physical received, accepted, rejected, quarantine location | Accepted + rejected equals received; posting occurs once and only accepted quantity becomes usable |
| supplier_resolutions, supplier_resolution_lines | receipt/return/order line, kind, quantity, replacement/credit/cancellation reference | Rejected quantity and supplier-returned stock do not disappear from obligations |
| supplier_invoices, supplier_invoice_lines, invoice_receipt_allocations | supplier/invoice number, currency, order/receipt allocation, amounts, discrepancy state | Prevent duplicate supplier invoice; flag mismatch, do not overwrite receipt facts |
| payment_records, invoice_payment_allocations | amount/currency/date/reference, reversal link, invoice allocations | Record external payments only; reversal is a new record, allocations cannot exceed effective balance |

Add purchase_commitment_allocations linking request lines to issued order lines/revisions and their active quantity/amount commitments. Lock the request allocations at issue/cancellation so split orders cannot each consume the same approved budget or quantity. Superseded revisions do not count twice; extra authorization is explicitly bound to the changed order, not inferred from a larger old decision.

Line fulfillment tracks original ordered, cancelled, delivered, accepted, rejected unresolved, supplier returned, replacement due and replacement received quantities separately. Replacement acceptance reduces the replacement obligation; it is not another original-order commitment. Credit notes and agreed cancellation resolve obligations but never create stock.

## 8. Maintenance, counts, messages and files

| Proposed structure | Main columns / references | Required invariant |
| --- | --- | --- |
| fault_reports | reporter, item/custody, affected quantity, evidence, state | Reporting does not itself move stock |
| maintenance_plans, work_orders, work_order_lines, service_events, maintenance_expenses | schedule, responsible membership/provider, dates, affected allocations, outcome/cost/currency | Intake/release use the ledger; only the affected quantity is unavailable |
| stock_checks, stock_check_lines, stock_adjustments | scope, snapshot/account version, observed quantity, reviewer/reason, posting link | Count does not adjust stock; stale snapshots need reconciliation before posting |
| outbox_events, delivery_attempts, scheduled_jobs | event/recipient key, encrypted sensitive payload where needed, lease, attempts/status/times | Transactional event creation; bounded retry, logical deduplication and visible terminal failure |
| notifications, notification_preferences | organization_id, recipient membership, event, deep-link target, read_at, channel preferences | Scope on read/render/delivery; mandatory security/account messages remain separate |
| attachments, attachment_links | object key/provider, uploader, detected type/size, state; exactly one typed nullable target FK per link | Same-tenant FKs and exactly-one-target check; private serving and durable cleanup remain mandatory |
| api_commands | account/organization, operation, idempotency key, request hash, committed result reference, cached response | Unique identity of an intent; same key/different request conflicts; result lookup never reposts stock |

Keep minimal command identity/result linkage for inventory and financial records for their retention lifetime. Cached full HTTP responses may expire separately. Report queries use scoped ledger/balance/document views rather than a second editable report store.

## 9. Migration and indexing plan

Reserve new ordered migrations for identity/ownership, location/category/scope, inventory backfill, custody, purchasing, maintenance/counts and messaging/attachments. Determine actual numbers from the checkout immediately before authoring; never rewrite 001/002. Expand/backfill/verify first, then switch writes through service adapters. Do not switch reads to an empty new balance projection.

Before backfill, review legacy owner mapping, assignment inconsistencies and unknown dates/costs. Backfill imported assignments/history once and reconcile each unit's projected balance. Keep old files and IDs. Use an application capability/version gate so old binaries cannot perform direct inventory writes after cutover. Rollback uses documented backups and matching binaries; no destructive automatic down migration is assumed.

Plan tenant-leading indexes on item/location/account lookups, active membership/grant resolution, current custody, order/receipt references, approval pending-step queues, work due dates, unread notifications and worker due/lease columns. Use partial uniqueness for active invitations, per-company tags, command keys, posting source and one positive individual-unit account. Index foreign-key lookup paths. Measure explain plans and contention with realistic fixtures during implementation.

## 10. Verification requirements

Use the dedicated test-database schema isolation described in README. Exercise empty and legacy installations, migration reruns/checksums, preserved IDs and unknown-data handling; tenant FK rejection; ledger balance and individual uniqueness; simultaneous last-unit issue; duplicate/unknown-outcome commands; partial returns/receipts/replacements; stale stock checks; and rollback of documents, audit and outbox on failure. This blueprint has not applied or tested these proposed migrations.

## Delivered inventory configuration: migration 008

locations and location_ancestry enforce same-company parents, cycles and descendant scope. category_definitions.fields is the delivered JSONB field name; category_revisions preserves immutable schema snapshots by category/version. unit_definitions forbids updates/deletes, including precision changes. location_move_previews stores actor/version/expiry, context fingerprint, affected grant IDs and named scope summaries. user_roles, user_permissions and invitation_grants now support validated location_id; products.location_id remains nullable for unknown legacy placement. Reviewed protected owners receive only the three new configuration capabilities; existing custom roles are not broadened. [Configuration evidence](docs/INVENTORY-CONFIGURATION-VERIFICATION.md) covers isolated fresh/legacy schemas; this does not claim application-database migration or inventory postings.

## Inventory ledger foundation (B06)

Migration 009 now provides internal catalog/lot/unit persistence, typed opening/adjustment posting sources, balanced immutable journals/entries, locked exact balance projections and a transactional domain-event outbox. The shared command boundary passes its durable command record to posting handlers. [Ledger verification](docs/INVENTORY-LEDGER-VERIFICATION.md) records 72 passing dedicated integration checks and current boundaries. B07 now provides the public catalog/opening-stock extension; legacy cutover remains B08, and the accepted business modules remain in scope. No generic public stock-writing endpoint, application-database migration, deployment or delivered business email is claimed.

## Delivered catalog and typed private inventory files (010/011)

catalog_item_history and inventory_lot_history retain immutable per-version specification/support snapshots. attachments binds a private object identity to the same tenant/actor durable command, with uploader-only expiring staging. attachment_links has exactly one same-tenant item/lot/product FK and immutable category/financial classification; it is not a free target type/UUID registry. Removal retains metadata/link history and queues cleanup. Current catalog base structures still come from 009; receiving/supplier/contact/legacy-import source extensions are not yet delivered. [B07 verification](docs/CATALOG-INVENTORY-VERIFICATION.md) records exact checksums and evidence, including provider limits.


Migration compatibility repair (012/013): 012 adds technical import sources, preserved snapshots, unknown receipt/cost and imported custody baselines. Its populated import block now executes with explicit variable precedence through the migration runner, preserving the original SQL-file checksum. New migration 013 permits current unlinked product workflows but retains immutable catalog/lot links and posting requirements for linked physical changes. This is partial cutover infrastructure, not completion of B08. See [actual regression evidence](docs/testing/BACKEND-REGRESSION-FIXES.md).
