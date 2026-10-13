import "express-async-errors"; // avoids app crashing for async errors
import './config/env.js';
import express from "express";
import { v2 as cloudinary } from "cloudinary";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { authenticateUser } from "./middlewares/authMiddleware.js";
// Routes
import userRouter from "./routes/userRoutes.js";
import authRouter from "./routes/authRoutes.js";
import productRouter from "./routes/productRoutes.js";
// middlewares
import errorHandlerMiddleware from "./middlewares/errorHandlerMiddleware.js";
import { cleanupUploads } from './middlewares/multerMiddleware.js';

import { pool } from '../db/pool.js';

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

const app = express();
app.disable('x-powered-by');

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(cleanupUploads);
app.use('/uploads', (req, res) => res.sendStatus(404));

// Products Routes
app.get('/api/v1/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.status(200).json({ status: 'ok', database: 'postgresql' });
});
app.use("/api/v1/products", authenticateUser, productRouter);

// User Routes
app.use("/api/v1/users", authenticateUser, userRouter);

// Auth Routes
app.use("/api/v1/auth", authRouter);
app.use('/api', (req, res) => res.status(404).json({ msg: 'API route not found' }));

// 404
app.use("*", (req, res) => {
  res.status(404).json({
    message: "Page not found",
  });
});

app.use(errorHandlerMiddleware);

export default app;
