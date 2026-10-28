CREATE TABLE organization_invitations (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 email text NOT NULL CHECK(email=lower(email) AND length(email)<=254),
 inviter_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 outbox_id uuid NOT NULL UNIQUE REFERENCES outbox_events(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','revoked','expired')),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 expires_at timestamptz NOT NULL,
 accepted_by uuid,
 accepted_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,inviter_id) REFERENCES memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,accepted_by) REFERENCES memberships(organization_id,user_id),
 CHECK(expires_at>created_at),
 CHECK((state='accepted' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL) OR
       (state<>'accepted' AND accepted_by IS NULL AND accepted_at IS NULL))
);
CREATE UNIQUE INDEX invitation_pending_email ON organization_invitations(organization_id,email) WHERE state='pending';
CREATE INDEX invitations_company ON organization_invitations(organization_id,id);
CREATE INDEX invitations_inviter ON organization_invitations(organization_id,inviter_id);

CREATE TABLE invitation_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 invitation_id uuid NOT NULL,
 role_id uuid,
 permission_id text REFERENCES permissions(id),
 scope text NOT NULL CHECK(scope IN ('organization','department','self')),
 department_code text,
 permission_snapshot text[] NOT NULL CHECK(cardinality(permission_snapshot)>0),
 FOREIGN KEY(organization_id,invitation_id) REFERENCES organization_invitations(organization_id,id),
 FOREIGN KEY(organization_id,role_id) REFERENCES roles(organization_id,id),
 FOREIGN KEY(organization_id,department_code) REFERENCES organization_departments(organization_id,code),
 CHECK((role_id IS NULL)<>(permission_id IS NULL)),
 CHECK((scope='department' AND department_code IS NOT NULL) OR (scope<>'department' AND department_code IS NULL))
);
CREATE INDEX invitation_grants_invitation ON invitation_grants(organization_id,invitation_id);
ALTER TABLE memberships ADD COLUMN invitation_id uuid;
ALTER TABLE memberships ADD CONSTRAINT membership_invitation_tenant_fk
 FOREIGN KEY(organization_id,invitation_id) REFERENCES organization_invitations(organization_id,id);
