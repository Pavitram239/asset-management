import { pool, transaction } from "../../db/pool.js";

import { lockActor, validateDestination } from "../utils/assetIntegrity.js";
import { assetScope, audit } from "../utils/authorization.js";
import { NotFoundError } from "../errors/customErrors.js";
import {conflict} from '../utils/commands.js';

const warranty = `CASE WHEN p.warranty_date IS NOT NULL THEN
  CASE WHEN p.warranty_date > (now() AT TIME ZONE 'UTC')::date THEN 'active' ELSE 'expired' END
  ELSE p.warranty_status END`;
const select = `SELECT p.organization_id AS "organizationId", p.id AS "_id", p.location_id AS "locationId",p.catalog_item_id AS "catalogItemId",p.lot_id AS "lotId",p.asset_tag AS "assetTag",COALESCE(p.serial_number,p.attributes->>'serialNumber') AS "serialNumber", p.name, p.company, p.department_code AS department,
  p.creator_id AS creator, p.created_by AS "createdBy", p.assigned_to_id AS "assignedToId",
  COALESCE(u.name, '') AS "assignedTo", p.status, ${warranty} AS warranty,
  to_char(p.purchase_date, 'YYYY-MM-DD') AS "purchaseDate",
  to_char(p.warranty_date, 'YYYY-MM-DD') AS "warrantyDate",
  p.product_img AS "productImg", p.invoice, p.qr, p.attributes,
  p.created_at AS "createdAt", p.updated_at AS "updatedAt"
  FROM products p LEFT JOIN users u ON p.assigned_to_id = u.id`;
const dto = ({ attributes, ...row }) => ({ ...attributes, ...row });
const attributes = ["customerCare", "power", "capacity", "serialNumber"];

export const productFilter = ({
  department,
  search,
  status,
  warrantyStatus,
  actor,
  permission = "asset.read",
} = {}) => {
  const scope = assetScope(actor, permission);
  const clauses = [scope.sql],
    values = [...scope.values];
  const add = (expression, value) => {
    values.push(value);
    clauses.push(expression.replace("?", `$${values.length}`));
  };
  if (department) add("p.department_code = ?", department);
  // strpos makes %, _, backslashes and quotes literal search characters.
  if (search) add("strpos(lower(p.name), lower(?)) > 0", search);
  if (status) add("p.status = ?", status);
  if (warrantyStatus) add(`${warranty} = ?`, warrantyStatus);
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
};

