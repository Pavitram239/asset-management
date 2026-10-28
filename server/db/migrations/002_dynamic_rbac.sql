CREATE TABLE organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE users ALTER COLUMN department_code DROP NOT NULL;
ALTER TABLE users ALTER COLUMN department_code DROP DEFAULT;
CREATE TABLE organization_departments (
 organization_id uuid NOT NULL REFERENCES organizations(id), code text NOT NULL CHECK(length(trim(code)) BETWEEN 1 AND 100),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200), active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(organization_id, code)
);
CREATE TABLE memberships (
 organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
 department_code text, active boolean NOT NULL DEFAULT true, PRIMARY KEY(organization_id,user_id),
 FOREIGN KEY(organization_id,department_code) REFERENCES organization_departments(organization_id,code)
);
CREATE INDEX memberships_user_idx ON memberships(user_id, organization_id);
CREATE TABLE permissions (id text PRIMARY KEY);
INSERT INTO permissions(id) VALUES
 ('asset.read'),('asset.create'),('asset.update'),('asset.delete'),('asset.file.read'),('asset.file.write'),
 ('directory.read'),('statistics.read'),('organization.create'),('organization.manage'),('department.manage'),
 ('membership.manage'),('role.manage'),('access.manage'),('audit.read');
CREATE TABLE roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200), active boolean NOT NULL DEFAULT true,
 UNIQUE(organization_id,id), UNIQUE(organization_id,name)
);
CREATE TABLE role_permissions (
 role_id uuid NOT NULL REFERENCES roles(id), permission_id text NOT NULL REFERENCES permissions(id),
 PRIMARY KEY(role_id,permission_id)
);
CREATE TABLE user_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, user_id uuid NOT NULL,
 role_id uuid NOT NULL, scope text NOT NULL CHECK(scope IN ('organization','department','self')), department_code text,
 FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,role_id) REFERENCES roles(organization_id,id),
 FOREIGN KEY(organization_id,department_code) REFERENCES organization_departments(organization_id,code),
 CHECK((scope='department' AND department_code IS NOT NULL) OR (scope<>'department' AND department_code IS NULL)),
 UNIQUE NULLS NOT DISTINCT(organization_id,user_id,role_id,scope,department_code)
);
CREATE INDEX user_roles_actor_idx ON user_roles(organization_id,user_id);
CREATE TABLE user_permissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, user_id uuid NOT NULL,
 permission_id text NOT NULL REFERENCES permissions(id), scope text NOT NULL CHECK(scope IN ('organization','department','self')), department_code text,
 FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,department_code) REFERENCES organization_departments(organization_id,code),
 CHECK((scope='department' AND department_code IS NOT NULL) OR (scope<>'department' AND department_code IS NULL)),
 UNIQUE NULLS NOT DISTINCT(organization_id,user_id,permission_id,scope,department_code)
);
CREATE INDEX user_permissions_actor_idx ON user_permissions(organization_id,user_id);
ALTER TABLE products ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE products ADD COLUMN deleted_at timestamptz;
DO $$
DECLARE org uuid; r record; rid uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM users) THEN
 IF NOT EXISTS(SELECT 1 FROM users WHERE role='admin') THEN RAISE EXCEPTION 'Legacy users have no administrator; provision a reviewed legacy administrator before migration'; END IF;
 INSERT INTO organizations(name) VALUES('Migrated organization') RETURNING id INTO org;
 INSERT INTO organization_departments(organization_id,code,name) SELECT org,code,name FROM departments;
 INSERT INTO memberships(organization_id,user_id,department_code) SELECT org,id,department_code FROM users;
 UPDATE products SET organization_id=org;
 FOR r IN SELECT DISTINCT role FROM users LOOP
 INSERT INTO roles(organization_id,name) VALUES(org,'Migrated ' || r.role) RETURNING id INTO rid;
 INSERT INTO role_permissions(role_id,permission_id)
 SELECT rid,id FROM permissions WHERE r.role='admin' OR
 (r.role='head' AND id IN ('asset.read','asset.create','asset.update','asset.delete','asset.file.read','asset.file.write','directory.read','statistics.read')) OR
 (r.role='user' AND id IN ('asset.read','asset.file.read'));
 INSERT INTO user_roles(organization_id,user_id,role_id,scope,department_code)
 SELECT org,id,rid,CASE WHEN role='admin' THEN 'organization' ELSE 'department' END,
 CASE WHEN role='admin' THEN NULL ELSE department_code END FROM users WHERE role=r.role;
 END LOOP;
 END IF;
END $$;
ALTER TABLE products ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE products DROP CONSTRAINT products_department_code_fkey;
ALTER TABLE products ADD CONSTRAINT products_tenant_department_fk FOREIGN KEY(organization_id,department_code) REFERENCES organization_departments(organization_id,code);
ALTER TABLE products ADD CONSTRAINT products_tenant_creator_fk FOREIGN KEY(organization_id,creator_id) REFERENCES memberships(organization_id,user_id);
ALTER TABLE products ADD CONSTRAINT products_tenant_assignee_fk FOREIGN KEY(organization_id,assigned_to_id) REFERENCES memberships(organization_id,user_id);
CREATE INDEX products_tenant_idx ON products(organization_id,department_code,created_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid REFERENCES organizations(id),
 actor_id uuid REFERENCES users(id), action text NOT NULL, target text, outcome text NOT NULL DEFAULT 'success',
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_tenant_idx ON audit_events(organization_id,id DESC);
CREATE FUNCTION protect_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit events are append-only'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION protect_audit();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION protect_audit();
ALTER TABLE products ADD CONSTRAINT products_tenant_id_unique UNIQUE(organization_id,id);
CREATE TABLE asset_assignment_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 asset_id uuid NOT NULL REFERENCES products(id), actor_id uuid NOT NULL REFERENCES users(id),
 previous_department text, department text NOT NULL, previous_user_id uuid REFERENCES users(id), user_id uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,asset_id) REFERENCES products(organization_id,id),
 FOREIGN KEY(organization_id,actor_id) REFERENCES memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,previous_user_id) REFERENCES memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,department) REFERENCES organization_departments(organization_id,code),
 FOREIGN KEY(organization_id,previous_department) REFERENCES organization_departments(organization_id,code)
);
CREATE INDEX history_tenant_asset_idx ON asset_assignment_history(organization_id,asset_id,id DESC);
-- Capture current legacy assignment state at migration time; earlier transfers are unknown.
INSERT INTO asset_assignment_history(organization_id,asset_id,actor_id,department,user_id,created_at)
SELECT organization_id,id,creator_id,department_code,assigned_to_id,now() FROM products;
CREATE TABLE authentication_attempts (key text PRIMARY KEY, count integer NOT NULL, reset_at timestamptz NOT NULL);
CREATE TABLE storage_cleanup (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, folder text NOT NULL, category text NOT NULL, object_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(folder,category,object_name)
);
