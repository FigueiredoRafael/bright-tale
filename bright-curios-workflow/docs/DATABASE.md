# Database Schema Documentation

## Overview

The BrightCurios Workflow platform uses PostgreSQL as its database with Prisma ORM for type-safe database access.

**Database**: `bright_curios_workflow`  
**ORM**: Prisma 7.3.0  
**Migration Tool**: Prisma Migrate

---

## Entity Relationship Diagram

```
research_archive (1) ----< (N) projects
projects (1) ----< (N) stages
projects (1) ----< (N) assets
stages (1) ----< (N) revisions
research_archive (1) ----< (N) research_sources
templates (1) ----< (N) templates (self-referencing)
```

---

## Models

### ResearchArchive

Stores research entries that serve as the foundation for content projects.

**Table**: `research_archive`

| Column         | Type          | Constraints   | Description                              |
| -------------- | ------------- | ------------- | ---------------------------------------- |
| id             | String (CUID) | PRIMARY KEY   | Unique identifier                        |
| theme          | String        | NOT NULL      | Main topic/theme of research             |
| description    | String (Text) | -             | Detailed description                     |
| projects_count | Int           | DEFAULT 0     | Auto-calculated count of projects        |
| winners_count  | Int           | DEFAULT 0     | Auto-calculated count of winner projects |
| created_at     | DateTime      | DEFAULT now() | Creation timestamp                       |
| updated_at     | DateTime      | AUTO UPDATE   | Last update timestamp                    |

**Relations**:

- `sources`: One-to-Many with ResearchSource
- `projects`: One-to-Many with Project

**Indexes**:

- `theme` (for filtering)

**Business Rules**:

- Cannot be deleted if associated projects exist
- `projects_count` and `winners_count` are automatically maintained by triggers
- When a project is marked as winner, `winners_count` increments

---

### ResearchSource

Individual sources (articles, videos, papers) associated with research.

**Table**: `research_sources`

| Column       | Type          | Constraints   | Description                       |
| ------------ | ------------- | ------------- | --------------------------------- |
| id           | String (CUID) | PRIMARY KEY   | Unique identifier                 |
| research_id  | String        | FOREIGN KEY   | Reference to research_archive.id  |
| title        | String        | NOT NULL      | Source title                      |
| url          | String        | NOT NULL      | Source URL                        |
| content_type | String        | NOT NULL      | Type: article, video, paper, etc. |
| notes        | String (Text) | -             | Additional notes                  |
| created_at   | DateTime      | DEFAULT now() | Creation timestamp                |

**Relations**:

- `research`: Many-to-One with ResearchArchive

**Indexes**:

- `research_id` (for filtering by research)

**Business Rules**:

- Cascades on delete when parent research is deleted

---

### Project

Content creation projects derived from research.

**Table**: `projects`

| Column        | Type          | Constraints   | Description                      |
| ------------- | ------------- | ------------- | -------------------------------- |
| id            | String (CUID) | PRIMARY KEY   | Unique identifier                |
| title         | String        | NOT NULL      | Project title                    |
| research_id   | String        | FOREIGN KEY   | Reference to research_archive.id |
| current_stage | String        | NOT NULL      | Current workflow stage           |
| auto_advance  | Boolean       | DEFAULT true  | Auto-advance to next stage       |
| status        | String        | NOT NULL      | Project status                   |
| winner        | Boolean       | DEFAULT false | Marked as winner content         |
| created_at    | DateTime      | DEFAULT now() | Creation timestamp               |
| updated_at    | DateTime      | AUTO UPDATE   | Last update timestamp            |

**Relations**:

- `research`: Many-to-One with ResearchArchive
- `stages`: One-to-Many with Stage
- `assets`: One-to-Many with Asset (not enforced in schema)

**Indexes**:

- `research_id` (for filtering by research)
- `status` (for filtering by status)
- `current_stage` (for filtering by stage)

**Valid Values**:

