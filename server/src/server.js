import './config/env.js';
import app from './app.js';
import { pool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';

const PORT = process.env.PORT || 5100;
try {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured');
  await migrate();
  console.log('Connected to PostgreSQL');
  const server = app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
  const shutdown = () => server.close(async () => { await pool.end(); process.exit(0); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (error) {
  console.error('Database startup failed:', error.message);
  await pool.end();
  process.exitCode = 1;
}
