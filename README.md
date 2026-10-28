# Asset Management / AssetOS

The agreed target product scope is in [PRD.md](PRD.md), with delivery stages in [IMPLEMENTATION.md](IMPLEMENTATION.md). These cover the planned first release; the setup and behavior documented below describe the current implementation.

The proposed navigation, user journeys and screen layouts are in [UX-FLOWS.md](UX-FLOWS.md).

The [technical blueprint](docs/TECHNICAL-BLUEPRINT.md) connects the target database, workflows, permissions and [implementation backlog](docs/IMPLEMENTATION-BACKLOG.md). [docs/openapi.json](docs/openapi.json) describes existing endpoints; [docs/openapi-planned.json](docs/openapi-planned.json) is a design-only delta, not a running API.

A full-stack application for tracking equipment, ownership, departments and warranties. The frontend uses React 18 and Vite; the backend uses Express and PostgreSQL through the `pg` driver.

The workspace includes an asset register, overview, asset details, QR downloads, profile editing and role-based access. Private asset images and invoices use Firebase Storage through its server SDK; profile avatars use Cloudinary.

The first implementation slices add protected ownership/settings, encrypted account mail, verification/recovery/session revocation, and verified self-service workspace creation with employee invitations. [Company](docs/COMPANY-FOUNDATION-VERIFICATION.md), [identity/delivery](docs/IDENTITY-DELIVERY-VERIFICATION.md) and [workspace onboarding](docs/WORKSPACE-ONBOARDING-VERIFICATION.md) verification record actual checks. Inventory setup now adds location trees with reviewed access changes, versioned category fields and immutable quantity units; see [configuration evidence](docs/INVENTORY-CONFIGURATION-VERIFICATION.md). Catalog/opening stock now supports all three tracking modes, acquisition lots and typed private-file access; see [catalog verification](docs/CATALOG-INVENTORY-VERIFICATION.md). Mail uses local capture only; live private storage is unverified. Legacy cutover, custody and purchasing remain planned.

## PostgreSQL migration

This version replaces MongoDB and Mongoose with PostgreSQL. It starts with an empty database; it does not import MongoDB records or preserve old ObjectIds, sessions or QR codes.

- Users and assets have UUID primary keys.
- Departments are stored in a separate table with foreign-key references.
- Assignments reference user IDs, so renaming an employee updates the displayed owner.
- Email addresses are normalized to lowercase and unique at the database level.
- Database constraints enforce required values, role/status values and references.
- Parameterized queries handle searching, filtering, pagination and overview counts.
- Optional asset specifications are stored in a JSONB attributes column.
- Versioned migrations run transactionally and automatically during server startup.
- Signup grants no memberships or permissions. Verified users can create and own a new isolated workspace; employees join through reviewed invitations. Legacy operator bootstrap remains available for an explicitly reviewed empty installation.

The API retains `/api/v1/products` and the response field `_id` for frontend compatibility. IDs now contain UUIDs. Assignment requests use `assignedToId`; responses include both that ID and the displayed `assignedTo` name.

The [PRD](PRD.md) governs intended first-release scope; [ENTERPRISE-ROADMAP.md](ENTERPRISE-ROADMAP.md) is older planning context. Current setup instructions below do not imply that the planned workflows are implemented.

## Run with Docker Desktop

From PowerShell in the project directory:

```powershell
if (!(Test-Path server/.env)) { Copy-Item server/sample.env server/.env }
```

Edit `server/.env` and set `JWT_SECRET` to a long, random value. Configure Firebase and Cloudinary if you want to upload files.

```powershell
docker compose --env-file server/.env up --build -d
```

