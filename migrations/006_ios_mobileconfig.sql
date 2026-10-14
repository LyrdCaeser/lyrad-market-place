BEGIN;

INSERT INTO lyrad_platforms(code,label,extension,enabled) VALUES
  ('android','Android','.apk',true),
  ('ios','iOS','.ipa',true),
  ('mobileconfig','MobiConfig','.mobileconfig',true)
ON CONFLICT(code) DO UPDATE SET
  label=EXCLUDED.label,
  extension=EXCLUDED.extension,
  enabled=EXCLUDED.enabled;

ALTER TABLE lyrad_products
  ADD COLUMN IF NOT EXISTS install_guide text NOT NULL DEFAULT '';

ALTER TABLE lyrad_products
  DROP CONSTRAINT IF EXISTS lyrad_products_mobileconfig_guide;

ALTER TABLE lyrad_products
  ADD CONSTRAINT lyrad_products_mobileconfig_guide
  CHECK(platform <> 'mobileconfig' OR length(trim(install_guide)) >= 20);

COMMIT;
