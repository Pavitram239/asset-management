# Project instructions

## Read before changing code

Read README.md for setup, PRD.md for product scope, DESIGN.md for UI rules, ARCHITECTURE.md for boundaries, DATABASE.md for persistence and API.md plus docs/openapi.json for interfaces. IMPLEMENTATION.md defines the working process. Use docs/RBAC-IMPLEMENTATION.md and docs/RBAC-OPERATIONS.md for access and deployment details.

PRD.md defines the agreed target product scope. ARCHITECTURE.md and DATABASE.md distinguish existing foundations from the proposed technical target; docs/TECHNICAL-BLUEPRINT.md indexes workflow/permission rules and docs/IMPLEMENTATION-BACKLOG.md defines the planned slices. docs/openapi.json remains the current contract; docs/openapi-planned.json is a design-only delta. Promote/remove planned operations only with implementation and evidence. None of these documents proves that acceptance requirements pass. The PRD takes precedence over the older enterprise roadmap for intended first-release scope. If code and documentation disagree, inspect implementation and tests, report the discrepancy, and update the affected document with the change. Do not silently turn requirements into implemented claims or defer accepted first-release modules.

## Repository rules

- Preserve unrelated uncommitted work. Keep changes focused on the requested task.
- Use npm workspaces and the root package-lock.json; install from the root.
- Reuse existing components, CSS tokens, repositories and authorization helpers.
- Enforce authorization server-side. Resolve current grants, constrain tenant/object access and retain least-privilege signup.
- Target onboarding allows verified users to own a newly created workspace, never to gain access to existing companies through signup. Preserve the current access restrictions until that flow is explicitly implemented.
- Preserve compatibility for /products, _id UUIDs and assignment identifiers unless an explicit migration is in scope.
- Parameterize SQL; add new numbered migrations instead of editing applied files.
- Preserve transactional audit/history and file cleanup behavior.
- Never commit secrets, credentials, private uploads or real personal data. Use sample.env for configuration names.

## Delivery

Define acceptance criteria, implement a focused slice and update relevant docs/contract. Run checks appropriate to the change: npm test for backend behavior, npm run build for frontend changes, and npm run test:integration with a dedicated TEST_DATABASE_URL for database/HTTP workflows. UI work also needs browser review of relevant states and responsive behavior. Do not claim skipped integration/storage checks passed. Documentation-only changes require link/content checks rather than an application rebuild.

Report what changed, actual validation and remaining limitations. Do not deploy, publish or change external service access as an incidental part of local implementation.
