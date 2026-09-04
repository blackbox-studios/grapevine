-- "Christian name" renamed to "patron saint", the term the app says out loud.

-- AlterTable
-- A rename, not a new column: the value is the same fact and every row already holds the
-- right one. The old name read as a name — a thing you would prefix with a rank — which is
-- what "Priest Right Believing Prince Alexander Nevsky" came of. It is the saint you are
-- named for, and how you are addressed is `display_name`.
--
-- Ordered after `20260903160000_display_name` because that migration's backfill still reads
-- `christian_name`. Reordering the two breaks it.
ALTER TABLE "profile" RENAME COLUMN "christian_name" TO "patron_saint";
