import { pool, transaction } from '../../db/pool.js';

const columns = `id AS "_id", name, first_name AS "firstName", email, location,
  active, role, department_code AS department, avatar, avatar_public_id AS "avatarPublicId",
  is_demo AS "isDemo", email_verified_at IS NOT NULL AS "emailVerified", session_version AS "sessionVersion",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export const users = {
  async findById(id) {
    const { rows } = await pool.query(`SELECT ${columns} FROM users WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async findByEmail(email) {
    const { rows } = await pool.query(`SELECT ${columns}, password_hash AS password FROM users WHERE email = $1`, [email.trim().toLowerCase()]);
    return rows[0] || null;
  },
  async register(input, afterInsert) {
    return transaction(async (client) => {
      const { rows } = await client.query(`INSERT INTO users (name, first_name, email, password_hash, location)
        VALUES ($1,$2,$3,$4,$5) RETURNING ${columns}`,
        [input.name,input.firstName || null,input.email.toLowerCase(),input.password,input.location]);
      if (afterInsert) await afterInsert(client, rows[0]);
      return rows[0];
    });
  },
  async update(id, input, db=pool) {
    const fields = { name: 'name', firstName: 'first_name', email: 'email', location: 'location', avatar: 'avatar', avatarPublicId: 'avatar_public_id' };
    const entries = Object.entries(input).filter(([key]) => key in fields);
    if (!entries.length) return this.findById(id);
    const values = entries.map(([key, value]) => key === 'email' ? value.toLowerCase() : value);
    const setters = entries.map(([key], index) => `${fields[key]} = $${index + 1}${key==='email'?'::text':''}`);
    const emailIndex=entries.findIndex(([key])=>key==='email');
    if(emailIndex!==-1)setters.push(`email_verified_at=CASE WHEN email::text IS DISTINCT FROM $${emailIndex+1}::text THEN NULL ELSE email_verified_at END`);
    const { rows } = await db.query(`UPDATE users SET ${setters.join(', ')} WHERE id = $${values.length + 1} RETURNING ${columns}`, [...values, id]);
    return rows[0] || null;
  },
};
