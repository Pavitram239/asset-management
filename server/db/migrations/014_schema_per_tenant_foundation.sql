-- 014_schema_per_tenant_foundation.sql
-- Introduce strict PostgreSQL schema-per-tenant architecture aligned with SeraEstateAI CRM.

-- 1. Add schema_name to public.organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS schema_name text;

-- 2. Populate schema_name for all existing organizations
UPDATE organizations
SET schema_name = 'tenant_' || REPLACE(LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '_', 'g')), '__', '_') || '_' || SUBSTRING(REPLACE(id::text, '-', ''), 1, 8)
WHERE schema_name IS NULL;

-- Flush deferred constraint triggers before altering table constraints
SET CONSTRAINTS company_owner_continuity IMMEDIATE;

ALTER TABLE organizations ALTER COLUMN schema_name SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_schema_name_idx ON organizations(schema_name);

-- 3. Procedure to provision tables inside a tenant schema
CREATE OR REPLACE PROCEDURE provision_tenant_schema(p_schema text, p_org_id uuid)
LANGUAGE plpgsql AS $$
BEGIN
  -- Create schema
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema);

  -- Departments
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.organization_departments (
      code text PRIMARY KEY,
      name text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_org_id);

  -- Roles & Permissions
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.roles (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.role_permissions (
      role_id uuid NOT NULL REFERENCES %I.roles(id) ON DELETE CASCADE,
      permission_id text NOT NULL,
      PRIMARY KEY (role_id, permission_id)
    )', p_schema, p_schema);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.user_roles (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id uuid NOT NULL,
      role_id uuid NOT NULL REFERENCES %I.roles(id) ON DELETE CASCADE,
      scope text NOT NULL,
      department_code text,
      location_id uuid,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.user_permissions (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id uuid NOT NULL,
      permission_id text NOT NULL,
      scope text NOT NULL,
      department_code text,
      location_id uuid,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_org_id);

  -- Audit ledger
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.audit_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor_id uuid,
      action text NOT NULL,
      target text,
      outcome text NOT NULL DEFAULT %L,
      metadata jsonb NOT NULL DEFAULT %L,
      organization_id uuid NOT NULL DEFAULT %L,
      created_at timestamptz NOT NULL DEFAULT now()
    )', p_schema, 'success', '{}', p_org_id);

  -- Locations & Hierarchy
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.locations (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      kind text NOT NULL,
      parent_id uuid REFERENCES %I.locations(id),
      active boolean NOT NULL DEFAULT true,
      version bigint NOT NULL DEFAULT 1,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.location_ancestry (
      ancestor_id uuid NOT NULL REFERENCES %I.locations(id) ON DELETE CASCADE,
      descendant_id uuid NOT NULL REFERENCES %I.locations(id) ON DELETE CASCADE,
      depth integer NOT NULL,
      organization_id uuid NOT NULL DEFAULT %L,
      PRIMARY KEY (ancestor_id, descendant_id)
    )', p_schema, p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.location_move_previews (
      id uuid PRIMARY KEY,
      location_id uuid NOT NULL REFERENCES %I.locations(id) ON DELETE CASCADE,
      new_parent_id uuid REFERENCES %I.locations(id) ON DELETE SET NULL,
      expires_at timestamptz NOT NULL,
      affected_grant_ids jsonb NOT NULL DEFAULT %L,
      affected_scopes jsonb NOT NULL DEFAULT %L,
      version bigint NOT NULL DEFAULT 1,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_schema, '[]', '[]', p_org_id);

  -- Categories & Revisions
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.category_definitions (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      version bigint NOT NULL DEFAULT 1,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.category_revisions (
      category_id uuid NOT NULL REFERENCES %I.category_definitions(id) ON DELETE CASCADE,
      version bigint NOT NULL,
      fields jsonb NOT NULL DEFAULT %L,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (category_id, version)
    )', p_schema, p_schema, '[]');

  -- Quantity Units of Measure
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.unit_definitions (
      id uuid PRIMARY KEY,
      code text UNIQUE NOT NULL,
      name text NOT NULL,
      quantity_scale integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_org_id);

  -- Products & Individual Asset Units
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.products (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      category text,
      price numeric(12,2),
      status text,
      assigned_to_id uuid,
      department_code text,
      location_id uuid REFERENCES %I.locations(id),
      catalog_item_id uuid,
      lot_id uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.asset_assignment_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      asset_id uuid NOT NULL REFERENCES %I.products(id) ON DELETE CASCADE,
      actor_id uuid NOT NULL,
      previous_department text,
      department text NOT NULL,
      previous_user_id uuid,
      user_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  -- Catalog & Stock Ledger
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.catalog_items (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      category_id uuid REFERENCES %I.category_definitions(id),
      unit_id uuid REFERENCES %I.unit_definitions(id),
      tracking_mode text,
      status text NOT NULL DEFAULT %L,
      version bigint NOT NULL DEFAULT 1,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_schema, 'active', p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.catalog_item_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      catalog_item_id uuid NOT NULL REFERENCES %I.catalog_items(id) ON DELETE CASCADE,
      actor_id uuid NOT NULL,
      version bigint NOT NULL,
      fields jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_lots (
      id uuid PRIMARY KEY,
      catalog_item_id uuid NOT NULL REFERENCES %I.catalog_items(id),
      unit_cost numeric(14,4) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_lot_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      lot_id uuid NOT NULL REFERENCES %I.inventory_lots(id) ON DELETE CASCADE,
      actor_id uuid NOT NULL,
      unit_cost numeric(14,4) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_accounts (
      id uuid PRIMARY KEY,
      catalog_item_id uuid NOT NULL REFERENCES %I.catalog_items(id),
      location_id uuid REFERENCES %I.locations(id),
      lot_id uuid REFERENCES %I.inventory_lots(id),
      unit_id uuid REFERENCES %I.products(id),
      account_type text NOT NULL,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_schema, p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_journals (
      id uuid PRIMARY KEY,
      posting_transaction_id xid8 NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_journal_sources (
      journal_id uuid PRIMARY KEY REFERENCES %I.inventory_journals(id) ON DELETE CASCADE,
      source_type text NOT NULL,
      source_id uuid NOT NULL,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_entries (
      journal_id uuid NOT NULL REFERENCES %I.inventory_journals(id) ON DELETE CASCADE,
      entry_index integer NOT NULL,
      account_id uuid NOT NULL REFERENCES %I.inventory_accounts(id),
      quantity numeric(18,6) NOT NULL,
      PRIMARY KEY (journal_id, entry_index)
    )', p_schema, p_schema, p_schema);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_balances (
      account_id uuid PRIMARY KEY REFERENCES %I.inventory_accounts(id),
      on_hand numeric(18,6) NOT NULL
    )', p_schema, p_schema);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_journal_events (
      journal_id uuid PRIMARY KEY REFERENCES %I.inventory_journals(id) ON DELETE CASCADE,
      event_type text NOT NULL,
      metadata jsonb NOT NULL DEFAULT %L,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, '{}', p_org_id);

  -- API Commands & Idempotency
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.api_commands (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key text NOT NULL,
      command_name text NOT NULL,
      actor_id uuid,
      result jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_org_id);

  -- Attachments
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.attachments (
      id uuid PRIMARY KEY,
      filename text NOT NULL,
      size_bytes bigint NOT NULL,
      mime_type text NOT NULL,
      storage_path text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.attachment_links (
      attachment_id uuid NOT NULL REFERENCES %I.attachments(id) ON DELETE CASCADE,
      target_type text NOT NULL,
      target_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L,
      PRIMARY KEY (attachment_id, target_type, target_id)
    )', p_schema, p_schema, p_org_id);

END $$;

-- 4. Automatically provision schema for all existing organizations and migrate existing data
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id, schema_name FROM organizations LOOP
    -- Provision the tables inside the tenant schema
    CALL provision_tenant_schema(org.schema_name, org.id);

    -- Copy existing organization departments
    EXECUTE format('
      INSERT INTO %I.organization_departments (code, name, active, organization_id)
      SELECT code, name, active, organization_id FROM public.organization_departments WHERE organization_id = %L
      ON CONFLICT (code) DO NOTHING
    ', org.schema_name, org.id);

    -- Copy existing roles
    EXECUTE format('
      INSERT INTO %I.roles (id, name, active, organization_id)
      SELECT id, name, active, organization_id FROM public.roles WHERE organization_id = %L
      ON CONFLICT (id) DO NOTHING
    ', org.schema_name, org.id);

    -- Copy existing role permissions
    EXECUTE format('
      INSERT INTO %I.role_permissions (role_id, permission_id)
      SELECT rp.role_id, rp.permission_id
      FROM public.role_permissions rp
      JOIN public.roles r ON r.id = rp.role_id
      WHERE r.organization_id = %L
      ON CONFLICT (role_id, permission_id) DO NOTHING
    ', org.schema_name, org.id);

    -- Copy existing user roles
    EXECUTE format('
      INSERT INTO %I.user_roles (user_id, role_id, scope, department_code, location_id, organization_id)
      SELECT user_id, role_id, scope, department_code, location_id, organization_id
      FROM public.user_roles WHERE organization_id = %L
    ', org.schema_name, org.id);

    -- Copy existing audit events
    EXECUTE format('
      INSERT INTO %I.audit_events (actor_id, action, target, outcome, metadata, organization_id, created_at)
      SELECT actor_id, action, target, outcome, metadata, organization_id, created_at
      FROM public.audit_events WHERE organization_id = %L
    ', org.schema_name, org.id);

  END LOOP;
END $$;
