-- 017_platform_client_onboarding.sql
-- Complete client administrator setup tokens and explicit admin tracking on organizations.

-- 1. Explicit initial admin tracking on organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS initial_admin_email text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS initial_admin_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- 2. Secure, expiring single-use setup tokens for initial client administrator
CREATE TABLE IF NOT EXISTS client_setup_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  outbox_id uuid REFERENCES outbox_events(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS client_setup_tokens_email_idx ON client_setup_tokens(email);
CREATE INDEX IF NOT EXISTS client_setup_tokens_org_idx ON client_setup_tokens(organization_id);
CREATE INDEX IF NOT EXISTS client_setup_tokens_token_hash_idx ON client_setup_tokens(token_hash);

