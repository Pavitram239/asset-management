import { Router } from "express";
import { login, logout, register, verifyAdminSetupToken, completeAdminSetup } from "../controllers/authController.js";
import {
  validateLoginInput,
  validateRegisterInput,
} from "../middlewares/validationMiddleware.js";
const router = Router();
import { sharedRateLimit } from '../middlewares/sharedRateLimit.js';
const authRateLimit = sharedRateLimit();

router.post("/register", authRateLimit, validateRegisterInput, register);
router.post("/login", authRateLimit, validateLoginInput, login);
router.get("/logout", logout);
router.get("/setup-admin/verify", verifyAdminSetupToken);
router.post("/setup-admin", completeAdminSetup);

export default router;
