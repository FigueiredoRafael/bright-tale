# API Documentation

## Overview

This document provides detailed information about all REST API endpoints available in the BrightCurios Workflow platform.

**Base URL**: `http://localhost:3000/api` (development)

**Authentication**: Not implemented yet (single-user system)

**Response Format**: All responses follow a consistent format:

```json
{
  "data": {
    /* response data */
  },
  "error": {
    /* only present on errors */
  }
}
```

---

## Research Archive API

### Create Research

**POST** `/api/research`

Create a new research entry for idea exploration.

**Request Body**:

```json
{
  "theme": "Content Marketing Trends 2026",
  "description": "Research on emerging content marketing strategies",
  "sources": [
    {
      "title": "Content Marketing Institute Report",
      "url": "https://example.com/report",
      "content_type": "article",
      "notes": "Key insights on video content"
    }
  ]
}
```

**Response** (201):

```json
{
  "data": {
    "id": "clx...",
    "theme": "Content Marketing Trends 2026",
    "description": "Research on emerging content marketing strategies",
    "projects_count": 0,
    "winners_count": 0,
    "created_at": "2026-01-30T10:00:00.000Z",
    "updated_at": "2026-01-30T10:00:00.000Z"
  }
}
```

### List Research

**GET** `/api/research`

List all research entries with optional filtering, sorting, and pagination.

**Query Parameters**:

- `theme` (string, optional): Filter by theme (partial match)
- `search` (string, optional): Search in theme and description
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20)
- `sort_by` (string, optional): Field to sort by (default: "created_at")
- `sort_order` (string, optional): "asc" or "desc" (default: "desc")

**Example**: `/api/research?theme=marketing&page=1&limit=10&sort_by=projects_count&sort_order=desc`

**Response** (200):

```json
{
  "data": {
    "research": [
      {
        "id": "clx...",
        "theme": "Content Marketing Trends 2026",
        "description": "Research on emerging strategies",
        "projects_count": 5,
        "winners_count": 2,
        "created_at": "2026-01-30T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 25,
      "page": 1,
      "limit": 10,
      "total_pages": 3
    }
  }
}
```

### Get Research Details

**GET** `/api/research/:id`

Get detailed information about a specific research entry including sources and related projects.

**Response** (200):

```json
{
  "data": {
    "id": "clx...",
    "theme": "Content Marketing Trends 2026",
    "description": "Research description",
    "projects_count": 5,
    "winners_count": 2,
    "created_at": "2026-01-30T10:00:00.000Z",
    "sources": [
      {
        "id": "clx...",
        "title": "Content Marketing Institute Report",
        "url": "https://example.com/report",
        "content_type": "article",
        "notes": "Key insights"
      }
    ],
    "projects": [
      {
        "id": "clx...",
        "title": "Video Content Strategy Guide",
        "status": "active",
        "current_stage": "production"
      }
    ]
  }
}
```

### Update Research

**PUT** `/api/research/:id`

Update a research entry.

**Request Body**:

```json
{
  "theme": "Updated Theme",
  "description": "Updated description"
}
```

### Delete Research

**DELETE** `/api/research/:id`

Delete a research entry. Fails if there are associated projects.

**Response** (200):

```json
{
  "data": {
    "deleted": true,
    "research_id": "clx...",
    "message": "Research deleted successfully"
  }
}
```

### Add Source to Research

**POST** `/api/research/:id/sources`

Add a new source to an existing research entry.

**Request Body**:

```json
{
  "title": "New Article",
  "url": "https://example.com/article",
  "content_type": "article",
  "notes": "Relevant insights"
}
```

### Remove Source from Research

**DELETE** `/api/research/:id/sources/:sourceId`

Remove a source from a research entry.

---

## Projects API

### Create Project

**POST** `/api/projects`

Create a new content project.

**Request Body**:

```json
{
  "title": "Ultimate Guide to Video Marketing",
  "research_id": "clx...",
  "auto_advance": true
}
```

**Response** (201):

```json
{
  "data": {
    "id": "clx...",
    "title": "Ultimate Guide to Video Marketing",
    "research_id": "clx...",
    "current_stage": "discovery",
    "auto_advance": true,
    "status": "active",
    "winner": false,
    "created_at": "2026-01-30T10:00:00.000Z"
  }
}
```

### List Projects

**GET** `/api/projects`

List all projects with filtering options.

**Query Parameters**:

