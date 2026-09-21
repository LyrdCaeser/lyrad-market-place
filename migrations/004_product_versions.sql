BEGIN;

ALTER TABLE lyrad_products
  ADD COLUMN IF NOT EXISTS version text NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS download_count bigint NOT NULL DEFAULT 0 CHECK (download_count >= 0);

-- Giữ lại số lượt tải từng được lưu trong dữ liệu ứng dụng cũ (nếu có).
WITH legacy_apps AS (
  SELECT item
  FROM lyrad_db_storage storage
  CROSS JOIN LATERAL jsonb_array_elements(storage.db_data::jsonb) AS item
  WHERE storage.db_key = 'lyrad_real_apps'
)
UPDATE lyrad_products product
SET download_count = GREATEST(
  product.download_count,
  CASE
    WHEN legacy_apps.item->>'downloads' ~ '^[0-9]+$'
      THEN (legacy_apps.item->>'downloads')::bigint
    ELSE 0
  END
)
FROM legacy_apps
WHERE legacy_apps.item->>'id' = product.id::text;

COMMIT;
