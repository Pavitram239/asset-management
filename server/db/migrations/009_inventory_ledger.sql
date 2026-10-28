-- Internal persistence/posting foundation. Public workflow permissions/routes ship
-- with their enforcing slices; existing custom-role grants are not expanded here.
CREATE TABLE catalog_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),
 category_id uuid NOT NULL,unit_id uuid NOT NULL,name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 tracking_mode text NOT NULL CHECK(tracking_mode IN ('individual','reusable_stock','consumable')),
 department_code text NOT NULL,owning_location_id uuid,
 attributes jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(attributes)='object'),category_version bigint NOT NULL,
 requestable boolean NOT NULL DEFAULT true,active boolean NOT NULL DEFAULT true,
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,category_id,category_version) REFERENCES category_revisions(organization_id,category_id,version),
 FOREIGN KEY(organization_id,unit_id) REFERENCES unit_definitions(organization_id,id),
 FOREIGN KEY(organization_id,department_code) REFERENCES organization_departments(organization_id,code),
 FOREIGN KEY(organization_id,owning_location_id) REFERENCES locations(organization_id,id)
);
CREATE TABLE inventory_openings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),item_id uuid NOT NULL,
 location_id uuid NOT NULL,quantity numeric(20,6) NOT NULL CHECK(quantity>0),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 received_on date NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','posted','cancelled')),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,id),FOREIGN KEY(organization_id,item_id) REFERENCES catalog_items(organization_id,id),
 FOREIGN KEY(organization_id,location_id) REFERENCES locations(organization_id,id)
);
-- Review/variance workflow is added in B19; this is its typed posting target only.
CREATE TABLE stock_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),actor_id uuid NOT NULL REFERENCES users(id),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','posted','cancelled')),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(organization_id,id)
);
CREATE TABLE inventory_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),item_id uuid NOT NULL,opening_id uuid NOT NULL,
 quantity_received numeric(20,6) NOT NULL CHECK(quantity_received>0),received_on date NOT NULL,purchased_on date,
 unit_cost numeric(20,6) CHECK(unit_cost>=0),currency text CHECK(currency ~ '^[A-Z]{3}$'),
 cost_basis text NOT NULL DEFAULT 'unknown' CHECK(cost_basis IN ('unknown','declared_opening')),
 expires_on date,support_metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(support_metadata)='object'),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((unit_cost IS NULL AND currency IS NULL AND cost_basis='unknown') OR (unit_cost IS NOT NULL AND currency IS NOT NULL AND cost_basis='declared_opening')),
 UNIQUE(organization_id,id),UNIQUE(organization_id,id,item_id),UNIQUE(organization_id,opening_id),
 FOREIGN KEY(organization_id,item_id) REFERENCES catalog_items(organization_id,id),
 FOREIGN KEY(organization_id,opening_id) REFERENCES inventory_openings(organization_id,id)
);
ALTER TABLE products ADD COLUMN catalog_item_id uuid,ADD COLUMN lot_id uuid,ADD COLUMN asset_tag text,ADD COLUMN serial_number text,
 ADD COLUMN inventory_version bigint NOT NULL DEFAULT 1 CHECK(inventory_version BETWEEN 1 AND 9007199254740991),
 ADD CONSTRAINT product_catalog_lot_pair CHECK((catalog_item_id IS NULL AND lot_id IS NULL AND asset_tag IS NULL) OR (catalog_item_id IS NOT NULL AND lot_id IS NOT NULL AND length(trim(asset_tag)) BETWEEN 1 AND 100)),
 ADD CONSTRAINT product_lot_tenant_fk FOREIGN KEY(organization_id,lot_id,catalog_item_id) REFERENCES inventory_lots(organization_id,id,item_id),
 ADD CONSTRAINT product_inventory_identity UNIQUE(organization_id,id,catalog_item_id,lot_id);
CREATE UNIQUE INDEX product_asset_tag ON products(organization_id,lower(trim(asset_tag))) WHERE asset_tag IS NOT NULL;

