INSERT INTO permissions(id) VALUES('location.manage'),('category.manage'),('unit.manage');
-- Reviewed owner markers, never editable role names, establish the migration mapping.
INSERT INTO user_permissions(organization_id,user_id,permission_id,scope)
 SELECT own.organization_id,own.user_id,p.id,'organization' FROM organization_owners own
 CROSS JOIN permissions p WHERE p.id IN ('location.manage','category.manage','unit.manage') ON CONFLICT DO NOTHING;

CREATE TABLE locations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 parent_id uuid, name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK(kind IN ('branch','building','floor','room','store','offsite','unspecified')),
 active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,parent_id) REFERENCES locations(organization_id,id), CHECK(id IS DISTINCT FROM parent_id)
);
CREATE INDEX locations_parent ON locations(organization_id,parent_id);
CREATE TABLE location_ancestry (
 organization_id uuid NOT NULL, ancestor_id uuid NOT NULL, descendant_id uuid NOT NULL, depth integer NOT NULL CHECK(depth>=0),
 PRIMARY KEY(organization_id,ancestor_id,descendant_id),
 FOREIGN KEY(organization_id,ancestor_id) REFERENCES locations(organization_id,id),
 FOREIGN KEY(organization_id,descendant_id) REFERENCES locations(organization_id,id)
);
CREATE INDEX location_ancestors ON location_ancestry(organization_id,descendant_id,ancestor_id);
CREATE FUNCTION validate_location_tree() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.organization_id<>OLD.organization_id OR NEW.id<>OLD.id) THEN
  RAISE EXCEPTION 'Location identity is immutable' USING ERRCODE='23514';
 END IF;
 IF EXISTS(WITH RECURSIVE ancestors AS (
  SELECT id,parent_id FROM locations WHERE organization_id=NEW.organization_id AND id=NEW.parent_id
  UNION SELECT l.id,l.parent_id FROM locations l JOIN ancestors a ON l.id=a.parent_id WHERE l.organization_id=NEW.organization_id
 ) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN RAISE EXCEPTION 'Location cycle' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER location_tree_guard BEFORE INSERT OR UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION validate_location_tree();
CREATE FUNCTION rebuild_location_ancestry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM location_ancestry WHERE organization_id=NEW.organization_id;
 INSERT INTO location_ancestry(organization_id,ancestor_id,descendant_id,depth)
 WITH RECURSIVE tree AS (
  SELECT organization_id,id AS ancestor_id,id AS descendant_id,0 AS depth FROM locations WHERE organization_id=NEW.organization_id
  UNION ALL SELECT tree.organization_id,tree.ancestor_id,l.id,tree.depth+1 FROM tree JOIN locations l
   ON l.organization_id=tree.organization_id AND l.parent_id=tree.descendant_id
 ) SELECT * FROM tree;
 RETURN NULL;
END $$;
CREATE TRIGGER location_tree_projection AFTER INSERT OR UPDATE OF parent_id ON locations FOR EACH ROW EXECUTE FUNCTION rebuild_location_ancestry();

CREATE TABLE category_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),fields jsonb NOT NULL CHECK(jsonb_typeof(fields)='array'),
 active boolean NOT NULL DEFAULT true,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 UNIQUE(organization_id,id)
);
CREATE TABLE category_revisions (
 organization_id uuid NOT NULL,category_id uuid NOT NULL,version bigint NOT NULL,fields jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,category_id,version),FOREIGN KEY(organization_id,category_id) REFERENCES category_definitions(organization_id,id)
);
CREATE TABLE unit_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL CHECK(code ~ '^[A-Z][A-Z0-9_]{0,19}$'),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 quantity_scale integer NOT NULL CHECK(quantity_scale BETWEEN 0 AND 6),version bigint NOT NULL DEFAULT 1 CHECK(version=1),
 UNIQUE(organization_id,id),UNIQUE(organization_id,code)
);
CREATE FUNCTION immutable_unit_meaning() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Unit definitions are immutable; create a new unit' USING ERRCODE='23514'; END $$;
CREATE TRIGGER unit_meaning_guard BEFORE UPDATE OR DELETE ON unit_definitions FOR EACH ROW EXECUTE FUNCTION immutable_unit_meaning();
CREATE FUNCTION immutable_category_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Category revisions are immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER category_revision_guard BEFORE UPDATE OR DELETE ON category_revisions FOR EACH ROW EXECUTE FUNCTION immutable_category_revision();

ALTER TABLE products ADD COLUMN location_id uuid;
ALTER TABLE products ADD CONSTRAINT product_location_tenant_fk FOREIGN KEY(organization_id,location_id) REFERENCES locations(organization_id,id);
CREATE INDEX product_location ON products(organization_id,location_id);
DO $$ DECLARE t text; c record; BEGIN
 FOREACH t IN ARRAY ARRAY['user_roles','user_permissions','invitation_grants'] LOOP
  EXECUTE format('ALTER TABLE %I ADD COLUMN location_id uuid',t);
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid=to_regclass(t) AND contype IN ('c','u') AND pg_get_constraintdef(oid) LIKE '%scope%' LOOP
   EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',t,c.conname);
  END LOOP;
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(organization_id,location_id) REFERENCES locations(organization_id,id)',t,t||'_location_tenant_fk');
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK(scope IN (''organization'',''department'',''location'',''self'') AND ((scope=''department'' AND department_code IS NOT NULL AND location_id IS NULL) OR (scope=''location'' AND location_id IS NOT NULL AND department_code IS NULL) OR (scope IN (''organization'',''self'') AND department_code IS NULL AND location_id IS NULL)))',t,t||'_scope_reference_check');
  EXECUTE format('CREATE INDEX %I ON %I(organization_id,location_id)',t||'_location_idx',t);
 END LOOP;
END $$;
ALTER TABLE user_roles ADD CONSTRAINT user_role_scoped_unique UNIQUE NULLS NOT DISTINCT(organization_id,user_id,role_id,scope,department_code,location_id);
ALTER TABLE user_permissions ADD CONSTRAINT user_permission_scoped_unique UNIQUE NULLS NOT DISTINCT(organization_id,user_id,permission_id,scope,department_code,location_id);

CREATE TABLE location_move_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,location_id uuid NOT NULL,new_parent_id uuid,
 actor_id uuid NOT NULL REFERENCES users(id),location_version bigint NOT NULL,fingerprint text NOT NULL,affected_grant_ids uuid[] NOT NULL,
 affected_scopes jsonb NOT NULL CHECK(jsonb_typeof(affected_scopes)='array'),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes',consumed_at timestamptz,
 FOREIGN KEY(organization_id,location_id) REFERENCES locations(organization_id,id),
 FOREIGN KEY(organization_id,new_parent_id) REFERENCES locations(organization_id,id),UNIQUE(organization_id,id)
);
