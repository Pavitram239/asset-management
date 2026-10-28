ALTER TABLE api_commands ADD COLUMN committed_at timestamptz;
UPDATE api_commands SET committed_at=created_at WHERE resource_id IS NOT NULL;
ALTER TABLE api_commands DROP CONSTRAINT api_commands_check;
ALTER TABLE api_commands ADD CONSTRAINT api_commands_commit_state_check CHECK(
 (committed_at IS NULL AND resource_type IS NULL AND resource_id IS NULL AND result IS NULL) OR
 (committed_at IS NOT NULL AND resource_type IS NOT NULL AND resource_id IS NOT NULL)
);
-- Response caching is disposable; the identity and result pointer are not.
CREATE FUNCTION protect_committed_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.committed_at IS NOT NULL THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Committed command identities are immutable' USING ERRCODE='23514'; END IF;
  IF ROW(NEW.id,NEW.actor_id,NEW.organization_id,NEW.operation_id,NEW.idempotency_key,NEW.request_hash,
         NEW.resource_type,NEW.resource_id,NEW.created_at,NEW.committed_at)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.actor_id,OLD.organization_id,OLD.operation_id,OLD.idempotency_key,OLD.request_hash,
         OLD.resource_type,OLD.resource_id,OLD.created_at,OLD.committed_at)
     OR (NEW.result IS DISTINCT FROM OLD.result AND NEW.result IS NOT NULL) THEN
   RAISE EXCEPTION 'Committed command identities are immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER command_identity_immutable BEFORE UPDATE OR DELETE ON api_commands
 FOR EACH ROW EXECUTE FUNCTION protect_committed_command();
