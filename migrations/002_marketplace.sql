BEGIN;
CREATE TABLE IF NOT EXISTS lyrad_platforms (code text PRIMARY KEY, label text NOT NULL, extension text NOT NULL, enabled boolean NOT NULL DEFAULT false);
INSERT INTO lyrad_platforms VALUES ('android','Mobile (PE)','.apk',true),('windows','Máy Tính (PC)','.exe',true),('ios','iOS','.ipa',false),('linux','Linux','.AppImage',false) ON CONFLICT DO NOTHING;
-- Quyền này độc lập với dữ liệu hồ sơ có thể sửa từ trình duyệt.
CREATE TABLE IF NOT EXISTS lyrad_market_roles (email text PRIMARY KEY, role text NOT NULL CHECK(role IN ('ADMIN','NPH','PUBLISHER')));
CREATE TABLE IF NOT EXISTS lyrad_market_files (id uuid PRIMARY KEY, owner_id text NOT NULL, filename text NOT NULL, platform text NOT NULL REFERENCES lyrad_platforms(code), sha256 text NOT NULL, bytes bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS lyrad_products (
 id uuid PRIMARY KEY, owner_id text NOT NULL, seller_name text NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), description text NOT NULL,
 platform text NOT NULL REFERENCES lyrad_platforms(code), category text NOT NULL CHECK(category IN ('app','game')),
 kind text NOT NULL CHECK(kind IN ('sale','catalog')), price numeric(14,2) NOT NULL DEFAULT 0 CHECK(price >= 0),
 payment_method text NOT NULL DEFAULT '', contact text NOT NULL DEFAULT '', file_id uuid NOT NULL REFERENCES lyrad_market_files(id),
 status text NOT NULL CHECK(status IN ('pending','approved','rejected','returned')),
 return_count integer NOT NULL DEFAULT 0 CHECK(return_count BETWEEN 0 AND 1), review_note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lyrad_product_history (id bigserial PRIMARY KEY, product_id uuid NOT NULL REFERENCES lyrad_products(id), actor_id text NOT NULL, status text NOT NULL CHECK(status IN ('pending','approved','rejected','returned')), note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS lyrad_products_status_created ON lyrad_products(status,created_at DESC);
CREATE INDEX IF NOT EXISTS lyrad_products_owner ON lyrad_products(owner_id);
CREATE INDEX IF NOT EXISTS lyrad_history_product ON lyrad_product_history(product_id,created_at DESC);
COMMIT;
-- Cấp quyền bằng email Google đã xác minh. Thay email bên dưới rồi chạy riêng:
-- INSERT INTO lyrad_market_roles(email,role) VALUES ('email-admin-cua-ban@gmail.com','ADMIN') ON CONFLICT(email) DO UPDATE SET role=EXCLUDED.role;
-- INSERT INTO lyrad_market_roles(email,role) VALUES ('email-nph-cua-ban@gmail.com','NPH') ON CONFLICT(email) DO UPDATE SET role=EXCLUDED.role;
