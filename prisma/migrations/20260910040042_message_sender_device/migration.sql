/*
  Warnings:

  - Added the required column `sender_device_id` to the `message` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "message" ADD COLUMN     "sender_device_id" TEXT NOT NULL;
