import { Router } from "express";
import { withTenantClient, tenantTransaction } from "../../db/pool.js";
import { authorize, audit, allows } from "../utils/authorization.js";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../errors/customErrors.js";
import { isUUID } from "../utils/accessPolicy.js";

const router = Router();

// Scope helper for requisitions
const requisitionScope = (actor, alias = "r") => {
  const grants = actor.grants.filter((g) => g.permission === "requisition.read");
  if (grants.some((g) => g.scope === "organization")) {
    return { sql: "TRUE", values: [] };
  }
  const values = [];
  const parts = [];
  for (const g of grants) {
    if (g.scope === "department" && g.department) {
      values.push(g.department);
      parts.push(`${alias}.department_code = $${values.length}`);
    }
    if (g.scope === "self") {
      values.push(actor.userId);
      parts.push(`${alias}.requester_id = $${values.length}`);
    }
  }
  // If user has requisition.approve, they can at least see requisitions in their department/org
  const approveGrants = actor.grants.filter((g) => g.permission === "requisition.approve");
  if (approveGrants.some((g) => g.scope === "organization")) {
    return { sql: "TRUE", values: [] };
  }
  for (const g of approveGrants) {
    if (g.scope === "department" && g.department && !values.includes(g.department)) {
      values.push(g.department);
      parts.push(`${alias}.department_code = $${values.length}`);
    }
  }
  // Storekeeper (fulfill) can see approved/fulfilled requisitions across their scope
  const fulfillGrants = actor.grants.filter((g) => g.permission === "requisition.fulfill");
  if (fulfillGrants.some((g) => g.scope === "organization")) {
    return { sql: "TRUE", values: [] };
  }

  return { sql: parts.join(" OR ") || "FALSE", values };
};

