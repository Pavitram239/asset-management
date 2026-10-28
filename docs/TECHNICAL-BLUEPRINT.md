# AssetOS technical blueprint

18 October 2026. The product scope and all 32 screen mockups are complete as planning artifacts. This blueprint defines how to implement that scope in the existing project. It does not claim the planned application features or migrations have been delivered.

Implementation update: B00–B04 foundations, encrypted account mail/identity/recovery, workspace creation and invitations are implemented locally. See [company](COMPANY-FOUNDATION-VERIFICATION.md), [identity/delivery](IDENTITY-DELIVERY-VERIFICATION.md) and [onboarding](WORKSPACE-ONBOARDING-VERIFICATION.md) evidence. B05–B23 remain open.

## Read the plan

| Document | Purpose |
| --- | --- |
| [PRD](../PRD.md) | Accepted first-release scope and A01-A16 acceptance scenarios |
| [UX flows](../UX-FLOWS.md) and [mockup verification](MOCKUP-VERIFICATION.md) | Screen groups S01-S32 and design-preview evidence |
| [Architecture](../ARCHITECTURE.md) | Module boundaries, transactions, worker and compatibility |
| [Database](../DATABASE.md) | Entities, ledger invariants, keys and migration approach |
| [Workflows](WORKFLOWS.md) | Allowed transitions, partial outcomes and recovery |
| [Permissions](PERMISSIONS.md) | Capability catalog, scope/field enforcement and ownership |
| [API guide](../API.md) | Current versus proposed contracts and caller rules |
| [Planned OpenAPI](openapi-planned.json) | New operation shapes, examples, errors and permission metadata |
| [Implementation backlog](IMPLEMENTATION-BACKLOG.md) | Dependency-ordered slices, acceptance evidence and coverage |
| [Blueprint verification](BLUEPRINT-VERIFICATION.md) | Actual artifact checks and remaining limits |

[openapi.json](openapi.json) continues to describe existing endpoints. The planned contract adds only future operations, with x-implementation-status: planned. Its existing-operation change register records adaptations still needed. Promote an operation to the current contract only with implementation and tests; remove the planned duplicate in the same change. Neither API publication nor an external Postman workspace is part of this work.

## Implementation gap map

| Area | Reusable current foundation | Target work still required |
| --- | --- | --- |
| Identity and onboarding | Login/session revocation, verification/recovery, new workspace/ownership/starter roles and reviewed invitations with encrypted local mail | Live mail provider and later membership-linked custody/tasks |
| Company access | Company context, current grants, protected ownership, company settings, department/self scopes, configurable roles, last-owner/admin guards | Delivered location/delegation/catalog/inventory/cost scope; extend further capabilities/redaction with their business modules |
| Inventory | Products UUIDs/history, catalog/category/unit definitions, three inventory modes, opening lots, ledger/balances and typed private inventory files | Legacy backfill/custody/compatibility adapters and later movement/acquisition sources |
| Custody | Existing assignment field/history | Requests, physical handovers, employee confirmation/disputes, partial inspected returns, transit and lifecycle commands |
| Purchasing | Legacy purchase-related asset fields/invoice attachment | Full request-to-payment workflow, sequential amount approvals, quotes/orders, partial receiving and supplier resolutions |
| Maintenance | Asset metadata and warranty fields | Faults, preventive schedules, provider contacts, intake/inspection and repair expenses |
| Messaging/reporting | Current statistics/private downloads and encrypted outbox/worker/local account mail | Live email provider, in-app/business tasks/reminders, scoped business reports/CSV and count corrections |
| Interface/release | Existing React shell/access screen; completed planned mockups | Implement planned screens, live QR, responsive/accessibility/recovery and deployment evidence |

This is a code-inspection gap map, not a fresh application test report. Earlier RBAC verification reports remain historical; the PRD supersedes their earlier release deferrals for invitations, locations, approvals and other accepted modules.

## Selected technical defaults

These are implementation proposals within the accepted scope, not additional business approvals.

| Decision | Selected direction and consequence |
| --- | --- |
| Runtime | Keep React/Express/PostgreSQL and npm workspaces; modular monolith with a separately runnable database-backed worker |
| Inventory identity | Keep products UUIDs for individual units; add catalog/lot/account structures rather than replacing IDs or creating a competing unit master |
| Stock truth | One immutable balanced movement journal plus locked balance projection; no editable quantity fields as an alternate source |
| Concurrent commands | Reuse organization-row serialization and current grant recheck; document versions plus durable idempotency keys protect intent and retries |
| Physical allocation | Explicit lot/unit allocation with oldest-receipt suggestions; no implicit unit conversions or accounting valuation claim |
| Scope | Union of company/department/location/self grants; location grant includes descendants and subtree moves require reviewed access impact |
| Approval | Versioned currency-specific sequential policy; no requester self-approval; exact final-order revision authorization when required |
| Money and quantity | Exact decimal strings; declared unit precision; separate currency totals; unknown historical costs stay unknown |
| Reservation | Request approval does not reserve stock; check available allocations at physical issue |
| Receiving | Posted purchase receipt includes inspection; only accepted quantity creates usable stock; rejected goods have separate resolution obligations |
| Provider dependencies | Reuse private storage/cleanup; email adapter and outbox; external providers are contacts; payments are records, not transfers |
| Historical migration | Preserve IDs/history/unknowns; import assignments without invented acknowledgements; review owner mapping explicitly |

## Bounded decisions before the relevant delivery gate

Do not block all local implementation on these, and do not invent production approval.

| Decision | Needed by | Safe local approach |
| --- | --- | --- |
| Email provider, sender domain, encryption secret ownership | B02/B03 external verification | Adapter plus local captured-mail tests; no live recipient mail without configured environment |
| Expected companies/users/items/write rate and performance targets | B23 release evaluation | Realistic synthetic fixtures and measurements; no unmeasured scale claim |
| Hosting, backup/restore objectives, retention and storage lifecycle | B23 production readiness | Document configuration names, migration/restore rehearsal; no incidental deployment |
| Currency rounding metadata and first company approval policy | B11/B12 | Validate supported currency/rounding and explicit company thresholds; never seed the discussion examples as policy |
| Legacy owner mapping and verification transition | B01/B02/B08 migration gate | Operator-reviewed mapping and explicit verification; no role-name or historical-email inference |
| Optional bulk import | Separate scope discussion | Preserve existing data through migration; CSV export remains required first release |

## First implementation milestone

Deliver B00-B08 as an onboarding-and-inventory foundation: a verified user creates an isolated company, invites a verified colleague, configures locations/categories/units and records existing individual, pooled and consumable stock. Show correctly scoped inventory/history while preserving legacy product IDs and access restrictions. This is a complete slice for review, not a release that defers purchasing or other accepted modules.

Then deliver custody, full procurement, maintenance, notifications/reports/counts and release verification through the backlog. Each slice must update the current contract and record actual unit, database/HTTP and browser evidence. Product acceptance remains open until those checks pass.
