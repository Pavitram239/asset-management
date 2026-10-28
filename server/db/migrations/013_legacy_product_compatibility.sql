-- Keep the current unlinked /products contract until its ledger cutover adapter
-- is implemented. Catalog-linked identities still require inventory workflows.
CREATE OR REPLACE FUNCTION legacy_physical_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.catalog_item_id IS NULL AND OLD.lot_id IS NULL THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Physical deletion requires an inventory lifecycle command' USING ERRCODE='23514';
 END IF;
 IF NEW.catalog_item_id IS NULL AND NEW.lot_id IS NULL THEN
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF OLD.catalog_item_id IS NULL AND OLD.lot_id IS NULL THEN RETURN NEW; END IF;
 END IF;
 IF NEW.catalog_item_id IS NULL OR NEW.lot_id IS NULL THEN
  RAISE EXCEPTION 'Catalog links cannot be removed or partially populated' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.organization_id,NEW.catalog_item_id,NEW.lot_id)
   IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.catalog_item_id,OLD.lot_id) THEN
   RAISE EXCEPTION 'Individual unit/catalog/lot identity is immutable' USING ERRCODE='23514';
  END IF;
  IF (NEW.department_code,NEW.assigned_to_id,NEW.status,NEW.location_id,NEW.deleted_at)
   IS DISTINCT FROM (OLD.department_code,OLD.assigned_to_id,OLD.status,OLD.location_id,OLD.deleted_at)
   AND NOT EXISTS(SELECT 1 FROM inventory_entries e JOIN inventory_accounts a ON a.organization_id=e.organization_id AND a.id=e.account_id
    JOIN inventory_journals j ON j.organization_id=e.organization_id AND j.id=e.journal_id
    WHERE e.organization_id=NEW.organization_id AND a.unit_id=NEW.id AND j.posting_transaction_id=pg_current_xact_id()) THEN
   RAISE EXCEPTION 'Legacy physical update requires a current inventory posting' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
