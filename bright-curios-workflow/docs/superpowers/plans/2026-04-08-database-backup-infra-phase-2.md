# Phase 2: Backup Infrastructure and Environment Sync Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automated backups and safe data synchronization between Production and Development environments.

**Architecture:** We will create shell scripts for PostgreSQL dumps and Node.js utilities for data sanitization (removing secrets before local import).

**Tech Stack:** Bash, Node.js, PostgreSQL (pg_dump/pg_restore).

---

### Task 1: Environment Branching Setup

- [ ] **Step 1: Create `dev` and `staging` branches**
- [ ] **Step 2: Commit current work-in-progress to `dev`**
- [ ] **Step 3: Cleanup `main` to represent only the stable production-ready state**

### Task 2: Automated Backup Script

**Files:**
- Create: `bright-curios-workflow/scripts/db-backup.sh`

- [ ] **Step 1: Create backup script with timestamping and rotation**

```bash
#!/bin/bash
# scripts/db-backup.sh
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATABASE_URL=$1

mkdir -p $BACKUP_DIR
pg_dump $DATABASE_URL -F c -f "$BACKUP_DIR/backup_$TIMESTAMP.dump"
# Keep only last 4 backups
ls -t $BACKUP_DIR/backup_*.dump | tail -n +5 | xargs -I {} rm {}
```

### Task 3: Production -> Dev Sync Utility

**Files:**
- Create: `bright-curios-workflow/scripts/sync-prod-to-dev.ts`

- [ ] **Step 1: Implement sanitization logic (masking secrets)**
- [ ] **Step 2: Create `npm run db:pull-prod` command**

### Task 4: Environment Guards

- [ ] **Step 1: Add checks to `package.json` scripts to prevent accidental resets in production**
- [ ] **Step 2: Implement `checkProduction()` helper in lib/utils.ts**
