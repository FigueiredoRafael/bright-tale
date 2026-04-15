# Preview Stage & WordPress Integration — Design Spec

**Date:** 2026-04-15
**Status:** approved

## Goal

Add a Preview stage between Assets and Publish that composes the final blog post with images, categories, tags, and SEO overrides. Then send the fully composed data to WordPress on publish — images stitched into HTML by H2 position, categories/tags resolved, SEO fields applied.

## Architecture

Current pipeline: `Brainstorm → Research → Draft → Review → Assets → Publish`
New pipeline: `Brainstorm → Research → Draft → Review → Assets → Preview → Publish`

Draft content stays immutable after review. Images are stitched into HTML at publish time (server-side). Client preview is display-only — server is authoritative.

---

## 1. Preview Stage — PreviewEngine

### Data Inputs (on mount)

- Draft: `draft_json.full_draft` (markdown), `draft_json.outline` (H2 sections)
- Assets: all `content_assets` for the draft (by `content_id`)
- Review: `review_feedback_json.publication_plan.blog` — categories, tags, final_seo, recommended_publish_date

### Initial Composition

1. Convert `full_draft` markdown → HTML (client-side, for preview only)
2. Match assets to H2 sections **positionally** as default: `body_section_1` → 1st H2, `body_section_2` → 2nd H2, etc.
3. Insert `<figure><img>` **after** each matched `<h2>` tag, before section body content
4. Set featured image at top of post
5. Auto-populate categories, tags, SEO fields, suggested publish date from `publication_plan.blog`

### Rendered HTML structure

```html
<figure><img src="featured.webp" alt="..."></figure>
<h2>Section Title</h2>
<figure><img src="section1.webp" alt="..."></figure>
<p>Section content...</p>
```

### Editable Sections

| Section | Capability |
|---------|-----------|
| Image map | Drag-reassign which image goes to which section slot. Dropdown per slot as fallback. |
| Alt text | Edit per image |
| Featured image | Swap with another uploaded asset |
| Categories | Add/remove from auto-populated list |
| Tags | Add/remove from auto-populated list |
| SEO title | Edit (pre-filled from publication_plan.blog.final_seo.title) |
| SEO slug | Edit (pre-filled from publication_plan.blog.final_seo.slug) |
| SEO meta description | Edit (pre-filled from publication_plan.blog.final_seo.meta_description) |
| Publish date | Pre-filled from recommended_publish_date, editable |

### Layout

Left panel: editable controls (image assignments, categories, tags, SEO fields).
Right panel: live HTML preview that updates as user changes assignments.

### Actions

- "Approve & Continue to Publish" → saves PreviewResult to pipeline context, advances to publish stage
- "Back to Assets" → navigate back

---

## 2. Publish Flow Changes

### PublishPanel Changes

Shows pre-approved data from preview stage as **read-only summary**:
- Categories and tags (chips display)
- SEO title + slug + meta_description
- Featured image thumbnail
- Image count
- Suggested publish date (pre-fills schedule date if mode = schedule)

User only controls:
- WordPress site selector (dropdown, auto-selects if single config)
- Publishing mode: draft / publish / schedule
- Schedule date (if schedule mode, pre-filled from preview)

No content editing — all content decisions finalized in preview.

### PublishEngine Changes

Reads preview data from PipelineContext. Passes to `/publish-draft` as additional payload fields.

---

## 3. API Changes — `POST /publish-draft`

### New Request Fields

```typescript
// Added to publishDraftSchema
imageMap?: Record<string, string>  // role → assetId (user-assigned from preview)
categories?: string[]              // from preview (overrides production_settings_json)
tags?: string[]                    // from preview
seoOverrides?: {                   // from preview (overrides draft_json defaults)
  title: string
  slug: string
  metaDescription: string
}
```

### New Server-Side Stitching Logic

When `imageMap` is provided:

1. Convert `full_draft` markdown → HTML
2. Parse `<h2>` tags in order from HTML
3. For each entry in `imageMap`:
   - `featured_image` → upload to WP, set as `featured_media` on post
   - `body_section_N` → upload to WP, insert `<figure><img src="wp_url" alt="alt_text"></figure>` **after** the Nth `<h2>` tag
4. Only upload images referenced in `imageMap` (skip unused assets)
5. Apply `seoOverrides`: use `title`, `slug`, `metaDescription` for WP post fields
6. Resolve `categories` and `tags` via existing `resolveCategories()`/`resolveTags()` functions

### Backward Compatibility

If `imageMap` not provided: falls back to current behavior (fetch all assets, use role-based placeholder matching with `<!-- IMAGE:role -->`).

