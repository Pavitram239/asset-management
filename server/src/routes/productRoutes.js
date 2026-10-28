import { Router } from "express";
import { pool } from '../../db/pool.js';
const router = Router();

import {
  getAllProducts,
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
  getOverview,
  downloadFile,
} from "../controllers/productController.js";
import { authorizePermissions } from "../middlewares/authMiddleware.js";
import { validateProductIdParam } from "../middlewares/validationMiddleware.js";

import upload from "../middlewares/multerMiddleware.js";
import { checkForTestUser } from '../middlewares/authMiddleware.js';

router.get('/:id/history', authorizePermissions('asset.read'), validateProductIdParam, async(req,res)=>{
  const {rows}=await pool.query('SELECT id,actor_id,previous_department,department,previous_user_id,user_id,created_at FROM asset_assignment_history WHERE organization_id=$1 AND asset_id=$2 ORDER BY id DESC LIMIT 100',[req.user.organizationId,req.params.id]);
  res.json({history:rows});
});
router.get('/overview', authorizePermissions('asset.read'), getOverview);
router.get('/:id/files/:category', authorizePermissions('asset.file.read'), validateProductIdParam, downloadFile);

router
  .route("/")
  .get(authorizePermissions('asset.read'), getAllProducts)
  .post(
    authorizePermissions('asset.create'),
    checkForTestUser,
    upload.fields([
      { name: "productImg", maxCount: 1 },
      { name: "invoice", maxCount: 1 },
    ]),
    createProduct
  );

router
  .route("/:id")
  .get(authorizePermissions('asset.read'), validateProductIdParam, getProduct)
  .patch(
    authorizePermissions('asset.update'),
    checkForTestUser,
    validateProductIdParam,
    upload.fields([
      { name: "productImg", maxCount: 1 },
      { name: "invoice", maxCount: 1 },
    ]),
    updateProduct
  )
  .delete(
    authorizePermissions('asset.delete'),
    checkForTestUser,
    validateProductIdParam,
    deleteProduct
  );

export default router;
