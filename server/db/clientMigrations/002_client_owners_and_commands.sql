-- 002_client_owners_and_commands.sql
-- 1. Create organization_owners table for protected ownership tracking
CREATE TABLE IF NOT EXISTS organization_owners (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

-- Backfill organization_owners from active Organization owner user_roles
INSERT INTO organization_owners (organization_id, user_id, created_by)
SELECT ur.organization_id, ur.user_id, ur.user_id
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id AND r.name = 'Organization owner' AND r.active
JOIN users u ON u.id = ur.user_id AND u.active
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- 2. Fix api_commands committed_at default and idempotency unique constraint
ALTER TABLE api_commands ALTER COLUMN committed_at DROP DEFAULT;

-- Clear committed_at if result is null (uncommitted commands that were incorrectly set to now())
UPDATE api_commands SET committed_at = NULL WHERE result IS NULL;

-- Ensure idempotency unique constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_commands_idempotency_unique'
  ) THEN
    -- In case duplicates exist in dev test data, remove older uncommitted duplicates
    DELETE FROM api_commands a USING api_commands b
    WHERE a.id < b.id 
      AND a.actor_id IS NOT DISTINCT FROM b.actor_id
      AND a.organization_id IS NOT DISTINCT FROM b.organization_id
      AND a.operation_id = b.operation_id
      AND a.idempotency_key = b.idempotency_key;

    ALTER TABLE api_commands ADD CONSTRAINT api_commands_idempotency_unique
      UNIQUE NULLS NOT DISTINCT (actor_id, organization_id, operation_id, idempotency_key);
  END IF;
END $$;
