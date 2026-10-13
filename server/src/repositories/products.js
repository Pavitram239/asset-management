import { pool } from '../../db/pool.js';

const warranty = `CASE WHEN p.warranty_date IS NOT NULL THEN
  CASE WHEN p.warranty_date > CURRENT_DATE THEN 'active' ELSE 'expired' END
  ELSE p.warranty_status END`;
const select = `SELECT p.id AS "_id", p.name, p.company, p.department_code AS department,
  p.creator_id AS creator, p.created_by AS "createdBy", p.assigned_to_id AS "assignedToId",
  COALESCE(u.name, '') AS "assignedTo", p.status, ${warranty} AS warranty,
  to_char(p.purchase_date, 'YYYY-MM-DD') AS "purchaseDate",
  to_char(p.warranty_date, 'YYYY-MM-DD') AS "warrantyDate",
  p.product_img AS "productImg", p.invoice, p.qr, p.attributes,
  p.created_at AS "createdAt", p.updated_at AS "updatedAt"
  FROM products p LEFT JOIN users u ON p.assigned_to_id = u.id`;
const dto = ({ attributes, ...row }) => ({ ...attributes, ...row });
const attributes = ['customerCare', 'power', 'capacity', 'serialNumber'];

export const productFilter = ({ department, search, status, warrantyStatus } = {}) => {
  const clauses = [], values = [];
  const add = (expression, value) => { values.push(value); clauses.push(expression.replace('?', `$${values.length}`)); };
  if (department) add('p.department_code = ?', department);
  // strpos makes %, _, backslashes and quotes literal search characters.
  if (search) add('strpos(lower(p.name), lower(?)) > 0', search);
  if (status) add('p.status = ?', status);
  if (warrantyStatus) add(`${warranty} = ?`, warrantyStatus);
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
};

export const products = {
  async findById(id) {
    const { rows } = await pool.query(`${select} WHERE p.id = $1`, [id]);
    return rows[0] ? dto(rows[0]) : null;
  },
  async list(filters, { limit, skip }, sort) {
    const { where, values } = productFilter(filters);
    const sorts = { newest: 'p.created_at DESC', oldest: 'p.created_at ASC', 'a-z': 'p.name ASC', 'z-a': 'p.name DESC' };
    const order = Object.hasOwn(sorts, sort) ? sorts[sort] : sorts.newest;
    const { rows } = await pool.query(`${select} ${where} ORDER BY ${order}, p.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, skip]);
    return rows.map(dto);
  },
  async count(filters) {
    const { where, values } = productFilter(filters);
    const { rows } = await pool.query(`SELECT count(*)::int AS count FROM products p ${where}`, values);
    return rows[0].count;
  },
  async create(input) {
    await pool.query(`INSERT INTO products (id, name, company, department_code, creator_id, assigned_to_id,
      created_by, status, purchase_date, warranty_date, warranty_status, product_img, invoice, qr, attributes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [input._id, input.name, input.company, input.department, input.creator, input.assignedToId || null,
      input.createdBy, input.status || 'In department', input.purchaseDate || null, input.warrantyDate || null,
      input.warranty || 'expired', input.productImg || null, input.invoice || null, input.qr,
      JSON.stringify(Object.fromEntries(attributes.filter((key) => key in input).map((key) => [key, input[key]])))]);
    return this.findById(input._id);
  },
  async update(id, input) {
    const fields = { name: 'name', company: 'company', department: 'department_code', assignedToId: 'assigned_to_id', status: 'status',
      purchaseDate: 'purchase_date', warrantyDate: 'warranty_date', warranty: 'warranty_status', productImg: 'product_img', invoice: 'invoice' };
    const values = [], setters = [];
    for (const [key, column] of Object.entries(fields)) {
      if (!(key in input)) continue;
      values.push(input[key] === '' ? null : input[key]);
      setters.push(`${column} = $${values.length}`);
    }
    const changes = Object.fromEntries(attributes.filter((key) => key in input).map((key) => [key, input[key]]));
    if (Object.keys(changes).length) {
      values.push(JSON.stringify(changes));
      setters.push(`attributes = attributes || $${values.length}::jsonb`);
    }
    if (setters.length) await pool.query(`UPDATE products SET ${setters.join(', ')} WHERE id = $${values.length + 1}`, [...values, id]);
    return this.findById(id);
  },
  async remove(id) {
    const asset = await this.findById(id);
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    return asset;
  },
  async overview(department) {
    const { where, values } = productFilter({ department });
    const [summary, groups, recent] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE p.assigned_to_id IS NOT NULL)::int AS assigned,
        count(*) FILTER (WHERE p.status = 'Out of campus')::int AS outside,
        count(*) FILTER (WHERE ${warranty} = 'expired')::int AS expired FROM products p ${where}`, values),
      pool.query(`SELECT p.department_code AS "_id", count(*)::int AS count FROM products p ${where} GROUP BY p.department_code ORDER BY count DESC, p.department_code`, values),
      pool.query(`${select} ${where} ORDER BY p.updated_at DESC, p.id LIMIT 5`, values),
    ]);
    return { ...summary.rows[0], departments: groups.rows, recent: recent.rows.map(dto) };
  },
};
