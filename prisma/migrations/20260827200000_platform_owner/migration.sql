-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('NONE', 'OWNER');

-- AlterEnum
ALTER TYPE "org_kind" ADD VALUE 'GROUP';

-- AlterTable
ALTER TABLE "profile" ADD COLUMN     "platform_role" "platform_role" NOT NULL DEFAULT 'NONE';

-- AlterTable
-- Nullable and not backfilled on purpose: a null creator means "not created through the app",
-- which is true of the launch parish and makes it deletable by nobody.
ALTER TABLE "organization" ADD COLUMN     "created_by_id" UUID;

-- CreateIndex
CREATE INDEX "organization_created_by_id_idx" ON "organization"("created_by_id");

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
