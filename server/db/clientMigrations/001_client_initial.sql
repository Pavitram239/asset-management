-- 001_client_initial.sql
-- Complete dedicated client database initial schema.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Local synchronized user roster (credentials and central state stay in platform database)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Organization Departments
CREATE TABLE IF NOT EXISTS organization_departments (
  code text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Roles & Permissions
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

-- 4. Audit ledger
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

-- 5. Locations & Hierarchy
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'room',
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

-- 6. Categories & Units
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
  effective_from timestamptz NOT NULL DEFAULT now(),
  organization_id uuid,
  PRIMARY KEY (category_id, version)
);

CREATE TABLE IF NOT EXISTS unit_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  quantity_scale integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Products (Physical Assets)
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
  category_id uuid REFERENCES category_definitions(id),
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
  damage_notes text,
  operational_status text DEFAULT 'available',
  version bigint DEFAULT 1,
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
  department text,
  previous_user_id uuid,
  user_id uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Catalog & Stock Ledger
CREATE TABLE IF NOT EXISTS catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES category_definitions(id),
  unit_id uuid REFERENCES unit_definitions(id),
  tracking_mode text NOT NULL DEFAULT 'untracked',
  attributes jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_item_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  item_id uuid,
  actor_id uuid,
  version bigint NOT NULL,
  name text,
  description text,
  category_id uuid,
  unit_id uuid,
  attributes jsonb,
  snapshot jsonb,
  active boolean,
  fields jsonb,
  organization_id uuid,
  changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  lot_number text,
  received_on date,
  purchased_on date,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  initial_quantity numeric(18,6) NOT NULL DEFAULT 0,
  remaining_quantity numeric(18,6) NOT NULL DEFAULT 0,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_lot_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lot_id uuid NOT NULL REFERENCES inventory_lots(id) ON DELETE CASCADE,
  actor_id uuid,
  action text,
  quantity numeric(18,6),
  unit_cost numeric(14,4),
  reason text,
  support_snapshot jsonb,
  version bigint,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text,
  kind text,
  catalog_item_id uuid REFERENCES catalog_items(id),
  location_id uuid REFERENCES locations(id),
  lot_id uuid REFERENCES inventory_lots(id),
  unit_id uuid REFERENCES products(id),
  account_type text,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_transaction_id xid8,
  event_type text,
  reference text,
  occurred_at timestamptz DEFAULT now(),
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_journal_sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_id uuid REFERENCES inventory_journals(id) ON DELETE CASCADE,
  source_type text,
  source_id uuid,
  organization_id uuid
);

CREATE TABLE IF NOT EXISTS inventory_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_id uuid REFERENCES inventory_journals(id) ON DELETE CASCADE,
  entry_index integer NOT NULL DEFAULT 0,
  account_id uuid REFERENCES inventory_accounts(id),
  catalog_item_id uuid REFERENCES catalog_items(id),
  location_id uuid REFERENCES locations(id),
  direction text,
  quantity numeric(18,6) NOT NULL,
  organization_id uuid
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid REFERENCES inventory_accounts(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES catalog_items(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id),
  quantity numeric(18,6) NOT NULL DEFAULT 0,
  on_hand numeric(18,6) DEFAULT 0,
  version bigint DEFAULT 1,
  organization_id uuid
);

CREATE TABLE IF NOT EXISTS inventory_journal_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_id uuid REFERENCES inventory_journals(id) ON DELETE CASCADE,
  event_type text,
  metadata jsonb NOT NULL DEFAULT '{}',
  organization_id uuid
);

-- 9. API Commands & Idempotency
CREATE TABLE IF NOT EXISTS api_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  organization_id uuid,
  operation_id text,
  command_name text,
  idempotency_key text NOT NULL,
  request_hash text,
  resource_type text,
  resource_id uuid,
  result jsonb,
  response jsonb,
  status text DEFAULT 'committed',
  expires_at timestamptz,
  committed_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Attachments & Links
CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  created_by uuid,
  command_id uuid,
  file_name text,
  filename text,
  media_type text,
  mime_type text,
  size_bytes bigint,
  content_hash text,
  storage_key text,
  storage_path text,
  state text DEFAULT 'staged',
  version bigint DEFAULT 1,
  expires_at timestamptz DEFAULT clock_timestamp() + interval '24 hours',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachment_links (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  item_id uuid,
  lot_id uuid,
  unit_id uuid,
  category text,
  entity_type text,
  entity_id uuid,
  target_type text,
  target_id uuid,
  contains_cost boolean DEFAULT false,
  created_by uuid,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. Asset Requisitions & Workflow
CREATE TABLE IF NOT EXISTS asset_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_number text UNIQUE NOT NULL,
  requester_id uuid NOT NULL,
  department_code text NOT NULL,
  target_asset_id uuid REFERENCES products(id),
  catalog_item_id uuid REFERENCES catalog_items(id),
  item_name text NOT NULL,
  quantity numeric(18,6) NOT NULL DEFAULT 1,
  purpose text NOT NULL,
  urgency text NOT NULL DEFAULT 'standard',
  needed_from timestamptz NOT NULL DEFAULT now(),
  needed_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval',
  approver_id uuid,
  approved_at timestamptz,
  approval_remarks text,
  rejection_reason text,
  issued_asset_id uuid REFERENCES products(id),
  issued_by_id uuid,
  issued_at timestamptz,
  returned_at timestamptz,
  return_condition text,
  return_notes text,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requisition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES asset_requisitions(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES catalog_items(id),
  quantity integer NOT NULL DEFAULT 1,
  fulfilled_product_id uuid REFERENCES products(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Indexes for performance
CREATE INDEX IF NOT EXISTS products_org_dept_idx ON products(organization_id, department_code);
CREATE INDEX IF NOT EXISTS products_org_loc_idx ON products(organization_id, location_id);
CREATE INDEX IF NOT EXISTS products_org_status_idx ON products(organization_id, status);
CREATE INDEX IF NOT EXISTS catalog_items_org_idx ON catalog_items(organization_id);
CREATE INDEX IF NOT EXISTS inventory_accounts_catalog_idx ON inventory_accounts(catalog_item_id);
CREATE INDEX IF NOT EXISTS attachments_org_idx ON attachments(organization_id);
CREATE INDEX IF NOT EXISTS requisitions_org_status_idx ON asset_requisitions(organization_id, status);
CREATE INDEX IF NOT EXISTS requisitions_requester_idx ON asset_requisitions(requester_id);

