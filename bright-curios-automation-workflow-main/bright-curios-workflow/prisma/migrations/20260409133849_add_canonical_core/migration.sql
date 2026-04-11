-- CreateTable
CREATE TABLE "CanonicalCore" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "project_id" TEXT,
    "thesis" TEXT NOT NULL,
    "argument_chain_json" TEXT NOT NULL,
    "emotional_arc_json" TEXT NOT NULL,
    "key_stats_json" TEXT NOT NULL,
    "key_quotes_json" TEXT,
    "affiliate_moment_json" TEXT,
    "cta_subscribe" TEXT,
    "cta_comment_prompt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalCore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanonicalCore_idea_id_idx" ON "CanonicalCore"("idea_id");

-- CreateIndex
CREATE INDEX "CanonicalCore_project_id_idx" ON "CanonicalCore"("project_id");
