-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('POST_LIKE', 'COMMENT_LIKE');

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "recipient_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_recipient_id_created_at_id_idx" ON "notification"("recipient_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notification_recipient_id_read_at_idx" ON "notification"("recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_actor_id_idx" ON "notification"("actor_id");

-- CreateIndex
CREATE INDEX "notification_post_id_idx" ON "notification"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipient_id_actor_id_type_subject_id_key" ON "notification"("recipient_id", "actor_id", "type", "subject_id");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
