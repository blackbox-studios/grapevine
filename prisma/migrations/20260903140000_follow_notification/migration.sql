-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'FOLLOW';

-- AlterTable
-- A follow happens inside no post, so the column that carries the cascade is optional.
ALTER TABLE "notification" ALTER COLUMN "post_id" DROP NOT NULL;
