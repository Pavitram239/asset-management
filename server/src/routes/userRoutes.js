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
const router = Router();

router.get("/current-user", getCurrentUser);
router.get("/admin/app-stats", [
  authorizePermissions("admin", "head"),
  getApplicationStats,
]);
router.get("/users-list", authorizePermissions("admin", "head"), getUsersList);
router.get(
  "/departments",
  authorizePermissions("admin", "head"),
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
