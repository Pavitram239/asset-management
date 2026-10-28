-- Explicit technical origin: imports must not invent a human posting/receipt.
ALTER TABLE api_commands ALTER COLUMN actor_id DROP NOT NULL,
 ADD COLUMN origin text NOT NULL DEFAULT 'employee' CHECK(origin IN ('employee','migration')),
 ADD CONSTRAINT command_actor_origin CHECK((origin='employee' AND actor_id IS NOT NULL) OR
   (origin='migration' AND actor_id IS NULL AND organization_id IS NOT NULL AND operation_id='legacyImportBaseline'));
CREATE FUNCTION immutable_command_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.origin<>OLD.origin THEN RAISE EXCEPTION 'Command origin is immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER command_origin_guard BEFORE UPDATE ON api_commands FOR EACH ROW EXECUTE FUNCTION immutable_command_origin();
ALTER TABLE inventory_journals ALTER COLUMN actor_id DROP NOT NULL,
 ADD COLUMN origin text NOT NULL DEFAULT 'employee' CHECK(origin IN ('employee','migration')),
 ADD CONSTRAINT journal_actor_origin CHECK((origin='employee' AND actor_id IS NOT NULL) OR (origin='migration' AND actor_id IS NULL AND action='legacy_import'));
ALTER TABLE category_revisions ALTER COLUMN actor_id DROP NOT NULL,ADD COLUMN origin text NOT NULL DEFAULT 'employee' CHECK(origin IN ('employee','migration')),
 ADD CONSTRAINT category_revision_actor_origin CHECK((origin='employee' AND actor_id IS NOT NULL) OR (origin='migration' AND actor_id IS NULL));
ALTER TABLE catalog_item_history ALTER COLUMN actor_id DROP NOT NULL,ADD COLUMN origin text NOT NULL DEFAULT 'employee' CHECK(origin IN ('employee','migration')),
 ADD CONSTRAINT item_history_actor_origin CHECK((origin='employee' AND actor_id IS NOT NULL) OR (origin='migration' AND actor_id IS NULL));
ALTER TABLE inventory_lot_history ALTER COLUMN actor_id DROP NOT NULL,ADD COLUMN origin text NOT NULL DEFAULT 'employee' CHECK(origin IN ('employee','migration')),
 ADD CONSTRAINT lot_history_actor_origin CHECK((origin='employee' AND actor_id IS NOT NULL) OR (origin='migration' AND actor_id IS NULL));

ALTER TABLE catalog_items ADD COLUMN legacy_product_id uuid,
 ADD CONSTRAINT catalog_legacy_product_fk FOREIGN KEY(organization_id,legacy_product_id) REFERENCES products(organization_id,id),
 ADD CONSTRAINT catalog_legacy_product_unique UNIQUE(organization_id,legacy_product_id);
ALTER TABLE catalog_items DROP CONSTRAINT catalog_items_name_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_name_check CHECK(length(trim(name)) BETWEEN 1 AND 200 OR (legacy_product_id IS NOT NULL AND length(trim(name)) BETWEEN 1 AND 500));
CREATE TABLE legacy_inventory_config (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),category_id uuid NOT NULL,unit_id uuid NOT NULL,
 FOREIGN KEY(organization_id,category_id) REFERENCES category_definitions(organization_id,id),
 FOREIGN KEY(organization_id,unit_id) REFERENCES unit_definitions(organization_id,id)
);
CREATE TABLE legacy_inventory_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,product_id uuid NOT NULL,item_id uuid NOT NULL,
 command_id uuid NOT NULL UNIQUE REFERENCES api_commands(id),original_assignee_id uuid,was_deleted boolean NOT NULL,original_status text NOT NULL,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,id),UNIQUE(organization_id,id,item_id),UNIQUE(organization_id,product_id),
 FOREIGN KEY(organization_id,product_id) REFERENCES products(organization_id,id),
 FOREIGN KEY(organization_id,item_id) REFERENCES catalog_items(organization_id,id),
 FOREIGN KEY(organization_id,original_assignee_id) REFERENCES memberships(organization_id,user_id)
);
CREATE TRIGGER legacy_inventory_config_history BEFORE UPDATE OR DELETE ON legacy_inventory_config FOR EACH ROW EXECUTE FUNCTION immutable_inventory_record();
CREATE TRIGGER legacy_inventory_import_history BEFORE UPDATE OR DELETE ON legacy_inventory_imports FOR EACH ROW EXECUTE FUNCTION immutable_inventory_record();
ALTER TABLE inventory_lots ALTER COLUMN opening_id DROP NOT NULL,ALTER COLUMN received_on DROP NOT NULL,ADD COLUMN legacy_import_id uuid,
 ADD CONSTRAINT lot_legacy_source_fk FOREIGN KEY(organization_id,legacy_import_id,item_id) REFERENCES legacy_inventory_imports(organization_id,id,item_id),
 ADD CONSTRAINT lot_source_choice CHECK(num_nonnulls(opening_id,legacy_import_id)=1),
 ADD CONSTRAINT lot_receipt_evidence CHECK((opening_id IS NOT NULL AND received_on IS NOT NULL) OR (legacy_import_id IS NOT NULL AND received_on IS NULL)),
 ADD CONSTRAINT lot_legacy_source_unique UNIQUE(organization_id,legacy_import_id);
