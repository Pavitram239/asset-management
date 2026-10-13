CREATE TABLE departments (
  code text PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0)
);
INSERT INTO departments (code, name) VALUES
  ('kitchen', 'Kitchen'), ('accounts', 'Accounts'),
  ('decoration', 'Decoration'), ('all', 'General');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL CHECK (length(trim(name)) > 0),
  first_name varchar(200),
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  location varchar(500) NOT NULL DEFAULT 'avd',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'head', 'user')),
  department_code text NOT NULL DEFAULT 'decoration' REFERENCES departments(code) ON DELETE RESTRICT,
  avatar text,
  avatar_public_id text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_department_idx ON users (department_code);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(500) NOT NULL CHECK (length(trim(name)) > 0),
  company varchar(500) NOT NULL CHECK (length(trim(company)) > 0),
  department_code text NOT NULL REFERENCES departments(code) ON DELETE RESTRICT,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by varchar(200) NOT NULL,
  status text NOT NULL DEFAULT 'In department'
    CHECK (status IN ('In department', 'Not in Department', 'Out of campus')),
  purchase_date date,
  warranty_date date,
  warranty_status text NOT NULL DEFAULT 'expired' CHECK (warranty_status IN ('active', 'expired')),
  product_img text,
  invoice text,
  qr text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_department_created_idx ON products (department_code, created_at DESC, id);
CREATE INDEX products_created_idx ON products (created_at DESC, id);
CREATE INDEX products_assignee_idx ON products (assigned_to_id);
CREATE INDEX products_department_status_idx ON products (department_code, status);

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