- `current_stage`: "discovery", "production", "review", "publication"
- `status`: "active", "paused", "archived", "completed"

**Business Rules**:

- When deleted, decrements `projects_count` on parent research
- When winner status changes, updates `winners_count` on parent research
- Stages are automatically versioned with unlimited revision history

---

### Stage

Workflow stages for projects with YAML artifacts.

**Table**: `stages`

| Column        | Type          | Constraints   | Description                 |
| ------------- | ------------- | ------------- | --------------------------- |
| id            | String (CUID) | PRIMARY KEY   | Unique identifier           |
| project_id    | String        | FOREIGN KEY   | Reference to projects.id    |
| stage_type    | String        | NOT NULL      | Stage type                  |
| yaml_artifact | String (Text) | NOT NULL      | YAML content from AI agents |
| version       | Int           | DEFAULT 1     | Version number              |
| created_at    | DateTime      | DEFAULT now() | Creation timestamp          |

**Relations**:

- `project`: Many-to-One with Project
- `revisions`: One-to-Many with Revision

**Indexes**:

- `project_id, stage_type` (composite, for finding latest stage)

**Valid Values**:

- `stage_type`: "discovery", "production", "review", "publication"

**Business Rules**:

- Only one "current" stage per project per stage_type
- When updated, old version is archived to `revisions` table
- Version number auto-increments
- Unlimited revision history maintained

---

### Revision

Historical versions of stages for audit trail and rollback.

**Table**: `revisions`

| Column        | Type          | Constraints   | Description                    |
| ------------- | ------------- | ------------- | ------------------------------ |
| id            | String (CUID) | PRIMARY KEY   | Unique identifier              |
| stage_id      | String        | FOREIGN KEY   | Reference to stages.id         |
| project_id    | String        | NOT NULL      | Denormalized project reference |
| stage_type    | String        | NOT NULL      | Denormalized stage type        |
| yaml_artifact | String (Text) | NOT NULL      | Archived YAML content          |
| version       | Int           | NOT NULL      | Version number snapshot        |
| created_at    | DateTime      | DEFAULT now() | Archival timestamp             |

**Relations**:

- `stage`: Many-to-One with Stage

**Indexes**:

- `stage_id` (for finding stage history)
- `project_id, stage_type` (composite, for project-wide history)

**Business Rules**:

- Immutable once created
- Automatically created when stage is updated
- Used for version comparison and rollback

---

### IdeaArchive

Archived ideas from discovery phase that weren't selected.

**Table**: `ideas_archive`

| Column      | Type          | Constraints   | Description                 |
| ----------- | ------------- | ------------- | --------------------------- |
| id          | String (CUID) | PRIMARY KEY   | Unique identifier           |
| research_id | String        | -             | Optional research reference |
| idea_json   | String (Text) | NOT NULL      | JSON with idea details      |
| verdict     | String        | NOT NULL      | Acceptance verdict          |
| archived_at | DateTime      | DEFAULT now() | Archival timestamp          |

**Indexes**:

- `research_id` (for finding archived ideas by research)
- `verdict` (for filtering by outcome)

**Valid Values**:

- `verdict`: "rejected", "needs_revision", "accepted"

**Business Rules**:

- Contains ideas that didn't become projects
- Used for learning and future reference
- JSON structure matches discovery output schema

---

### Template

Reusable configuration templates for AI agents.

**Table**: `templates`

| Column             | Type          | Constraints   | Description              |
| ------------------ | ------------- | ------------- | ------------------------ |
| id                 | String (CUID) | PRIMARY KEY   | Unique identifier        |
| name               | String        | NOT NULL      | Template name            |
| type               | String        | NOT NULL      | Template type            |
| config_json        | String (Text) | NOT NULL      | JSON configuration       |
| parent_template_id | String        | FOREIGN KEY   | Optional parent template |
| created_at         | DateTime      | DEFAULT now() | Creation timestamp       |
| updated_at         | DateTime      | AUTO UPDATE   | Last update timestamp    |

