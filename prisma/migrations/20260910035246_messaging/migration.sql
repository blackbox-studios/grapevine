/*
  Warnings:

  - You are about to drop the column `body` on the `message` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "envelope_type" AS ENUM ('PREKEY', 'RATCHET');

-- AlterTable
ALTER TABLE "conversation" ADD COLUMN     "created_by_id" UUID;

-- AlterTable
ALTER TABLE "conversation_participant" ADD COLUMN     "accepted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "message" DROP COLUMN "body";

-- CreateTable
CREATE TABLE "message_envelope" (
    "message_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "type" "envelope_type" NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "message_envelope_pkey" PRIMARY KEY ("message_id","device_id")
);

-- CreateTable
CREATE TABLE "crypto_device" (
    "id" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    "identity_key" TEXT NOT NULL,
    "signed_pre_key_id" INTEGER NOT NULL,
    "signed_pre_key" TEXT NOT NULL,
    "signed_pre_key_signature" TEXT NOT NULL,
    "registration_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crypto_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_time_pre_key" (
    "device_id" TEXT NOT NULL,
    "key_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "one_time_pre_key_pkey" PRIMARY KEY ("device_id","key_id")
);

-- CreateTable
CREATE TABLE "message_block" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_block_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateIndex
CREATE INDEX "message_envelope_device_id_idx" ON "message_envelope"("device_id");

-- CreateIndex
CREATE INDEX "crypto_device_profile_id_idx" ON "crypto_device"("profile_id");

-- CreateIndex
CREATE INDEX "message_block_blocked_id_idx" ON "message_block"("blocked_id");

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_envelope" ADD CONSTRAINT "message_envelope_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_envelope" ADD CONSTRAINT "message_envelope_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "crypto_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_device" ADD CONSTRAINT "crypto_device_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_pre_key" ADD CONSTRAINT "one_time_pre_key_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "crypto_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_block" ADD CONSTRAINT "message_block_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_block" ADD CONSTRAINT "message_block_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
