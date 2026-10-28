import { randomUUID } from "node:crypto";
import qrcode from "qrcode";
import { pool } from "../../db/pool.js";
import { products } from "../repositories/products.js";
import { saveFile } from "../utils/fileOps.js";
import { assetInput, pagination } from "../utils/accessPolicy.js";
import { PRODUCT_STATUS, WARRANTY_STATUS } from "../utils/constants.js";
import { BadRequestError } from "../errors/customErrors.js";
import { authorize, allows, audit } from "../utils/authorization.js";
import { readStoredFile } from "../utils/firebase/firebaseFileOps.js";
import { validateUploadedFiles } from "../utils/uploadValidation.js";

import { validateDestination } from "../utils/assetIntegrity.js";
import {conflict} from '../utils/commands.js';

export const presentAsset = (asset, actor) => {
  if (!asset) return null;
  if (!allows(actor, "asset.read", asset)) return { _id: asset._id };
  const { invoice, productImg, ...rest } = asset;
  // Do not disclose persistent storage URLs. Browser downloads still require current membership.
  const base = `/api/v1/products/${asset._id}/files`;
  const query = `?organizationId=${encodeURIComponent(actor.organizationId)}`;
  const files = allows(actor, "asset.file.read", asset);
  return {
    ...rest,
    invoice: files && invoice ? `${base}/invoice${query}` : null,
    productImg: files && productImg ? `${base}/image${query}` : null,
    capabilities: {
      update: !asset.catalogItemId&&allows(actor, "asset.update", asset),
      delete: !asset.catalogItemId&&allows(actor, "asset.delete", asset),
    },
  };
};
export const getAllProducts = async (req, res) => {
  const { search, productStatus, productWarranty, sort } = req.query;
  if (
    search !== undefined &&
    (typeof search !== "string" || search.length > 200)
  )
    throw new BadRequestError("Invalid search");
  if (
    productStatus &&
    productStatus !== "all" &&
    !Object.values(PRODUCT_STATUS).includes(productStatus)
  )
    throw new BadRequestError("Invalid status filter");
  if (
    productWarranty &&
    productWarranty !== "all" &&
    !Object.values(WARRANTY_STATUS).includes(productWarranty)
  )
    throw new BadRequestError("Invalid warranty filter");
  const filters = {
    actor: req.user,
    search,
    status: productStatus === "all" ? undefined : productStatus,
    warrantyStatus: productWarranty === "all" ? undefined : productWarranty,
  };
  const paging = pagination(req.query);
  const [items, totalProducts] = await Promise.all([
    products.list(filters, paging, sort),
    products.count(filters),
  ]);
  res.json({
    products: items.map((x) => presentAsset(x, req.user)),
    totalProducts,
    numOfPages: Math.ceil(totalProducts / paging.limit),
    currentPage: paging.page,
  });
};
const uploadFiles = async (req, id) => {
  await validateUploadedFiles(req.files);
  const fields = {};
  if (Object.keys(req.files || {}).length)
    authorize(
      req.user,
      "asset.file.write",
      req.product || {
        organizationId: req.user.organizationId,
        department: req.body.department,
        assignedToId: req.body.assignedToId,
      },
    );
  for (const [field, type] of [
    ["productImg", "images"],
    ["invoice", "invoices"],
  ])
    if (req.files?.[field]) {
      const name = `${req.user.organizationId}/${id}/${randomUUID()}`;
      // Durable intent exists before the external write; failed writes are safe to retry for deletion.
      await pool.query(
        "INSERT INTO storage_cleanup(folder,category,object_name) VALUES($1,$2,$3)",
        ["assets", type, name],
      );
      fields[field] = await saveFile(req.files[field][0], "assets", type, name);
    }
  return fields;
};
export const createProduct = async (req, res) => {
  const input = assetInput(req.body, req.user);
  await validateDestination(input, req.user, "asset.create");
  input._id = randomUUID();
  input.qr = await qrcode.toDataURL(input._id, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 300,
  });
  const files = await uploadFiles(req, input._id);
  const product = await products.create({ ...input, ...files }, req.user);
  res.status(201).json({ product: presentAsset(product, req.user) });
};
export const getProduct = async (req, res) =>
  res.json({ product: presentAsset(req.product, req.user) });
export const updateProduct = async (req, res) => {
  if(req.product.catalogItemId)throw conflict('WORKFLOW_REQUIRED','Use the inventory workflow for catalog-linked units');
  const input = assetInput(req.body, req.user, true);
  if (
    input.department &&
    input.department !== req.product.department &&
    !("assignedToId" in input)
  )
    input.assignedToId = "";
  await validateDestination(input, req.user, "asset.update", req.product);
  const files = await uploadFiles(req, req.params.id);
  const updatedProduct = await products.update(
    req.params.id,
    { ...input, ...files },
    req.user,
  );
  res.json({
    message: "Product Updated",
    updatedProduct: presentAsset(updatedProduct, req.user),
  });
};
export const deleteProduct = async (req, res) =>
  res.json({
    message: "Product deleted",
    removedProduct: presentAsset(
      await products.remove(req.params.id, req.user),
      req.user,
    ),
  });
export const getOverview = async (req, res) => {
  const result = await products.overview(req.user);
  res.json({
    ...result,
    recent: result.recent.map((x) => presentAsset(x, req.user)),
  });
};
export const downloadFile = async (req, res) => {
  authorize(req.user, "asset.file.read", req.product);
  if (!["image", "invoice"].includes(req.params.category))
    throw new BadRequestError("Invalid file category");
  const key = req.params.category === "invoice" ? "invoice" : "productImg";
  const value = req.product[key];
  if (!value) return res.sendStatus(404);
  const { data, contentType } = await readStoredFile(
    value,
    req.params.category,
  );
  await audit(pool, req.user, "asset.file.read", req.product._id, {
    category: req.params.category,
  });
  res.set({
    "Content-Type": contentType,
    "Cache-Control": "private, no-store",
    "Content-Disposition":
      req.params.category === "invoice" ? "attachment" : "inline",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  res.send(Buffer.from(data));
};
