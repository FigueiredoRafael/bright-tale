# Manual Asset Generation Flow — Design Spec

**Date:** 2026-04-15
**Status:** Approved

## Goal

Add a 3-step manual asset generation workflow to AssetsEngine so users can generate blog/video images via external AI tools (ChatGPT, Gemini, Midjourney, DALL-E) with structured prompt briefs derived from their content and channel context.

## Architecture

The feature adds:
- A new asset agent definition (`agent-5-assets.md`) for prompt brief generation
- A 4-phase state machine in `AssetsEngine` (prompts → refined → upload → done)
- Two new API endpoints (asset-prompts extraction, image upload with WebP)
- Seed update for the agent prompt

No new dependencies. Uses existing `sharp` for WebP, existing `saveImageLocally` for storage, existing `content_assets` table.

---

## 1. Asset Agent Definition

**File:** `agents/agent-5-assets.md`

**Purpose:** Generate structured image prompt briefs for each content section, with a cohesive visual direction derived from channel context.

### Input Contract (`BC_ASSETS_INPUT`)

```json
{
  "BC_ASSETS_INPUT": {
    "title": "The 85% Rule: The Scientific Sweet Spot for Learning Anything",
    "content_type": "blog",
    "outline": [
      {
        "h2": "The Trap of Perfection",
        "key_points": ["Zero failure equals zero new information", "..."]
      }
    ],
    "channel_context": {
      "niche": "science, productivity",
      "niche_tags": ["cognitive science", "learning"],
      "tone": "informative",
      "language": "English",
      "market": "global",
      "region": "US"
    }
  }
}
```

### Output Contract (`BC_ASSETS_OUTPUT`)

```json
{
  "BC_ASSETS_OUTPUT": {
    "visual_direction": {
      "style": "minimalist scientific illustration with clean geometry",
      "color_palette": ["#1a1a2e", "#16213e", "#0f3460", "#e94560"],
      "mood": "intellectual, clean, curiosity-driven",
      "constraints": [
        "no text or words in images",
        "no realistic human faces unless contextually required",
        "consistent color temperature across all images"
      ]
    },
    "slots": [
      {
        "slot": "featured",
        "section_title": "The 85% Rule: The Scientific Sweet Spot",
        "prompt_brief": "A brain diagram with 85% of neurons illuminated in warm tones and 15% dim, scientific visualization, clean lines, dark background with subtle grid pattern",
        "style_rationale": "Featured image must immediately convey the core concept — the balance between success and failure in learning",
        "aspect_ratio": "16:9"
      },
      {
        "slot": "section_1",
        "section_title": "The Trap of Perfection",
        "prompt_brief": "A pristine golden trophy with a hairline crack, spotlight, minimalist dark background",
        "style_rationale": "Visual metaphor for the illusion that perfection equals progress",
        "aspect_ratio": "16:9"
      }
    ]
  }
}
```

**Rules:**
- One `featured` slot always generated
- One slot per H2 section from the blog outline
- `prompt_brief` must be 50-200 characters, descriptive scene/composition/lighting
- Never include text/words in prompts (image generation limitation)
- `aspect_ratio` defaults to `16:9` for blog, `1:1` for thumbnails
- `visual_direction` applies to ALL slots — ensures visual consistency
- Derive style from channel niche + tone + audience (no hardcoded presets)

---

## 2. AssetsEngine Phase Machine

**File:** `apps/app/src/components/engines/AssetsEngine.tsx`

### Phase State

```typescript
type AssetPhase = 'prompts' | 'refined' | 'upload' | 'done';
```

### Phase Details

#### Phase: `prompts`

The user generates or obtains structured prompt briefs.

**AI mode:**
- Calls `POST /api/content-drafts/:id/asset-prompts` to get section data
- Sends to asset agent via existing `generateWithFallback`
- On success, auto-populates slot cards → skips to `refined` phase

**Manual mode (ManualModePanel):**
- `agentSlug="assets"` loads the asset agent prompt from DB
- `inputContext` built from draft title, outline sections, channel context
- User copies prompt → pastes into external AI → gets `BC_ASSETS_OUTPUT`
- On paste/import, parses JSON → populates slot cards → moves to `refined` phase

**Existing AI "Generate All" path:**
- Still available as a third option
- Calls `POST /api/content-drafts/:id/generate-assets`
- Skips directly to `done` phase

#### Phase: `refined`

Editable slot cards populated from the parsed `BC_ASSETS_OUTPUT`.

Each card shows:
- Slot name badge (`featured`, `section_1`, etc.)
- Section title
- Prompt text — **editable textarea** (user can tweak before generating)
- Style rationale — read-only text
- Aspect ratio selector (`16:9`, `1:1`, `9:16`, `4:3`)

**Visual direction banner** at top showing style, mood, color palette swatches, constraints.

**Actions:**
- "Start Uploading" button → moves to `upload` phase
- "Paste New Prompts" → re-paste JSON, overwrite current slots
- Individual slot edit (inline textarea)

#### Phase: `upload`

Same slot cards, now in upload mode. Each card shows:
- Slot name + section title + refined prompt (read-only, collapsed)
- **Upload area:** "Upload File" button (file picker) + "Paste URL" text input
- Image preview (thumbnail) once uploaded
- Delete button to remove and re-upload
- Alt text input field

**Progress indicator:** "3 of 5 images uploaded" with progress bar.

**Upload mechanics:**
- File: client reads as base64 → `POST /api/assets/upload`
- URL: client sends URL → same endpoint, server downloads + saves

