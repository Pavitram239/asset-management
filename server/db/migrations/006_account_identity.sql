ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0 CHECK(session_version>=0);
CREATE TABLE account_tokens (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 purpose text NOT NULL CHECK(purpose IN ('verification','recovery')),
 email text NOT NULL CHECK(email=lower(email)),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 outbox_id uuid NOT NULL UNIQUE REFERENCES outbox_events(id),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(expires_at>created_at)
);
CREATE INDEX account_tokens_user ON account_tokens(user_id,purpose);
CREATE UNIQUE INDEX account_tokens_active ON account_tokens(user_id,purpose) WHERE consumed_at IS NULL AND revoked_at IS NULL;

-- Profile email changes revoke old-address links in the same database transaction,
-- including changes performed by an operator instead of the HTTP profile route.
CREATE FUNCTION invalidate_account_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.email IS DISTINCT FROM OLD.email THEN
  NEW.email_verified_at=NULL;
  UPDATE account_tokens SET revoked_at=clock_timestamp()
   WHERE user_id=NEW.id AND consumed_at IS NULL AND revoked_at IS NULL;
  UPDATE delivery_attempts SET status='cancelled',error_code='CONTEXT_REVOKED',finished_at=clock_timestamp()
   WHERE id IN (SELECT o.lease_token FROM outbox_events o JOIN account_tokens t ON t.outbox_id=o.id WHERE t.user_id=NEW.id)
    AND status='leased';
  UPDATE outbox_events SET status='cancelled',encrypted_payload=NULL,finished_at=clock_timestamp(),
   lease_token=NULL,lease_until=NULL,last_error_code='CONTEXT_REVOKED'
   WHERE id IN (SELECT outbox_id FROM account_tokens WHERE user_id=NEW.id)
    AND status IN ('pending','leased','retry_scheduled');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_email_changed BEFORE UPDATE OF email ON users
 FOR EACH ROW EXECUTE FUNCTION invalidate_account_email();
