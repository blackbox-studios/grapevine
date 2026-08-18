-- Replaces `profile.full_name` with `first_name` / `last_name`.
--
-- The display string is composed at render time instead of being stored, because the app
-- needs two different answers from one name: the feed addresses clergy as title + given
-- name ("Dn. Paul") while the roster sorts and searches on the surname. A single frozen
-- column can only serve one of those. The title itself comes from `vocation`, not from
-- these columns — see `displayName()` in `src/lib/name.js`.
--
-- Nullable, because a Profile is provisioned from an email address alone at admission and
-- has no name until the person completes orientation.

ALTER TABLE "profile" ADD COLUMN "first_name" TEXT;
ALTER TABLE "profile" ADD COLUMN "last_name" TEXT;

-- Best-effort backfill: first whitespace-delimited token as the given name, the remainder
-- as the surname. Imperfect for rows where an admin typed a title into the full-name box
-- ("Dn. Paul" splits as "Dn." / "Paul"), which is precisely the corruption this migration
-- exists to stop — those rows are re-seeded or corrected at orientation.
UPDATE "profile"
SET
    "first_name" = NULLIF(split_part(btrim("full_name"), ' ', 1), ''),
    "last_name" = NULLIF(btrim(substr(btrim("full_name"), strpos(btrim("full_name"), ' ') + 1)), '')
WHERE "full_name" IS NOT NULL
  AND btrim("full_name") <> '';

-- A single-token full name backfills as a given name only; the surname must stay null
-- rather than repeating it.
UPDATE "profile"
SET "last_name" = NULL
WHERE "last_name" IS NOT NULL
  AND "last_name" = "first_name";

ALTER TABLE "profile" DROP COLUMN "full_name";