CREATE TABLE custody_obligations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,legacy_import_id uuid NOT NULL,item_id uuid NOT NULL,lot_id uuid NOT NULL,unit_id uuid NOT NULL,
 recipient_user_id uuid NOT NULL,quantity numeric(20,6) NOT NULL CHECK(quantity=1),confirmation_state text NOT NULL DEFAULT 'legacy_imported' CHECK(confirmation_state='legacy_imported'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(organization_id,id),UNIQUE(organization_id,legacy_import_id),
 FOREIGN KEY(organization_id,legacy_import_id,item_id) REFERENCES legacy_inventory_imports(organization_id,id,item_id),
 FOREIGN KEY(organization_id,lot_id,item_id) REFERENCES inventory_lots(organization_id,id,item_id),
 FOREIGN KEY(organization_id,unit_id,item_id,lot_id) REFERENCES products(organization_id,id,catalog_item_id,lot_id),
 FOREIGN KEY(organization_id,recipient_user_id) REFERENCES memberships(organization_id,user_id)
);
CREATE TRIGGER custody_obligation_history BEFORE UPDATE OR DELETE ON custody_obligations FOR EACH ROW EXECUTE FUNCTION immutable_inventory_record();
ALTER TABLE inventory_accounts ADD COLUMN custody_obligation_id uuid,ADD COLUMN legacy_unknown_location boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT inventory_custody_tenant_fk FOREIGN KEY(organization_id,custody_obligation_id) REFERENCES custody_obligations(organization_id,id),
 ADD CONSTRAINT inventory_custody_reference CHECK((kind='custody')=(custody_obligation_id IS NOT NULL));
ALTER TABLE inventory_accounts DROP CONSTRAINT inventory_accounts_kind_check,DROP CONSTRAINT inventory_accounts_check;
ALTER TABLE inventory_accounts ADD CONSTRAINT inventory_accounts_kind_check CHECK(kind IN ('external','variance','available','custody','legacy_unreconciled','inspection','damaged','retired','consumed','lost','disposed','returned_to_supplier')),
 ADD CONSTRAINT inventory_location_evidence CHECK(location_id IS NOT NULL OR kind IN ('external','variance','consumed','lost','disposed','returned_to_supplier') OR (legacy_unknown_location AND kind IN ('custody','legacy_unreconciled')));
-- Replace the old account-key constraint with the additional typed custody dimension.
DO $$ DECLARE name text; BEGIN
 SELECT conname INTO name FROM pg_constraint WHERE conrelid='inventory_accounts'::regclass AND contype='u' AND pg_get_constraintdef(oid) LIKE '%item_id%';
 EXECUTE format('ALTER TABLE inventory_accounts DROP CONSTRAINT %I',name);
END $$;
ALTER TABLE inventory_accounts ADD CONSTRAINT inventory_account_dimensions UNIQUE NULLS NOT DISTINCT(organization_id,item_id,lot_id,unit_id,kind,location_id,custody_obligation_id);
ALTER TABLE inventory_journal_sources ADD COLUMN legacy_import_id uuid,
 ADD CONSTRAINT journal_legacy_source_fk FOREIGN KEY(organization_id,legacy_import_id) REFERENCES legacy_inventory_imports(organization_id,id),
 ADD CONSTRAINT journal_legacy_source_unique UNIQUE(organization_id,legacy_import_id);
ALTER TABLE inventory_journal_sources DROP CONSTRAINT inventory_journal_sources_check;
ALTER TABLE inventory_journal_sources ADD CONSTRAINT journal_one_source CHECK(num_nonnulls(opening_id,adjustment_id,legacy_import_id)=1);
ALTER TABLE asset_assignment_history ADD COLUMN previous_location_id uuid,ADD COLUMN location_id uuid,ADD COLUMN movement_journal_id uuid,
 ADD CONSTRAINT history_previous_location_fk FOREIGN KEY(organization_id,previous_location_id) REFERENCES locations(organization_id,id),
 ADD CONSTRAINT history_location_fk FOREIGN KEY(organization_id,location_id) REFERENCES locations(organization_id,id),
 ADD CONSTRAINT history_movement_journal_fk FOREIGN KEY(organization_id,movement_journal_id) REFERENCES inventory_journals(organization_id,id);