export const products = {
  async findById(id, actor, permission = "asset.read", db = pool) {
    const scope = assetScope(actor, permission);
    const { rows } = await db.query(
      `${select} WHERE ${scope.sql} AND p.id=$${scope.values.length + 1}`,
      [...scope.values, id],
    );
    return rows[0] ? dto(rows[0]) : null;
  },
  async list(filters, { limit, skip }, sort) {
    const { where, values } = productFilter(filters);
    const sorts = {
      newest: "p.created_at DESC",
      oldest: "p.created_at ASC",
      "a-z": "p.name ASC",
      "z-a": "p.name DESC",
    };
    const order = Object.hasOwn(sorts, sort) ? sorts[sort] : sorts.newest;
    const { rows } = await pool.query(
      `${select} ${where} ORDER BY ${order}, p.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, skip],
    );
    return rows.map(dto);
  },
  async count(filters) {
    const { where, values } = productFilter(filters);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS count FROM products p ${where}`,
      values,
    );
    return rows[0].count;
  },
  async create(input, actor) {
    return transaction(async (db) => {
      actor = await lockActor(db, actor, "asset.create");
      await validateDestination(input, actor, "asset.create", undefined, db);
      await db.query(
        `INSERT INTO products (id,organization_id,name,company,department_code,creator_id,assigned_to_id,
        created_by,status,purchase_date,warranty_date,warranty_status,product_img,invoice,qr,attributes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          input._id,
          actor.organizationId,
          input.name,
          input.company,
          input.department,
          actor.userId,
          input.assignedToId || null,
          actor.name,
          input.status || "In department",
          input.purchaseDate || null,
          input.warrantyDate || null,
          input.warranty || "expired",
          input.productImg || null,
          input.invoice || null,
          input.qr,
          JSON.stringify(
            Object.fromEntries(
              attributes.filter((k) => k in input).map((k) => [k, input[k]]),
            ),
          ),
        ],
      );
      await db.query(
        `INSERT INTO asset_assignment_history(organization_id,asset_id,actor_id,department,user_id) VALUES($1,$2,$3,$4,$5)`,
        [
          actor.organizationId,
          input._id,
          actor.userId,
          input.department,
          input.assignedToId || null,
        ],
      );
      await audit(db, actor, "asset.create", input._id);
      return this.findById(input._id, actor, "asset.create", db);
    });
  },
  async update(id, input, actor) {
    return transaction(async (db) => {
      actor = await lockActor(db, actor, "asset.update");
      const scope = assetScope(actor, "asset.update");
      const locked = await db.query(
        `SELECT p.id,p.catalog_item_id FROM products p WHERE ${scope.sql} AND p.id=$${scope.values.length + 1} FOR UPDATE`,
        [...scope.values, id],
      );
      if (!locked.rowCount) throw new NotFoundError("Asset not found");
      if(locked.rows[0].catalog_item_id)throw conflict('WORKFLOW_REQUIRED','Use the inventory workflow for catalog-linked units');
      const previous = await this.findById(id, actor, "asset.update", db);
      if (
        input.department &&
        input.department !== previous.department &&
        !("assignedToId" in input)
      )
        input.assignedToId = "";
      await validateDestination(input, actor, "asset.update", previous, db);
      const fields = {
        name: "name",
        company: "company",
        department: "department_code",
        assignedToId: "assigned_to_id",
        status: "status",
        purchaseDate: "purchase_date",
        warrantyDate: "warranty_date",
        warranty: "warranty_status",
        productImg: "product_img",
        invoice: "invoice",
      };
      const values = [],
        setters = [];
      for (const [key, column] of Object.entries(fields))
        if (key in input) {
          values.push(input[key] === "" ? null : input[key]);
          setters.push(`${column}=$${values.length}`);
        }
      const changes = Object.fromEntries(
        attributes.filter((k) => k in input).map((k) => [k, input[k]]),
      );
      if (Object.keys(changes).length) {
        values.push(JSON.stringify(changes));
        setters.push(`attributes=attributes || $${values.length}::jsonb`);
      }
      if (setters.length)
        await db.query(
          `UPDATE products SET ${setters.join(",")} WHERE id=$${values.length + 1}`,
          [...values, id],
        );
      const department = input.department || previous.department;
      const assigned =
        "assignedToId" in input
          ? input.assignedToId || null
          : previous.assignedToId;
      if (
        department !== previous.department ||
        assigned !== previous.assignedToId
      )
        await db.query(
          `INSERT INTO asset_assignment_history
        (organization_id,asset_id,actor_id,previous_department,department,previous_user_id,user_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            actor.organizationId,
            id,
            actor.userId,
            previous.department,
            department,
            previous.assignedToId,
            assigned,
          ],
        );
      for (const [field, category] of [
        ["productImg", "images"],
        ["invoice", "invoices"],
      ])
        if (input[field] && previous[field])
          await queueCleanup(db, previous[field], category, id);
      await audit(db, actor, "asset.update", id, {
        fields: Object.keys(input),
      });
      // Permission may no longer cover the destination after a transfer; never return an unrestricted row.
      return this.findById(id, actor, "asset.update", db);
    });
  },
  async remove(id, actor) {
    return transaction(async (db) => {
      actor = await lockActor(db, actor, "asset.delete");
      const scope = assetScope(actor, "asset.delete");
      const locked = await db.query(
        `SELECT p.id,p.catalog_item_id FROM products p WHERE ${scope.sql} AND p.id=$${scope.values.length + 1} FOR UPDATE`,
        [...scope.values, id],
      );
      if (!locked.rowCount) throw new NotFoundError("Asset not found");
      if(locked.rows[0].catalog_item_id)throw conflict('WORKFLOW_REQUIRED','Use the inventory workflow for catalog-linked units');
      const previous = await this.findById(id, actor, "asset.delete", db);
      await db.query("UPDATE products SET deleted_at=now() WHERE id=$1", [id]);
      await audit(db, actor, "asset.delete", id);
      // Soft deletion retains files and history for operator-defined retention.
      return previous;
    });
  },
  async overview(actor) {
    const { where, values } = productFilter({ actor });
    const [summary, groups, recent] = await Promise.all([
      pool.query(
        `SELECT count(*)::int AS total,
        count(*) FILTER (WHERE p.assigned_to_id IS NOT NULL)::int AS assigned,
        count(*) FILTER (WHERE p.status = 'Out of campus')::int AS outside,
        count(*) FILTER (WHERE ${warranty} = 'expired')::int AS expired FROM products p ${where}`,
        values,
      ),
      pool.query(
        `SELECT p.department_code AS "_id", count(*)::int AS count FROM products p ${where} GROUP BY p.department_code ORDER BY count DESC, p.department_code`,
        values,
      ),
      pool.query(
        `${select} ${where} ORDER BY p.updated_at DESC, p.id LIMIT 5`,
        values,
      ),
    ]);
    return {
      ...summary.rows[0],
      departments: groups.rows,
      recent: recent.rows.map(dto),
    };
  },
};

async function queueCleanup(db, value, category, id) {
  // New files are stored as opaque object keys; legacy URLs retain their historical location.
  const object = value.startsWith("assets/")
    ? value.split("/").slice(2).join("/")
    : id;
  await db.query(
    "INSERT INTO storage_cleanup(folder,category,object_name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    ["assets", category, object],
  );
}
