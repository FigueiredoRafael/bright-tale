-- CreateTable
CREATE TABLE "ResearchArchive" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "research_content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "projects_count" INTEGER NOT NULL DEFAULT 0,
    "winners_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ResearchArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSource" (
    "id" TEXT NOT NULL,
    "research_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "research_id" TEXT,
    "current_stage" TEXT NOT NULL,
    "auto_advance" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL,
    "winner" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "stage_type" TEXT NOT NULL,
    "yaml_artifact" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "yaml_artifact" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "change_notes" TEXT,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaArchive" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "core_tension" TEXT NOT NULL,
    "target_audience" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "discovery_data" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config_json" TEXT NOT NULL,
    "parent_template_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordPressConfig" (
    "id" TEXT NOT NULL,
    "site_url" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordPressConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "asset_type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "alt_text" TEXT,
    "wordpress_id" INTEGER,
    "wordpress_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchSource_research_id_idx" ON "ResearchSource"("research_id");

-- CreateIndex
CREATE INDEX "Project_research_id_idx" ON "Project"("research_id");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_current_stage_idx" ON "Project"("current_stage");

-- CreateIndex
CREATE INDEX "Stage_project_id_stage_type_idx" ON "Stage"("project_id", "stage_type");

-- CreateIndex
CREATE INDEX "Revision_stage_id_idx" ON "Revision"("stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "IdeaArchive_idea_id_key" ON "IdeaArchive"("idea_id");

-- CreateIndex
CREATE INDEX "IdeaArchive_verdict_idx" ON "IdeaArchive"("verdict");

-- CreateIndex
CREATE INDEX "Template_type_idx" ON "Template"("type");

-- CreateIndex
CREATE INDEX "Asset_project_id_idx" ON "Asset"("project_id");

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_research_id_fkey" FOREIGN KEY ("research_id") REFERENCES "ResearchArchive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_research_id_fkey" FOREIGN KEY ("research_id") REFERENCES "ResearchArchive"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_parent_template_id_fkey" FOREIGN KEY ("parent_template_id") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
