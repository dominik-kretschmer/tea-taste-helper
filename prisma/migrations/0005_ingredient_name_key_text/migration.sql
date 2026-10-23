-- 00-chore/04: normalizeName kann bis zu 3× länger werden als der Name (z.B. „İ“ → „i̇“).
-- Nur verbreitern: bestehende Werte bleiben unverändert, der Index (locale, nameKey) bleibt.
ALTER TABLE "IngredientVersionTranslation" ALTER COLUMN "nameKey" SET DATA TYPE TEXT;