CREATE TABLE inventory_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,item_id uuid NOT NULL,lot_id uuid NOT NULL,unit_id uuid,
 kind text NOT NULL CHECK(kind IN ('external','variance','available','inspection','damaged','retired','consumed','lost','disposed','returned_to_supplier')),
 location_id uuid,CHECK(kind IN ('external','variance','consumed','lost','disposed','returned_to_supplier') OR location_id IS NOT NULL),
 UNIQUE(organization_id,id),UNIQUE NULLS NOT DISTINCT(organization_id,item_id,lot_id,unit_id,kind,location_id),
 FOREIGN KEY(organization_id,lot_id,item_id) REFERENCES inventory_lots(organization_id,id,item_id),
 FOREIGN KEY(organization_id,unit_id,item_id,lot_id) REFERENCES products(organization_id,id,catalog_item_id,lot_id),
 FOREIGN KEY(organization_id,location_id) REFERENCES locations(organization_id,id)
);
CREATE TABLE inventory_journals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),
 command_id uuid NOT NULL UNIQUE REFERENCES api_commands(id),actor_id uuid NOT NULL REFERENCES users(id),posting_transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id(),
 action text NOT NULL CHECK(length(action) BETWEEN 1 AND 100),intent_hash text NOT NULL CHECK(intent_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(organization_id,id)
);
CREATE TABLE inventory_journal_sources (
 organization_id uuid NOT NULL,journal_id uuid NOT NULL,opening_id uuid,adjustment_id uuid,
 CHECK(num_nonnulls(opening_id,adjustment_id)=1),PRIMARY KEY(organization_id,journal_id),
 FOREIGN KEY(organization_id,journal_id) REFERENCES inventory_journals(organization_id,id),
 FOREIGN KEY(organization_id,opening_id) REFERENCES inventory_openings(organization_id,id),
 FOREIGN KEY(organization_id,adjustment_id) REFERENCES stock_adjustments(organization_id,id),
 UNIQUE(organization_id,opening_id),UNIQUE(organization_id,adjustment_id)
);
CREATE TABLE inventory_entries (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,organization_id uuid NOT NULL,journal_id uuid NOT NULL,account_id uuid NOT NULL,
 signed_quantity numeric(20,6) NOT NULL CHECK(signed_quantity<>0),
 FOREIGN KEY(organization_id,journal_id) REFERENCES inventory_journals(organization_id,id),
 FOREIGN KEY(organization_id,account_id) REFERENCES inventory_accounts(organization_id,id),UNIQUE(journal_id,account_id)
);
CREATE INDEX inventory_entries_account ON inventory_entries(organization_id,account_id,id);
CREATE TABLE inventory_balances (
 organization_id uuid NOT NULL,account_id uuid NOT NULL,unit_id uuid,bucket text NOT NULL,quantity numeric(20,6) NOT NULL DEFAULT 0,
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(organization_id,account_id),FOREIGN KEY(organization_id,account_id) REFERENCES inventory_accounts(organization_id,id),
 CHECK(bucket IN ('external','variance') OR quantity>=0),CHECK(unit_id IS NULL OR bucket IN ('external','variance') OR quantity IN (0,1))
);
CREATE UNIQUE INDEX inventory_positive_unit ON inventory_balances(organization_id,unit_id) WHERE unit_id IS NOT NULL AND quantity>0 AND bucket NOT IN ('external','variance');
-- Durable domain-event outbox. Recipient-specific encrypted delivery is B18;
-- these rows contain only tenant/journal pointers, never cost or mail content.
CREATE TABLE inventory_journal_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,journal_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),dispatched_at timestamptz,
 FOREIGN KEY(organization_id,journal_id) REFERENCES inventory_journals(organization_id,id),UNIQUE(organization_id,journal_id)
);

CREATE FUNCTION immutable_inventory_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Posted inventory identity/history is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER inventory_account_guard BEFORE UPDATE OR DELETE ON inventory_accounts FOR EACH ROW EXECUTE FUNCTION immutable_inventory_record();
CREATE TRIGGER inventory_journal_guard BEFORE UPDATE OR DELETE ON inventory_journals FOR EACH ROW EXECUTE FUNCTION immutable_inventory_record();
CREATE TRIGGER inventory_source_guard BEFORE UPDATE OR DELETE ON inventory_journal_sources FOR EACH ROW EXECUTE FUNCTION immutable_inventory_record();
CREATE TRIGGER inventory_entry_guard BEFORE UPDATE OR DELETE ON inventory_entries FOR EACH ROW EXECUTE FUNCTION immutable_inventory_record();
CREATE FUNCTION inventory_entry_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM inventory_journals WHERE id=NEW.journal_id AND organization_id=NEW.organization_id AND posting_transaction_id=pg_current_xact_id()) THEN
  RAISE EXCEPTION 'Cannot append to a previously posted journal' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_entry_posting BEFORE INSERT ON inventory_entries FOR EACH ROW EXECUTE FUNCTION inventory_entry_insert_guard();
