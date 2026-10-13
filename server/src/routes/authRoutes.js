import { Router } from "express";
import { login, logout, register } from "../controllers/authController.js";
import {
  validateLoginInput,
  validateRegisterInput,
} from "../middlewares/validationMiddleware.js";
const router = Router();
import { createLoginRateLimit } from '../middlewares/loginRateLimit.js';
const authRateLimit = createLoginRateLimit();

router.post("/register", authRateLimit, validateRegisterInput, register);
router.post("/login", authRateLimit, validateLoginInput, login);
router.get("/logout", logout);

export default router;
