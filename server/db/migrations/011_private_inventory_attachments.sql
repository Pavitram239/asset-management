INSERT INTO permissions(id) VALUES('attachment.read'),('attachment.write');
INSERT INTO user_permissions(organization_id,user_id,permission_id,scope)
 SELECT own.organization_id,own.user_id,p.id,'organization' FROM organization_owners own CROSS JOIN permissions p
 WHERE p.id IN ('attachment.read','attachment.write') ON CONFLICT DO NOTHING;
ALTER TABLE api_commands ADD CONSTRAINT command_attachment_context UNIQUE(organization_id,id,actor_id);
CREATE TABLE attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),created_by uuid NOT NULL REFERENCES users(id),
 command_id uuid NOT NULL UNIQUE,file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
 media_type text NOT NULL CHECK(media_type IN ('image/jpeg','image/png','image/webp','application/pdf')),size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),storage_key text NOT NULL UNIQUE CHECK(storage_key ~ '^assets/documents/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$' AND split_part(storage_key,'/',3)=organization_id::text),
 state text NOT NULL DEFAULT 'staged' CHECK(state IN ('staged','linked','removed')),version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,command_id,created_by) REFERENCES api_commands(organization_id,id,actor_id)
);
CREATE TABLE attachment_links (
 organization_id uuid NOT NULL,attachment_id uuid NOT NULL,item_id uuid,lot_id uuid,unit_id uuid,
 category text NOT NULL CHECK(category IN ('image','document','invoice','quotation','evidence','contract')),
 contains_cost boolean NOT NULL DEFAULT false,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,attachment_id),CHECK(num_nonnulls(item_id,lot_id,unit_id)=1),
 FOREIGN KEY(organization_id,attachment_id) REFERENCES attachments(organization_id,id),
 FOREIGN KEY(organization_id,item_id) REFERENCES catalog_items(organization_id,id),
 FOREIGN KEY(organization_id,lot_id) REFERENCES inventory_lots(organization_id,id),
 FOREIGN KEY(organization_id,unit_id) REFERENCES products(organization_id,id),
 CHECK(category NOT IN ('invoice','quotation','contract') OR contains_cost)
);
CREATE INDEX attachment_item_links ON attachment_links(organization_id,item_id);
CREATE INDEX attachment_lot_links ON attachment_links(organization_id,lot_id);
CREATE INDEX attachment_unit_links ON attachment_links(organization_id,unit_id);
CREATE TRIGGER attachment_link_history BEFORE UPDATE OR DELETE ON attachment_links FOR EACH ROW EXECUTE FUNCTION immutable_inventory_record();
CREATE FUNCTION attachment_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.id,NEW.organization_id,NEW.created_by,NEW.command_id,NEW.file_name,NEW.media_type,NEW.size_bytes,NEW.content_hash,NEW.storage_key,NEW.created_at,NEW.expires_at)
  IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.created_by,OLD.command_id,OLD.file_name,OLD.media_type,OLD.size_bytes,OLD.content_hash,OLD.storage_key,OLD.created_at,OLD.expires_at)
  OR OLD.state='removed' OR (OLD.state='linked' AND NEW.state NOT IN ('linked','removed')) THEN
  RAISE EXCEPTION 'Attachment identity/history is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER attachment_identity BEFORE UPDATE OR DELETE ON attachments FOR EACH ROW EXECUTE FUNCTION attachment_identity_guard();
CREATE FUNCTION attachment_link_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attachment_row attachments%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='attachments' THEN attachment_row=NEW;
 ELSE SELECT * INTO attachment_row FROM attachments WHERE organization_id=NEW.organization_id AND id=NEW.attachment_id; END IF;
 IF attachment_row.state='linked' AND NOT EXISTS(SELECT 1 FROM attachment_links WHERE organization_id=attachment_row.organization_id AND attachment_id=attachment_row.id) THEN
  RAISE EXCEPTION 'Linked attachment requires a typed target' USING ERRCODE='23514';
 END IF;
 IF attachment_row.state='staged' AND EXISTS(SELECT 1 FROM attachment_links WHERE organization_id=attachment_row.organization_id AND attachment_id=attachment_row.id) THEN
  RAISE EXCEPTION 'Staged attachment cannot have a live target' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER attachment_state_consistency AFTER INSERT OR UPDATE ON attachments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION attachment_link_consistency();
CREATE CONSTRAINT TRIGGER attachment_target_consistency AFTER INSERT ON attachment_links DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION attachment_link_consistency();
