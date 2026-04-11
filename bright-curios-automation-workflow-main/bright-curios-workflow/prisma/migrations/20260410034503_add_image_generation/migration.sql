/*
  Warnings:

  - Added the required column `updated_at` to the `Asset` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "content_id" TEXT,
ADD COLUMN     "content_type" TEXT,
ADD COLUMN     "local_path" TEXT,
ADD COLUMN     "prompt" TEXT,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "project_id" DROP NOT NULL,
ALTER COLUMN "source_url" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ImageGeneratorConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "config_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageGeneratorConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageGeneratorConfig_is_active_idx" ON "ImageGeneratorConfig"("is_active");

-- CreateIndex
CREATE INDEX "Asset_source_idx" ON "Asset"("source");

-- CreateIndex
CREATE INDEX "Asset_content_type_idx" ON "Asset"("content_type");

-- CreateIndex
CREATE INDEX "Asset_content_id_idx" ON "Asset"("content_id");
