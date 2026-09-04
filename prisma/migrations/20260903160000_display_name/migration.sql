-- How a person is addressed, as a column they type rather than a string the app composes.

-- AlterTable
ALTER TABLE "profile" ADD COLUMN "display_name" TEXT;

-- Backfill: whatever the composition produced yesterday, so nobody's byline changes on
-- deploy. It is the last time this expression runs anywhere — `displayName()` reads the
-- column from here on, and `suggestDisplayName()` in `lib/name.js` only ever proposes.
--
-- The titles are `VOCATION_TITLE` in `lib/constants.js`, and they must agree: a value typed
-- wrong here is a person renamed silently. MATUSHKA takes her title with her *first* name,
-- because a matushka is not conferred a Christian name (see `CHRISTIAN_NAME_VOCATIONS`).
--
-- CATECHUMEN and FAITHFUL are skipped rather than written. They carry no title, so the
-- composition was already "first last" — which is exactly what the column's null fallback
-- answers, and leaving them null is what keeps the field they are never shown from filling
-- itself in behind them.
UPDATE "profile"
SET "display_name" =
    CASE "vocation"
        WHEN 'BISHOP'   THEN 'Bp.'
        WHEN 'PRIEST'   THEN 'Priest'
        WHEN 'DEACON'   THEN 'Dn.'
        WHEN 'READER'   THEN 'Reader'
        WHEN 'MATUSHKA' THEN 'Mat.'
    END
    || ' '
    || CASE
        WHEN "vocation" = 'MATUSHKA' THEN "first_name"
        ELSE COALESCE(NULLIF(TRIM("christian_name"), ''), "first_name")
    END
WHERE "vocation" IN ('BISHOP', 'PRIEST', 'DEACON', 'READER', 'MATUSHKA')
  -- A profile admitted but never onboarded has no name to attach a title to, and "Dn. "
  -- with nothing after it addresses nobody. It stays null and renders as its handle.
  AND NULLIF(TRIM(COALESCE("first_name", '')), '') IS NOT NULL;