CREATE OR REPLACE FUNCTION inventory_lot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE opening inventory_openings%ROWTYPE; scale integer;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.id,NEW.item_id,NEW.opening_id,NEW.legacy_import_id,NEW.quantity_received,NEW.received_on,NEW.purchased_on,NEW.unit_cost,NEW.currency,NEW.cost_basis)
  IS DISTINCT FROM (OLD.organization_id,OLD.id,OLD.item_id,OLD.opening_id,OLD.legacy_import_id,OLD.quantity_received,OLD.received_on,OLD.purchased_on,OLD.unit_cost,OLD.currency,OLD.cost_basis) THEN
  RAISE EXCEPTION 'Acquisition identity and cost basis are immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.legacy_import_id IS NOT NULL THEN
  IF NEW.opening_id IS NOT NULL OR NEW.quantity_received<>1 OR NEW.received_on IS NOT NULL OR NEW.unit_cost IS NOT NULL THEN
   RAISE EXCEPTION 'Legacy import must retain unknown receipt and cost' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT * INTO opening FROM inventory_openings WHERE organization_id=NEW.organization_id AND id=NEW.opening_id;
  SELECT u.quantity_scale INTO scale FROM catalog_items i JOIN unit_definitions u ON u.organization_id=i.organization_id AND u.id=i.unit_id WHERE i.organization_id=NEW.organization_id AND i.id=NEW.item_id;
  IF opening.item_id IS DISTINCT FROM NEW.item_id OR opening.quantity<>NEW.quantity_received OR opening.received_on<>NEW.received_on OR NEW.quantity_received<>trunc(NEW.quantity_received,scale) THEN
   RAISE EXCEPTION 'Acquisition lot must match its typed source and unit precision' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION inventory_dimensions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mode text; scale integer; imported uuid; original_unit uuid; obligation custody_obligations%ROWTYPE;
BEGIN
 SELECT i.tracking_mode,u.quantity_scale,l.legacy_import_id,li.product_id INTO mode,scale,imported,original_unit
 FROM catalog_items i JOIN unit_definitions u ON u.organization_id=i.organization_id AND u.id=i.unit_id
 JOIN inventory_lots l ON l.organization_id=i.organization_id AND l.item_id=i.id AND l.id=NEW.lot_id
 LEFT JOIN legacy_inventory_imports li ON li.organization_id=l.organization_id AND li.id=l.legacy_import_id
 WHERE i.organization_id=NEW.organization_id AND i.id=NEW.item_id;
 IF (mode='individual') IS DISTINCT FROM (NEW.unit_id IS NOT NULL) OR (mode='individual' AND scale<>0) OR (imported IS NOT NULL AND NEW.unit_id IS DISTINCT FROM original_unit) THEN
  RAISE EXCEPTION 'Individual identities and whole-unit precision must match item/source' USING ERRCODE='23514';
 END IF;
 IF NEW.legacy_unknown_location AND (imported IS NULL OR NEW.location_id IS NOT NULL OR NEW.kind NOT IN ('custody','legacy_unreconciled')) THEN
  RAISE EXCEPTION 'Unknown placement requires an explicit legacy baseline' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='legacy_unreconciled' AND imported IS NULL THEN RAISE EXCEPTION 'Unreconciled legacy position requires an import source' USING ERRCODE='23514'; END IF;
 IF NEW.custody_obligation_id IS NOT NULL THEN
  SELECT * INTO obligation FROM custody_obligations WHERE organization_id=NEW.organization_id AND id=NEW.custody_obligation_id;
  IF obligation.item_id IS DISTINCT FROM NEW.item_id OR obligation.lot_id IS DISTINCT FROM NEW.lot_id OR obligation.unit_id IS DISTINCT FROM NEW.unit_id OR obligation.legacy_import_id IS DISTINCT FROM imported THEN
   RAISE EXCEPTION 'Custody account must match its original obligation and allocation' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION legacy_physical_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Physical deletion requires an inventory lifecycle command' USING ERRCODE='23514'; END IF;
 IF NEW.catalog_item_id IS NULL OR NEW.lot_id IS NULL THEN RAISE EXCEPTION 'Legacy physical creation requires the inventory workflow' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.catalog_item_id IS NOT NULL AND (NEW.id,NEW.organization_id,NEW.catalog_item_id,NEW.lot_id) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.catalog_item_id,OLD.lot_id) THEN
   RAISE EXCEPTION 'Individual unit/catalog/lot identity is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.department_code,NEW.assigned_to_id,NEW.status,NEW.location_id,NEW.deleted_at) IS DISTINCT FROM (OLD.department_code,OLD.assigned_to_id,OLD.status,OLD.location_id,OLD.deleted_at)
   AND NOT EXISTS(SELECT 1 FROM inventory_entries e JOIN inventory_accounts a ON a.organization_id=e.organization_id AND a.id=e.account_id
    JOIN inventory_journals j ON j.organization_id=e.organization_id AND j.id=e.journal_id
    WHERE e.organization_id=NEW.organization_id AND a.unit_id=NEW.id AND j.posting_transaction_id=pg_current_xact_id()) THEN
   RAISE EXCEPTION 'Legacy physical update requires a current inventory posting' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- Technical relinking must retain the original update timestamp as well as IDs.