- `status` (string): "active", "paused", "archived", "completed"
- `stage` (string): "discovery", "production", "review", "publication"
- `winner` (boolean): Filter winner projects
- `research_id` (string): Filter by research ID
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `sort_by` (string): Field to sort by (default: "created_at")
- `sort_order` (string): "asc" or "desc" (default: "desc")

### Get Project Details

**GET** `/api/projects/:id`

Get detailed project information including research, stages, and counts.

### Update Project

**PUT** `/api/projects/:id`

Update project details.

**Request Body**:

```json
{
  "title": "Updated Title",
  "status": "paused",
  "current_stage": "production",
  "auto_advance": false
}
```

### Delete Project

**DELETE** `/api/projects/:id`

Delete a project and update research counters.

### Bulk Operations

**POST** `/api/projects/bulk`

Perform bulk operations on multiple projects.

**Request Body**:

```json
{
  "operation": "archive",
  "project_ids": ["clx1...", "clx2...", "clx3..."]
}
```

**Operations**: `delete`, `archive`, `activate`, `pause`, `complete`

### Mark as Winner

**PUT** `/api/projects/:id/winner`

Toggle winner status for a project.

**Request Body**:

```json
{
  "winner": true
}
```

---

## Stages API

### Create/Update Stage

**POST** `/api/stages`

Create a new stage or update an existing one (creates new version).

**Request Body**:

```json
{
  "project_id": "clx...",
  "stage_type": "discovery",
  "yaml_artifact": "performance_review:\n  platform: youtube\n  ..."
}
```

### Get All Stages

**GET** `/api/stages/:projectId`

Get all stages for a project grouped by type.

**Response** (200):

```json
{
  "data": {
    "stages": {
      "discovery": {
        "id": "clx...",
        "version": 2,
        "yaml_artifact": "...",
        "created_at": "2026-01-30T10:00:00.000Z"
      },
      "production": {
        "id": "clx...",
        "version": 1,
        "yaml_artifact": "...",
        "created_at": "2026-01-30T09:00:00.000Z"
      }
    }
  }
}
```

### Get Specific Stage

**GET** `/api/stages/:projectId/:stageType`

Get the latest version of a specific stage type with revision history.

**Response** (200):

```json
{
  "data": {
    "current": {
      "id": "clx...",
      "version": 3,
      "yaml_artifact": "...",
      "created_at": "2026-01-30T10:00:00.000Z"
    },
    "revisions": [
      {
        "id": "clx...",
        "version": 2,
        "yaml_artifact": "...",
        "created_at": "2026-01-30T09:00:00.000Z"
      }
    ]
  }
}
```

### Create Manual Revision

**POST** `/api/stages/:projectId/:stageType/revisions`

Create a manual revision of a stage.

**Request Body**:

```json
{
  "yaml_artifact": "updated content..."
}
```

---

## Templates API

### Create Template

**POST** `/api/templates`

Create a new template with optional parent inheritance.

**Request Body**:

```json
{
  "name": "YouTube Video Template",
  "type": "production",
  "config_json": "{\"tone\": \"professional\", \"length\": \"10-15 minutes\"}",
  "parent_template_id": "clx..."
}
```

### List Templates

**GET** `/api/templates`

List all templates with filtering.

**Query Parameters**:

- `type` (string): "discovery", "production", "review"
- `parent_id` (string): Filter by parent template ID
- `search` (string): Search in name
- `page`, `limit`, `sort_by`, `sort_order`

### Get Template

**GET** `/api/templates/:id`

Get raw template details including parent and children templates (raw `config_json` as stored). To retrieve the fully-resolved merged config (parent chain merged with child overrides), use **GET** `/api/templates/:id/resolved`.

### Export Jobs (Async export scaffold)

**POST** `/api/export/jobs`

- Request: `{ project_ids: string[] }`
- Response: `{ job_id: string }`

**GET** `/api/export/jobs/:id`

- Response: `{ job_id, status }` where status is one of `pending`, `done`, or `failed`.

**GET** `/api/export/jobs/:id/download`

- Returns the exported JSON file as an attachment when the job is `done`.

### Update Template

**PUT** `/api/templates/:id`

Update template with circular inheritance prevention.

### Delete Template

**DELETE** `/api/templates/:id`

Delete template. Fails if template has children.

---

## WordPress API

### Test Connection

**POST** `/api/wordpress/test`

Test WordPress REST API connection.

**Request Body**:

