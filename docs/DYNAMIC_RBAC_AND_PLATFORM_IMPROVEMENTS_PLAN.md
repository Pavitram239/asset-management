# Dynamic RBAC and Platform Improvements Plan

**Status:** Proposed implementation specification  
**Repository:** [Pavitram239/asset-management](https://github.com/Pavitram239/asset-management)  
**Document owner:** Project maintainers  
**Last updated:** 2026-10-16

## 1. Purpose

This document defines a staged, testable plan for evolving AssetOS into a secure, multi-organization asset-management platform with database-driven authorization and stronger operational reliability.

It is a plan, not a claim that the features below already exist. Codex must inspect the current code before implementing each phase, confirm actual paths and behavior, and update this document when repository realities require a justified adjustment.

### Product requirements

- Organizations, departments, user memberships, business roles, and role assignments are managed through the application and database, not hardcoded in business logic.
- A user may belong to multiple organizations and have different roles in each.
- Each organization can configure its own departments and custom roles.
- Permission identifiers are stable technical capabilities maintained by the application. For example, `asset.read` is a capability identifier, not a business role.
- Authorization is enforced on the server for every protected operation and every resource, not merely by hiding UI controls.
- Tenant boundaries apply to assets, files, departments, assignments, administration, exports, and audit records.
- Existing asset-management workflows remain functional or are migrated with documented compatibility changes.
- Security and reliability improvements are implemented incrementally, tested, and operationally documented.

## 2. Repository baseline and assumptions

The repository README describes a React 18/Vite frontend, an Express API, PostgreSQL accessed with `pg`, versioned transactional migrations, Firebase Storage for asset images/invoices, and Cloudinary for avatars. Existing API compatibility includes `/api/v1/products` and the response field `_id`. Existing concepts include users, products/assets, departments, roles, authentication, assignment, and warranty status.

The README also states that the PostgreSQL version starts with an empty database and does not import MongoDB records. Do not assume old MongoDB data must be migrated. Do preserve data already present in any PostgreSQL deployment. Confirm the current schema and migration history before designing backfills.

Prior code inspection identified areas to verify while implementing:
- Hardcoded role and department assumptions in constants, SQL migrations, routes, or controllers.
- Route/controller authorization that checks role names directly.
- Login rate limiting implemented in process memory.
- Storage and database operations that can fail independently.
- Upload handling that may rely on client-supplied content metadata or buffer entire files.
- Warranty/date calculations that may differ between SQL and JavaScript.
- Dependency audit findings mentioned in project roadmap documentation. Re-run the audit; do not treat historical vulnerability counts as current facts.

**First task for Codex:** inspect the current branch and repository state, tests, migrations, route definitions, middleware, controllers, repositories, frontend auth state, and storage adapters. Record verified findings and actual commands/results. Do not infer that a feature is absent solely because this document lists it as a target.

## 3. Architecture principles

1. **Deny by default.** A missing permission, membership, resource scope, or authorization context means deny.
2. **Server is authoritative.** Frontend permission checks improve usability but never secure an endpoint.
3. **Tenant context is explicit.** Every organization-scoped request operates within a verified active organization membership.
4. **Scope is narrower than permission.** Having `asset.read` does not automatically mean access to every asset.
5. **No role-name checks in business authorization.** Application logic checks permission capabilities and scope; role names are labels for administrators.
6. **Stable permission catalog, dynamic grants.** Permission keys are code-defined and validated, while roles and role-permission grants are data-driven.
7. **Revoke promptly.** Authorization changes must take effect without waiting for a long-lived JWT to expire.
8. **Database constraints reinforce policy.** Authorization checks do not replace foreign keys, uniqueness constraints, or transactional invariants.
9. **Auditable privilege changes.** Changes to memberships, role grants, permissions, and critical asset operations produce audit events.
10. **Small reversible steps.** Use additive migrations, tests, and phased delivery. Do not silently delete data or combine unrelated refactors.

## 4. Proposed domain model

Adapt naming and columns to the existing PostgreSQL conventions. UUIDs are preferred if consistent with the current schema.

### 4.1 Core tables

#### `organizations`
- `id` primary key
- `name`, optional unique `slug` or normalized identifier
- `status` (for example active/suspended)
- `created_at`, `updated_at`

#### `users`
Retain the existing identity/authentication model. User identity is global; organization-specific privileges do not live on the user row. Avoid using a global `users.role` field as the authorization source. If retained temporarily for migration compatibility, mark it deprecated and remove authorization dependence on it.

#### `organization_memberships`
- `id`, `organization_id`, `user_id`
- `status` (invited/active/suspended/removed as supported by product flow)
- optional `joined_at`, `created_at`, `updated_at`
- unique constraint on `(organization_id, user_id)`
- indexes for `(user_id, status)` and `(organization_id, status)`

A user can have memberships in several organizations. A membership is the basis for any organization-scoped access.

#### `departments`
- `id`, `organization_id`, `name`, optional `code`
- `status`, timestamps
- unique normalized name/code per organization, as product requirements permit
- unique composite key `(organization_id, id)` if needed by composite foreign keys

Departments are organization-owned data. Do not encode department names as application constants or rely on a fixed list.

#### `permissions`
- `id`, stable unique `key` such as `asset.read`
- `description`, `resource_type`, optional `is_sensitive`
- optional `is_assignable` or `system_managed`
- This is the application capability catalog. Seed or synchronize known permission keys through migrations or a controlled startup/deployment mechanism.
- Never let an ordinary organization administrator create arbitrary permission keys that the backend does not understand.

#### `roles`
- `id`, `organization_id`, `name`, optional `description`
- `status`, timestamps, optional `is_system_managed`
- unique normalized role name per organization
- A role is an organization-owned bundle of permission grants. It is not a hardcoded enum.
- If the product needs platform-level support staff roles, model those separately with an explicit threat model and platform-only authorization path. Do not mix them into tenant roles.

#### `role_permissions`
- `role_id`, `permission_id`, optional policy attributes if needed
- primary/unique key on `(role_id, permission_id)`
- Validate that the role belongs to the active organization before changing its grants.
- Avoid per-role custom permission strings that the application does not recognize.

#### `user_role_assignments`
- `id`, `organization_id`, `membership_id`, `role_id`
- optional `department_id` for department-scoped grants
- optional `location_id` if a real location entity is introduced
- optional `valid_from`, `valid_until`, `created_by`, timestamps
- indexes for membership, organization, role, department, and active validity
- Enforce same-organization relationships using composite foreign keys where practical.

This supports organization-wide role assignments and more limited department assignments. Prefer one clearly documented representation over multiple overlapping ways to assign a role.

#### `assets` / existing `products`
Keep the existing table and API naming unless a separately approved migration changes it. Add or verify:
- `organization_id` non-null after safe backfill
- department and assignee relationships constrained to the same organization
- indexes supporting tenant-filtered list/search queries
- consistent status, deletion, and timestamp semantics

If `products` remains the database table, do not rename it solely to match this document. The API can retain `/products` while the product UI calls them assets.

#### `asset_assignment_history`
- `id`, `organization_id`, `asset_id`
- previous and new assignee IDs, previous/new department IDs if applicable
- actor, reason/note where appropriate, effective timestamp
- use immutable historical records for transfers rather than overwriting history
- apply retention rules and avoid storing unnecessary sensitive data

#### `audit_events`
- `id`, `organization_id` nullable only for truly platform-level events
- actor user ID (nullable for system/anonymous events), action key, resource type and ID
- outcome, timestamp, request/correlation ID
- safe structured metadata with before/after diffs only for fields approved for audit
- indexes on organization/time, actor/time, and resource identity
- application-level append-only behavior and restricted database privileges where feasible

### 4.2 Optional entities, only when needed

- `locations` and `asset_locations` for actual physical location scoping.
- `invitations` for email invitation lifecycle.
- `outbox_events` or a durable storage-cleanup queue for retryable cross-system operations.
- `sessions` or token-version/revocation state if required by the existing authentication design.

Do not add these entities speculatively. Introduce them when there is a defined workflow and acceptance test.

### 4.3 Database invariants

At minimum:
- An assignment's membership, role, department, and organization must agree.
- An asset's organization must match its department and assignee membership.
- A role-permission link references an existing permission.
- Duplicate memberships and duplicate role-permission links are rejected by the database.
- Deactivating a referenced organization, department, role, or user has defined behavior.
- Critical multi-record changes run in a transaction.
- Constraints should protect data integrity even if an application code path is accidentally bypassed.

Where composite foreign keys require additional unique constraints, add them explicitly. Explain any invariant that cannot be expressed in PostgreSQL and enforce it in a transaction with tests.

## 5. Permission catalog and authorization semantics

The exact catalog must be finalized from the routes and workflows found in the repository. Start with a small explicit catalog; do not create permissions for hypothetical features. Candidate keys include:

| Capability | Meaning |
|---|---|
| `asset.read` | Read permitted assets |
| `asset.create` | Create assets |
| `asset.update` | Update permitted assets |
| `asset.delete` | Delete or archive permitted assets |
| `asset.assign` | Assign or transfer assets |
| `asset.export` | Export authorized asset data |
| `asset.file.read` | Download authorized asset files |
| `asset.file.manage` | Upload, replace, or remove asset files |
| `department.read` | Read department metadata |
| `department.manage` | Create/update/deactivate departments |
| `membership.read` | View organization memberships |
| `membership.manage` | Invite, suspend, or remove members |
| `role.read` | View roles and grants |
| `role.manage` | Create/update/deactivate roles and edit grants |
| `role.assign` | Assign/revoke roles for other memberships |
| `audit.read` | Read authorized audit events |
| `organization.manage` | Change organization settings |

The catalog is illustrative. Validate each capability against actual application routes and use least privilege. Split capabilities where different risk levels warrant it. Avoid one broad `admin` permission.

### 5.1 Evaluation contract

Implement a centralized authorization service with semantics equivalent to:

```text
authorize({
  actor,
  organizationId,
  permission,
  resource?,
  actionContext?
}) -> allow | deny
```

The service must:
1. Verify the actor is authenticated and active.
2. Verify active membership in the requested organization.
3. Resolve active role assignments and permission grants from trusted database records.
4. Apply assignment scope and resource attributes.
5. Deny when resource organization, department, or ownership does not match the allowed scope.
6. Return a clear internal denial reason for logging/testing without leaking sensitive information to the client.
7. Fail closed on missing records, unknown permission keys, malformed context, and unexpected resolution errors.

Use typed result values or a consistent project-appropriate interface. Do not allow controllers to invent authorization decisions by reading request-body role names.

### 5.2 Scope rules

Define and test these semantics:

- **Organization scope:** applies only to resources in the active organization.
- **Department scope:** applies only to resources associated with the assigned department. A missing department on a resource must not accidentally widen access.
- **Location scope:** implement only if location data exists and has validated organization ownership.
- **Self/assigned scope:** applies only where the resource has a trusted ownership/assignment relationship to the actor. Never trust a client-supplied owner ID.
- **Multiple grants:** grants may be additive, but only within each grant's scope. A broad grant must be explicitly assigned; a narrow grant must never be upgraded implicitly.
- **Explicit deny:** do not add deny-overrides complexity unless a real requirement exists. Initially use additive grants plus mandatory tenant/scope boundaries.
- **Role edits:** changes affect every user assigned that role. Show this consequence in the UI and audit the change.
- **Inactive entities:** suspended membership, inactive role, expired assignment, or inactive organization must not grant access.

### 5.3 Privilege escalation controls

- Users cannot grant themselves roles or edit their own effective permissions unless an explicit, reviewed product policy allows a narrow operation.
- A role manager cannot grant permissions beyond the grant authority delegated to them. If the product does not implement delegated administration safely, reserve role/permission management for explicitly authorized organization administrators.
- Protect the last active organization administrator from accidental removal, suspension, or demotion. Enforce this in a transaction with appropriate locking to prevent races.
- Bootstrap the first organization owner through a controlled, authenticated setup/CLI process or the existing secure first-user flow. Do not expose public admin creation.
- Platform support access, if ever required, must be a separate explicit capability with audit and least privilege.

## 6. Authentication and request lifecycle

Inspect the current cookie/JWT/session design before changing it.

- Authentication establishes actor identity only. Do not treat a JWT's stale role claims as the definitive permission source.
- Resolve current organization membership and grants from the database, or use a cache with reliable invalidation and a short, documented freshness bound.
- Ensure removed memberships and revoked grants take effect promptly.
- Validate active organization context on every organization-scoped request.
- Keep authentication middleware separate from permission and resource-scope middleware.
- Avoid leaking account existence through login errors.
- Rate-limit login and other sensitive endpoints using a shared store in multi-instance deployments.
- Keep secrets out of logs and responses.

## 7. API design

Use the existing `/api/v1` convention and project response/error format. The routes below are proposed resource groupings, not permission to break current contracts without need. All routes must enforce both authentication and object/tenant authorization.

### Organizations and memberships
- `GET /api/v1/organizations`: organizations the current user belongs to.
- `POST /api/v1/organizations`: create an organization only through an approved bootstrap or authorized product flow.
- `GET /api/v1/organizations/:organizationId`
- `PATCH /api/v1/organizations/:organizationId`
- `GET /api/v1/organizations/:organizationId/memberships`
- `POST /api/v1/organizations/:organizationId/invitations` or membership creation through a verified invitation flow.
- `PATCH /api/v1/organizations/:organizationId/memberships/:membershipId`
- `DELETE /api/v1/organizations/:organizationId/memberships/:membershipId` or a documented suspend/remove operation.

Do not let a caller add arbitrary existing users to an organization without a verified, authorized membership flow.

### Departments
- `GET /api/v1/organizations/:organizationId/departments`
- `POST /api/v1/organizations/:organizationId/departments`
- `PATCH /api/v1/organizations/:organizationId/departments/:departmentId`
- `DELETE /api/v1/organizations/:organizationId/departments/:departmentId` or deactivate operation with explicit behavior for assets and assignments.

### Roles and permissions
- `GET /api/v1/organizations/:organizationId/roles`
- `POST /api/v1/organizations/:organizationId/roles`
- `GET /api/v1/organizations/:organizationId/roles/:roleId`
- `PATCH /api/v1/organizations/:organizationId/roles/:roleId`
- `PUT /api/v1/organizations/:organizationId/roles/:roleId/permissions`
- `GET /api/v1/permissions`: application-supported permission catalog, filtered as appropriate.
- `GET /api/v1/organizations/:organizationId/memberships/:membershipId/roles`
- `PUT /api/v1/organizations/:organizationId/memberships/:membershipId/roles`
- `GET /api/v1/organizations/:organizationId/memberships/:membershipId/effective-permissions`

Use idempotent replacement semantics for `PUT` endpoints, validate every referenced ID and scope, and audit changes. Do not reveal permission assignments to users who lack the appropriate read permission.

### Asset endpoints
Keep existing `/api/v1/products` contracts where possible. Add organization-scoped filtering and resource authorization to list, detail, create, update, delete/archive, assignment, QR generation/download, file upload/download, and exports. Never accept organization, department, or assignee fields without validating them against trusted membership and resource data.

### Error conventions
Use consistent status codes and response shapes:
- 401 for unauthenticated requests.
- 403 for authenticated but unauthorized actions, or 404 for inaccessible resources where that is the established anti-enumeration policy.
- 400/422 for invalid input according to existing conventions.
- 409 for uniqueness or state conflicts.
- Do not expose SQL, stack traces, storage credentials, or internal authorization detail in client-facing errors.

## 8. Frontend requirements

- Provide organization selection/switching for users with multiple memberships.
- Keep the active organization explicit and reset organization-specific cached state on switch.
- Load roles, departments, and effective permissions from APIs; do not hardcode business role names or department lists.
- Add management screens for departments, roles, permission grants, and memberships according to the existing component patterns.
- Show clear scope information, such as organization-wide versus department-scoped assignments.
- Explain when a role edit affects multiple members.
- Hide actions the user cannot perform, while still expecting server-side enforcement.
- Handle 401, 403, inactive membership, and organization-switch failures consistently.
- Avoid stale UI permissions after grants are changed.
- Provide accessible loading, empty, validation, success, and error states.
- Do not expose security-sensitive management screens just because a user knows their URL.

## 9. Data migration and rollout

The migration must be based on verified current schema and deployed data, not assumptions.

1. Add new tables and nullable organization references as an additive migration.
2. Establish a safe organization backfill strategy. For a single-tenant deployment, a documented one-time organization may be appropriate, but do not hardcode that as a permanent product constraint.
3. Backfill users' memberships, roles, department ownership, assets, and relationships using verified data.
4. Create initial database-backed roles and grants from current behavior only as migration data. The runtime authorization engine must not depend on those role names.
5. Validate row counts, orphaned records, duplicate assignments, and cross-organization references.
6. Add constraints after data is clean.
7. Update repositories and APIs to require tenant context.
8. Enable enforcement in a controlled deployment step, with monitoring and a tested recovery plan.
9. Keep applied migration files immutable; add new numbered migrations.
10. Document rollback limitations, especially where new writes cannot be safely reversed.

Do not run destructive migrations automatically against production without an explicit deployment approval. Test against a dedicated PostgreSQL database. Never delete a database volume as part of routine migration instructions.

## 10. Audit, file operations, and data integrity

### Audit events
Record actor, organization, action, target, outcome, timestamp, request/correlation ID, and carefully selected metadata for:
- Role/grant changes and role assignments.
- Membership invitations, activation, suspension, and removal.
- Department/organization changes.
- Asset creation, update, archive/delete, assignment, and transfer.
- Sensitive exports and file operations where appropriate.
- Authentication/authorization events useful for investigation.

Do not store passwords, tokens, signed URLs, invoice contents, or unnecessary personal data in audit logs. Restrict audit read access. Audit critical mutations in the same transaction when possible. If external side effects make that impossible, use a durable outbox or compensating workflow where justified.

### File uploads and cloud storage
- Enforce size, allowed extension, allowed media type, and content/signature validation where practical. Never trust only client-supplied MIME.
- Use generated object keys; prevent path traversal and unsafe names.
- Keep invoices private; authorize each download and use short-lived signed URLs where appropriate.
- Stream large files when supported rather than buffering unbounded content.
- Ensure storage actions are authorized against the parent asset and organization.
- Handle database/storage partial failure with compensating deletion, retryable cleanup, or a durable outbox.
- Do not silently leave orphaned files or database references.
- Keep Firebase and Cloudinary integrations unless a concrete security or operational reason justifies change.
- Consider malware scanning for uploaded documents based on deployment risk and available infrastructure.

### Asset lifecycle
- Make assignment/transfer operations transactional.
- Preserve assignment history.
- Validate same-organization membership and department relationships.
- Define deletion/archive semantics and retention.
- Standardize warranty/date calculations and timezone rules between SQL and JavaScript.
- Validate identifiers and prevent unintended duplicate asset records.

## 11. Additional production-readiness work

### Rate limiting and auth
- Replace in-process-only rate limiting with shared rate limiting for multi-instance deployments (for example Redis) if the deployment architecture requires it.
- Apply limits to login, invitations, role mutation, uploads, exports, and other sensitive endpoints.
- Review session expiration, token revocation, account deactivation, cookie flags, CORS, security headers, and password handling.
- Do not introduce infrastructure dependencies without setup documentation and tests.

### Dependencies and supply chain
- Run the actual package-manager audit for the current lockfiles.
- Record command, date, and severity counts.
- Prioritize reachable, exploitable critical/high findings.
- Upgrade deliberately and run tests/build after upgrades.
- Do not blindly force upgrades or claim an advisory is fixed without rerunning the audit.
- Avoid committing real credentials; validate required environment variables on startup.

### Operations
- Improve structured logging and request correlation.
- Ensure production errors do not reveal stack traces or secrets.
- Verify health checks cover the appropriate service/dependency state.
- Review Docker runtime users, exposed ports, secret handling, and production configuration.
- Document backup and restore testing, migration deployment, storage cleanup, and incident response basics.

## 12. Testing and acceptance criteria

Use the repository's current test framework and scripts. Inspect actual commands in root and workspace package files before running them.

### Authorization unit tests
- Unknown permission denies.
- Missing actor, organization, membership, resource, or scope denies.
- Active grants permit only matching actions and resources.
- Department scope never widens to organization scope.
- Multiple roles combine only according to documented additive semantics.
- Expired or inactive assignments do not grant access.
- Role/permission updates change effective authorization promptly.

### API integration tests
- Unauthenticated requests cannot access protected endpoints.
- User A cannot read or mutate User B's organization data by changing IDs, query parameters, body fields, or headers.
- A user cannot switch into an organization without active membership.
- A user can belong to multiple organizations with different roles.
- Cross-organization asset assignment, department assignment, role assignment, and file access are rejected.
- Unauthorized exports, QR downloads, invoice downloads, and uploads are rejected.
- Unauthorized users cannot manage roles, grant permissions, or alter memberships.
- The last active organization administrator cannot be removed/demoted by conflicting concurrent requests.
- Revoked memberships and grants take effect within the documented freshness guarantee.

### Database and migration tests
- Migrations apply to a clean test database.
- Upgrade/backfill behavior is tested against a representative fixture of the existing PostgreSQL schema.
- Constraints reject invalid cross-organization relationships.
- Uniqueness and transaction rollback work.
- Migration validation detects orphaned or ambiguous legacy records.

### File and reliability tests
- Oversized, disallowed, and malformed uploads are rejected.
- Storage failures do not silently create inconsistent DB state.
- Cleanup retries are idempotent.
- Audit records are created for critical changes without secrets.
- Shared rate limiting works across multiple app instances if that infrastructure is adopted.

### Regression checks
Run the actual project scripts for tests, lint, type checking (if configured), and build. Run PostgreSQL integration tests with a dedicated test database. Report each command and its observed result. Never claim tests passed if they were not run.

## 13. Prioritized delivery phases

### Phase 0: Repository audit and decisions
Deliverables:
- Verified architecture and endpoint inventory.
- Inventory of hardcoded role/department checks.
- Existing schema and migration analysis.
- Threat model and permission/scope semantics.
- Migration/backfill strategy.
- Updated task checklist with risks.

Exit criteria: no schema or authorization implementation begins before the critical assumptions and migration approach are documented.

### Phase 1: Tenant-aware schema and safe migration
Deliverables:
- Organizations, memberships, organization-owned departments/roles, permissions, grants, scoped role assignments.
- Asset organization ownership and same-tenant relationship constraints.
- Safe backfill and migration validation.
- Database-level tests.

Exit criteria: schema supports multiple organizations and rejects invalid cross-tenant relationships; existing PostgreSQL data is preserved.

### Phase 2: Central authorization service
Deliverables:
- Permission catalog.
- Central resolver and middleware.
- Resource and scope checks.
- Revocation/freshness behavior.
- Unit tests and route authorization inventory.

Exit criteria: policy is centralized, deny-by-default, and independently tested.

### Phase 3: API migration and tenant enforcement
Deliverables:
- All protected API routes and queries use verified organization context.
- Object-level authorization for assets and file operations.
- Role, permission, department, and membership management APIs.
- Security integration tests.

Exit criteria: no known protected endpoint bypasses tenant/resource authorization; tests cover IDOR and cross-tenant attempts.

### Phase 4: Frontend organization and administration UI
Deliverables:
- Organization switcher.
- Dynamic department/role/membership screens.
- Permission-aware actions and stale-state handling.
- UI and API integration tests.

Exit criteria: no hardcoded business roles/departments remain in authorization-related frontend logic.

### Phase 5: Audit and reliability hardening
Deliverables:
- Audit events for critical changes.
- Storage/database failure handling.
- Upload hardening and private downloads.
- Transactional asset transfer history.
- Consistent date/warranty behavior.

Exit criteria: critical mutations and file workflows have tested failure behavior and useful auditability.

### Phase 6: Production readiness and release
Deliverables:
- Dependency audit and remediations.
- Shared rate limiting decision and implementation if needed.
- Environment validation, logging, health checks, Docker/deployment review.
- Migration, rollback, backup/restore, and release checklist.
- Final regression report.

Exit criteria: deployment risks are documented, tests/builds have real recorded outcomes, and release steps are reproducible.

## 14. Definition of done

- [ ] Organizations, departments, memberships, roles, and assignments are database-driven.
- [ ] Users may belong to multiple organizations with different grants per organization.
- [ ] Runtime authorization does not depend on hardcoded business role names.
- [ ] Stable application permission keys are validated against a catalog.
- [ ] Every protected route and resource is authorized server-side.
- [ ] Database queries are tenant-scoped and relationship integrity is enforced.
- [ ] Grant changes and revocation take effect within the documented freshness bound.
- [ ] Role/membership management prevents self-escalation and administrator lockout.
- [ ] Existing PostgreSQL data and API compatibility are handled deliberately.
- [ ] Critical operations produce protected audit events.
- [ ] Uploads/downloads and DB/storage partial failures are handled safely.
- [ ] Automated tests cover authorization, tenant isolation, migration, and regression paths.
- [ ] Lint/build/test/audit results are reported truthfully.
- [ ] Setup, migration, deployment, rollback limitations, and operational procedures are documented.

## 15. Codex execution protocol

Codex should work in a dedicated feature branch and commit coherent changes. Do not ask it to implement all phases in one unreviewed pass. Use one prompt per phase, review the diff and test results, then proceed.

For every phase:
1. Read this plan and inspect the current repository state.
2. Identify exact files and current behavior before editing.
3. Implement only the phase scope and necessary dependencies.
4. Add/update tests alongside the implementation.
5. Run relevant tests and record actual output.
6. Review the diff for security, data loss, and unrelated changes.
7. Update this document's status/checklist with completed work and unresolved decisions.
8. Do not push/deploy production changes or run destructive production migrations without explicit approval.

### Prompt 0: Audit and detailed implementation design

```text
Read docs/DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md completely. Do not implement the feature yet. Inspect the current repository, schema, migrations, authentication, routes, controllers, repositories, frontend, storage utilities, tests, package scripts, and Docker configuration. Produce a verified audit: current architecture, every hardcoded role/department assumption, endpoint inventory, existing security controls, migration risks, and test commands. Propose the exact target schema and permission/scope semantics consistent with the plan. Identify decisions that truly block implementation; otherwise choose safe defaults and document them. Update the plan with repository-specific file paths and a sequenced task checklist. Do not claim commands were run unless you ran them. Do not change application behavior in this phase.
```

### Prompt 1: Schema, migrations, and tenant foundation

```text
Implement Phase 1 from docs/DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md only. Inspect current migration history and PostgreSQL schema first. Add versioned additive migrations for organizations, memberships, dynamic departments, roles, permission catalog/grants, and scoped role assignments, adapting names to the current conventions. Add organization ownership and constraints to existing asset-related tables. Provide a safe backfill for existing PostgreSQL data, validate orphaned and ambiguous records, and do not edit already-applied migrations or delete data. Add indexes, uniqueness constraints, same-organization integrity constraints where feasible, and migration tests. Do not yet refactor all authorization routes or build the UI. Run applicable migration/integration tests against a dedicated test database and report exact results. Update the plan with decisions, files, and remaining risks.
```

### Prompt 2: Central authorization engine

```text
Implement Phase 2 from docs/DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md. Inspect existing authentication and role checks. Create a centralized, testable authorization service that resolves stable permission keys from database-backed role grants and evaluates organization membership, active status, resource organization, and explicit scope. Enforce deny-by-default and fail-closed behavior. Do not rely on JWT role claims or hardcoded business role names for authorization. Ensure grant revocation is prompt and document any cache/freshness strategy. Add unit tests for organization, department, assigned/self scope, multiple grants, inactive assignments, unknown permissions, missing context, and revocation. Keep changes focused on the authorization foundation and do not claim routes are protected until migrated. Run tests and update the plan.
```

### Prompt 3: API migration and server-side enforcement

```text
Implement Phase 3 from docs/DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md. Inventory every protected API route and migrate it to the centralized authorization service. Ensure every list query and resource operation is scoped to a verified active organization and checks object-level permissions. Cover asset CRUD, assignment/transfer, QR and file operations, exports, departments, memberships, roles, permission grants, and audit reads as applicable to existing routes. Validate all referenced IDs and prevent mass assignment, IDOR, cross-tenant access, and self-escalation. Implement management APIs using existing API conventions and preserve compatibility where possible. Add PostgreSQL-backed integration tests for cross-organization access, department scope, revoked roles, unauthorized management, and existing workflows. Do not rely on frontend visibility for security. Run tests and update the plan with any endpoint not yet migrated.
```

### Prompt 4: Frontend organization and access management

```text
Implement Phase 4 from docs/DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md. Inspect the existing React routing, API client, auth state, components, and styling. Add organization selection/switching, dynamic department management, role/permission editing, membership and role assignment workflows, and effective-permission-aware action visibility using the new APIs. Do not hardcode business roles or department names. Reset organization-scoped state when switching organizations and handle stale permissions, 401/403, loading, empty, validation, and error states accessibly. Treat backend authorization as authoritative. Add appropriate frontend tests, run lint/build/tests available in the repo, and update the plan with results.
```

### Prompt 5: Audit, file storage, and asset lifecycle reliability

```text
Implement Phase 5 from docs/DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md. Review existing Firebase/Cloudinary integrations and asset assignment/file workflows before editing. Add protected audit events for role, permission, membership, department, organization, and critical asset changes. Harden uploads against oversized/disallowed/malformed files and untrusted MIME types; ensure invoice downloads are private and authorized. Make storage/database partial failures recoverable using compensating actions or a durable cleanup/outbox mechanism only where needed. Make assignment/transfer transactional and preserve history. Standardize warranty/date logic. Add failure-path tests and avoid logging secrets or sensitive file content. Run relevant tests and update the plan with limitations.
```

### Prompt 6: Production readiness and final verification

```text
Implement Phase 6 from docs/DYNAMIC_RBAC_AND_PLATFORM_IMPROVEMENTS_PLAN.md. Re-run package-manager dependency audits on current lockfiles and report actual findings; remediate critical/high risks carefully without blind force upgrades. Review login rate limiting for multi-instance behavior, authentication/session revocation, environment validation, secrets, CORS/security headers, structured logs, health checks, Docker settings, and deployment documentation. Add shared rate limiting infrastructure only if appropriate to the actual deployment and document configuration. Run the full relevant test suite, lint, type checks, build, migration tests, and dependency audit that the repository supports. Inspect the final diff for data loss, bypasses, and unrelated changes. Update the plan's checklist with completed items, commands and actual outcomes, unresolved risks, and a safe release/rollback procedure. Do not deploy or run destructive production commands.
```

## 16. Release checklist

Before production rollout:
- [ ] Review and approve the schema and permission/scope semantics.
- [ ] Take and verify a database backup.
- [ ] Test migrations and backfill on a production-like copy.
- [ ] Validate counts, membership mapping, asset ownership, and tenant integrity.
- [ ] Confirm bootstrap/owner recovery procedure.
- [ ] Confirm every protected endpoint has authorization tests.
- [ ] Confirm invoice and asset file access is private and scoped.
- [ ] Confirm role revocation freshness and audit visibility.
- [ ] Run tests/build/audit and archive the results.
- [ ] Deploy migrations and application changes using a documented order.
- [ ] Monitor authorization denials, API errors, storage failures, and migration health.
- [ ] Document recovery steps and rollback limitations.

---

**Implementation rule:** Security boundaries and data integrity take priority over convenience and UI polish. If an implementation choice could widen access, expose another tenant's data, or risk existing data, stop and document the issue rather than guessing.
