-- clientSchema.sql
-- Complete DDL for a dedicated client database.
-- Tables reside in standard public schema of the client's PostgreSQL database.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Local Tenant User Directory (Names & Emails only; credentials stay in central platform DB)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Departments
CREATE TABLE IF NOT EXISTS organization_departments (
  code text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Roles & Permissions
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id text NOT NULL,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  scope text NOT NULL,
  department_code text,
  location_id uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_permissions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  permission_id text NOT NULL,
  scope text NOT NULL,
  department_code text,
  location_id uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit ledger
CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  target text,
  outcome text NOT NULL DEFAULT 'success',
  metadata jsonb NOT NULL DEFAULT '{}',
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Locations & Hierarchy
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL,
  parent_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_ancestry (
  ancestor_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  descendant_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  depth integer NOT NULL,
  organization_id uuid,
  PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE TABLE IF NOT EXISTS location_move_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  new_parent_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  affected_grant_ids jsonb NOT NULL DEFAULT '[]',
  affected_scopes jsonb NOT NULL DEFAULT '[]',
  version bigint NOT NULL DEFAULT 1,
  organization_id uuid
);

-- Categories & Revisions
CREATE TABLE IF NOT EXISTS category_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS category_revisions (
  category_id uuid NOT NULL REFERENCES category_definitions(id) ON DELETE CASCADE,
  version bigint NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, version)
);

-- Quantity Units of Measure
CREATE TABLE IF NOT EXISTS unit_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  quantity_scale integer NOT NULL DEFAULT 0,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Products & Individual Asset Units
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  category text,
  price numeric(12,2),
  status text,
  assigned_to_id uuid,
  department_code text,
  location_id uuid REFERENCES locations(id),
  catalog_item_id uuid,
  lot_id uuid,
  asset_tag text,
  serial_number text,
  warranty_date date,
  warranty_status text,
  purchase_date date,
  product_img text,
  invoice text,
  qr text,
  attributes jsonb DEFAULT '{}',
  creator_id uuid,
  created_by text,
  deleted_at timestamptz,
  organization_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_assignment_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  previous_department text,
  department text NOT NULL,
  previous_user_id uuid,
  user_id uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Catalog & Stock Ledger
CREATE TABLE IF NOT EXISTS catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES category_definitions(id),
  unit_id uuid REFERENCES unit_definitions(id),
  tracking_mode text,
  status text NOT NULL DEFAULT 'active',
  version bigint NOT NULL DEFAULT 1,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_item_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  version bigint NOT NULL,
  fields jsonb NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES catalog_items(id),
  unit_cost numeric(14,4) NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_lot_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lot_id uuid NOT NULL REFERENCES inventory_lots(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  unit_cost numeric(14,4) NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES catalog_items(id),
  location_id uuid REFERENCES locations(id),
  lot_id uuid REFERENCES inventory_lots(id),
  unit_id uuid REFERENCES products(id),
  account_type text NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_transaction_id xid8 NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_journal_sources (
  journal_id uuid PRIMARY KEY REFERENCES inventory_journals(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  organization_id uuid
);

CREATE TABLE IF NOT EXISTS inventory_entries (
  journal_id uuid NOT NULL REFERENCES inventory_journals(id) ON DELETE CASCADE,
  entry_index integer NOT NULL,
  account_id uuid NOT NULL REFERENCES inventory_accounts(id),
  quantity numeric(18,6) NOT NULL,
  PRIMARY KEY (journal_id, entry_index)
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  account_id uuid PRIMARY KEY REFERENCES inventory_accounts(id),
  on_hand numeric(18,6) NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_journal_events (
  journal_id uuid PRIMARY KEY REFERENCES inventory_journals(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  organization_id uuid
);

-- API Commands & Idempotency
CREATE TABLE IF NOT EXISTS api_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  command_name text NOT NULL,
  actor_id uuid,
  result jsonb,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Attachments
CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  size_bytes bigint NOT NULL,
  mime_type text NOT NULL,
  storage_path text NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachment_links (
  attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attachment_id, target_type, target_id)
);

-- Asset Requisitions & Workflow
CREATE TABLE IF NOT EXISTS asset_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_number text UNIQUE NOT NULL,
  requester_id uuid NOT NULL,
  department_code text NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  priority text NOT NULL DEFAULT 'standard',
  reason text,
  rejection_reason text,
  approver_id uuid,
  approved_at timestamptz,
  fulfilled_at timestamptz,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requisition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES asset_requisitions(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES catalog_items(id),
  quantity integer NOT NULL DEFAULT 1,
  fulfilled_product_id uuid REFERENCES products(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create standard indexes for performance
CREATE INDEX IF NOT EXISTS products_org_dept_idx ON products(organization_id, department_code);
CREATE INDEX IF NOT EXISTS products_org_loc_idx ON products(organization_id, location_id);
CREATE INDEX IF NOT EXISTS products_org_status_idx ON products(organization_id, status);
CREATE INDEX IF NOT EXISTS catalog_items_org_idx ON catalog_items(organization_id);
CREATE INDEX IF NOT EXISTS inventory_accounts_catalog_idx ON inventory_accounts(catalog_item_id);
CREATE INDEX IF NOT EXISTS attachments_org_idx ON attachments(organization_id);
CREATE INDEX IF NOT EXISTS requisitions_org_status_idx ON asset_requisitions(organization_id, status);
