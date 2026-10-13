import { pool, transaction } from '../../db/pool.js';

const columns = `id AS "_id", name, first_name AS "firstName", email, location,
  role, department_code AS department, avatar, avatar_public_id AS "avatarPublicId",
  is_demo AS "isDemo", created_at AS "createdAt", updated_at AS "updatedAt"`;

export const users = {
  async findById(id) {
    const { rows } = await pool.query(`SELECT ${columns} FROM users WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async findByEmail(email) {
    const { rows } = await pool.query(`SELECT ${columns}, password_hash AS password FROM users WHERE email = $1`, [email.trim().toLowerCase()]);
    return rows[0] || null;
  },
  async register(input) {
    return transaction(async (client) => {
      // First-account administrator creation must be atomic across registrations.
      await client.query('SELECT pg_advisory_xact_lock(73410202)');
      const { rows: existing } = await client.query('SELECT EXISTS (SELECT 1 FROM users) AS present');
      const { rows } = await client.query(`INSERT INTO users (name, first_name, email, password_hash, location, department_code, role)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${columns}`,
      [input.name, input.firstName || null, input.email.toLowerCase(), input.password, input.location,
        input.department || 'decoration', existing[0].present ? 'user' : 'admin']);
      return rows[0];
    });
  },
  async list(department) {
    const { rows } = await pool.query(`SELECT id AS "_id", name, first_name AS "firstName", department_code AS department
      FROM users ${department ? 'WHERE department_code = $1' : ''} ORDER BY name, id`, department ? [department] : []);
    return rows;
  },
  async count(department) {
    const { rows } = await pool.query(`SELECT count(*)::int AS count FROM users ${department ? 'WHERE department_code = $1' : ''}`, department ? [department] : []);
    return rows[0].count;
  },
  async departments(department) {
    const { rows } = await pool.query(`SELECT code FROM departments ${department ? 'WHERE code = $1' : ''} ORDER BY code`, department ? [department] : []);
    return rows.map((row) => row.code);
  },
  async update(id, input) {
    const fields = { name: 'name', firstName: 'first_name', email: 'email', location: 'location', avatar: 'avatar', avatarPublicId: 'avatar_public_id' };
    const entries = Object.entries(input).filter(([key]) => key in fields);
    if (!entries.length) return this.findById(id);
    const values = entries.map(([key, value]) => key === 'email' ? value.toLowerCase() : value);
    const setters = entries.map(([key], index) => `${fields[key]} = $${index + 1}`);
    const { rows } = await pool.query(`UPDATE users SET ${setters.join(', ')} WHERE id = $${values.length + 1} RETURNING ${columns}`, [...values, id]);
    return rows[0] || null;
  },
};
