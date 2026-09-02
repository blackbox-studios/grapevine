-- The facts orientation now asks for, and the indexes that make the follow lists pageable.

-- AlterTable
-- All nullable and not backfilled: every one of these is a fact only the person can supply,
-- and a profile provisioned by an admin from an email address has none of them until they
-- complete orientation. Existing members answer them from Settings → General.
ALTER TABLE "profile" ADD COLUMN     "baptism_name" TEXT,
                      ADD COLUMN     "name_day_month" INTEGER,
                      ADD COLUMN     "name_day_day" INTEGER,
                      ADD COLUMN     "ordination_date" DATE;

-- CreateIndex
-- Serves the name-day digest: a seven-day window is seven (month, day) pairs, so the read is
-- an IN over this index with no special case at the year boundary.
CREATE INDEX "profile_name_day_month_name_day_day_idx" ON "profile"("name_day_month", "name_day_day");

-- CreateIndex
-- One per direction, each in the order its keyset cursor compares, so a page of followers or
-- of following is an index range scan rather than a sort. The tiebreaker is the other
-- person's id because this table is keyed by the pair and has no surrogate id.
CREATE INDEX "follow_following_id_created_at_follower_id_idx" ON "follow"("following_id", "created_at" DESC, "follower_id" DESC);
CREATE INDEX "follow_follower_id_created_at_following_id_idx" ON "follow"("follower_id", "created_at" DESC, "following_id" DESC);

-- DropIndex
-- Superseded by the composite above, which leads on the same column.
DROP INDEX IF EXISTS "follow_following_id_idx";