### Validation

- `imageMap` must include `featured_image` key (required when imageMap is provided)
- Section images optional
- Categories/tags: empty arrays allowed

---

## 4. PipelineContext & Types

### New PipelineContext Fields

```typescript
// From preview stage
previewImageMap?: Record<string, string>
previewCategories?: string[]
previewTags?: string[]
previewSeoOverrides?: { title: string; slug: string; metaDescription: string }
previewPublishDate?: string
previewComposedHtml?: string  // display-only, server recomposes
```

### New Type: PreviewResult

```typescript
interface PreviewResult {
  imageMap: Record<string, string>
  categories: string[]
  tags: string[]
  seoOverrides: { title: string; slug: string; metaDescription: string }
  suggestedPublishDate?: string
  composedHtml: string  // client-side preview HTML (display only)
}
```

### PIPELINE_STAGES Update

```typescript
const PIPELINE_STAGES = ['brainstorm', 'research', 'draft', 'review', 'assets', 'preview', 'publish']
```

---

## 5. Publish Progress UI

Publishing to WordPress is a multi-step process that can take 10-30 seconds (image uploads are slow). The user needs real-time feedback on what's happening.

### Progress Steps Shown to User

| Step | Label | Detail shown |
|------|-------|-------------|
| 1 | Preparing content | "Converting markdown to HTML..." |
| 2 | Uploading featured image | "Uploading featured image to WordPress..." |
| 3 | Uploading section images | "Uploading image 1 of N..." (updates per image) |
| 4 | Resolving categories | "Creating/matching N categories..." |
| 5 | Resolving tags | "Creating/matching N tags..." |
| 6 | Publishing post | "Creating post on WordPress..." or "Scheduling post..." |
| 7 | Done | "Published! View post →" with link |

### Implementation

**Server-side**: The `/publish-draft` endpoint sends Server-Sent Events (SSE) for each step. New endpoint: `POST /publish-draft/stream` that returns `text/event-stream`.

Each event:
```
data: {"step": "uploading_images", "progress": 2, "total": 4, "message": "Uploading image 2 of 4..."}
```

**Client-side**: PublishEngine connects to SSE stream on publish click. Shows a vertical stepper/progress UI:
- Each step: icon + label + status (pending / in-progress with spinner / done with checkmark / failed with X)
- Current step highlighted with animation
- Error on any step: show error message inline, offer retry button
- On completion: show success banner with link to WordPress post

### Fallback

If SSE not feasible (Vercel serverless limitations), fall back to polling:
- `POST /publish-draft` returns immediately with `{ jobId }`
- Client polls `GET /publish-draft/:jobId/status` every 2 seconds
- Same progress data, just polled instead of streamed

### UI States

**Before publish**: Summary of what will be published (from preview data). Publish button.
**During publish**: Progress stepper. No navigation away — warn if user tries to leave.
**After publish**: Success state with WordPress post link, WP post ID. Option to view on site. "Done" button completes pipeline.
**On error**: Failed step shown in red. Error message. "Retry" button resumes from failed step.

---

## 6. Files to Create/Modify

| File | Action |
|------|--------|
| `apps/app/src/components/engines/PreviewEngine.tsx` | CREATE — new preview stage component |
| `apps/app/src/components/engines/types.ts` | MODIFY — add PreviewResult, update PipelineContext |
| `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` | MODIFY — add preview stage, wire context |
| `apps/app/src/components/pipeline/PipelineStages.tsx` | MODIFY — add preview step |
| `apps/app/src/components/engines/PublishEngine.tsx` | MODIFY — read preview data from context |
| `apps/app/src/components/preview/PublishPanel.tsx` | MODIFY — show preview summary, pass to API |
| `apps/api/src/routes/wordpress.ts` | MODIFY — extend publish-draft schema + H2 stitching logic + SSE streaming endpoint |
| `apps/app/src/components/publish/PublishProgress.tsx` | CREATE — progress stepper component for publish flow |
| `packages/shared/src/schemas/` | MODIFY — update publishDraftSchema if shared |

---

## 6. Edge Cases

- **No review data**: If publication_plan is missing (e.g., review was skipped or manual), categories/tags/SEO fields start empty. User fills manually in preview.
- **No section images**: Only featured image required. Sections without images render normally (no figure tag).
- **Fewer images than H2s**: Unmatched H2s get no image. No error.
- **More images than H2s**: Extra images listed in preview but not assigned. User can reassign.
- **Draft without outline**: Fall back to inserting images in order between block elements. Edge case — most drafts have outlines.