DROP TRIGGER products_updated ON products;
DO $$
DECLARE company uuid; p products%ROWTYPE; category uuid; measure uuid; item uuid; imported uuid; lot uuid; command uuid; journal uuid;
 source_account uuid; target_account uuid; obligation uuid; tag text; suffix integer; definitions jsonb; attrs jsonb; support jsonb; hash text;
BEGIN
 definitions='[{"key":"manufacturer","label":"Manufacturer / company","type":"text","required":false},{"key":"customer_care","label":"Original support details","type":"text","required":false},{"key":"power","label":"Power","type":"text","required":false},{"key":"capacity","label":"Capacity","type":"text","required":false},{"key":"serial_number","label":"Original serial number","type":"text","required":false}]'::jsonb;
 FOR company IN SELECT DISTINCT organization_id FROM products WHERE catalog_item_id IS NULL ORDER BY organization_id LOOP
  PERFORM 1 FROM organizations WHERE id=company FOR UPDATE;
  category=gen_random_uuid();measure=gen_random_uuid();
  INSERT INTO category_definitions(id,organization_id,name,fields) VALUES(category,company,'Imported assets (legacy)',definitions);
  INSERT INTO category_revisions(organization_id,category_id,version,fields,actor_id,origin) VALUES(company,category,1,definitions,NULL,'migration');
  INSERT INTO unit_definitions(id,organization_id,code,name,quantity_scale) VALUES(measure,company,'LEGACY_'||upper(substr(replace(measure::text,'-',''),1,12)),'Imported individual unit',0);
  INSERT INTO legacy_inventory_config(organization_id,category_id,unit_id) VALUES(company,category,measure);
  FOR p IN SELECT * FROM products WHERE organization_id=company AND catalog_item_id IS NULL ORDER BY id LOOP
   item=gen_random_uuid();imported=gen_random_uuid();lot=gen_random_uuid();command=gen_random_uuid();journal=gen_random_uuid();source_account=gen_random_uuid();target_account=gen_random_uuid();obligation=NULL;
   hash=encode(sha256(convert_to('legacy-inventory-baseline:'||p.id::text,'UTF8')),'hex');
   INSERT INTO api_commands(id,actor_id,organization_id,operation_id,idempotency_key,request_hash,origin)
    VALUES(command,NULL,company,'legacyImportBaseline','legacy-import-'||p.id::text,hash,'migration');
   attrs=jsonb_build_object('manufacturer',p.company);
   IF jsonb_typeof(p.attributes->'customerCare')='string' THEN attrs=attrs||jsonb_build_object('customer_care',p.attributes->>'customerCare'); END IF;
   IF jsonb_typeof(p.attributes->'power')='string' THEN attrs=attrs||jsonb_build_object('power',p.attributes->>'power'); END IF;
   IF jsonb_typeof(p.attributes->'capacity')='string' THEN attrs=attrs||jsonb_build_object('capacity',p.attributes->>'capacity'); END IF;
   IF jsonb_typeof(p.attributes->'serialNumber')='string' THEN attrs=attrs||jsonb_build_object('serial_number',p.attributes->>'serialNumber'); END IF;
   INSERT INTO catalog_items(id,organization_id,category_id,category_version,unit_id,name,tracking_mode,department_code,owning_location_id,attributes,requestable,active,legacy_product_id)
    VALUES(item,company,category,1,measure,p.name,'individual',p.department_code,p.location_id,attrs,false,p.deleted_at IS NULL,p.id);
   INSERT INTO legacy_inventory_imports(id,organization_id,product_id,item_id,command_id,original_assignee_id,was_deleted,original_status,snapshot)
    VALUES(imported,company,p.id,item,command,p.assigned_to_id,p.deleted_at IS NOT NULL,p.status,to_jsonb(p));
   support='{}'::jsonb;
   IF p.warranty_date IS NOT NULL THEN support=support||jsonb_build_object('expiresOn',to_char(p.warranty_date,'YYYY-MM-DD')); END IF;
   IF jsonb_typeof(p.attributes->'customerCare')='string' THEN support=support||jsonb_build_object('supportDetails',p.attributes->>'customerCare'); END IF;
   INSERT INTO inventory_lots(id,organization_id,item_id,legacy_import_id,quantity_received,received_on,purchased_on,expires_on,support_metadata)
    VALUES(lot,company,item,imported,1,NULL,p.purchase_date,p.warranty_date,support);
   tag='LEGACY-'||p.id::text;suffix=0;
   WHILE EXISTS(SELECT 1 FROM products WHERE organization_id=company AND lower(trim(asset_tag))=lower(tag)) LOOP suffix=suffix+1;tag='LEGACY-'||p.id::text||'-'||suffix::text;END LOOP;
   UPDATE products SET catalog_item_id=item,lot_id=lot,asset_tag=tag,serial_number=CASE WHEN jsonb_typeof(p.attributes->'serialNumber')='string' THEN p.attributes->>'serialNumber' ELSE serial_number END WHERE id=p.id;
   IF p.assigned_to_id IS NOT NULL THEN
    obligation=gen_random_uuid();
    INSERT INTO custody_obligations(id,organization_id,legacy_import_id,item_id,lot_id,unit_id,recipient_user_id,quantity)
     VALUES(obligation,company,imported,item,lot,p.id,p.assigned_to_id,1);
   END IF;
   INSERT INTO inventory_accounts(id,organization_id,item_id,lot_id,unit_id,kind) VALUES(source_account,company,item,lot,p.id,'external');
   INSERT INTO inventory_accounts(id,organization_id,item_id,lot_id,unit_id,kind,location_id,custody_obligation_id,legacy_unknown_location)
    VALUES(target_account,company,item,lot,p.id,CASE WHEN obligation IS NULL THEN 'legacy_unreconciled' ELSE 'custody' END,p.location_id,obligation,p.location_id IS NULL);
   INSERT INTO inventory_journals(id,organization_id,command_id,actor_id,action,intent_hash,origin) VALUES(journal,company,command,NULL,'legacy_import',hash,'migration');
   INSERT INTO inventory_journal_sources(organization_id,journal_id,legacy_import_id) VALUES(company,journal,imported);
   INSERT INTO inventory_entries(organization_id,journal_id,account_id,signed_quantity) VALUES(company,journal,source_account,-1),(company,journal,target_account,1);
   INSERT INTO inventory_balances(organization_id,account_id,unit_id,bucket,quantity) VALUES(company,source_account,p.id,'external',-1),
    (company,target_account,p.id,CASE WHEN obligation IS NULL THEN 'legacy_unreconciled' ELSE 'custody' END,1);
   INSERT INTO inventory_journal_events(organization_id,journal_id) VALUES(company,journal);
   INSERT INTO catalog_item_history(organization_id,item_id,version,actor_id,snapshot,origin) SELECT company,item,1,NULL,to_jsonb(i),'migration' FROM catalog_items i WHERE i.id=item;
   INSERT INTO inventory_lot_history(organization_id,lot_id,version,actor_id,reason,support_snapshot,origin) VALUES(company,lot,1,NULL,'Legacy baseline; receipt/cost/acknowledgement not invented',support,'migration');
   INSERT INTO audit_events(organization_id,actor_id,action,target,metadata) VALUES(company,NULL,'migration.legacy_inventory',p.id::text,jsonb_build_object('importId',imported,'journalId',journal,'confirmationState',CASE WHEN obligation IS NULL THEN NULL ELSE 'legacy_imported' END));
   UPDATE api_commands SET resource_type='legacy_import',resource_id=imported,result=jsonb_build_object('data',jsonb_build_object('id',imported,'status','legacy_imported')),committed_at=clock_timestamp() WHERE id=command;
  END LOOP;
 END LOOP;
END $$;
CREATE TRIGGER products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_inventory_boundary BEFORE INSERT OR UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION legacy_physical_write_guard();

-- This gate prevents direct legacy physical writes. Deployment still must stop
-- older processes; runtime read policy is owned by the matching application.