Each upload immediately creates a `content_assets` row with:
- `role`: mapped from slot name (`featured` → `featured_image`, `section_1` → `body_section_1`)
- `source_type`: `manual_upload` (file) or `external_url` (URL)
- `meta_json`: `{ prompt, style_rationale, aspect_ratio }`
- `url`: original image path
- `webp_url`: WebP-converted path

**Minimum to proceed:** Featured image must be uploaded. Section images are optional.

**Actions:**
- "Finish" button → moves to `done` phase (enabled when featured image exists)
- Back to `refined` phase (non-destructive)

#### Phase: `done`

- AssetGallery showing all uploaded images mapped to roles
- "Continue to Publish" button → calls `onComplete` with asset IDs
- "Add More Images" → back to `upload` phase

### Phase Stepper

Horizontal stepper at top (matching DraftEngine pattern):
```
Prompt Briefs ——— Refine Prompts ——— Upload Images ——— Done
```

### State Restoration

When revisiting from publish stage (same pattern as DraftEngine):
- If assets exist for the draft → load them → skip to `done` phase
- If no assets → start at `prompts` phase

---

## 3. API Endpoints

### `POST /api/content-drafts/:id/asset-prompts`

**File:** `apps/api/src/routes/content-drafts.ts`

Extracts section data from the draft + fetches channel context. Pure data extraction, no AI call.

**Request:** Empty body (draft ID in URL)

**Response:**
```json
{
  "data": {
    "title": "The 85% Rule...",
    "content_type": "blog",
    "sections": [
      {
        "slot": "featured",
        "section_title": "The 85% Rule: The Scientific Sweet Spot",
        "key_points": []
      },
      {
        "slot": "section_1",
        "section_title": "The Trap of Perfection",
        "key_points": ["Zero failure equals zero new information", "..."]
      }
    ],
    "channel_context": {
      "niche": "science, productivity",
      "niche_tags": ["cognitive science"],
      "tone": "informative",
      "language": "English",
      "market": "global",
      "region": "US"
    }
  },
  "error": null
}
```

**Logic:**
1. Load draft → extract `draft_json.blog.outline` (array of `{ h2, key_points }`)
2. Build featured slot from title
3. Build section slots from each outline H2
4. If draft has `channel_id`, fetch channel → extract context fields
5. Return structured data

### `POST /api/assets/upload`

**File:** `apps/api/src/routes/assets.ts`

Accepts either base64 image data or an external URL. Saves original + WebP. Creates `content_assets` row.

**Request (file upload):**
```json
{
  "base64": "iVBORw0KGgo...",
  "mimeType": "image/png",
  "draftId": "uuid",
  "role": "featured_image",
  "altText": "Brain diagram showing 85% illumination",
  "prompt": "A brain diagram with 85% neurons illuminated...",
  "styleRationale": "Featured image must convey the core concept"
}
```

**Request (URL):**
```json
{
  "url": "https://example.com/generated-image.png",
  "draftId": "uuid",
  "role": "featured_image",
  "altText": "...",
  "prompt": "...",
  "styleRationale": "..."
}
```

**Logic:**
1. Validate with Zod schema (base64+mimeType OR url required, draftId required)
2. If URL: fetch image → get buffer + detect mimeType
3. Save original via `saveImageLocally(base64, mimeType, projectId)`
4. Convert to WebP via `convertToWebP(buffer, 80)` → save WebP version
5. Look up draft → get `org_id`, `user_id`
6. Insert `content_assets` row:
   - `url`: original public URL
   - `webp_url`: WebP public URL (null if conversion failed)
   - `role`: from request
   - `alt_text`: from request
   - `source_type`: `manual_upload` or `external_url`
   - `meta_json`: `{ prompt, style_rationale }`
   - `credits_used`: 0 (manual uploads are free)
7. Return the created asset record

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "url": "/generated-images/project-id/uuid.png",
    "webp_url": "/generated-images/project-id/uuid.webp",
    "role": "featured_image",
    "alt_text": "...",
    "source_type": "manual_upload"
  },
  "error": null
}
```

---

## 4. Seed Update

**File:** `supabase/seed.sql`

New row in `agent_prompts` table:
- `id`: `agent-5-assets`
- `name`: `Assets Agent`
- `slug`: `assets`
- `stage`: `assets`
- `instructions`: Full agent-5-assets.md content

Generated via existing `scripts/generate-seed.ts` after creating the agent definition file.

---

## 5. Slot-to-Role Mapping

| Slot name | DB role | Position |
|-----------|---------|----------|
| `featured` | `featured_image` | 0 |
| `section_1` | `body_section_1` | 1 |
| `section_2` | `body_section_2` | 2 |
| `section_N` | `body_section_N` | N |

This matches the existing `AssetGallery` role expectations.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `agents/agent-5-assets.md` | CREATE — Asset agent prompt definition |
| `apps/app/src/components/engines/AssetsEngine.tsx` | REWRITE — 4-phase state machine with manual flow |
| `apps/api/src/routes/content-drafts.ts` | ADD — `POST /:id/asset-prompts` endpoint |
| `apps/api/src/routes/assets.ts` | ADD — `POST /upload` endpoint |
| `supabase/seed.sql` | UPDATE — Add agent-5-assets row |
| `scripts/generate-seed.ts` | No change (already reads agents/ folder) |
| `packages/shared/src/types/agents.ts` | No change (BC_ASSETS_OUTPUT is agent-side only) |

---

## Out of Scope

- Video thumbnail generation (same pattern, future extension)
- Bulk image generation via AI (existing path, unchanged)
- Channel-level image style presets (derive from niche/tone for now)
- Multipart file upload (base64 JSON sufficient for blog images <10MB)