// 1. GET /api/v1/requisitions - List requisitions with filter and search
router.get("/", async (req, res) => {
  authorize(req.user, "requisition.read");
  const { status, urgency, search } = req.query;
  const scope = requisitionScope(req.user, "r");

  const conditions = [scope.sql];
  const params = [...scope.values];

  if (status && status !== "all") {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }

  if (urgency && urgency !== "all") {
    params.push(urgency);
    conditions.push(`r.urgency = $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    conditions.push(`(LOWER(r.item_name) LIKE $${params.length} OR LOWER(r.requisition_number) LIKE $${params.length} OR LOWER(r.purpose) LIKE $${params.length})`);
  }

  const result = await withTenantClient(req.user.schemaName, async (client) => {
    const query = `
      SELECT r.*,
             u.name AS requester_name,
             u.email AS requester_email,
             app.name AS approver_name,
             iss.name AS issued_by_name,
             p.name AS target_asset_name
      FROM asset_requisitions r
      JOIN public.users u ON u.id = r.requester_id
      LEFT JOIN public.users app ON app.id = r.approver_id
      LEFT JOIN public.users iss ON iss.id = r.issued_by_id
      LEFT JOIN products p ON p.id = r.target_asset_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY r.created_at DESC
      LIMIT 100
    `;
    return (await client.query(query, params)).rows;
  });

  res.json({ requisitions: result });
});

// 2. POST /api/v1/requisitions - Submit new requisition
router.post("/", async (req, res) => {
  authorize(req.user, "requisition.create");
  const {
    itemName,
    purpose,
    urgency = "standard",
    neededFrom,
    neededUntil,
    departmentCode,
    targetAssetId,
    catalogItemId,
    quantity = 1,
  } = req.body;

  if (!itemName || typeof itemName !== "string" || !itemName.trim()) {
    throw new BadRequestError("Item name is required");
  }
  if (!purpose || typeof purpose !== "string" || !purpose.trim()) {
    throw new BadRequestError("Purpose of request is required");
  }
  if (!neededUntil) {
    throw new BadRequestError("Needed until return date is required");
  }
  const returnDate = new Date(neededUntil);
  if (isNaN(returnDate.getTime()) || returnDate <= new Date()) {
    throw new BadRequestError("Needed until date must be a valid future date");
  }

  const dept = departmentCode || req.user.department;
  if (!dept) {
    throw new BadRequestError("Department code is required");
  }

  const createdRequisition = await tenantTransaction(req.user.schemaName, async (client) => {
    // Validate department exists
    const deptCheck = await client.query(
      "SELECT code FROM organization_departments WHERE code = $1 AND active = true",
      [dept]
    );
    if (!deptCheck.rowCount) {
      throw new BadRequestError("Invalid or inactive department");
    }

    // Generate requisition number REQ-YYYY-XXXX
    const year = new Date().getFullYear();
    const countRes = await client.query("SELECT count(*)::int AS count FROM asset_requisitions");
    const seq = String(countRes.rows[0].count + 1).padStart(4, "0");
    const reqNumber = `REQ-${year}-${seq}`;

    const insertQuery = `
      INSERT INTO asset_requisitions (
        organization_id, requisition_number, requester_id, department_code,
        target_asset_id, catalog_item_id, item_name, quantity, purpose,
        urgency, needed_from, needed_until, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending_approval')
      RETURNING *
    `;
    const fromDate = neededFrom ? new Date(neededFrom) : new Date();

    const result = (
      await client.query(insertQuery, [
        req.user.organizationId,
        reqNumber,
        req.user.userId,
        dept,
        targetAssetId && isUUID(targetAssetId) ? targetAssetId : null,
        catalogItemId && isUUID(catalogItemId) ? catalogItemId : null,
        itemName.trim(),
        Number(quantity) || 1,
        purpose.trim(),
        ["low", "standard", "urgent"].includes(urgency) ? urgency : "standard",
        fromDate,
        returnDate,
      ])
    ).rows[0];

    await audit(client, req.user, "requisition.create", result.id, {
      requisitionNumber: reqNumber,
      itemName: result.item_name,
      neededUntil: result.needed_until,
    });

    return result;
  });

  res.status(201).json({ requisition: createdRequisition });
});

// 3. PATCH /api/v1/requisitions/:id/approval - Approve or Reject
router.patch("/:id/approval", async (req, res) => {
  if (!isUUID(req.params.id)) throw new BadRequestError("Invalid requisition ID");
  const { decision, remarks } = req.body;
  if (!["approve", "reject"].includes(decision)) {
    throw new BadRequestError("Decision must be either 'approve' or 'reject'");
  }

  const updated = await tenantTransaction(req.user.schemaName, async (client) => {
    const existing = (
      await client.query("SELECT * FROM asset_requisitions WHERE id = $1 FOR UPDATE", [req.params.id])
    ).rows[0];

    if (!existing) throw new NotFoundError("Requisition not found");
    if (existing.status !== "pending_approval") {
      throw new BadRequestError(`Cannot approve/reject a requisition with status '${existing.status}'`);
    }

    // Check authority: Approver must have requisition.approve in their scope
    const resource = { organizationId: req.user.organizationId, department: existing.department_code };
    if (!allows(req.user, "requisition.approve", resource)) {
      throw new UnauthorizedError("You are not authorized to approve requisitions for this department");
    }

    const newStatus = decision === "approve" ? "approved" : "rejected";
    const updateQuery = `
      UPDATE asset_requisitions
      SET status = $2,
          approver_id = $3,
          approved_at = now(),
          approval_remarks = $4,
          rejection_reason = $5,
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `;

    const result = (
      await client.query(updateQuery, [
        req.params.id,
        newStatus,
        req.user.userId,
        decision === "approve" ? remarks || null : null,
        decision === "reject" ? remarks || "Rejected by department head" : null,
      ])
    ).rows[0];

    await audit(client, req.user, `requisition.${decision}`, req.params.id, {
      decision,
      remarks,
      requisitionNumber: existing.requisition_number,
    });

    return result;
  });

  res.json({ requisition: updated });
});

// 4. PATCH /api/v1/requisitions/:id/fulfillment - Storekeeper issues physical asset
router.patch("/:id/fulfillment", async (req, res) => {
  if (!isUUID(req.params.id)) throw new BadRequestError("Invalid requisition ID");
  authorize(req.user, "requisition.fulfill");

  const { issuedAssetId } = req.body;
  if (!issuedAssetId || !isUUID(issuedAssetId)) {
    throw new BadRequestError("A valid asset ID must be scanned or selected for issuance");
  }

  const result = await tenantTransaction(req.user.schemaName, async (client) => {
    const reqRow = (
      await client.query("SELECT * FROM asset_requisitions WHERE id = $1 FOR UPDATE", [req.params.id])
    ).rows[0];

    if (!reqRow) throw new NotFoundError("Requisition not found");
    if (!["approved", "ready_for_pickup"].includes(reqRow.status)) {
      throw new BadRequestError(`Requisition must be approved before issuance (current: '${reqRow.status}')`);
    }

    // Validate the asset to be issued
    const asset = (
      await client.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [issuedAssetId])
    ).rows[0];

    if (!asset) throw new NotFoundError("Scanned asset not found");

    // Transfer asset custody to the requester
    const previousUserId = asset.assigned_to_id;
    const previousDept = asset.department_code;

    await client.query(
      `UPDATE products
       SET assigned_to_id = $2,
           department_code = $3,
           status = 'in_use',
           updated_at = now()
       WHERE id = $1`,
      [issuedAssetId, reqRow.requester_id, reqRow.department_code]
    );

    // Record asset assignment history
    await client.query(
      `INSERT INTO asset_assignment_history (
        asset_id, actor_id, previous_department, department, previous_user_id, user_id, organization_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        issuedAssetId,
        req.user.userId,
        previousDept,
        reqRow.department_code,
        previousUserId,
        reqRow.requester_id,
        req.user.organizationId,
      ]
    );

    // Update requisition to fulfilled
    const updatedReq = (
      await client.query(
        `UPDATE asset_requisitions
         SET status = 'fulfilled',
             issued_asset_id = $2,
             issued_by_id = $3,
             issued_at = now(),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [req.params.id, issuedAssetId, req.user.userId]
      )
    ).rows[0];

    await audit(client, req.user, "requisition.fulfill", req.params.id, {
      issuedAssetId,
      issuedAssetName: asset.name,
      requesterId: reqRow.requester_id,
      requisitionNumber: reqRow.requisition_number,
    });

    return updatedReq;
  });

  res.json({ requisition: result });
});

// 5. PATCH /api/v1/requisitions/:id/return - Return check-in with condition inspection
router.patch("/:id/return", async (req, res) => {
  if (!isUUID(req.params.id)) throw new BadRequestError("Invalid requisition ID");
  authorize(req.user, "requisition.fulfill");

  const { returnCondition = "good", returnNotes } = req.body;
  if (!["good", "minor_wear", "damaged"].includes(returnCondition)) {
    throw new BadRequestError("Return condition must be 'good', 'minor_wear', or 'damaged'");
  }

  const result = await tenantTransaction(req.user.schemaName, async (client) => {
    const reqRow = (
      await client.query("SELECT * FROM asset_requisitions WHERE id = $1 FOR UPDATE", [req.params.id])
    ).rows[0];

    if (!reqRow) throw new NotFoundError("Requisition not found");
    if (reqRow.status !== "fulfilled") {
      throw new BadRequestError(`Cannot return a requisition with status '${reqRow.status}'`);
    }

    const assetId = reqRow.issued_asset_id || reqRow.target_asset_id;
    if (assetId) {
      const isDamaged = returnCondition === "damaged";
      await client.query(
        `UPDATE products
         SET assigned_to_id = NULL,
             status = $2,
             updated_at = now()
         WHERE id = $1`,
        [assetId, isDamaged ? "damaged" : "available"]
      );

      // Record in history that asset is returned to store
      await client.query(
        `INSERT INTO asset_assignment_history (
          asset_id, actor_id, previous_department, department, previous_user_id, user_id, organization_id
        ) VALUES ($1, $2, $3, $3, $4, NULL, $5)`,
        [assetId, req.user.userId, reqRow.department_code, reqRow.requester_id, req.user.organizationId]
      );
    }

    const updated = (
      await client.query(
        `UPDATE asset_requisitions
         SET status = 'returned',
             returned_at = now(),
             return_condition = $2,
             return_notes = $3,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [req.params.id, returnCondition, returnNotes || null]
      )
    ).rows[0];

    await audit(client, req.user, "requisition.return", req.params.id, {
      returnCondition,
      returnNotes,
      requisitionNumber: reqRow.requisition_number,
    });

    return updated;
  });

  res.json({ requisition: result });
});

export default router;
