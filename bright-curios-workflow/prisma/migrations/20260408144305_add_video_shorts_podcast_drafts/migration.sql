-- CreateTable
CREATE TABLE "VideoDraft" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "title_options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thumbnail_json" TEXT,
    "script_json" TEXT,
    "total_duration_estimate" TEXT,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "project_id" TEXT,
    "idea_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortsDraft" (
    "id" TEXT NOT NULL,
    "shorts_json" TEXT NOT NULL,
    "short_count" INTEGER NOT NULL DEFAULT 3,
    "total_duration" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "project_id" TEXT,
    "idea_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortsDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodcastDraft" (
    "id" TEXT NOT NULL,
    "episode_title" TEXT NOT NULL,
    "episode_description" TEXT NOT NULL,
    "intro_hook" TEXT NOT NULL,
    "talking_points_json" TEXT NOT NULL,
    "personal_angle" TEXT NOT NULL,
    "guest_questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outro" TEXT NOT NULL,
    "duration_estimate" TEXT,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "project_id" TEXT,
    "idea_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PodcastDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoDraft_status_idx" ON "VideoDraft"("status");

-- CreateIndex
CREATE INDEX "VideoDraft_project_id_idx" ON "VideoDraft"("project_id");

-- CreateIndex
CREATE INDEX "VideoDraft_idea_id_idx" ON "VideoDraft"("idea_id");

-- CreateIndex
CREATE INDEX "ShortsDraft_status_idx" ON "ShortsDraft"("status");

-- CreateIndex
CREATE INDEX "ShortsDraft_project_id_idx" ON "ShortsDraft"("project_id");

-- CreateIndex
CREATE INDEX "ShortsDraft_idea_id_idx" ON "ShortsDraft"("idea_id");

-- CreateIndex
CREATE INDEX "PodcastDraft_status_idx" ON "PodcastDraft"("status");

-- CreateIndex
CREATE INDEX "PodcastDraft_project_id_idx" ON "PodcastDraft"("project_id");

-- CreateIndex
CREATE INDEX "PodcastDraft_idea_id_idx" ON "PodcastDraft"("idea_id");
