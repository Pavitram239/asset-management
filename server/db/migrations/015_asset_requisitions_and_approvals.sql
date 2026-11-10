-- 015_asset_requisitions_and_approvals.sql
-- Introduce Asset Requisitions, Approvals, and Handover Fulfillment workflow.

-- 1. Insert new permissions into public.permissions
INSERT INTO permissions (id) VALUES
  ('requisition.create'),
  ('requisition.read'),
  ('requisition.approve'),
  ('requisition.fulfill')
ON CONFLICT (id) DO NOTHING;

-- 2. Update procedure provision_tenant_schema to include asset_requisitions in every tenant schema
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
      depth int NOT NULL,
      organization_id uuid NOT NULL DEFAULT %L,
      PRIMARY KEY (ancestor_id, descendant_id)
    )', p_schema, p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.location_move_previews (
      id uuid PRIMARY KEY,
      location_id uuid NOT NULL REFERENCES %I.locations(id) ON DELETE CASCADE,
      version bigint NOT NULL,
      new_parent_id uuid REFERENCES %I.locations(id) ON DELETE CASCADE,
      asset_count int NOT NULL DEFAULT 0,
      descendant_count int NOT NULL DEFAULT 0,
      impacted_user_count int NOT NULL DEFAULT 0,
      organization_id uuid NOT NULL DEFAULT %L,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    )', p_schema, p_schema, p_schema, p_org_id);

  -- Categories & Dynamic Attributes
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.category_definitions (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      current_revision_id uuid,
      version bigint NOT NULL DEFAULT 1,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.category_revisions (
      id uuid PRIMARY KEY,
      category_id uuid NOT NULL REFERENCES %I.category_definitions(id) ON DELETE CASCADE,
      version bigint NOT NULL,
      fields jsonb NOT NULL,
      effective_from timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  -- Units of Measure
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.unit_definitions (
      id uuid PRIMARY KEY,
      code text NOT NULL,
      name text NOT NULL,
      quantity_scale int NOT NULL DEFAULT 0,
      active boolean NOT NULL DEFAULT true,
      organization_id uuid NOT NULL DEFAULT %L,
      CONSTRAINT uom_code_unique UNIQUE (organization_id, code)
    )', p_schema, p_org_id);

  -- Catalog Items
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.catalog_items (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      description text,
      tracking_mode text NOT NULL,
      category_id uuid REFERENCES %I.category_definitions(id),
      unit_id uuid REFERENCES %I.unit_definitions(id),
      attributes jsonb NOT NULL DEFAULT %L,
      active boolean NOT NULL DEFAULT true,
      version bigint NOT NULL DEFAULT 1,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_schema, '{}', p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.catalog_item_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      catalog_item_id uuid NOT NULL REFERENCES %I.catalog_items(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text,
      category_id uuid,
      unit_id uuid,
      attributes jsonb NOT NULL,
      active boolean NOT NULL,
      version bigint NOT NULL,
      actor_id uuid,
      changed_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  -- Inventory Accounting & Ledger
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_accounts (
      id uuid PRIMARY KEY,
      code text NOT NULL,
      name text NOT NULL,
      kind text NOT NULL,
      organization_id uuid NOT NULL DEFAULT %L,
      CONSTRAINT account_code_unique UNIQUE (organization_id, code)
    )', p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_journals (
      id uuid PRIMARY KEY,
      event_type text NOT NULL,
      reference text,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_journal_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      journal_id uuid NOT NULL REFERENCES %I.inventory_journals(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_journal_sources (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      journal_id uuid NOT NULL REFERENCES %I.inventory_journals(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_entries (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      journal_id uuid NOT NULL REFERENCES %I.inventory_journals(id) ON DELETE CASCADE,
      account_id uuid NOT NULL REFERENCES %I.inventory_accounts(id),
      catalog_item_id uuid NOT NULL REFERENCES %I.catalog_items(id),
      location_id uuid REFERENCES %I.locations(id),
      direction text NOT NULL,
      quantity numeric(18,6) NOT NULL,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_schema, p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_lots (
      id uuid PRIMARY KEY,
      catalog_item_id uuid NOT NULL REFERENCES %I.catalog_items(id) ON DELETE CASCADE,
      lot_number text,
      received_on date NOT NULL,
      purchased_on date,
      warranty jsonb,
      unit_cost jsonb,
      initial_quantity numeric(18,6) NOT NULL,
      remaining_quantity numeric(18,6) NOT NULL,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_lot_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      lot_id uuid NOT NULL REFERENCES %I.inventory_lots(id) ON DELETE CASCADE,
      action text NOT NULL,
      quantity numeric(18,6) NOT NULL,
      organization_id uuid NOT NULL DEFAULT %L,
      created_at timestamptz NOT NULL DEFAULT now()
    )', p_schema, p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory_balances (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      catalog_item_id uuid NOT NULL REFERENCES %I.catalog_items(id) ON DELETE CASCADE,
      location_id uuid REFERENCES %I.locations(id),
      quantity numeric(18,6) NOT NULL DEFAULT 0,
      organization_id uuid NOT NULL DEFAULT %L,
      CONSTRAINT item_location_unique UNIQUE (organization_id, catalog_item_id, location_id)
    )', p_schema, p_schema, p_schema, p_org_id);

  -- Assets (Products)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.products (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      company text NOT NULL,
      department_code text,
      assigned_to_id uuid,
      location_id uuid REFERENCES %I.locations(id),
      category_id uuid REFERENCES %I.category_definitions(id),
      catalog_item_id uuid REFERENCES %I.catalog_items(id),
      lot_id uuid REFERENCES %I.inventory_lots(id),
      status boolean NOT NULL DEFAULT true,
      warranty text NOT NULL,
      warranty_date date,
      purchase_date date,
      customer_care text,
      serial_number text,
      power text,
      capacity text,
      qr text NOT NULL,
      product_img text,
      invoice text,
      damage_notes text,
      operational_status text NOT NULL DEFAULT %L,
      version bigint NOT NULL DEFAULT 1,
      deleted_at timestamptz,
      organization_id uuid NOT NULL DEFAULT %L,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )', p_schema, p_schema, p_schema, p_schema, p_schema, 'available', p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.asset_assignment_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      asset_id uuid NOT NULL,
      previous_department text,
      department text,
      previous_user_id uuid,
      user_id uuid,
      actor_id uuid,
      organization_id uuid NOT NULL DEFAULT %L,
      created_at timestamptz NOT NULL DEFAULT now()
    )', p_schema, p_org_id);

  -- Attachments
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.attachments (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      file_path text NOT NULL,
      file_size bigint NOT NULL,
      mime_type text NOT NULL,
      organization_id uuid NOT NULL DEFAULT %L,
      created_at timestamptz NOT NULL DEFAULT now()
    )', p_schema, p_org_id);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.attachment_links (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      attachment_id uuid NOT NULL REFERENCES %I.attachments(id) ON DELETE CASCADE,
      entity_type text NOT NULL,
      entity_id uuid NOT NULL,
      organization_id uuid NOT NULL DEFAULT %L
    )', p_schema, p_schema, p_org_id);

  -- Commands / Idempotency
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.api_commands (
      id uuid PRIMARY KEY,
      operation_id text NOT NULL,
      idempotency_key text NOT NULL,
      status text NOT NULL DEFAULT %L,
      response jsonb,
      organization_id uuid NOT NULL DEFAULT %L,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      CONSTRAINT api_command_unique UNIQUE (organization_id, operation_id, idempotency_key)
    )', p_schema, 'pending', p_org_id);

  -- -------------------------------------------------------------
  -- NEW: Asset Requisitions, Approvals & Issuance
  -- -------------------------------------------------------------
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.asset_requisitions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL DEFAULT %L,
      requisition_number text NOT NULL,
      requester_id uuid NOT NULL,
      department_code text NOT NULL,
      target_asset_id uuid REFERENCES %I.products(id),
      catalog_item_id uuid REFERENCES %I.catalog_items(id),
      item_name text NOT NULL,
      quantity numeric(18,6) NOT NULL DEFAULT 1,
      purpose text NOT NULL,
      urgency text NOT NULL DEFAULT %L,
      needed_from timestamptz NOT NULL DEFAULT now(),
      needed_until timestamptz NOT NULL,
      status text NOT NULL DEFAULT %L,
      approver_id uuid,
      approved_at timestamptz,
      approval_remarks text,
      rejection_reason text,
      issued_asset_id uuid REFERENCES %I.products(id),
      issued_by_id uuid,
      issued_at timestamptz,
      returned_at timestamptz,
      return_condition text,
      return_notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )', p_schema, p_org_id, p_schema, p_schema, 'standard', 'pending_approval', p_schema);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS asset_req_status_idx ON %I.asset_requisitions(organization_id, status);
    CREATE INDEX IF NOT EXISTS asset_req_requester_idx ON %I.asset_requisitions(organization_id, requester_id);
    CREATE INDEX IF NOT EXISTS asset_req_dept_idx ON %I.asset_requisitions(organization_id, department_code);
    CREATE INDEX IF NOT EXISTS asset_req_due_idx ON %I.asset_requisitions(organization_id, status, needed_until);
  ', p_schema, p_schema, p_schema, p_schema);

END;
$$;

-- 3. Create asset_requisitions table in all existing tenant schemas
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id, schema_name FROM organizations WHERE schema_name IS NOT NULL LOOP
    CALL provision_tenant_schema(rec.schema_name, rec.id);

    -- Seed permissions into roles for each existing tenant schema
    -- Owner & Administrator get all 4 requisition permissions
    EXECUTE format('
      INSERT INTO %I.role_permissions (role_id, permission_id)
      SELECT r.id, p.perm
      FROM %I.roles r
      CROSS JOIN (VALUES (''requisition.create''), (''requisition.read''), (''requisition.approve''), (''requisition.fulfill'')) AS p(perm)
      WHERE r.name IN (''Organization owner'', ''Administrator'')
      ON CONFLICT DO NOTHING;
    ', rec.schema_name, rec.schema_name);

    -- Employee gets requisition.create and requisition.read
    EXECUTE format('
      INSERT INTO %I.role_permissions (role_id, permission_id)
      SELECT r.id, p.perm
      FROM %I.roles r
      CROSS JOIN (VALUES (''requisition.create''), (''requisition.read'')) AS p(perm)
      WHERE r.name = ''Employee''
      ON CONFLICT DO NOTHING;
    ', rec.schema_name, rec.schema_name);

    -- Create or ensure Department Head role exists
    EXECUTE format('
      DO $inner$
      DECLARE
        v_role_id uuid;
      BEGIN
        SELECT id INTO v_role_id FROM %I.roles WHERE name = ''Department head'';
        IF v_role_id IS NULL THEN
          v_role_id := gen_random_uuid();
          INSERT INTO %I.roles (id, name, active, organization_id)
          VALUES (v_role_id, ''Department head'', true, %L);
        END IF;

        INSERT INTO %I.role_permissions (role_id, permission_id)
        VALUES
          (v_role_id, ''asset.read''),
          (v_role_id, ''requisition.create''),
          (v_role_id, ''requisition.read''),
          (v_role_id, ''requisition.approve''),
          (v_role_id, ''directory.read'')
        ON CONFLICT DO NOTHING;
      END $inner$;
    ', rec.schema_name, rec.schema_name, rec.id, rec.schema_name);

    -- Create or ensure Storekeeper role exists
    EXECUTE format('
      DO $inner$
      DECLARE
        v_role_id uuid;
      BEGIN
        SELECT id INTO v_role_id FROM %I.roles WHERE name = ''Storekeeper'';
        IF v_role_id IS NULL THEN
          v_role_id := gen_random_uuid();
          INSERT INTO %I.roles (id, name, active, organization_id)
          VALUES (v_role_id, ''Storekeeper'', true, %L);
        END IF;

        INSERT INTO %I.role_permissions (role_id, permission_id)
        VALUES
          (v_role_id, ''asset.read''),
          (v_role_id, ''requisition.read''),
          (v_role_id, ''requisition.fulfill''),
          (v_role_id, ''catalog.read''),
          (v_role_id, ''inventory.read'')
        ON CONFLICT DO NOTHING;
      END $inner$;
    ', rec.schema_name, rec.schema_name, rec.id, rec.schema_name);

  END LOOP;
END $$;

-- Also seed into public.role_permissions template if public.roles exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='role_permissions') THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.perm
    FROM public.roles r
    CROSS JOIN (VALUES ('requisition.create'), ('requisition.read'), ('requisition.approve'), ('requisition.fulfill')) AS p(perm)
    WHERE r.name IN ('Organization owner', 'Administrator')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.perm
    FROM public.roles r
    CROSS JOIN (VALUES ('requisition.create'), ('requisition.read')) AS p(perm)
    WHERE r.name = 'Employee'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
