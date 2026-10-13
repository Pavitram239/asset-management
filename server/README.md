# AssetOS API

Express and PostgreSQL backend. Source is in `src/`, SQL migrations in `db/migrations/`, and tests in `tests/`.

Install both workspaces once with `npm ci` from the repository root. Create `server/.env` from `server/sample.env`, then configure `JWT_SECRET` and `DATABASE_URL`.

From the root, use `npm run server`, `npm test`, `npm run db:migrate`, or `npm run test:integration`. From this directory, use `npm run dev`, `npm start`, `npm test`, or `npm run db:migrate`.

The API does not serve frontend files. Vite or Nginx forwards `/api` requests to the API. Build the backend container from the repository root with `docker build -f server/Dockerfile .` so it can use the shared workspace lockfile.

See the [project README](../README.md) for Docker configuration, PostgreSQL workflows and deployment requirements.
