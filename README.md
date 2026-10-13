# Asset Management / AssetOS

A full-stack application for tracking equipment, ownership, departments and warranties. The frontend uses React 18 and Vite; the backend uses Express and PostgreSQL through the `pg` driver.

The workspace includes an asset register, overview, asset details, QR downloads, profile editing and role-based access. Asset images and invoices use Firebase Storage; profile avatars use Cloudinary.

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
- Concurrent initial registrations create exactly one administrator.

The API retains `/api/v1/products` and the response field `_id` for frontend compatibility. IDs now contain UUIDs. Assignment requests use `assignedToId`; responses include both that ID and the displayed `assignedTo` name.

See [ENTERPRISE-ROADMAP.md](ENTERPRISE-ROADMAP.md) for the next asset lifecycle and production readiness work.

## Run with Docker Desktop

From PowerShell in the project directory:

```powershell
if (!(Test-Path server/.env)) { Copy-Item server/sample.env server/.env }
```

Edit `server/.env` and set `JWT_SECRET` to a long, random value. Configure Firebase and Cloudinary if you want to upload files.

```powershell
docker compose --env-file server/.env up --build -d
```

Open [http://localhost:5173](http://localhost:5173). Register your first account; it becomes the administrator.

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

Requirements: Node.js 20+, npm, and PostgreSQL (or the Compose database).

```powershell
npm ci
docker compose --env-file server/.env up -d postgres
npm run db:migrate
npm run dev
```

Set `DATABASE_URL` in `server/.env` to your PostgreSQL connection string. The sample uses `localhost:5433`, the exposed Compose database port. The frontend runs on port 5173 and the API on port 5100. For local HTTP, use `NODE_ENV=development` or explicitly set `COOKIE_SECURE=false`.

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
| FIREBASE_* | Firebase configuration for asset file storage |
| CLOUD_NAME / CLOUD_API_KEY / CLOUD_SECRET | Cloudinary avatar configuration |

For a hosted database, use the provider's TLS connection settings and trusted certificates. Keep `.env` files and real secrets out of source control. `server/Dockerfile` builds only the API; `client/Dockerfile` builds React and serves it with Nginx. The API expects a reachable PostgreSQL database and applies migrations at startup. A hosted frontend must forward `/api` requests to the API.

Uploaded files are limited to 5 MB each. Images accept JPEG, PNG or WebP; invoices also accept PDF. Configure appropriate Firebase Storage permissions.

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

- Authentication: `POST /auth/register`, `POST /auth/login`, `GET /auth/logout`.
- Assets: `GET/POST /products`, `GET/PATCH/DELETE /products/:id`, `GET /products/overview`.
- Users: `GET /users/current-user`, `PATCH /users/update-user`.
- Admin/head lookups: `GET /users/users-list`, `GET /users/departments`, `GET /users/admin/app-stats`.
- Database health: `GET /health`.

Users can read assets within their department. Heads can modify assets within their department; admins can access all departments. Public registration assigns the user role after the initial administrator; role changes are not available through profile updates.

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

This remains an evolving project. File-storage failure recovery, audit history, approvals, maintenance workflows, identity-provider integration and production operations are tracked in the roadmap.
