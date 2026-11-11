# Database-per-Client Tenant Migration & Operational Guide

This document details the migration path, operational procedures, backup strategy, and rollback instructions for transitioning from the legacy shared-database / schema-per-tenant model to the **Database-per-Client SaaS Architecture**.

---

## 1. Architecture Overview

### Central Platform Database (`asset_management`)
- **Login accounts** (`users` table): Stores authentication credentials (email, hashed password, verification status, `is_super_admin`, session versions).
- **Client Registry & Routing** (`organizations` table): Stores client organization metadata, dedicated `database_name`, host/port overrides, lifecycle status (`active`, `suspended`, `provisioning`, `failed`), and provisioning logs.
- **Client Memberships** (`memberships` table): Determines authorized user memberships for each client organization.
- **Platform Auditing** (`platform_audit_events` table): Audits super-admin provisioning, suspension, and reactivation actions.
- **Identity & Outbox** (`account_tokens`, `delivery_outbox`, `organization_invitations`): Handles password resets, verification, and expiring setup invites.

### Dedicated Client Databases (`client_asset_<slug>_<id>`)
- Every client organization operates in its own separate PostgreSQL database.
- Database schemas are managed via versioned client migrations tracked in `client_schema_migrations` (`server/db/clientMigrations/`):
  - `001_client_initial.sql`: Canonical initial client migration containing all 29 client tables.
- All client business tables live in the standard `public` schema within that database:
  - `products`, `asset_assignment_history`
  - `locations`, `location_ancestry`, `location_move_previews`
  - `category_definitions`, `category_revisions`, `unit_definitions`
  - `catalog_items`, `catalog_item_history`, `inventory_lots`, `inventory_accounts`, `inventory_journals`, `inventory_entries`, `inventory_balances`
  - `roles`, `role_permissions`, `user_roles`, `user_permissions`, `organization_departments`
  - `attachments`, `attachment_links`
  - `asset_requisitions`, `requisition_items`
  - `audit_events`, `api_commands`

### Initial Client Administrator Setup Flow
- When a client organization is created, an expiring, single-use setup link is generated and placed into `outbox_events` (`client.admin_setup`).
- Setup tokens are hashed with SHA-256 before storage in `client_setup_tokens`; tokens are never returned in API responses or logs.
- New administrators receive an email with the link `https://<host>/setup-admin#<token>`.
- The setup page verifies the token (`GET /auth/setup-admin/verify`), verifies ownership of the email upon completion, and allows the admin to set their password (`POST /auth/setup-admin`).
- For existing users, their existing password is authenticated before granting access, preserving their password and existing company memberships.

### Connection Pool Management & Security Boundaries
- Client connection pools are managed via an LRU cache bounded by `MAX_CACHED_POOLS = 50`.
- Client lifecycle status (`active`, `suspended`, `provisioning`, `failed`) is validated on every pool acquisition—cached pools cannot bypass suspension.
- Suspended clients reject all business operations with `403 Forbidden` and block retry attempts.
- Privileged provisioning credentials (`PROVISIONING_DATABASE_URL`) are isolated from runtime queries.

---

## 2. Platform Administration & Super Admin Operations

### Bootstrapping Platform Super Admin
To promote an existing user or create a new Platform Super Admin account:
```bash
# Promoting an existing user by email:
npm run bootstrap:superadmin --workspace=server -- admin@platform.com

# Creating a new super-admin with a custom password:
npm run bootstrap:superadmin --workspace=server -- admin@platform.com "Super Admin" "SecurePassword123!"
```

### Privileged Provisioning vs. Application Credentials
- **Application Pool (`DATABASE_URL`)**: Connects to the central platform database and uses ordinary permissions to query tenant databases.
- **Privileged DDL Connection (`PROVISIONING_DATABASE_URL`)**: Used solely by `provisionClientDatabase` to execute `CREATE DATABASE` and `DROP DATABASE`. If not set, it defaults to the `postgres` administrative database on the same host. Database credentials are never logged or exposed in frontend API responses.

---

## 3. Migration Procedure

### Step 1: Pre-Migration Full Backup
Before performing any data operations, perform a complete PostgreSQL dump:
```bash
pg_dump -U asset_user -h localhost -p 5432 -d asset_management -F c -b -v -f backup_pre_tenant_migration.dump
```

### Step 2: Dry-Run Assessment
Run the migration script in dry-run mode to inspect existing organizations, schemas, and record counts:
```bash
npm run tenant:migrate --workspace=server
```
This reads existing data and outputs an exact inventory without altering any databases or tables.

### Step 3: Rehearsal with Synthetic or Test Client
Execute a rehearsal on test organizations to verify DDL application, data copying, and count parity:
```bash
npm run tenant:migrate --workspace=server -- --rehearsal
```

### Step 4: Live Cutover (Requires Explicit Approval)
> [!IMPORTANT]
> Live cutover creates dedicated databases, copies data, verifies record counts, and updates client routing. Original tables and schemas in the platform database are strictly preserved.
```bash
npm run tenant:migrate --workspace=server -- --live
```

---

## 4. Verification Checklist
- [x] Client database creation and schema initialization succeed.
- [x] Record counts match 1:1 between original schema and client database.
- [x] Users with memberships in Client A can access Client A data but are blocked from Client B.
- [x] Suspending Client A blocks subsequent requests with 403 Forbidden.
- [x] Switching between authorized clients cleanly purges client-side cached state.
- [x] Platform Super Admin view lists clients, status, and retry controls without exposing client business records.

---

## 5. Rollback Instructions
If a rollback is required:
1. Since original tables and schemas are never deleted, simply point `database_name` back to the central database in the platform database:
```sql
UPDATE organizations SET database_name = 'asset_management';
```
2. Restart the application or run:
```bash
node -e "import('./server/db/clientPoolManager.js').then(m => m.closeAllClientPools())"
```
3. To restore from the pre-migration backup if needed:
```bash
pg_restore -U asset_user -h localhost -p 5432 -d asset_management -c -v backup_pre_tenant_migration.dump
```

