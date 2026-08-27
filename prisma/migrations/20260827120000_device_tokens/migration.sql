-- CreateTable
CREATE TABLE "device_token" (
    "token" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_token_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "device_token_profile_id_idx" ON "device_token"("profile_id");

-- AddForeignKey
ALTER TABLE "device_token" ADD CONSTRAINT "device_token_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
