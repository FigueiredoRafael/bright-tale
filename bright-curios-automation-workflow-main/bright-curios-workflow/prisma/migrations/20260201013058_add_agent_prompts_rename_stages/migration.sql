-- CreateTable
CREATE TABLE "AgentPrompt" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "input_schema" TEXT,
    "output_schema" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentPrompt_slug_key" ON "AgentPrompt"("slug");

-- CreateIndex
CREATE INDEX "AgentPrompt_slug_idx" ON "AgentPrompt"("slug");

-- CreateIndex
CREATE INDEX "AgentPrompt_stage_idx" ON "AgentPrompt"("stage");

-- Rename stages: discovery -> brainstorm, content -> production
UPDATE "Project" SET "current_stage" = 'brainstorm' WHERE "current_stage" = 'discovery';
UPDATE "Project" SET "current_stage" = 'production' WHERE "current_stage" = 'content';

UPDATE "Stage" SET "stage_type" = 'brainstorm' WHERE "stage_type" = 'discovery';
UPDATE "Stage" SET "stage_type" = 'production' WHERE "stage_type" = 'content';
