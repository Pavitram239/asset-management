import { Router } from "express";
const router = Router();

import {
  getAllProducts,
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
  getOverview,
} from "../controllers/productController.js";
import { authorizePermissions } from "../middlewares/authMiddleware.js";
import { validateProductIdParam } from "../middlewares/validationMiddleware.js";
import { USER_ROLES } from "../utils/constants.js";
import upload from "../middlewares/multerMiddleware.js";
import { checkForTestUser } from '../middlewares/authMiddleware.js';

router.get('/overview', getOverview);

router
  .route("/")
  .get(getAllProducts)
  .post(
    authorizePermissions(USER_ROLES.ADMIN, USER_ROLES.HEAD),
    checkForTestUser,
    upload.fields([
      { name: "productImg", maxCount: 1 },
      { name: "invoice", maxCount: 1 },
    ]),
    createProduct
  );

router
  .route("/:id")
  .get(validateProductIdParam, getProduct)
  .patch(
    authorizePermissions(USER_ROLES.ADMIN, USER_ROLES.HEAD),
    checkForTestUser,
    validateProductIdParam,
    upload.fields([
      { name: "productImg", maxCount: 1 },
      { name: "invoice", maxCount: 1 },
    ]),
    updateProduct
  )
  .delete(
    authorizePermissions(USER_ROLES.ADMIN, USER_ROLES.HEAD),
    checkForTestUser,
    validateProductIdParam,
    deleteProduct
  );

export default router;
