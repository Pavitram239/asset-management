-- Payloads are application-encrypted; no recipient, body or account token in plaintext.
CREATE TABLE outbox_events (
 id uuid PRIMARY KEY,
 topic text NOT NULL CHECK(topic ~ '^[a-z][a-z0-9_.]{0,79}$'),
 deduplication_key text NOT NULL UNIQUE CHECK(length(deduplication_key) BETWEEN 1 AND 200),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 encrypted_payload jsonb,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','retry_scheduled','delivered','failed','cancelled','expired')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 max_attempts integer NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 10),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 lease_token uuid,
 lease_until timestamptz,
 last_error_code text CHECK(last_error_code IN ('DELIVERY_FAILED','DELIVERY_TIMEOUT','LEASE_EXPIRED','INVALID_PAYLOAD','CONTEXT_REVOKED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CHECK(expires_at>created_at),
 CHECK(attempts<=max_attempts),
 CHECK((status='leased' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR
       (status<>'leased' AND lease_token IS NULL AND lease_until IS NULL)),
 CHECK((status IN ('pending','leased','retry_scheduled') AND encrypted_payload IS NOT NULL AND finished_at IS NULL) OR
       (status IN ('delivered','failed','cancelled','expired') AND encrypted_payload IS NULL AND finished_at IS NOT NULL))
);
CREATE INDEX outbox_due ON outbox_events(next_attempt_at,id) WHERE status IN ('pending','retry_scheduled');
CREATE INDEX outbox_leases ON outbox_events(lease_until,id) WHERE status='leased';
CREATE INDEX outbox_expiry ON outbox_events(expires_at,id) WHERE encrypted_payload IS NOT NULL;

CREATE TABLE delivery_attempts (
 id uuid PRIMARY KEY,
 event_id uuid NOT NULL REFERENCES outbox_events(id),
 attempt_number integer NOT NULL CHECK(attempt_number BETWEEN 1 AND 10),
 status text NOT NULL CHECK(status IN ('leased','delivered','retry_scheduled','failed','abandoned','cancelled','expired')),
 error_code text CHECK(error_code IN ('DELIVERY_FAILED','DELIVERY_TIMEOUT','LEASE_EXPIRED','INVALID_PAYLOAD','CONTEXT_REVOKED')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 UNIQUE(event_id,attempt_number),
 CHECK((status='leased' AND finished_at IS NULL) OR (status<>'leased' AND finished_at IS NOT NULL))
);

-- Local development/test sink only. Encrypted captures expire with the event.
CREATE TABLE captured_mail (
 id uuid PRIMARY KEY,
 event_id uuid NOT NULL REFERENCES outbox_events(id),
 attempt_id uuid NOT NULL UNIQUE REFERENCES delivery_attempts(id),
 encrypted_message jsonb NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX captured_mail_expiry ON captured_mail(expires_at,id);
