-- 018_client_idempotency_recovery.sql
-- Link organizations to api_commands for atomic idempotency recovery and duplicate prevention

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS command_id uuid REFERENCES api_commands(id);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_command_id_idx ON organizations(command_id) WHERE command_id IS NOT NULL;
