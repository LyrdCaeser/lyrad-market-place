-- Bind marketplace display names to Creator profiles; existing records are linked after verified sign-in.
ALTER TABLE lyrad_products ADD COLUMN IF NOT EXISTS seller_profile_uid text;
