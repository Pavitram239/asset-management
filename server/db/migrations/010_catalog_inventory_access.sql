INSERT INTO permissions(id) VALUES('catalog.read'),('catalog.manage'),('catalog.requestable.read'),('inventory.read'),('inventory.opening'),('cost.read');
INSERT INTO user_permissions(organization_id,user_id,permission_id,scope)
 SELECT own.organization_id,own.user_id,p.id,'organization' FROM organization_owners own CROSS JOIN permissions p
 WHERE p.id IN ('catalog.read','catalog.manage','catalog.requestable.read','inventory.read','inventory.opening','cost.read') ON CONFLICT DO NOTHING;

CREATE TABLE catalog_item_history (
 organization_id uuid NOT NULL,item_id uuid NOT NULL,version bigint NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,item_id,version),FOREIGN KEY(organization_id,item_id) REFERENCES catalog_items(organization_id,id)
);
CREATE TABLE inventory_lot_history (
 organization_id uuid NOT NULL,lot_id uuid NOT NULL,version bigint NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL,support_snapshot jsonb NOT NULL CHECK(jsonb_typeof(support_snapshot)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,lot_id,version),FOREIGN KEY(organization_id,lot_id) REFERENCES inventory_lots(organization_id,id)
);
CREATE TRIGGER catalog_item_history_guard BEFORE UPDATE OR DELETE ON catalog_item_history FOR EACH ROW EXECUTE FUNCTION immutable_inventory_record();
CREATE TRIGGER inventory_lot_history_guard BEFORE UPDATE OR DELETE ON inventory_lot_history FOR EACH ROW EXECUTE FUNCTION immutable_inventory_record();
