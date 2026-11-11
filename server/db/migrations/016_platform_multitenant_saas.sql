-- 016_platform_multitenant_saas.sql
-- Elevate architecture to Database-per-Client SaaS model.

-- 1. Super admin flag on central users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- 2. Client database routing and lifecycle status on organizations
ALTER TABLE organizations ALTER COLUMN schema_name DROP NOT NULL;
DROP INDEX IF EXISTS organizations_schema_name_idx;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS database_name text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS database_host text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS database_port integer;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS database_user text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS provisioning_status text NOT NULL DEFAULT 'provisioned';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS provisioning_error text;

-- Add check constraint on status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_status_check'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_status_check
      CHECK (status IN ('active', 'suspended', 'provisioning', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_provisioning_status_check'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_provisioning_status_check
      CHECK (provisioning_status IN ('pending', 'provisioning', 'provisioned', 'failed'));
  END IF;
END $$;

-- Populate database_name for existing organizations based on database name
UPDATE organizations
SET database_name = COALESCE(database_name, current_database())
WHERE database_name IS NULL;

-- 3. Platform audit log for super-admin operations
CREATE TABLE IF NOT EXISTS platform_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_client_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  outcome text NOT NULL DEFAULT 'success',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for platform audit queries
CREATE INDEX IF NOT EXISTS platform_audit_events_target_client_idx ON platform_audit_events(target_client_id);
CREATE INDEX IF NOT EXISTS platform_audit_events_created_at_idx ON platform_audit_events(created_at DESC);
