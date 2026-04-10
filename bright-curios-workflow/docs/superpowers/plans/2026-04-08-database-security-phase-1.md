# Phase 1: Database Security and Seed Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the `prisma/seed.ts` script from a destructive process into a safe, idempotent synchronization tool that protects production data.

**Architecture:** We will implement an `upsert` pattern for essential system data (Agent Prompts) and add environmental safeguards to prevent accidental data deletion.

**Tech Stack:** Prisma, TypeScript, PostgreSQL.

---

### Task 1: Add Production Safeguards

**Files:**
- Modify: `bright-curios-workflow/prisma/seed.ts`

- [ ] **Step 1: Implement `checkProduction` and safety check**

Update the top of `main()` to check for production environment and comment out destructive calls.

```typescript
async function main() {
  console.log("🌱 Starting database seed...");

  // Safety check: Prevent destructive operations in production
  const isProduction = process.env.NODE_ENV === "production" || 
                      process.env.DATABASE_URL?.includes("production") ||
                      process.env.DATABASE_URL?.includes("rds.amazonaws.com");

  if (isProduction) {
    console.warn("⚠️ Production environment detected. Skipping destructive cleanup.");
  } else {
    // Clean existing data (optional - comment out in production)
    console.log("🧹 Cleaning existing data...");
    // Commented out to prevent accidental loss even in dev
    /*
    await prisma.revision.deleteMany();
    await prisma.stage.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.project.deleteMany();
    await prisma.researchSource.deleteMany();
    await prisma.researchArchive.deleteMany();
    await prisma.ideaArchive.deleteMany();
    await prisma.template.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.agentPrompt.deleteMany();
    */
    console.log("ℹ️ Cleanup skipped. Using safe synchronization.");
  }
  // ... rest of the file
}
```

- [ ] **Step 2: Commit changes**

```bash
git add bright-curios-workflow/prisma/seed.ts
git commit -m "chore: add production safeguards to seed script"
```

### Task 2: Refactor Agent Prompts to Upsert

**Files:**
- Modify: `bright-curios-workflow/prisma/seed.ts`

- [ ] **Step 1: Replace `create` with `upsert` for agent prompts**

Update the loop at the end of `seed.ts` to use `upsert` based on the `slug` field.

```typescript
  // ... inside main()
  console.log("🤖 Seeding Agent Prompts...");

  for (const agent of agentPrompts) {
    await prisma.agentPrompt.upsert({
      where: { slug: agent.slug },
      update: {
        name: agent.name,
        instructions: agent.instructions,
        input_schema: agent.input_schema,
        output_schema: agent.output_schema,
        stage: agent.stage,
        updated_at: new Date(),
      },
      create: agent,
    });
  }

  console.log("✅ Agent Prompts synchronized:", agentPrompts.length);
}
```

- [ ] **Step 2: Commit changes**

```bash
git add bright-curios-workflow/prisma/seed.ts
git commit -m "feat: refactor agent seeding to use safe upsert"
```

### Task 3: Verification

- [ ] **Step 1: Run seed in dev environment**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bright_curios_workflow" npx prisma db seed`
Expected: Output showing "Cleanup skipped" and "Agent Prompts synchronized". Existing projects/blogs should NOT be deleted.

- [ ] **Step 2: Verify data persistence**

Check if existing blog drafts still exist after seed.

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bright_curios_workflow" npx tsx -e 'import { PrismaClient } from "@prisma/client"; import { PrismaPg } from "@prisma/adapter-pg"; import { Pool } from "pg"; const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const adapter = new PrismaPg(pool); const prisma = new PrismaClient({ adapter }); async function main() { const count = await prisma.blogDraft.count(); console.log("Blog Drafts count:", count); } main().finally(() => { prisma.$disconnect(); pool.end(); });'`
Expected: Count should be >= current count (not zeroed).