**Relations**:

- `parent`: Many-to-One with Template (self-reference)
- `children`: One-to-Many with Template (self-reference)

**Indexes**:

- `type` (for filtering by template type)

**Valid Values**:

- `type`: "discovery", "production", "review"

**Business Rules**:

- Supports template inheritance (parent-child relationship)
- Circular inheritance prevented (cannot reference self or descendants)
- Parent must be same type as child
- Cannot delete if template has children
- JSON must be valid on creation/update

---

### WordPressConfig

Stored WordPress site credentials for publishing.

**Table**: `wordpress_config`

| Column     | Type          | Constraints   | Description           |
| ---------- | ------------- | ------------- | --------------------- |
| id         | String (CUID) | PRIMARY KEY   | Unique identifier     |
| site_url   | String        | NOT NULL      | WordPress site URL    |
| username   | String        | NOT NULL      | WordPress username    |
| password   | String        | NOT NULL      | Application password  |
| created_at | DateTime      | DEFAULT now() | Creation timestamp    |
| updated_at | DateTime      | AUTO UPDATE   | Last update timestamp |

**Business Rules**:

- Stores credentials for WordPress REST API
- Password should be WordPress Application Password, not user password
- Used by publish endpoint to avoid entering credentials every time
- No encryption implemented yet (single-user system)

---

### Asset

Media assets (images, videos) associated with projects.

**Table**: `assets`

| Column        | Type          | Constraints   | Description         |
| ------------- | ------------- | ------------- | ------------------- |
| id            | String (CUID) | PRIMARY KEY   | Unique identifier   |
| project_id    | String        | NOT NULL      | Project reference   |
| asset_type    | String        | NOT NULL      | Asset type          |
| source        | String        | NOT NULL      | Source platform     |
| source_url    | String        | NOT NULL      | Original asset URL  |
| alt_text      | String        | -             | Alt text for images |
| wordpress_id  | Int           | -             | WordPress media ID  |
| wordpress_url | String        | -             | WordPress media URL |
| created_at    | DateTime      | DEFAULT now() | Creation timestamp  |

**Indexes**:

- `project_id` (for finding assets by project)

**Valid Values**:

- `asset_type`: "image", "video", "audio", "document"
- `source`: "unsplash", "custom", "wordpress", etc.

**Business Rules**:

- Linked to projects but not enforced as foreign key
- Tracks both source (Unsplash) and destination (WordPress) URLs
- Used for media library management

---

## Database Maintenance

### Migrations

All schema changes are managed through Prisma Migrate:

```bash
# Create a new migration
npx prisma migrate dev --name description_of_change

# Apply migrations in production
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

### Indexes

Indexes are strategically placed on:

- Foreign keys for join performance
- Frequently filtered columns (status, stage_type, type, theme)
- Composite indexes for common query patterns

### Data Integrity

- Foreign keys with cascade deletes where appropriate
- Check constraints for enum-like fields
- Default values for counters and timestamps
- Auto-updating timestamps with `@updatedAt`

### Performance Considerations

- Denormalized fields (`projects_count`, `winners_count`) for fast reads
- Composite indexes for common query patterns
- Text type for large content (YAML artifacts, descriptions)
- CUID for globally unique, sortable IDs

---

## Connection Configuration

Database connection is configured in `prisma.config.ts` (Prisma 7):

```typescript
export default {
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
};
```

**Environment Variable**:

```
DATABASE_URL=postgresql://user:password@localhost:5432/bright_curios_workflow
```

---

## Backup Recommendations

For production:

1. Enable PostgreSQL point-in-time recovery (PITR)
2. Daily automated backups
3. Test restore procedures regularly
4. Consider replication for high availability

For development:

```bash
# Export schema and data
pg_dump bright_curios_workflow > backup.sql

# Restore
psql bright_curios_workflow < backup.sql
```
