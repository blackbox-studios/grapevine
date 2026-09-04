-- Events: the parish's own calendar, and the sign-up sheets a parish runs on.
--
-- Two halves that meet only on screen. The calendar is a **feed**, not rows — an admin pastes
-- a public Google Calendar and the app reads it as iCalendar per request, so nothing here
-- stores an event. What is stored is the rota: a sheet, its dated slots, the people in them,
-- and the nudges those people are owed.
--
-- Run `npm run db:secure` after this. It adds four tables, and a new table is created without
-- RLS and with the Data API's grants intact until `prisma/policies.sql` is applied.

-- ── The parish calendar ──────────────────────────────────────────────────────
-- Stored exactly as the admin pasted it; `icsFeedUrl` normalizes on read. See the column's
-- note in schema.prisma for why the raw string is the right thing to keep.
ALTER TABLE "organization" ADD COLUMN "calendar_url" TEXT;

-- ── Sign-ups ─────────────────────────────────────────────────────────────────
CREATE TYPE "signup_status" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "signup_sheet" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    -- The parish's clock, needed to *write* slots rather than to read them: twelve weekly
    -- occurrences cross a daylight-saving boundary, and a fixed offset puts half of them an
    -- hour out. Defaulted rather than backfilled because there are no rows yet.
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "signup_status" NOT NULL DEFAULT 'OPEN',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "signup_sheet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signup_slot" (
    "id" TEXT NOT NULL,
    "sheet_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    -- Cancelling rather than deleting is what keeps the volunteers: a deleted slot drops the
    -- people who had claimed it without telling them anything.
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_slot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signup_claim" (
    "id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    -- "OCF - Orthodox Christian Fellowship". Free text, not a group: most of the bodies a
    -- parish's volunteers stand for are not groups in this app.
    "on_behalf_of" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_claim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signup_reminder" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "send_at" TIMESTAMP(3) NOT NULL,
    -- Null is "pending", and the only thing the sender looks for. It is also what makes a
    -- double-run idempotent: rows are claimed with a conditional update on it.
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "signup_reminder_pkey" PRIMARY KEY ("id")
);

-- ── The reminder's line in the panel ─────────────────────────────────────────
-- Two more values on an existing enum. `ALTER TYPE ... ADD VALUE` cannot run inside a
-- transaction block on older Postgres; from 12 it can, which is what Prisma Migrate wraps
-- this file in. Both are appended, never inserted, because the physical order of an enum is
-- its sort order and this one is read by nothing that sorts — but the next one might be.
ALTER TYPE "notification_type" ADD VALUE 'SIGNUP_REMINDER';
ALTER TYPE "notification_type" ADD VALUE 'SIGNUP_CANCELED';

-- The slot a reminder or a cancellation is about. It carries the foreign key so a deleted
-- slot takes its notifications with it, which `subject_id` — a bare string — cannot.
ALTER TABLE "notification" ADD COLUMN "signup_slot_id" TEXT;

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Each one is in the order its query compares columns, so a page is an index range scan.
CREATE INDEX "signup_sheet_org_id_status_created_at_id_idx"
    ON "signup_sheet"("org_id", "status", "created_at" DESC, "id" DESC);
CREATE INDEX "signup_sheet_created_by_id_idx" ON "signup_sheet"("created_by_id");

-- One slot per start time per sheet. This is what makes extending a rota idempotent: "add
-- another twelve Sundays" runs the same generator over an overlapping range, and
-- `skipDuplicates` then adds only the dates that are not already there.
CREATE UNIQUE INDEX "signup_slot_sheet_id_starts_at_key" ON "signup_slot"("sheet_id", "starts_at");
CREATE INDEX "signup_slot_sheet_id_starts_at_idx" ON "signup_slot"("sheet_id", "starts_at");
CREATE INDEX "signup_slot_starts_at_idx" ON "signup_slot"("starts_at");

CREATE UNIQUE INDEX "signup_claim_slot_id_profile_id_key"
    ON "signup_claim"("slot_id", "profile_id");
CREATE INDEX "signup_claim_profile_id_idx" ON "signup_claim"("profile_id");

CREATE UNIQUE INDEX "signup_reminder_claim_id_send_at_key"
    ON "signup_reminder"("claim_id", "send_at");
-- `sent_at` leads because it is the selective column: almost every row here has been sent,
-- and Postgres range scans `send_at` inside the null group.
CREATE INDEX "signup_reminder_sent_at_send_at_idx" ON "signup_reminder"("sent_at", "send_at");

CREATE INDEX "notification_signup_slot_id_idx" ON "notification"("signup_slot_id");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
-- Every one of these cascades, and every one of them is indexed above: Postgres does not
-- index a foreign key on its own, and an unindexed one turns ON DELETE CASCADE into a
-- sequential scan of the child table.
ALTER TABLE "signup_sheet" ADD CONSTRAINT "signup_sheet_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "signup_sheet" ADD CONSTRAINT "signup_sheet_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signup_slot" ADD CONSTRAINT "signup_slot_sheet_id_fkey"
    FOREIGN KEY ("sheet_id") REFERENCES "signup_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signup_claim" ADD CONSTRAINT "signup_claim_slot_id_fkey"
    FOREIGN KEY ("slot_id") REFERENCES "signup_slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "signup_claim" ADD CONSTRAINT "signup_claim_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signup_reminder" ADD CONSTRAINT "signup_reminder_claim_id_fkey"
    FOREIGN KEY ("claim_id") REFERENCES "signup_claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification" ADD CONSTRAINT "notification_signup_slot_id_fkey"
    FOREIGN KEY ("signup_slot_id") REFERENCES "signup_slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
