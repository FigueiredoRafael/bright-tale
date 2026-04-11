-- AlterTable
ALTER TABLE "IdeaArchive" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "markdown_content" TEXT,
ADD COLUMN     "source_project_id" TEXT,
ADD COLUMN     "source_type" TEXT NOT NULL DEFAULT 'brainstorm',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "usage_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "completed_stages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "IdeaArchive_source_type_idx" ON "IdeaArchive"("source_type");

-- CreateIndex
CREATE INDEX "IdeaArchive_is_public_idx" ON "IdeaArchive"("is_public");
