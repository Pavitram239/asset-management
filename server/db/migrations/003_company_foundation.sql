-- Legacy ownership is deliberately unreviewed; editable role names are not ownership.
ALTER TABLE organizations ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991);
ALTER TABLE organizations ADD COLUMN currency text CHECK(currency ~ '^[A-Z]{3}$');
ALTER TABLE organizations ADD COLUMN time_zone text CHECK(length(time_zone) BETWEEN 1 AND 100);
ALTER TABLE organizations ADD COLUMN ownership_activated_at timestamptz;
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

INSERT INTO permissions(id) VALUES('ownership.manage');
CREATE TABLE organization_owners (
 organization_id uuid NOT NULL, user_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,user_id),
 FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id)
);
CREATE INDEX organization_owners_user_idx ON organization_owners(user_id,organization_id);

-- Deferred checks allow add-new-owner/remove-old-owner within one transaction.
CREATE FUNCTION assert_company_owner(company uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE activated timestamptz;
BEGIN
 SELECT ownership_activated_at INTO activated FROM organizations WHERE id=company FOR UPDATE;
 IF activated IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM organization_owners own JOIN memberships m USING(organization_id,user_id)
  JOIN users u ON u.id=own.user_id WHERE own.organization_id=company AND m.active AND u.active
 ) THEN RAISE EXCEPTION 'Cannot remove the last active company owner' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION protect_company_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE company uuid; field_name text;
BEGIN
 field_name := CASE WHEN TG_TABLE_NAME='organizations' THEN 'id' ELSE 'organization_id' END;
 FOR company IN SELECT DISTINCT value FROM unnest(ARRAY[
  (to_jsonb(OLD)->>field_name)::uuid,(to_jsonb(NEW)->>field_name)::uuid
 ]) AS companies(value) WHERE value IS NOT NULL ORDER BY value LOOP
  PERFORM assert_company_owner(company);
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER owners_continuity AFTER INSERT OR UPDATE OR DELETE ON organization_owners
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION protect_company_owner();
CREATE CONSTRAINT TRIGGER membership_owner_continuity AFTER UPDATE OR DELETE ON memberships
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION protect_company_owner();
CREATE CONSTRAINT TRIGGER company_owner_continuity AFTER INSERT OR UPDATE ON organizations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION protect_company_owner();
CREATE FUNCTION protect_owner_account() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE company uuid;
BEGIN
 IF NEW.active IS DISTINCT FROM OLD.active THEN
  FOR company IN SELECT organization_id FROM organization_owners WHERE user_id=NEW.id ORDER BY organization_id LOOP
   PERFORM assert_company_owner(company);
  END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER account_owner_continuity AFTER UPDATE ON users
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION protect_owner_account();

-- A committed key keeps its result pointer even when response caching is pruned later.
CREATE TABLE api_commands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES users(id),
 organization_id uuid REFERENCES organizations(id), operation_id text NOT NULL,
 idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9_-]{16,100}$'),
 request_hash text NOT NULL, resource_type text, resource_id uuid, result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE NULLS NOT DISTINCT(actor_id,organization_id,operation_id,idempotency_key),
 CHECK((result IS NULL AND resource_type IS NULL AND resource_id IS NULL) OR
       (result IS NOT NULL AND resource_type IS NOT NULL AND resource_id IS NOT NULL))
);
