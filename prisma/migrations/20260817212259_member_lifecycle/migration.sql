-- Vocation gains four ranks AND is reordered, so this recreates the type rather than
-- using ALTER TYPE ... ADD VALUE.
--
-- Why the generated ADD VALUE version was wrong: it appends. The existing type is
-- (PRIEST, FAITHFUL), so appending would leave the real order as
-- PRIEST, FAITHFUL, CATECHUMEN, READER, DEACON, BISHOP — and Postgres sorts an enum by
-- that physical order, not alphabetically. Any roster grouped or ordered by rank would
-- read as nonsense, with Priest sorting above Catechumen and Bishop last. ADD VALUE
-- cannot move an existing label, so PRIEST could never be placed after DEACON without
-- rebuilding the type.
--
-- Safe to do here because both dependent columns are plain (no indexes or constraints on
-- the enum), and every existing label survives the round-trip through text.

ALTER TYPE "vocation" RENAME TO "vocation_old";

CREATE TYPE "vocation" AS ENUM (
    'CATECHUMEN',
    'FAITHFUL',
    'READER',
    'DEACON',
    'PRIEST',
    'BISHOP'
);

-- Defaults reference the old type and must be dropped before the column can be recast.
ALTER TABLE "profile" ALTER COLUMN "vocation" DROP DEFAULT;
ALTER TABLE "invite"  ALTER COLUMN "vocation" DROP DEFAULT;

ALTER TABLE "profile"
    ALTER COLUMN "vocation" TYPE "vocation" USING "vocation"::text::"vocation";
ALTER TABLE "invite"
    ALTER COLUMN "vocation" TYPE "vocation" USING "vocation"::text::"vocation";

ALTER TABLE "profile" ALTER COLUMN "vocation" SET DEFAULT 'FAITHFUL';
ALTER TABLE "invite"  ALTER COLUMN "vocation" SET DEFAULT 'FAITHFUL';

DROP TYPE "vocation_old";

-- Profile lifecycle: birthday is a calendar date, and the two timestamps are what let the
-- roster distinguish "invited, never signed in" from "signed in, orientation incomplete".
ALTER TABLE "profile"
    ADD COLUMN "birthday"     DATE,
    ADD COLUMN "onboarded_at" TIMESTAMP(3),
    ADD COLUMN "last_seen_at" TIMESTAMP(3);
