# AssetOS Product and Technical Roadmap

**Status:** Proposed product strategy and implementation roadmap  
**Repository:** [Pavitram239/asset-management](https://github.com/Pavitram239/asset-management)  
**Audience:** Product, engineering, operations, and Codex implementation agents  
**Target:** Multi-organization SaaS for physical and IT assets, differentiated by lifecycle and maintenance management  
**Last updated:** 2026-10-16

> This is a forward-looking plan, not a statement that the features already exist. Each phase must begin with repository inspection, preserve existing behavior where practical, and record real test results. Implement in reviewed increments, not as one massive rewrite.

## 1. Product vision

AssetOS should evolve from an asset register into a configurable asset operations platform. It should help organizations answer four questions:

1. **What do we own?** Accurate, searchable records of physical equipment and IT assets.
2. **Where is it and who is accountable?** Verified locations, assignments, custody, transfers, and audit history.
3. **What condition is it in and what needs action?** Maintenance plans, inspections, work orders, downtime, warranty and lifecycle events.
4. **What is it costing us and what should we do next?** Repair costs, utilization, replacement decisions, budgets, and actionable reports.

The product differentiator is **trusted asset lifecycle history plus maintenance workflows**, supported by secure multi-tenancy and flexible organization configuration.

### Target customers and tenancy

Multiple independent organizations use the same hosted SaaS application. Each organization can configure its own sites, departments, locations, roles, users, workflows, asset fields, and notification preferences within supported product limits. A person may belong to multiple organizations and have different permissions in each.

### Product principles

- Tenant isolation is mandatory and tested.
- Lifecycle transitions are explicit, auditable, and validated.
- Maintenance is a first-class workflow, not a notes field.
- Configurable business concepts must not be hardcoded as role/department enums.
- Permission keys and core invariants remain controlled by the application.
- Build operational depth before adding a long tail of disconnected features.
- Start with a modular monolith and clear module boundaries; do not introduce microservices prematurely.
- Every feature has acceptance criteria, tests, operational behavior, and a clear owner.

## 2. Current baseline and discovery gate

The repository README describes React 18/Vite, Express, PostgreSQL through `pg`, versioned transactional migrations, Firebase Storage for asset images/invoices, Cloudinary for profile avatars, and existing asset register, overview, detail, QR, profile, and role-aware workflows. The API currently retains `/api/v1/products` and `_id` for compatibility.

Before implementation, inspect the current repository branch, actual schema, routes, migrations, auth flow, test commands, UI patterns, file storage, and existing `ENTERPRISE-ROADMAP.md`. Do not assume every idea in this document is absent. Update the checklist with verified existing capabilities and gaps. Historical dependency audit counts must be rechecked against current lockfiles.

The existing detailed RBAC plan is [DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md](DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md). That document is the source of detailed tenancy/RBAC acceptance criteria. This roadmap adds the product modules, lifecycle/maintenance domain, delivery sequencing, and prompts below. If the documents conflict, prefer the stricter security requirement and update both documents.

## 3. Product modules

### 3.1 Platform foundation and multi-tenancy

- Organizations, memberships, invitations, organization switching.
- Configurable sites, departments, locations, teams where required.
- Dynamic custom roles and database-backed role assignments; stable application permission catalog.
- Tenant-scoped assets, files, queries, reports, exports, jobs, and audit records.
- Organization preferences, locale/timezone, date/currency display, retention settings.
- Platform support and SaaS operations kept separate from tenant administration.
- Tenant quotas/feature entitlements only when subscription/business needs are established.

### 3.2 Asset registry and lifecycle

Each asset should have a stable identity and a coherent lifecycle record.

- Identity: asset tag, name, type, category, manufacturer, model, serial number, QR/barcode.
- Context: organization, site, location, department, assigned custodian, vendor.
- Acquisition: supplier, purchase date, cost/currency, purchase order reference, warranty start/end.
- State: lifecycle status, condition, operational state, criticality, last verified date.
- Documents: invoices, warranty certificates, manuals, photos, service reports.
- Timeline: assignments, transfers, inspections, maintenance, repairs, status transitions, cost events, attachments, audit history.
- Bulk create/update through validated import with preview, row-level errors, duplicate detection, and safe rollback/retry.
- Search/filter/sort/pagination with tenant-aware query plans and indexes.

Suggested lifecycle states should be configurable where sensible, but transitions must be validated. Candidate default journey: requested -> ordered -> received -> in_stock -> deployed -> in_maintenance -> retired/disposed. Not every asset follows every state; implement a transition policy rather than allowing arbitrary status strings.

### 3.3 Physical assets

- Furniture, tools, facilities equipment, machinery and other physical inventory.
- Location hierarchy such as site/building/floor/room, with same-organization validation.
- Custody/assignment and transfer acceptance.
- Condition checks, periodic physical audits, discrepancy resolution.
- Consumables/stock should be a distinct later inventory capability if quantity-based stock is needed; do not force every consumable into a serialized asset model.

### 3.4 IT assets

- Laptops, desktops, monitors, mobile devices, networking equipment and peripherals.
- Device identifiers, serial number, operating system, purchase/warranty details, custodian and status.
- Software/license inventory as a separate linked domain, including seat count, entitlement, renewal and compliance dates.
- Employee onboarding/offboarding checklists for device issue, return, wipe/reassignment and access coordination.
- Endpoint management/identity integrations are later releases; avoid claiming live device telemetry without a real connector.

### 3.5 Maintenance and work orders (primary differentiator)

Maintenance is a core product module and should be designed early enough that lifecycle records can reference it.

**Maintenance plans**
- Time-based recurring schedules initially.
- Optional usage/meter-based schedules only after a trustworthy meter input exists.
- Task checklist, required skills, estimated duration, instructions, safety notes, and required parts.
- Next due date, last completion, schedule version and pause/retire behavior.

**Work orders**
- Draft/requested, triaged, approved (when required), scheduled, in_progress, on_hold, completed, cancelled.
- Priority, asset, site/location, requester, assignee/technician, planned/actual dates, SLA targets.
- Diagnosis, action taken, parts/materials, labor/time, vendor, cost, downtime and attachments.
- Reopen/close rules and required completion evidence.
- Audit all important status changes; avoid silent overwrites.

**Maintenance operations**
- Work-order queue, calendar, asset maintenance timeline, overdue view.
- Preventive schedule generation through background jobs with idempotency.
- Repair and downtime history.
- Vendor service/contract references and warranty claim tracking.
- Escalations and notifications.
- Reporting for overdue maintenance, recurring failures, MTTR/MTBF only where source data supports meaningful calculations.

### 3.6 Inspections and physical audits

- Reusable inspection templates/checklists.
- Scheduled and ad hoc inspections.
- QR-assisted scan and confirm identity/location/condition/custodian.
- Audit sessions with expected versus observed assets, discrepancy categories, evidence and resolution.
- Avoid destructive bulk updates from import/scan results without a preview and confirmation step.
- Offline capture is a later feature requiring conflict resolution and a deliberate sync model.

### 3.7 Vendors, procurement and contracts

Deliver after core lifecycle and maintenance are stable:
- Vendor records and contacts.
- Purchase requests, approval, purchase orders, receiving and asset creation from received lines.
- Service contracts, warranty/coverage dates, vendor work and attachments.
- Quote comparison and procurement integrations later.
- Never represent a purchase order as an accounting system of record unless an accounting integration is implemented.

### 3.8 Financial lifecycle

- Acquisition cost, currency, cost history, repair/maintenance spend.
- Depreciation methods and useful life configured with explicit accounting assumptions.
- Residual value and replacement planning.
- Total cost of ownership and repair-versus-replace indicators.
- Budget and department allocation reporting.
- Financial calculations must be deterministic, tested, and explicit about currency and dates. This module is operational planning, not a substitute for regulated accounting advice.

### 3.9 Notifications and workflow automation

Start with system-defined events and a small set of configurable rules:
- Assignment/transfer request and acceptance.
- Maintenance due/overdue, work-order assignment and SLA escalation.
- Warranty/contract expiry.
- Approval requests and decisions.
- Import completion/failure.
- Email and in-app notifications, delivery state, retries, deduplication, preferences and unsubscribe/quiet-hour rules where applicable.
- Use a durable job/outbox pattern when database commits and external notifications must stay consistent.
- Do not start with an unrestricted visual workflow scripting engine. Add workflow configuration after real flows and authorization semantics are proven.

### 3.10 Search, reporting and analytics

- Universal search across authorized assets, people, locations, work orders and vendors.
- Saved filters/views.
- CSV export initially; spreadsheet export if there is a real user need.
- Every report/export must enforce the same row and field access as interactive views.
- Dashboards: asset count/value where data is reliable, lifecycle distribution, maintenance backlog, overdue work, downtime, warranties, audit discrepancies, utilization where measured.
- Avoid misleading KPI calculations when underlying data is incomplete.
- Scheduled reports and forecasting are later releases.

### 3.11 Documents and integrations

- Private file storage with authorization, generated keys, file validation, size limits, cleanup/retry behavior, and short-lived download access.
- Public/versioned API contracts and webhook delivery with signature validation, retries, idempotency and delivery logs when integrations are introduced.
- Future connectors may include identity providers, endpoint management, accounting/procurement systems, and email/calendar.
- Do not introduce integrations without clear use cases, secret rotation, rate limits, and failure behavior.

### 3.12 SaaS administration and operations

- Tenant lifecycle, safe bootstrap, organization suspension/reactivation.
- Feature entitlements/quotas only when pricing/product policy is defined.
- Health/readiness endpoints, structured logs, request IDs, error monitoring.
- Backup/restore drills, migration release process, retention policy, incident response and security review.
- Avoid cross-tenant support access by default. Any break-glass support process must be narrow, time-bound, explicitly approved and audited.

## 4. Recommended technical architecture

### 4.1 Modular monolith first

Retain the existing React + Vite frontend, Express API, PostgreSQL and current storage providers unless repository inspection identifies a concrete blocker. Organize code into modules with clear dependency boundaries:

- Identity and organizations
- Authorization/policy
- Asset registry/lifecycle
- Locations and assignments
- Maintenance plans and work orders
- Inspections/audits
- Vendors/procurement
- Financials
- Files/documents
- Notifications/jobs
- Reporting
- Platform operations

A module should own its validation, service/use-case logic, repository access, and API boundary. Shared infrastructure (database transaction helpers, logging, errors, authorization interfaces) should be small and explicit. Avoid controllers that contain complex business rules.

### 4.2 Request path

1. Authenticate the request.
2. Resolve active user status and explicit organization context.
3. Verify active membership.
4. Authorize the requested permission and resource scope.
5. Validate input and state transition.
6. Execute tenant-scoped query/transaction.
7. Write audit event in the same transaction for critical changes, or use a durable outbox where necessary.
8. Commit.
9. Dispatch asynchronous side effects idempotently.
10. Return a stable API response and correlation ID.

### 4.3 Background jobs

Use a job runner only when recurring maintenance generation, notifications, import processing, or cleanup requires it. Choose the simplest reliable infrastructure compatible with deployment. Jobs must:
- Have idempotency keys or equivalent deduplication.
- Retry transient failures with bounded backoff.
- Expose status/failure visibility.
- Be scoped to a tenant and revalidate that context.
- Avoid holding database transactions open during external network calls.
- Never trust a job payload as an authorization grant.

### 4.4 Data storage

PostgreSQL remains the system of record for relational business data. JSONB is appropriate for flexible, non-critical custom attributes with validation and schema metadata; do not put core relationships, authorization grants, lifecycle transitions or report-critical fields only inside unvalidated JSON.

Use object storage for files, with metadata/authorization in PostgreSQL. A DB transaction cannot atomically commit with Firebase or email. Use compensation, retryable cleanup, or an outbox where appropriate.

### 4.5 API and compatibility

- Keep existing `/api/v1/products` contracts working where possible during staged migrations.
- Introduce new resource routes under `/api/v1` consistent with existing conventions.
- Use pagination, filtering, consistent error shapes, input schemas and parameterized SQL.
- Add API contract tests before breaking response shapes.
- Version only when compatibility cannot be maintained safely; document deprecation periods.

## 5. Proposed data model

This is a conceptual model. Codex must compare it with current tables and avoid unnecessary renames.

### Platform and access
- `organizations`
- `users` (global identity)
- `organization_memberships`
- `departments`
- `sites` and `locations` (hierarchical if needed)
- `permissions` (stable application capability catalog)
- `roles` (organization-owned configurable role definitions)
- `role_permissions`
- `user_role_assignments` (membership, organization, optional department/location scope, validity)
- `audit_events`

Detailed constraints and RBAC semantics live in [the RBAC plan](DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md).

### Asset domain
- Existing `products`/assets table with `organization_id`, stable asset identifier, category/type, lifecycle status, condition, location, custodian/assignee, purchase/warranty metadata.
- `asset_categories` and optionally `asset_attribute_definitions` / `asset_attribute_values` if configurable fields are approved.
- `asset_status_transitions` or lifecycle event records.
- `asset_assignment_history`
- `asset_cost_events` for acquisition, maintenance, upgrade, and disposal cost history.
- `asset_documents` metadata pointing to private object storage.
- `asset_audit_items` / audit sessions for physical verification.

### Maintenance domain
- `maintenance_plans`
- `maintenance_plan_tasks` or checklist template records
- `maintenance_schedules` / due occurrences if needed for reliable recurrence
- `work_orders`
- `work_order_tasks`
- `work_order_status_history`
- `work_order_labor_entries`
- `work_order_parts` only when parts inventory is in scope
- `service_providers` / vendors
- `maintenance_attachments` or shared document relationships

### Workflow and integrations
- `notification_preferences`, `notifications`, `notification_deliveries`
- `background_jobs` only if not provided by chosen infrastructure
- `outbox_events` for durable external side effects
- `webhook_endpoints`, `webhook_deliveries` in a later integration phase
- `import_jobs` and `import_row_errors` for auditable bulk import

### Financial/procurement (later)
- `purchase_requests`, `purchase_request_lines`
- `purchase_orders`, `purchase_order_lines`, `receipts`
- `contracts`, `vendors`
- `depreciation_policies` and/or calculation snapshots only after requirements are agreed.

### Schema rules

- Use foreign keys, unique constraints and indexes aligned with access patterns.
- Enforce same-organization relationships through composite foreign keys where practical.
- Store currency codes and use exact numeric/decimal representations for money, never floating-point arithmetic.
- Store timestamps consistently (UTC) and define organization timezone for scheduling/display.
- Use explicit lifecycle status history where it matters for auditability.
- Define archive/delete/retention behavior for assets, work orders, documents and audit events.
- Keep migrations additive, ordered and immutable after application.
- Do not over-normalize speculative features or add all future tables in the first migration.

## 6. MVP versus later releases

### MVP: trustworthy asset operations
Include:
- Tenant-aware schema and dynamic RBAC.
- Organization membership and switching.
- Dynamic departments, locations and roles.
- Asset register/detail/search/filter and QR workflows.
- Assignment/transfer with history.
- Asset lifecycle statuses and validated transitions.
- Private document access and reliable upload/delete handling.
- Basic maintenance request/work order lifecycle.
- Due/overdue maintenance view.
- Audit log for security and critical asset operations.
- Bulk import with preview and validation if it can be safely delivered without delaying the secure foundation.
- Automated tests, migrations, logging and deployment documentation.

Exclude from MVP:
- Complex workflow builder.
- Predictive AI maintenance.
- Live device telemetry.
- Full procurement/accounting suite.
- Offline-first mobile sync.
- Microservices.
- Custom arbitrary executable business rules.

### Release 2: maintenance depth
- Recurring preventive maintenance schedules.
- Checklists, technicians, labor, parts/cost capture, downtime.
- Vendor/service history, warranty claims, SLA reminders.
- Inspection templates and physical audit sessions.
- Notifications and retryable jobs.
- Maintenance KPIs backed by reliable data.

### Release 3: operational intelligence
- Executive dashboards and saved reports.
- Asset utilization and idle asset insights.
- Cost history and repair-versus-replace views.
- Warranty and contract risk dashboards.
- Scheduled exports and data quality monitoring.

### Release 4: procurement and financial lifecycle
- Vendors/contracts, requests/approvals, purchase orders, receiving.
- Depreciation and total cost of ownership with explicit policy.
- Budget reporting and replacement forecasts.

### Release 5: integrations and advanced platform
- Identity-provider integrations and device-management connectors.
- Webhooks and public integration API.
- Subscription entitlements/quotas when commercial policy is defined.
- Mobile/offline capabilities if validated by users.
- Advanced automation builder only after predefined workflows are proven.

## 7. Dependency graph and sequencing

- Tenant-aware schema and identity context must precede safe multi-tenant features.
- Central authorization and tenant-scoped repositories precede management UI and all new modules.
- Asset lifecycle events and history precede maintenance analytics.
- Locations and assignment history precede meaningful physical audit.
- Work orders and reliable status history precede maintenance KPIs.
- Reliable cost events precede TCO/depreciation analytics.
- Durable jobs/outbox precede recurring schedules and reliable external notifications.
- Document metadata and authorization precede vendor/contracts document management.
- API contracts and tenant-scoped authorization precede public integrations.
- Validated import pipeline precedes large-scale migration or customer onboarding.
- Observability and backup/restore precede production rollout.

## 8. Delivery phases, acceptance criteria and exit gates

### Phase 0: Product and codebase discovery
**Deliver:** verified feature inventory, domain glossary, endpoint inventory, migration review, threat model, user workflows, schema proposal and test baseline.

**Acceptance:** current behavior and real gaps are documented; ambiguous decisions are listed; no application behavior changed; commands/results are recorded truthfully.

### Phase 1: Secure multi-tenant foundation
**Deliver:** organization/membership model, dynamic roles/permissions/scopes, tenant-aware assets/departments/locations, safe backfill, centralized authorization and audit basics.

**Acceptance:** cross-tenant reads/writes/downloads are denied; custom roles work without source edits; user can have different roles in two organizations; revoked grants take effect within a documented bound; migration preserves existing PostgreSQL data; tests cover IDOR and privilege escalation.

### Phase 2: Asset lifecycle and data quality
**Deliver:** lifecycle states/transitions, asset identity/tagging, assignment/transfer history, document metadata/private access, import preview, validation and duplicate detection.

**Acceptance:** every lifecycle transition is validated and audited; transfers are transactional; invalid cross-tenant relationships are rejected; imports cannot silently overwrite unrelated records; asset APIs remain compatible or changes are documented and tested.

### Phase 3: Maintenance core
**Deliver:** maintenance requests and work orders, priorities, assignment, status history, completion evidence, asset timeline and overdue queue.

**Acceptance:** unauthorized users cannot see or mutate another tenant's work; invalid transitions fail; every status change has an actor/time; completion captures required fields; work order and asset references are tenant-consistent; failure paths are tested.

### Phase 4: Preventive maintenance, inspections and notifications
**Deliver:** recurring schedules, idempotent job generation, checklist templates, inspections, audit sessions, email/in-app alerts, retries and delivery status.

**Acceptance:** rerunning a scheduler does not duplicate work orders; overdue calculation respects timezone; notification failures are retryable and visible; inspection discrepancies require explicit resolution; jobs revalidate tenant scope.

### Phase 5: Reporting and operational intelligence
**Deliver:** role-aware dashboards, saved filters, CSV reports, maintenance and lifecycle KPIs, data quality reports.

**Acceptance:** exports apply identical authorization to API reads; KPI definitions are documented; queries are indexed and paginated; metrics disclose missing/insufficient source data rather than fabricating values.

### Phase 6: Vendors, procurement and financial lifecycle
**Deliver:** vendors/contracts, request/approval/purchase order/receiving flow, cost events, depreciation/TCO policy.

**Acceptance:** approval and receiving transitions are audited; received assets link to purchase records; monetary values use decimal arithmetic and currency codes; depreciation assumptions are documented and tested; cross-tenant vendor and document access is denied.

### Phase 7: Integrations and advanced SaaS operations
**Deliver:** API/webhook contracts, selected identity/device/procurement connectors, operational monitoring, tenant lifecycle and entitlements only if needed.

**Acceptance:** webhook signatures and retries are tested; duplicate deliveries are idempotent; secrets are rotatable; connector failures are observable; support access is explicit and audited; backup/restore and incident procedures are rehearsed.

### Phase 8: Release hardening
**Deliver:** dependency audit, security review, migration/release runbook, backup restore evidence, performance baseline, support documentation.

**Acceptance:** relevant tests/lint/build/audits have real recorded outcomes; critical/high findings have documented disposition; restore process has been exercised; no known cross-tenant access bypass remains; rollback limitations are understood.

## 9. Cross-cutting non-functional requirements

### Security
- Deny-by-default centralized authorization.
- Tenant isolation on database queries, object storage and background jobs.
- Parameterized SQL, input validation, output-safe rendering, CSRF protections as appropriate to cookie auth, secure cookie/CORS/header configuration.
- No secrets or sensitive documents in logs.
- Prompt permission revocation, brute-force controls and auditability.
- Dependency and upload threat review.

### Reliability
- Transactional multi-record changes.
- Idempotent jobs and retries with bounded backoff.
- Storage/database compensation or durable cleanup.
- Stable error responses and request correlation IDs.
- Health/readiness checks, backup/restore and incident runbooks.

### Performance
- Tenant-scoped indexes and query plans.
- Pagination for list APIs and exports.
- Avoid N+1 query patterns.
- Large imports/exports and file operations should not monopolize API request workers.
- Establish realistic performance budgets after a baseline is measured; do not invent benchmark results.

### Accessibility and UX
- Keyboard-accessible forms and workflows.
- Clear status labels and validation messages.
- Responsive layouts for common operational screens.
- Accessible tables, dialogs and notifications.
- Destructive operations require explicit confirmation and clear consequences.

### Privacy and retention
- Collect only necessary personal data.
- Define retention/deletion behavior for documents, audit data and removed memberships.
- Ensure exports and support operations obey tenant access policies.
- Document any immutable audit retention requirements.

## 10. Test strategy

Use existing project test frameworks. Inspect package scripts before running commands.

- **Unit:** permission resolution, lifecycle transition policy, maintenance due calculations, validation and financial arithmetic.
- **Integration:** PostgreSQL constraints, migrations, transactions, tenant scoping, work-order workflows, assignment and audit events.
- **Security:** cross-tenant IDOR, guessed UUIDs, altered organization IDs, unauthorized downloads/exports, privilege escalation, stale grants.
- **Jobs:** idempotency, retry, duplicate schedule prevention, timezone boundaries, dead-letter/failure visibility where supported.
- **Storage:** invalid files, unauthorized access, upload/delete partial failure and cleanup retries.
- **Frontend:** organization switching, management flows, loading/error states and permission-aware action visibility.
- **Regression:** existing login, asset register/detail, QR, profile and current API contracts.
- **Operational:** clean database migration, representative backfill, build, lint, dependency audit, backup/restore procedure.

Never claim tests passed unless commands ran and their results were observed. Use a dedicated test database; never run destructive tests against production.

## 11. Product metrics to consider

Instrument metrics only where data is trustworthy and privacy-appropriate:
- Percentage of assets with verified owner, location, category and lifecycle state.
- Physical audit discrepancy rate.
- Preventive maintenance completed on time.
- Overdue work-order backlog and age.
- Mean time to repair only when downtime timestamps are reliable.
- Warranty/contract expirations without an action.
- Import failure rate and duplicate rate.
- Cross-tenant authorization denials and suspicious access attempts.
- Notification/job failure rate.
- API latency/error rate and successful restore drills.

Avoid vanity dashboards; each metric should have a clear definition and an owner who can act on it.

## 12. Codex operating rules

- Work in a dedicated feature branch.
- Read this roadmap and the detailed RBAC plan before each phase.
- Inspect actual files before editing; adapt names to the current codebase.
- Implement one phase at a time and make focused commits.
- Add tests with each feature.
- Do not introduce microservices or major infrastructure dependencies without an explicit need.
- Do not hardcode business roles, department names, organization IDs, or sample users in runtime logic.
- Do not run destructive production migrations, deploy, or change live infrastructure without explicit approval.
- Update the roadmap with actual file paths, test commands/results, completed criteria and unresolved risks.

## 13. Separate Codex prompts

### Prompt 0: Discovery and architecture decision record

```text
Read docs/ASSETOS_PRODUCT_AND_TECHNICAL_ROADMAP.md and docs/DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md. Do not implement features yet. Inspect the current repository, README, ENTERPRISE-ROADMAP.md, schema/migrations, authentication, routes, controllers, repositories, frontend, storage, tests, and package scripts. Produce a verified feature inventory and gap analysis. Propose repository-specific module boundaries and a data model for lifecycle, assignments, maintenance, work orders, locations, documents, jobs and audit. Identify dependencies and migration risks. Separate must-have MVP scope from later releases. Record actual test/build results if run; do not invent them. Update the roadmap with findings and explicit decisions. No application behavior changes in this phase.
```

### Prompt 1: Multi-tenant security and dynamic RBAC

```text
Implement Phase 1 using the two planning documents as requirements. Start by confirming current schema and migration history. Build the organization/membership model, database-driven roles and role-permission grants, scoped assignments, tenant-aware assets/departments/locations, centralized authorization and safe migration/backfill. Preserve existing PostgreSQL data and API compatibility where practical. Add constraints and tests for cross-tenant isolation, custom roles, different roles per organization, department scope, revocation, IDOR and privilege escalation. Do not build speculative product modules yet. Run relevant tests on a dedicated database and update both planning documents with exact results and remaining risks.
```

### Prompt 2: Asset lifecycle and data quality

```text
Implement Phase 2 from docs/ASSETOS_PRODUCT_AND_TECHNICAL_ROADMAP.md. Inspect existing asset/product models and routes. Add validated lifecycle statuses and transitions, assignment/transfer history, asset timeline, consistent location/custodian relationships, private document metadata/access, and a safe bulk-import workflow with preview and row-level validation. Keep existing API contracts where possible. Every important transition must be authorized and audited. Add migration, integration, tenant-isolation and regression tests. Do not silently overwrite records or delete data. Run tests/builds available and update the roadmap.
```

### Prompt 3: Maintenance and work-order core

```text
Implement Phase 3 from docs/ASSETOS_PRODUCT_AND_TECHNICAL_ROADMAP.md. Add a maintenance/work-order module consistent with the existing modular-monolith architecture. Support request creation, triage, priority, assignment, planned dates, validated status transitions, notes/diagnosis/action taken, completion evidence, asset timeline and overdue views. Enforce organization/resource permissions on every route and query. Keep status history and audit events. Use transactions for related mutations. Add unit and PostgreSQL integration tests for workflow transitions, invalid states, cross-tenant access, assignment and failures. Avoid premature parts inventory, advanced automation or microservices. Update the roadmap with actual results.
```

### Prompt 4: Preventive maintenance, inspections and notifications

```text
Implement Phase 4 from docs/ASSETOS_PRODUCT_AND_TECHNICAL_ROADMAP.md. Add time-based preventive maintenance schedules, idempotent due-work generation, checklist templates, inspections/physical audit sessions, discrepancy resolution, and notification delivery with retry/status visibility. Choose the simplest job infrastructure compatible with the repository and document its deployment requirements. Prevent duplicate work orders on repeated job execution, define timezone behavior, and revalidate tenant scope in every job. Add tests for retries, idempotency, timezone boundaries, authorization, audit and partial failure. Do not build an unrestricted workflow scripting engine. Update the roadmap.
```

### Prompt 5: Reporting and operational intelligence

```text
Implement Phase 5 from docs/ASSETOS_PRODUCT_AND_TECHNICAL_ROADMAP.md. Build role-aware dashboard metrics, saved filters/views, authorized CSV exports, maintenance backlog/overdue views, lifecycle distributions and data-quality reports. Define each KPI and its source data. Do not fabricate utilization, MTTR, financial value or other metrics when inputs are missing. Ensure exports apply exactly the same tenant, row and field authorization as interactive APIs. Optimize indexes and query plans based on observed queries; use pagination and tests. Add regression and authorization tests, run build/test scripts, and update the roadmap.
```

### Prompt 6: Vendors, procurement and financial lifecycle

```text
Implement Phase 6 from docs/ASSETOS_PRODUCT_AND_TECHNICAL_ROADMAP.md only after the earlier lifecycle/maintenance foundation is verified. Add vendor/contract records, purchase request/approval/order/receiving workflows, and cost events. Add depreciation/TCO only after documenting the supported policy assumptions and date/currency rules. Use exact decimal arithmetic and explicit currency codes. Audit state transitions, enforce tenant boundaries and avoid pretending to replace an accounting system. Add migrations, transaction and integration tests, and update the roadmap with limitations and results.
```

### Prompt 7: Integrations and SaaS operations

```text
Implement Phase 7 from docs/ASSETOS_PRODUCT_AND_TECHNICAL_ROADMAP.md based on real product requirements and existing infrastructure. Add only selected integration capabilities with documented API contracts, webhook signatures, retries, idempotency, secret handling, delivery logs and tenant-aware authorization. Review tenant lifecycle, quotas/feature entitlements only if commercial requirements exist, structured logs, health/readiness, backups and restore procedures. Keep support access separate and auditable. Do not add a new external service without documenting cost/configuration/operations. Test failures and update the roadmap.
```

### Prompt 8: Security, performance and release readiness

```text
Complete Phase 8 from docs/ASSETOS_PRODUCT_AND_TECHNICAL_ROADMAP.md and the final hardening phase in docs/DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md. Inspect the complete diff. Run current dependency audits, tests, lint, type checks, builds, migrations and integration tests that the repository supports. Verify tenant isolation for API, exports, files and jobs; review upload security, revocation, rate limits, secret handling, Docker config, logs, health checks, and backup/restore documentation. Fix issues introduced by the implementation and document any pre-existing findings separately. Do not claim success without observed command output. Do not deploy or run destructive production commands. Update both plans with actual acceptance status, known risks, and a safe release/rollback checklist.
```

## 14. Roadmap status checklist

Update this list as phases are reviewed and merged:

- [ ] Phase 0: Discovery and architecture decisions
- [ ] Phase 1: Multi-tenant security and dynamic RBAC
- [ ] Phase 2: Asset lifecycle and data quality
- [ ] Phase 3: Maintenance and work-order core
- [ ] Phase 4: Preventive maintenance, inspections and notifications
- [ ] Phase 5: Reporting and operational intelligence
- [ ] Phase 6: Vendors, procurement and financial lifecycle
- [ ] Phase 7: Integrations and SaaS operations
- [ ] Phase 8: Security, performance and release readiness

## 15. Final product guardrail

AssetOS should become deeper before it becomes wider. A secure asset history, reliable maintenance schedule, well-designed work-order lifecycle, and trustworthy tenant boundaries are more valuable than many shallow modules. Deliver each release as a cohesive, testable product slice, and let real operational needs justify the next layer.
