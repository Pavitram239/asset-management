# AssetOS frontend

React 18, Vite, React Router, Axios and Styled Components.

See the [project README](../README.md) for PostgreSQL configuration, Docker instructions and the application API.

Install both npm workspaces once with `npm ci` from the repository root. Start the frontend with `npm run client` from the root, or `npm run dev` from this directory. The development server runs on port 5173 and forwards `/api` to the Express backend on port 5100.

Use `npm run build` for the production frontend. Assignment forms submit UUID user references through `assignedToId`; asset responses continue to use `_id` as the identifier field.

Build the frontend container from the repository root with `docker build -f client/Dockerfile .` so it can use the shared workspace lockfile.
