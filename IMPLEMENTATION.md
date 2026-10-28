# Implementation workflow

## Product baseline

The agreed first-release scope is recorded in [PRD.md](PRD.md), dated 18 October 2026. It includes self-service company onboarding, account-based employees, three inventory modes, custody, full procurement, maintenance, notifications, reports and a responsive web interface with QR scanning.

The existing React/Express/PostgreSQL application provides a foundation. Existing documents and historical verification reports describe earlier work, not completion of the new requirements. README.md is the current setup guide and docs/openapi.json is the current interface contract.

Read in order: [PRD](PRD.md), [design](DESIGN.md), [architecture](ARCHITECTURE.md), [database](DATABASE.md), [API](API.md), [agent instructions](AGENTS.md), then [README](README.md).

## Per-feature process

The initial user journeys and screen specifications are in [UX-FLOWS.md](UX-FLOWS.md). Review its workflow states and acceptance mapping before designing each feature's interface and persistence.

The screen mockup stage now covers all 32 planned screen groups. [Mockup verification](docs/MOCKUP-VERIFICATION.md) records design-preview checks. This completes the requested visual mockups, not the application implementation stages below.

The [technical blueprint](docs/TECHNICAL-BLUEPRINT.md) defines the target data model, workflow transitions, permissions and planned API delta. The [implementation backlog](docs/IMPLEMENTATION-BACKLOG.md) breaks the stages below into B00-B23 with acceptance dependencies. [Blueprint verification](docs/BLUEPRINT-VERIFICATION.md) records the earlier artifact checks separately from application evidence.

B00–B04 foundations, verified identity/recovery, self-service workspace creation and invitations are delivered locally. [Company](docs/COMPANY-FOUNDATION-VERIFICATION.md), [identity/delivery](docs/IDENTITY-DELIVERY-VERIFICATION.md) and [onboarding](docs/WORKSPACE-ONBOARDING-VERIFICATION.md) verification record actual checks and limits. Mail remains local capture only. Only ownership.manage was added; future business capabilities ship with enforcing modules. B05 locations/categories/units/scopes is next; B05–B23 and full release acceptance remain open.

1. Map the feature to the agreed PRD and observable acceptance scenarios. Inspect current behavior and reuse existing capabilities.
2. Design the user flow and failure states, then affected schema, authorization and interface changes. Record consequential unresolved decisions without inventing user approval.
3. Implement a complete slice across persistence, access enforcement, API and UI.
4. Check success, invalid input, denied/cross-company access, concurrency, repeat submissions and recovery where relevant.
5. Update relevant documents and contract, recording actual validation and skipped dependencies. Mark completed requirements only with evidence.

## Delivery order within the first release

All stages contribute to the accepted first release. This is a proposed implementation dependency order, not an additional product-scope decision or an estimate.

| Stage | Scope | Acceptance evidence |
| --- | --- | --- |
| 0. Baseline and design | Reconcile current implementation, identify reusable capabilities, design user journeys and shared inventory/procurement concepts | Gap map, dated baseline checks, screen flows and explicit transition rules |
| 1. Company and access | Verified self-service creation, invitations, account-based employees, starter/custom roles, department/location scopes | PRD A01-A03; no self-escalation or cross-company access |
| 2. Inventory foundation | Categories, individual units, pooled reusable stock, consumables, units, purchase batches, locations and movement history | A04-A05 and A09; quantity invariants, safe concurrency and permission-filtered reads |
| 3. Purchasing | Requests, role/amount approval chains, quotations, purchase orders, partial receiving/inspection, supplier returns/cancellations, invoices and payment records | A10-A12; accepted receipts create inventory exactly once and records reconcile |
| 4. Custody | Requests and direct issues, physical handover, reusable receipt confirmation/disputes, temporary/long-term custody, partial returns and condition checks | A06-A08; correct stock, custody and audit history through failures |
| 5. Maintenance and lifecycle | Internal/external providers, preventive service, faults, repairs, warranty/support, loss and retirement/disposal | A13; only affected units/quantities unavailable; costs and history retained |
| 6. Notifications and reports | In-app/email delivery, attention dashboard, inventory/custody/purchasing/maintenance/usage reports, physical stock checks, CSV export | A14-A15; scoped information, recoverable delivery failure and traceable corrections |
| 7. Complete release | Phone-camera QR flow, mobile/accessibility checks, end-to-end workflows, deployment/recovery review | A16 and earlier scenarios; measured evidence in the intended environment |

Plan notification events, responsive behavior and access checks with each feature rather than leaving their underlying design to final stages. Stock checks and financial reports depend on consistent movement, receipt and cost records established earlier.

## Existing work and documentation authority

Reuse existing assignment history, audit, dynamic permissions, organization isolation, private files and shared authentication throttling. Extend the model rather than introducing a second incompatible access or inventory system.

The earlier [enterprise roadmap](ENTERPRISE-ROADMAP.md) is historical planning context. PRD.md now governs intended first-release scope. Old claims that notifications, organization isolation or configurable access are future work must be checked against current code and this scope. Old dependency and verification reports are historical observations.

## Integrations, debugging and delivery

Firebase and Cloudinary are existing integrations. Email delivery is a new first-release dependency whose provider and failure handling must be designed. External maintenance providers are contacts, not login users. Payment records do not authorize money transfers. Add MCP or other connections only for a concrete authorized task.

For each feature, record its user outcome, affected documents/files, access rules, state transitions, failure/recovery behavior and acceptance evidence. For bugs, reproduce the symptom, trace the failing boundary, make the smallest coherent fix and verify the reported scenario. Keep credentials and private data out of diagnostics.

Documentation changes require link/content checks. Code changes require appropriate unit, database/HTTP, UI and integration verification; do not report skipped checks as passing. Production rollout needs separately established volumes, hosting, backups, retention and recovery evidence.

## B05 local delivery

Inventory setup now includes reviewed location trees/access, versioned category fields and immutable quantity units. [Configuration verification](docs/INVENTORY-CONFIGURATION-VERIFICATION.md) records migration 008, promoted operations and test/browser evidence. B08�B23 remain implementation work; the accepted first-release modules and procurement scope remain intact.

## Inventory ledger foundation (B06)

Migration 009 now provides internal catalog/lot/unit persistence, typed opening/adjustment posting sources, balanced immutable journals/entries, locked exact balance projections and a transactional domain-event outbox. The shared command boundary passes its durable command record to posting handlers. [Ledger verification](docs/INVENTORY-LEDGER-VERIFICATION.md) records 72 passing dedicated integration checks and current boundaries. B07 now provides the public catalog/opening-stock extension; legacy cutover remains B08, and the accepted business modules remain in scope. No generic public stock-writing endpoint, application-database migration, deployment or delivered business email is claimed.

## B07 local delivery

[Catalog verification](docs/CATALOG-INVENTORY-VERIFICATION.md) records 86 passing dedicated integration checks, current contract 2.6.0 and actual three-mode browser journeys. Private file metadata/access is covered without live provider objects; configured storage success/recovery remains B23. The remaining accepted modules are not deferred.