Open [http://localhost:5173](http://localhost:5173) and register an account. New accounts have no access. For a **new, empty installation only**, provision its first owner from a trusted operator terminal:

```powershell
docker compose exec server npm run bootstrap:owner -- existing-owner-email "Your organization"
```

Use the registered email in place of `existing-owner-email`. This command refuses to run once an organization exists. Existing installations migrate their current administrator access instead. Select your organization in the header, then open **Access management** to configure departments, memberships, roles, and direct permissions.

Account mail now requires the [delivery configuration](docs/DELIVERY-OPERATIONS.md). The Docker server's production environment cannot use the local capture adapter: new registration/recovery and profile email changes return 503 until a live provider is implemented/configured. Existing password login and organization access remain available. Do not treat the commands above as proof that hosted verification mail is ready.

Migration 003 preserves existing access and leaves existing company ownership awaiting an explicit operator review. After reviewing the intended active member, a trusted operator can run `npm run ownership:review --workspace=server -- company-uuid registered-email`. It records protected ownership without marking the email verified. New empty-installation bootstrap records that explicit ownership review automatically. See [operations](docs/RBAC-OPERATIONS.md) before upgrading; the application database was not migrated during development of this slice.

See [RBAC implementation and migration](docs/RBAC-IMPLEMENTATION.md), [deployment and storage procedure](docs/RBAC-OPERATIONS.md), [API contract](docs/openapi.json), and [verification report](docs/RBAC-VERIFICATION.md).

The stack runs:

| Service | Purpose | Local access |
| --- | --- | --- |
| postgres | PostgreSQL 17 with a persistent volume | localhost:5433 |
| server | Express API; applies migrations at startup | Internal port 5100 |
| client | Nginx serving React and forwarding API requests | localhost:5173 |

The database port is bound only to the local computer. Compose connects the API using `PGHOST=postgres` and internal port 5432. It overrides `DATABASE_URL` inside the server container so a native-development connection string cannot point it at the wrong database.

The default database password in `server/sample.env` is for local development. If you change it before the first startup, update the native `DATABASE_URL` too. Changing `POSTGRES_PASSWORD` after a database volume exists does not change the stored database password.

Compose uses HTTP locally and sets `COOKIE_SECURE=false`. Hosted HTTPS deployments must set `COOKIE_SECURE=true`.

```powershell
docker compose ps
docker compose logs -f server client postgres
docker compose down
```

Stopping the stack preserves database data. Adding `-v` to `docker compose down` permanently removes this stack's database volume.

If an older MongoDB container is left over from a previous version, use `docker compose --env-file server/.env up --build -d --remove-orphans`. Existing MongoDB volumes are not imported or deleted by this migration.

## Native development

Requirements: Node.js 22.12+, npm, and PostgreSQL (or the Compose database).

```powershell
npm ci
docker compose --env-file server/.env up -d postgres
npm run db:migrate
npm run dev
```

Set `DATABASE_URL` in `server/.env` to your PostgreSQL connection string. The sample uses `localhost:5433`, the exposed Compose database port. The frontend runs on port 5173 and the API on port 5100. For local HTTP, use `NODE_ENV=development` or explicitly set `COOKIE_SECURE=false`.

For account verification/recovery in local development, set MAIL_ADAPTER=capture, a separately generated OUTBOX_ENCRYPTION_KEY and APP_PUBLIC_URL. Run `npm run worker --workspace=server -- run` in another terminal after migrations. Captured messages are encrypted database fixtures, with no public inbox; [operations](docs/DELIVERY-OPERATIONS.md) describes inspection, expiry, retry limits and the remaining live-mail dependency.

## Environment variables

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | PostgreSQL URL for native or hosted execution |
| POSTGRES_PASSWORD | Compose database password |
| POSTGRES_PORT | Host database port; default 5433 |
| JWT_SECRET | Required signing secret |
| JWT_EXPIRES_IN | Token lifetime; default in Compose is 1d |
| COOKIE_SECURE | Set true for hosted HTTPS; false for local HTTP |
| PORT | API port; default 5100 |
| NODE_ENV | development or production |
| FIREBASE_STORAGE_BUCKET / GOOGLE_APPLICATION_CREDENTIALS | Private Firebase bucket and server credential file (or workload identity) |
| TRUST_PROXY_HOPS | 0 for direct access, 1 only behind the trusted proxy |
| CLOUD_NAME / CLOUD_API_KEY / CLOUD_SECRET | Cloudinary avatar configuration |
| MAIL_ADAPTER | capture for local development/test only; no live email adapter yet |
| OUTBOX_ENCRYPTION_KEY | Separate random 32-byte base64 key shared by API and worker; keep outside Git |
| APP_PUBLIC_URL | Application origin for one-use mail links; loopback HTTP or HTTPS, no path/query |

For a hosted database, use the provider's TLS connection settings and trusted certificates. Keep `.env` files and real secrets out of source control. `server/Dockerfile` builds only the API; `client/Dockerfile` builds React and serves it with Nginx. The API expects a reachable PostgreSQL database and applies migrations at startup. A hosted frontend must forward `/api` requests to the API.

Uploaded files are limited to 5 MB each. Images accept JPEG, PNG or WebP; invoices also accept PDF. Configure private bucket access and server credentials; revoke legacy public download tokens before production rollout. Run the durable cleanup job periodically; see docs/RBAC-OPERATIONS.md.

## Database migrations and inspection

```powershell
npm run db:migrate
docker compose exec postgres psql -U asset_user -d asset_management
```

Inside psql:

```sql
\dt
SELECT name, company, department_code FROM products;
SELECT name, email, role FROM users;
```

Migration files are under `server/db/migrations/`. Add a new numbered migration for schema changes; do not edit an applied migration. Checksums prevent silently changing migration history.

## Tests

```powershell
npm test
npm run build
```

The PostgreSQL integration suite uses a dedicated database whose name ends in `_test`. It creates a unique schema, exercises migrations and real HTTP workflows, and removes only its own schema afterward.

```powershell
$env:TEST_DATABASE_URL='postgresql://user:password@localhost:5432/asset_management_test'
npm run test:integration
```

Without `TEST_DATABASE_URL`, the integration suite is skipped by `npm test`. It does not connect to or clear the application database.

## API

Base path: `/api/v1`.

- Authentication: `POST /auth/register`, `POST /auth/login`, `GET /auth/logout`; verification/recovery at `POST /auth/verification-requests`, `/auth/email-verifications`, `/auth/recovery-requests` and `/auth/password-resets`.
- Assets: `GET/POST /products`, `GET/PATCH/DELETE /products/:id`, `GET /products/overview`.
- Users: `GET /users/current-user`, `PATCH /users/update-user`.
- Admin/head lookups: `GET /users/users-list`, `GET /users/departments`, `GET /users/admin/app-stats`.
- Database health: `GET /health`.

Protected organization operations require `X-Organization-Id` and an active membership. Users receive no permissions by default. Organization-defined roles and direct permissions combine additively, with organization, department, or assigned-asset scope. Revocation is checked against PostgreSQL on every request. The legacy role and department columns are retained for migration compatibility and never authorize access.

The **Access management** screen manages organizations, departments, memberships, custom roles, scoped assignments, direct permissions, effective access, and audit events. Its APIs live under `/api/v1/access`; see `docs/openapi.json`. Asset assignment history is available at `GET /products/:id/history`. File downloads use authorized `/products/:id/files/:category` endpoints instead of persistent cloud URLs.

## Project structure

```text
root/
├── client/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── Dockerfile
├── server/
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middlewares/
│   │   ├── repositories/
│   │   ├── utils/
│   │   ├── errors/
│   │   ├── config/
│   │   ├── app.js
│   │   └── server.js
│   ├── db/
│   │   └── migrations/
│   ├── tests/
│   ├── scripts/
│   ├── sample.env
│   ├── package.json
│   └── Dockerfile
├── package.json
├── package-lock.json
├── docker-compose.yml
└── README.md
```

The root package uses npm workspaces and a single lockfile. Install once with `npm ci`; do not create separate client or server lockfiles.

| Root command | Action |
| --- | --- |
| npm run dev | Start frontend and backend together |
| npm run client | Start Vite only |
| npm run server | Start the API with automatic reload |
| npm start | Start the API without reload |
| npm run build | Build the frontend |
| npm test | Run server tests |
| npm run db:migrate | Apply PostgreSQL migrations |
| npm run test:integration | Run PostgreSQL-backed workflow tests |

Server configuration loads `server/.env` independently of the current working directory. An existing root `.env` remains a fallback. Docker reads both files, with `server/.env` taking precedence for backend secrets. Use `--env-file server/.env` for Compose commands when configuring database passwords or host ports there, so Compose interpolation uses the same settings. Root `.env` remains supported for shared Compose settings.

The API serves JSON only. In development Vite proxies API requests; in Docker Nginx serves the frontend and proxies `/api`. Previously committed public build files and the sample upload are preserved under `client/legacy-public/`, excluded from Docker builds and not served.

This remains an evolving project. Current private-file cleanup and audit foundations are reused by the [planned delivery slices](docs/IMPLEMENTATION-BACKLOG.md); full purchasing, custody, maintenance, messaging and production-readiness evidence remain implementation work. SSO and broader identity-provider integration are outside the accepted first release.

## Inventory ledger foundation (B06)

Migration 009 now provides internal catalog/lot/unit persistence, typed opening/adjustment posting sources, balanced immutable journals/entries, locked exact balance projections and a transactional domain-event outbox. The shared command boundary passes its durable command record to posting handlers. [Ledger verification](docs/INVENTORY-LEDGER-VERIFICATION.md) records 72 passing dedicated integration checks and current boundaries. B07 now provides the public catalog/opening-stock extension; legacy cutover remains B08, and the accepted business modules remain in scope. No generic public stock-writing endpoint, application-database migration, deployment or delivered business email is claimed.
