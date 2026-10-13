# Asset platform upgrade

## First release implemented

- Asset register table with filters, details, QR downloads, role-aware actions and deletion confirmation.
- Overview with department-scoped database counts, department distribution and recently updated assets.
- Indigo workspace theme, responsive layouts, restored navigation and loading feedback.
- Department boundaries on individual asset requests, including department heads.
- Current account permissions loaded from PostgreSQL for each authenticated request.
- Explicit allowed fields for registration, profile updates and asset writes.
- Asset date/status validation, bounded pagination and literal search matching.
- Upload size/type restrictions, unique temporary filenames outside the web root and cleanup.
- Correct invoice file selection and warranty values; profile and admin display fixes.
- Authentication throttling, safer cookie defaults, basic response headers and generic server errors.
- Regression tests for access policy, input validation, pagination and throttling.

## Next release: asset lifecycle

1. Persistent asset tags, categories, locations and employee references.
2. Checkout and return transactions, assignment history and transfer approvals.
3. Maintenance schedules, work orders, retirement and disposal records.
4. Audit events with actor, timestamp, changed fields and request identifier.
5. Asset detail page with a timeline and documents.

## Production readiness work

- Shared rate-limit store and explicitly trusted reverse proxies before horizontal scaling. Current throttling is per process and resets on restart.
- Identity provider integration, MFA, session revocation and configurable role permissions.
- File-content inspection and malware scanning. Current type checks use client-reported MIME types; Firebase asset storage and Cloudinary avatar storage remain separate integrations.
- Private document delivery, storage permissions, media transfer handling and database/storage failure recovery.
- Database-backed route/integration tests, end-to-end workflow tests and accessibility testing.
- Monitoring, dependency review, CI, staging, backup/restore drills and security review.
- The migration Docker build reported 33 inherited dependency vulnerabilities, including 5 critical. Review and upgrade these packages before production deployment; the database migration does not resolve them.
- Extend database indexes and migrations as lifecycle workflows grow. PostgreSQL migration now provides UUIDs, department/employee references, unique emails and atomic initial administrator setup.
- Configurable departments, bulk import/export, notifications and organization isolation if offered to multiple organizations.

The first release improves the existing application; it is not a claim of enterprise readiness. The app uses PostgreSQL and still needs configured storage services for upload workflow verification. Database-backed HTTP integration tests cover the migrated workflows.

## Verification

Run `npm ci` once from the root to install both npm workspaces. Run `npm test` for the server tests and `npm run build` for the frontend build. Backend source lives under `server/src`, migrations under `server/db`, and tests under `server/tests`.
