-- Admission is one-directional: an admin adds people, nobody asks to join.
--
-- This removes the request-to-join lane from the database. It was designed but never
-- built: `MembershipStatus` had a PENDING value (a request) and a REJECTED value (a
-- refusal), the roster had an Approve button, and there was a "waiting on approval"
-- screen — but no entry point ever created a PENDING row, because admission provisions an
-- APPROVED membership on the spot. Narrowing the enum is what makes the missing half
-- unrepresentable rather than merely unused.
--
-- Existing PENDING rows collapse to REVOKED, not APPROVED. That direction is deliberate:
-- these are people an admin had *not* yet let in, so promoting them would be a silent
-- grant of access nobody authorised. As REVOKED they stay visible in the roster with a
-- Restore button, which makes the decision an admin's to make in one click.
-- REJECTED also collapses to REVOKED — the same closed door, which is how the viewer
-- projection already treated it.

-- Fail closed, before the type can no longer hold the old labels.
ALTER TABLE "membership" ALTER COLUMN "status" DROP DEFAULT;
UPDATE "membership" SET "status" = 'REVOKED' WHERE "status" IN ('PENDING', 'REJECTED');

-- Postgres cannot drop a value from an enum in place, so the type is rebuilt. Declaration
-- order is the sort order and `listMembers` orders on it, so APPROVED must come first for
-- the roster to lead with the people actually in the parish.
ALTER TYPE "membership_status" RENAME TO "membership_status_old";
CREATE TYPE "membership_status" AS ENUM ('APPROVED', 'REVOKED');
ALTER TABLE "membership"
    ALTER COLUMN "status" TYPE "membership_status"
    USING "status"::text::"membership_status";
DROP TYPE "membership_status_old";

-- APPROVED, not PENDING. Admission is the only thing that creates a membership and it
-- always grants access, so the old default could only ever produce a member who gets a
-- 403 on every request and has no screen that can repair them.
ALTER TABLE "membership" ALTER COLUMN "status" SET DEFAULT 'APPROVED';

-- "requested_at" named a request that cannot happen. This is when an admin added them.
ALTER TABLE "membership" RENAME COLUMN "requested_at" TO "admitted_at";

-- The invite row is an audit trail, not a ticket. There is no link to redeem, so the
-- token had no reader, the expiry gated nothing, and `accepted_at` was written at the same
-- instant as the row itself. Dropping "token" drops its unique index with it.
ALTER TABLE "invite" DROP COLUMN "token";
ALTER TABLE "invite" DROP COLUMN "expires_at";
ALTER TABLE "invite" DROP COLUMN "accepted_at";
