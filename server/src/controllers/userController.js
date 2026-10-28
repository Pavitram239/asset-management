import { pool, transaction } from "../../db/pool.js";
import { resolveGrants, assetScope, audit } from "../utils/authorization.js";
import { isUUID } from "../utils/accessPolicy.js";
import { BadRequestError, UnauthorizedError } from "../errors/customErrors.js";
import { users } from "../repositories/users.js";
import { products } from "../repositories/products.js";
import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "node:crypto";
import { pickProfileFields } from "../utils/accessPolicy.js";
import { issueAccountToken } from '../services/identity.js';

export const getCurrentUser = async (req, res) => {
  const current = await users.findById(req.user.userId);
  const { role, department, sessionVersion, ...user } = current;
  const { rows: organizations } = await pool.query(
    `SELECT o.id,o.name,m.department_code AS department FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.active AND o.active ORDER BY o.name`,
    [req.user.userId],
  );
  const id = req.get("X-Organization-Id");
  if (id && (!isUUID(id) || !organizations.some((o) => o.id === id)))
    throw new UnauthorizedError("Organization membership required");
  user.grants = id ? await resolveGrants(req.user.userId, id) : [];
  user.department = organizations.find((o) => o.id === id)?.department || null;
  res.json({ user, organizations, activeOrganizationId: id || null });
};
const directoryScope = (actor, alias = "m", permission = "directory.read") => {
  const grants = actor.grants.filter((g) => g.permission === permission);
  if (grants.some((g) => g.scope === "organization"))
    return { sql: "TRUE", values: [] };
  const values = [];
  const parts = [];
  for (const g of grants) {
    if (g.scope === "department") {
      values.push(g.department);
      parts.push(`${alias}.department_code=$${values.length + 1}`);
    }
    if (g.scope === "self") {
      values.push(actor.userId);
      parts.push(`${alias}.user_id=$${values.length + 1}`);
    }
    if (g.scope === 'location') {
      values.push(g.locationId);
      parts.push(`EXISTS(SELECT 1 FROM products p JOIN location_ancestry a ON a.organization_id=p.organization_id AND a.descendant_id=p.location_id
        WHERE p.organization_id=${alias}.organization_id AND p.assigned_to_id=${alias}.user_id AND p.deleted_at IS NULL AND a.ancestor_id=$${values.length+1})`);
    }
  }
  return { sql: parts.join(" OR ") || "FALSE", values };
};
export const getApplicationStats = async (req, res) => {
  const scope = assetScope(req.user, "statistics.read");
  const memberScope = directoryScope(req.user, "m", "statistics.read");
  const [assets, members] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS count FROM products p WHERE ${scope.sql}`,
      scope.values,
    ),
    pool.query(
      `SELECT count(*)::int AS count FROM memberships m JOIN users u ON u.id=m.user_id AND u.active WHERE m.organization_id=$1 AND m.active AND (${memberScope.sql})`,
      [req.user.organizationId, ...memberScope.values],
    ),
  ]);
  res.json({ users: members.rows[0].count, products: assets.rows[0].count });
};
export const getUsersList = async (req, res) => {
  const scope = directoryScope(req.user);
  const { rows } = await pool.query(
    `SELECT u.id AS "_id",u.name,m.department_code AS department FROM memberships m JOIN users u ON u.id=m.user_id AND u.active
    WHERE m.organization_id=$1 AND m.active AND (${scope.sql}) ORDER BY u.name`,
    [req.user.organizationId, ...scope.values],
  );
  res.json({ users: rows });
};
export const getDepartmentList = async (req, res) => {
  const grants = req.user.grants.filter(
    (g) => g.permission === "directory.read",
  );
  const all = grants.some((g) => g.scope === "organization");
  const departments = grants
    .filter((g) => g.scope === "department")
    .map((g) => g.department);
  if (grants.some((g) => g.scope === "self") && req.user.department)
    departments.push(req.user.department);
  const { rows } = await pool.query(
    `SELECT d.code FROM organization_departments d WHERE d.organization_id=$1 AND d.active AND ($2 OR d.code=ANY($3::text[]) OR EXISTS(
      SELECT 1 FROM products p JOIN location_ancestry a ON a.organization_id=p.organization_id AND a.descendant_id=p.location_id
      WHERE p.organization_id=d.organization_id AND p.department_code=d.code AND p.deleted_at IS NULL AND a.ancestor_id=ANY($4::uuid[]))) ORDER BY d.name`,
    [req.user.organizationId, all, departments, grants.filter(g=>g.scope==='location').map(g=>g.locationId)],
  );
  res.json({ departments: rows.map((d) => d.code) });
};

export const updateUser = async (req, res) => {
  const input = pickProfileFields(req.body);
  const previous = await users.findById(req.user.userId);
  if (req.file) {
    if (req.file.size > 500000)
      throw new BadRequestError("Avatar exceeds 0.5 MB");
    const { validateUploadedFiles } =
      await import("../utils/uploadValidation.js");
    await validateUploadedFiles({ avatar: [req.file] });
    const publicId = `avatars/${req.user.userId}/${randomUUID()}`;
    await pool.query(
      "INSERT INTO storage_cleanup(folder,category,object_name) VALUES($1,$2,$3)",
      ["cloudinary", "avatar", publicId],
    );
    const response = await cloudinary.uploader.upload(req.file.path, {
      public_id: publicId,
      overwrite: false,
      resource_type: "image",
    });
    input.avatar = response.secure_url;
    input.avatarPublicId = response.public_id;
  }
  await transaction(async (db) => {
    const { rows: accounts } = await db.query('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', [req.user.userId]);
    await users.update(req.user.userId, input, db);
    if (input.email && input.email.toLowerCase() !== accounts[0].email)
      await issueAccountToken(db, { id: req.user.userId, email: input.email.toLowerCase() }, 'verification');
    if (req.file && previous.avatarPublicId)
      await db.query(
        "INSERT INTO storage_cleanup(folder,category,object_name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        ["cloudinary", "avatar", previous.avatarPublicId],
      );
    await audit(db, req.user, "profile.update", req.user.userId, {
      fields: Object.keys(input),
    });
  });
  res.status(200).json({ msg: "Updated user" });
};