CREATE TRIGGER inventory_source_posting BEFORE INSERT ON inventory_journal_sources FOR EACH ROW EXECUTE FUNCTION inventory_entry_insert_guard();
CREATE FUNCTION inventory_source_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.state<>'draft' THEN RAISE EXCEPTION 'Posted or cancelled inventory sources are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_opening_history BEFORE UPDATE OR DELETE ON inventory_openings FOR EACH ROW EXECUTE FUNCTION inventory_source_state_guard();
CREATE TRIGGER inventory_adjustment_history BEFORE UPDATE OR DELETE ON stock_adjustments FOR EACH ROW EXECUTE FUNCTION inventory_source_state_guard();
CREATE FUNCTION inventory_lot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE opening inventory_openings%ROWTYPE; scale integer;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.id,NEW.item_id,NEW.opening_id,NEW.quantity_received,NEW.received_on,NEW.purchased_on,NEW.unit_cost,NEW.currency,NEW.cost_basis)
  IS DISTINCT FROM (OLD.organization_id,OLD.id,OLD.item_id,OLD.opening_id,OLD.quantity_received,OLD.received_on,OLD.purchased_on,OLD.unit_cost,OLD.currency,OLD.cost_basis) THEN
  RAISE EXCEPTION 'Acquisition identity and cost basis are immutable' USING ERRCODE='23514';
 END IF;
 SELECT * INTO opening FROM inventory_openings WHERE organization_id=NEW.organization_id AND id=NEW.opening_id;
 SELECT u.quantity_scale INTO scale FROM catalog_items i JOIN unit_definitions u ON u.organization_id=i.organization_id AND u.id=i.unit_id WHERE i.organization_id=NEW.organization_id AND i.id=NEW.item_id;
 IF opening.item_id IS DISTINCT FROM NEW.item_id OR opening.quantity<>NEW.quantity_received OR opening.received_on<>NEW.received_on OR NEW.quantity_received<>trunc(NEW.quantity_received,scale) THEN
  RAISE EXCEPTION 'Acquisition lot must match its typed source and unit precision' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_lot_identity BEFORE INSERT OR UPDATE ON inventory_lots FOR EACH ROW EXECUTE FUNCTION inventory_lot_guard();

CREATE FUNCTION inventory_dimensions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mode text; scale integer;
BEGIN
 SELECT i.tracking_mode,u.quantity_scale INTO mode,scale FROM catalog_items i JOIN unit_definitions u ON u.organization_id=i.organization_id AND u.id=i.unit_id
 WHERE i.organization_id=NEW.organization_id AND i.id=NEW.item_id;
 IF (mode='individual') IS DISTINCT FROM (NEW.unit_id IS NOT NULL) OR (mode='individual' AND scale<>0) THEN
  RAISE EXCEPTION 'Individual identities and whole-unit precision must match item mode' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_dimensions BEFORE INSERT ON inventory_accounts FOR EACH ROW EXECUTE FUNCTION inventory_dimensions_guard();
CREATE FUNCTION inventory_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM inventory_accounts a JOIN inventory_entries e ON e.account_id=a.id WHERE a.organization_id=OLD.organization_id AND a.item_id=OLD.id)
  AND (NEW.tracking_mode<>OLD.tracking_mode OR NEW.unit_id<>OLD.unit_id) THEN
  RAISE EXCEPTION 'Posted item mode and base unit are immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.tracking_mode='individual' AND EXISTS(SELECT 1 FROM unit_definitions WHERE organization_id=NEW.organization_id AND id=NEW.unit_id AND quantity_scale<>0) THEN
  RAISE EXCEPTION 'Individual items require whole-unit precision' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_item_mode BEFORE INSERT OR UPDATE ON catalog_items FOR EACH ROW EXECUTE FUNCTION inventory_item_guard();

