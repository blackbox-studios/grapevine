-- Drops `profile.verified`.
--
-- The check on a post card means "this person administers the group you are reading this
-- in", and that fact already exists as `membership.role = 'ADMIN'`. Keeping a second copy
-- of it as a profile-wide boolean let the two disagree — revoking an admin's role left the
-- flag set, so a former admin kept the badge — and it could not express a per-group answer
-- at all, since one person can administer a parish while being an ordinary member of its
-- diocese.
--
-- It is now derived per post, against that post's organization, in `projectAuthor`.

ALTER TABLE "profile" DROP COLUMN "verified";