```json
{
  "site_url": "https://yoursite.com",
  "username": "admin",
  "password": "your-app-password"
}
```

**Response** (200):

```json
{
  "data": {
    "connected": true,
    "site_url": "https://yoursite.com",
    "message": "WordPress connection successful"
  }
}
```

### Publish to WordPress

**POST** `/api/wordpress/publish`

Publish a project's blog content to WordPress.

**Request Body**:

```json
{
  "project_id": "clx...",
  "config_id": "clx...",
  "status": "draft",
  "categories": [1, 3],
  "tags": [5, 7, 9]
}
```

**Alternative** (direct credentials):

```json
{
  "project_id": "clx...",
  "site_url": "https://yoursite.com",
  "username": "admin",
  "password": "your-app-password",
  "status": "publish"
}
```

**Response** (201):

```json
{
  "data": {
    "published": true,
    "wordpress_post_id": 123,
    "wordpress_url": "https://yoursite.com/blog-post",
    "status": "draft",
    "message": "Successfully published to WordPress"
  }
}
```

### Fetch Categories

**GET** `/api/wordpress/categories`

Fetch WordPress categories.

**Query Parameters**:

- `config_id` (string): Stored WordPress config ID
- OR `site_url`, `username`, `password`: Direct credentials

**Response** (200):

```json
{
  "data": {
    "categories": [
      {
        "id": 1,
        "name": "Technology",
        "slug": "technology",
        "count": 42
      }
    ],
    "total": 5
  }
}
```

### Fetch Tags

**GET** `/api/wordpress/tags`

Fetch WordPress tags. Same parameters and response format as categories.

---

## Assets API

### Search Unsplash

**GET** `/api/assets/unsplash/search`

Search Unsplash for images.

**Query Parameters**:

- `query` (string, required): Search query
- `page` (number): Page number (default: 1)
- `per_page` (number): Results per page (default: 20)
- `orientation` (string): "landscape", "portrait", or "squarish"

**Example**: `/api/assets/unsplash/search?query=mountains&orientation=landscape&per_page=10`

**Response** (200):

```json
{
  "data": {
    "results": [
      {
        "id": "abc123",
        "description": "Mountain landscape",
        "alt_text": "Snow-capped mountain peaks",
        "urls": {
          "raw": "https://...",
          "full": "https://...",
          "regular": "https://...",
          "small": "https://...",
          "thumb": "https://..."
        },
        "user": {
          "name": "John Doe",
          "username": "johndoe",
          "profile": "https://unsplash.com/@johndoe"
        },
        "width": 4000,
        "height": 3000
      }
    ],
    "total": 1234,
    "total_pages": 62,
    "page": 1,
    "per_page": 20
  }
}
```

### Save Asset

**POST** `/api/assets`

Save an asset to the database.

**Request Body**:

```json
{
  "project_id": "clx...",
  "asset_type": "image",
  "source": "unsplash",
  "source_url": "https://images.unsplash.com/...",
  "alt_text": "Mountain landscape photo",
  "wordpress_id": 456,
  "wordpress_url": "https://yoursite.com/wp-content/uploads/..."
}
```

### Get Project Assets

**GET** `/api/assets/:projectId`

Get all assets for a project.

**Response** (200):

```json
{
  "data": {
    "assets": [
      {
        "id": "clx...",
        "project_id": "clx...",
        "asset_type": "image",
        "source": "unsplash",
        "source_url": "https://...",
        "alt_text": "Mountain landscape",
        "wordpress_id": 456,
        "created_at": "2026-01-30T10:00:00.000Z"
      }
    ],
    "count": 3
  }
}
```

### Delete Asset

**DELETE** `/api/assets/:id`

Delete an asset.

---

## Error Responses

All endpoints return consistent error responses:

**Validation Error** (400):

```json
{
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "path": ["title"],
        "message": "Title is required"
      }
    ]
  }
}
```

**Not Found** (404):

```json
{
  "error": {
    "message": "Project not found",
    "code": "NOT_FOUND"
  }
}
```

**Server Error** (500):

```json
{
  "error": {
    "message": "Internal server error",
    "code": "INTERNAL_ERROR"
  }
}
```

## Rate Limiting

Currently no rate limiting is implemented (single-user system).

## Notes

- All timestamps are in ISO 8601 format (UTC)
- IDs are generated using CUID
- The WordPress API uses Basic Authentication (application passwords)
- Unsplash API requires `UNSPLASH_ACCESS_KEY` environment variable
