-- CreateTable
CREATE TABLE "BlogDraft" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "meta_description" TEXT NOT NULL,
    "full_draft" TEXT NOT NULL,
    "outline_json" TEXT,
    "primary_keyword" TEXT,
    "secondary_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affiliate_placement" TEXT,
    "affiliate_copy" TEXT,
    "affiliate_link" TEXT,
    "affiliate_rationale" TEXT,
    "internal_links_json" TEXT,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "project_id" TEXT,
    "idea_id" TEXT,
    "wordpress_post_id" INTEGER,
    "wordpress_url" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogDraft_status_idx" ON "BlogDraft"("status");

-- CreateIndex
CREATE INDEX "BlogDraft_project_id_idx" ON "BlogDraft"("project_id");

-- CreateIndex
CREATE INDEX "BlogDraft_idea_id_idx" ON "BlogDraft"("idea_id");

-- CreateIndex
CREATE INDEX "BlogDraft_slug_idx" ON "BlogDraft"("slug");