CREATE FUNCTION verify_inventory_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org uuid; journal uuid; invalid boolean;
BEGIN
 org=NEW.organization_id;
 IF TG_TABLE_NAME='inventory_journals' THEN journal=NEW.id; ELSE journal=NEW.journal_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM inventory_journal_sources WHERE organization_id=org AND journal_id=journal)
  OR (SELECT count(*) FROM inventory_entries WHERE organization_id=org AND journal_id=journal)<2 THEN
  RAISE EXCEPTION 'Inventory journal needs a typed source and balanced entries' USING ERRCODE='23514';
 END IF;
 SELECT EXISTS(SELECT 1 FROM inventory_entries e JOIN inventory_accounts a ON a.organization_id=e.organization_id AND a.id=e.account_id
  WHERE e.organization_id=org AND e.journal_id=journal GROUP BY a.item_id,a.lot_id,a.unit_id HAVING sum(e.signed_quantity)<>0) INTO invalid;
 IF invalid THEN RAISE EXCEPTION 'Inventory journal does not balance per item/lot/unit' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM inventory_entries e JOIN inventory_accounts a ON a.id=e.account_id AND a.organization_id=e.organization_id
  JOIN catalog_items i ON i.id=a.item_id AND i.organization_id=a.organization_id JOIN unit_definitions u ON u.id=i.unit_id AND u.organization_id=i.organization_id
  WHERE e.organization_id=org AND e.journal_id=journal AND (e.signed_quantity<>trunc(e.signed_quantity,u.quantity_scale) OR (a.unit_id IS NOT NULL AND abs(e.signed_quantity)<>1) OR (i.tracking_mode='individual') IS DISTINCT FROM (a.unit_id IS NOT NULL))) THEN
  RAISE EXCEPTION 'Inventory entry precision or individual quantity is invalid' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM inventory_journals j JOIN api_commands c ON c.id=j.command_id WHERE j.organization_id=org AND j.id=journal
  AND (c.organization_id IS DISTINCT FROM org OR c.actor_id<>j.actor_id)) THEN RAISE EXCEPTION 'Journal command context mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM inventory_journal_sources s JOIN inventory_openings o ON o.organization_id=s.organization_id AND o.id=s.opening_id
   JOIN inventory_entries e ON e.organization_id=s.organization_id AND e.journal_id=s.journal_id
   JOIN inventory_accounts a ON a.organization_id=e.organization_id AND a.id=e.account_id
   JOIN inventory_lots l ON l.organization_id=a.organization_id AND l.id=a.lot_id
   WHERE s.organization_id=org AND s.journal_id=journal AND (a.item_id<>o.item_id OR l.opening_id<>o.id)) THEN
  RAISE EXCEPTION 'Opening journal must use its original item and lot' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM inventory_journal_sources s JOIN inventory_openings o ON o.organization_id=s.organization_id AND o.id=s.opening_id
   WHERE s.organization_id=org AND s.journal_id=journal AND (o.state<>'posted' OR o.quantity<>(SELECT COALESCE(sum(e.signed_quantity),0) FROM inventory_entries e JOIN inventory_accounts a ON a.organization_id=e.organization_id AND a.id=e.account_id
     WHERE e.organization_id=org AND e.journal_id=journal AND a.kind='available') OR EXISTS(SELECT 1 FROM inventory_entries e JOIN inventory_accounts a ON a.organization_id=e.organization_id AND a.id=e.account_id
     WHERE e.organization_id=org AND e.journal_id=journal AND (a.kind NOT IN ('external','available') OR (a.kind='available' AND a.location_id IS DISTINCT FROM o.location_id))))) THEN
  RAISE EXCEPTION 'Opening posting must acquire its declared quantity at the declared location' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM inventory_journal_events WHERE organization_id=org AND journal_id=journal) THEN
  RAISE EXCEPTION 'Inventory posting needs a transactional domain event' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inventory_journal_consistency AFTER INSERT ON inventory_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_inventory_journal();
CREATE CONSTRAINT TRIGGER inventory_entry_consistency AFTER INSERT ON inventory_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_inventory_journal();

CREATE FUNCTION verify_inventory_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org uuid; account uuid; projected inventory_balances%ROWTYPE; definition inventory_accounts%ROWTYPE; total numeric;
BEGIN
 org=COALESCE(NEW.organization_id,OLD.organization_id); account=COALESCE(NEW.account_id,OLD.account_id);
 SELECT * INTO projected FROM inventory_balances WHERE organization_id=org AND account_id=account;
 SELECT * INTO definition FROM inventory_accounts WHERE organization_id=org AND id=account;
 SELECT COALESCE(sum(signed_quantity),0) INTO total FROM inventory_entries WHERE organization_id=org AND account_id=account;
 IF projected.account_id IS NULL OR projected.quantity<>total OR projected.unit_id IS DISTINCT FROM definition.unit_id OR projected.bucket<>definition.kind THEN
  RAISE EXCEPTION 'Inventory balance must reconcile to immutable entries and account identity' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER inventory_balance_projection AFTER INSERT OR UPDATE OR DELETE ON inventory_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_inventory_balance();
CREATE CONSTRAINT TRIGGER inventory_entry_projection AFTER INSERT ON inventory_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_inventory_balance();
