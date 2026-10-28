import { Router } from "express";
import {
  getApplicationStats,
  getCurrentUser,
  getDepartmentList,
  getUsersList,
  updateUser,
} from "../controllers/userController.js";
import { validateUpdateUserInput } from "../middlewares/validationMiddleware.js";
import {
  authorizePermissions,
  checkForTestUser,
} from "../middlewares/authMiddleware.js";
import upload from "../middlewares/multerMiddleware.js";
import { organizationContext } from '../utils/authorization.js';
const router = Router();

router.get("/current-user", getCurrentUser);
router.get("/admin/app-stats", [
  organizationContext, authorizePermissions('statistics.read'),
  getApplicationStats,
]);
router.get("/users-list", organizationContext, authorizePermissions('directory.read'), getUsersList);
router.get(
  "/departments",
  organizationContext, authorizePermissions('directory.read'),
  getDepartmentList
);
router.patch(
  "/update-user",
  checkForTestUser,
  upload.single("avatar"),
  validateUpdateUserInput,
  updateUser
);

export default router;
