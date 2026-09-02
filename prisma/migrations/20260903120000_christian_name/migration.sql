-- The name a person is addressed by in the Church, renamed from "baptism name".

-- AlterTable
-- A rename, not a new column: the value is the same fact and every existing row already
-- holds the right one. It is only "the name given at baptism" until the next time it is
-- given — a tonsure or a consecration replaces it, and the column holds the current one.
-- `displayName()` now reads it for DEACON and above, so what is in here reaches a byline.
ALTER TABLE "profile" RENAME COLUMN "baptism_name" TO "christian_name";
