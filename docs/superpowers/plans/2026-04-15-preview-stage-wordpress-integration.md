# Preview Stage & WordPress Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Preview stage between Assets and Publish that lets users assign images to sections, edit categories/tags/SEO, see a live preview, then publish to WordPress with progress feedback.

**Architecture:** New PreviewEngine component composes the post client-side for preview. On publish, server recomposes authoritatively — stitches images after H2 tags, resolves categories/tags via WP API, uploads media. SSE stream provides real-time progress to client.

**Tech Stack:** Next.js 16 (React 19), Fastify 4, Supabase, WordPress REST API, Server-Sent Events, Zod, shadcn/ui, Tailwind CSS 4

---

### Task 1: Update Pipeline Types — Add Preview Stage

**Files:**
- Modify: `apps/app/src/components/engines/types.ts`

- [ ] **Step 1: Add 'preview' to PipelineStage union**

In `apps/app/src/components/engines/types.ts`, update the PipelineStage type (line 1) and PIPELINE_STAGES constant (line 9):

```typescript
// Line 1 — add 'preview' before 'publish'
export type PipelineStage = 'brainstorm' | 'research' | 'draft' | 'review' | 'assets' | 'preview' | 'publish';

// Line 9 — add 'preview' before 'publish'  
export const PIPELINE_STAGES: PipelineStage[] = ['brainstorm', 'research', 'draft', 'review', 'assets', 'preview', 'publish'];
```

- [ ] **Step 2: Add PreviewResult interface**

After the AssetsResult interface (line 69), add:

```typescript
export interface PreviewResult {
  imageMap: Record<string, string>;  // role → assetId
  altTexts: Record<string, string>;  // role → alt text
  categories: string[];
  tags: string[];
  seoOverrides: { title: string; slug: string; metaDescription: string };
  suggestedPublishDate?: string;
  composedHtml: string;  // client-side preview (display only)
}
```

- [ ] **Step 3: Update StageResult union**

Add PreviewResult to the StageResult union (line 76):

```typescript
export type StageResult = BrainstormResult | ResearchResult | DraftResult | ReviewResult | AssetsResult | PreviewResult | PublishResult;
```

- [ ] **Step 4: Update PipelineContext**

Add preview fields to PipelineContext interface (after line 34, before the publish fields):

```typescript
  // From preview stage
  previewImageMap?: Record<string, string>;
  previewAltTexts?: Record<string, string>;
  previewCategories?: string[];
  previewTags?: string[];
  previewSeoOverrides?: { title: string; slug: string; metaDescription: string };
  previewPublishDate?: string;
```

- [ ] **Step 5: Update PipelineState stageResults**

Add preview to stageResults in PipelineState interface (after line 103, the assets line):

```typescript
      preview?: PreviewResult & { completedAt: string };
```

- [ ] **Step 6: Verify typecheck passes**

Run: `npx tsc --noEmit -p apps/app/tsconfig.json`
Expected: errors in PipelineOrchestrator and PipelineStages (they reference the old stage list) — that's fine, we fix those next.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/components/engines/types.ts
git commit -m "feat(types): add preview stage to pipeline types"
```

---

### Task 2: Update PipelineStages Component — Add Preview Step

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineStages.tsx`

- [ ] **Step 1: Add 'preview' to PipelineStep type and STEPS array**

In `apps/app/src/components/pipeline/PipelineStages.tsx`, add the preview step.

Update the PipelineStep type (line 9) — add `'preview'` before `'published'`:

```typescript
export type PipelineStep = 'brainstorm' | 'research' | 'draft' | 'review' | 'assets' | 'preview' | 'published';
```

Add to the STEPS array (after the assets entry, before the published entry):

```typescript
{ key: 'preview' as PipelineStep, label: 'Preview', icon: Eye },
```

Import `Eye` from lucide-react at the top of the file.

- [ ] **Step 2: Update buildStepUrl to handle preview**

In the `buildStepUrl` function, add a case for 'preview'. Preview doesn't have its own standalone page — it's inline in the pipeline. Return `#` or the project URL:

```typescript
case 'preview':
  return projectId ? `/channels/${channelId}/projects/${projectId}` : '#';
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit -p apps/app/tsconfig.json`
Expected: Fewer errors now. PipelineOrchestrator still needs updating.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/pipeline/PipelineStages.tsx
git commit -m "feat(pipeline): add preview step to pipeline stages UI"
```

---

### Task 3: Update publishDraftSchema — Add imageMap, seoOverrides

**Files:**
- Modify: `packages/shared/src/schemas/pipeline.ts`

- [ ] **Step 1: Extend publishDraftSchema**

In `packages/shared/src/schemas/pipeline.ts` (lines 151-158), add new optional fields:

```typescript
export const publishDraftSchema = z.object({
  draftId: z.string().uuid(),
  configId: z.string().uuid().optional(),
  mode: z.enum(['draft', 'publish', 'schedule']),
  scheduledDate: z.string().datetime().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  imageMap: z.record(z.string(), z.string().uuid()).optional(),
  altTexts: z.record(z.string(), z.string()).optional(),
  seoOverrides: z.object({
    title: z.string(),
    slug: z.string(),
    metaDescription: z.string(),
  }).optional(),
});
```

- [ ] **Step 2: Verify shared package builds**

Run: `npx tsc --noEmit -p packages/shared/tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas/pipeline.ts
git commit -m "feat(schema): add imageMap and seoOverrides to publishDraftSchema"
```

---

### Task 4: Server-Side H2 Stitching Logic in publish-draft

**Files:**
- Modify: `apps/api/src/routes/wordpress.ts`

- [ ] **Step 1: Add stitchImagesIntoHtml helper function**

Before the `assetsRoutes` export (around line 30 area in wordpress.ts), add a helper function. Place it after the existing `uploadImageToWordPress` helper:

```typescript
/**
 * Stitch images into HTML after <h2> tags by position.
 * body_section_1 → after 1st <h2>, body_section_2 → after 2nd <h2>, etc.
 */
function stitchImagesAfterH2(
  html: string,
  uploadedMedia: Record<string, { wpId: number; wpUrl: string }>,
  altTexts: Record<string, string>,
): string {
  // Find all <h2> positions
  const h2Regex = /<h2[^>]*>.*?<\/h2>/gi;
  const h2Matches: { index: number; length: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = h2Regex.exec(html)) !== null) {
    h2Matches.push({ index: match.index, length: match[0].length });
  }

  // Build insertion map: section number → media
  const insertions: { afterIndex: number; html: string }[] = [];
  for (const [role, media] of Object.entries(uploadedMedia)) {
    if (role === 'featured_image') continue;
    const sectionMatch = role.match(/body_section_(\d+)/);
    if (!sectionMatch) continue;
    const sectionNum = parseInt(sectionMatch[1], 10);
    const h2 = h2Matches[sectionNum - 1]; // 1-indexed
    if (!h2) continue;
    const alt = (altTexts[role] ?? '').replace(/"/g, '&quot;');
    const figureTag = `<figure class="wp-block-image"><img src="${media.wpUrl}" alt="${alt}" class="wp-image-${media.wpId}" /></figure>`;
    insertions.push({ afterIndex: h2.index + h2.length, html: figureTag });
  }

  // Insert in reverse order so indices don't shift
  insertions.sort((a, b) => b.afterIndex - a.afterIndex);
  let result = html;
  for (const ins of insertions) {
    result = result.slice(0, ins.afterIndex) + '\n' + ins.html + '\n' + result.slice(ins.afterIndex);
  }

  return result;
}
```

- [ ] **Step 2: Update the publish-draft handler to use imageMap when provided**

In the publish-draft handler (around line 958), replace the image upload section. The key change: when `body.imageMap` is provided, only upload images from the map and use H2 stitching instead of placeholder replacement.

Find the block starting at line 958 (`// Fetch content_assets for this draft`) through line 1001 (end of placeholder replacement). Replace with:

```typescript
      // Fetch content_assets for this draft
      const { data: assets } = await sb
        .from('content_assets')
        .select('*')
        .eq('draft_id', body.draftId);

      // Upload images to WordPress — prefer WebP, fall back to original
      const uploadedMedia: Record<string, { wpId: number; wpUrl: string }> = {};
      const assetsById = new Map((assets ?? []).map((a: any) => [a.id, a]));

      if (body.imageMap) {
        // New flow: only upload images from the user-assigned imageMap
        for (const [role, assetId] of Object.entries(body.imageMap)) {
          const asset = assetsById.get(assetId) as Record<string, unknown> | undefined;
          if (!asset) continue;
          const imageUrl = (asset.webp_url as string) || (asset.url as string);
          if (!imageUrl) continue;

          const altText = body.altTexts?.[role] ?? (asset.alt_text as string) ?? (draft.title as string) ?? '';
          const wpMediaId = await uploadImageToWordPress(imageUrl, altText, site_url, auth);

          const mediaResp = await fetch(`${site_url}/wp-json/wp/v2/media/${wpMediaId}`, { headers });
          let wpUrl = '';
          if (mediaResp.ok) {
            const mediaData = (await mediaResp.json()) as Record<string, unknown>;
            wpUrl = (mediaData.source_url as string) ?? '';
          }
          uploadedMedia[role] = { wpId: wpMediaId, wpUrl };
        }
      } else {
        // Legacy flow: upload all assets, use role-based matching
        for (const rawAsset of assets ?? []) {
          const asset = rawAsset as Record<string, unknown>;
          const imageUrl = (asset.webp_url as string) || (asset.url as string);
          if (!imageUrl) continue;

          const wpMediaId = await uploadImageToWordPress(
            imageUrl,
            (asset.alt_text as string) || (draft.title as string) || '',
            site_url,
            auth,
          );

          const mediaResp = await fetch(`${site_url}/wp-json/wp/v2/media/${wpMediaId}`, { headers });
          let wpUrl = '';
          if (mediaResp.ok) {
            const mediaData = (await mediaResp.json()) as Record<string, unknown>;
            wpUrl = (mediaData.source_url as string) ?? '';
          }

          const role = (asset.role as string) ?? `position_${(asset.position as number) ?? 0}`;
          uploadedMedia[role] = { wpId: wpMediaId, wpUrl };
        }
      }

      // Process blog content
      const draftJson = draft.draft_json as Record<string, unknown> | null;
      let blogBody = (draftJson?.full_draft as string) ?? '';

      if (body.imageMap) {
        // New flow: convert markdown first, then stitch images after <h2> tags
        const htmlContent = markdownToHtml(blogBody);
        blogBody = stitchImagesAfterH2(htmlContent, uploadedMedia, body.altTexts ?? {});
      } else {
        // Legacy flow: replace placeholders, then convert
        for (const [role, media] of Object.entries(uploadedMedia)) {
          if (role === 'featured_image') continue;
          const placeholder = new RegExp(`<!--\\s*IMAGE:${role}\\s*-->`, 'gi');
          const imgTag = `<figure><img src="${media.wpUrl}" alt="" class="wp-image-${media.wpId}" /></figure>`;
          blogBody = blogBody.replace(placeholder, imgTag);
        }
        blogBody = markdownToHtml(blogBody);
      }
```

- [ ] **Step 3: Apply seoOverrides in post data construction**

Update the post data section (around line 1019). Replace:

```typescript
      const postData: Record<string, unknown> = {
        title: draft.title ?? draftJson?.title ?? 'Untitled',
        slug: (draftJson?.slug as string) ?? undefined,
        content: htmlContent,
        excerpt: (draftJson?.meta_description as string) ?? '',
        status: body.mode === 'schedule' ? 'future' : body.mode,
      };
```

With:

```typescript
      const seo = body.seoOverrides;
      const postData: Record<string, unknown> = {
        title: seo?.title ?? draft.title ?? draftJson?.title ?? 'Untitled',
        slug: seo?.slug ?? (draftJson?.slug as string) ?? undefined,
        content: blogBody,
        excerpt: seo?.metaDescription ?? (draftJson?.meta_description as string) ?? '',
        status: body.mode === 'schedule' ? 'future' : body.mode,
      };
```

Note: also change `content: htmlContent` to `content: blogBody` since the variable name changed in step 2.

- [ ] **Step 4: Verify API builds**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/wordpress.ts
git commit -m "feat(wordpress): H2 image stitching + seoOverrides in publish-draft"
```

---

### Task 5: SSE Streaming Endpoint for Publish Progress

**Files:**
- Modify: `apps/api/src/routes/wordpress.ts`

- [ ] **Step 1: Add POST /publish-draft/stream endpoint**

Register this endpoint BEFORE the existing `/publish-draft` route (route ordering matters in Fastify). This is a new route that wraps the same logic but sends SSE events:

```typescript
  /**
   * POST /publish-draft/stream — Same as publish-draft but streams progress via SSE
   */
  fastify.post('/publish-draft/stream', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = publishDraftSchema.parse(request.body);

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      function sendEvent(step: string, message: string, progress?: number, total?: number) {
        const data = JSON.stringify({ step, message, progress, total });
        reply.raw.write(`data: ${data}\n\n`);
      }

      function sendError(step: string, message: string) {
        const data = JSON.stringify({ step, message, error: true });
        reply.raw.write(`data: ${data}\n\n`);
        reply.raw.end();
      }

      function sendDone(result: Record<string, unknown>) {
        const data = JSON.stringify({ step: 'done', message: 'Published!', result });
        reply.raw.write(`data: ${data}\n\n`);
        reply.raw.end();
      }

      // Step 1: Load draft
      sendEvent('preparing', 'Loading draft data...');
      const draft = await loadDraftForPublish(sb, body.draftId);
      if (!draft) {
        sendError('preparing', 'Draft not found');
        return;
      }

      // Resolve WordPress config
      const config = await resolveWpConfig(sb, body.configId);
      if (!config) {
        sendError('preparing', 'WordPress configuration not found');
        return;
      }

      const { site_url, username, password } = config;
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };

      // Step 2: Upload featured image
      const { data: assets } = await sb
        .from('content_assets')
        .select('*')
        .eq('draft_id', body.draftId);

      const assetsById = new Map((assets ?? []).map((a: any) => [a.id, a]));
      const uploadedMedia: Record<string, { wpId: number; wpUrl: string }> = {};
      const imageEntries = body.imageMap ? Object.entries(body.imageMap) : [];
      const featuredEntry = imageEntries.find(([role]) => role === 'featured_image');
      const sectionEntries = imageEntries.filter(([role]) => role !== 'featured_image');

      if (featuredEntry) {
        sendEvent('uploading_featured', 'Uploading featured image to WordPress...');
        const [role, assetId] = featuredEntry;
        const asset = assetsById.get(assetId) as Record<string, unknown> | undefined;
        if (asset) {
          const imageUrl = (asset.webp_url as string) || (asset.url as string);
          if (imageUrl) {
            const altText = body.altTexts?.[role] ?? (asset.alt_text as string) ?? '';
            const wpMediaId = await uploadImageToWordPress(imageUrl, altText, site_url, auth);
            const mediaResp = await fetch(`${site_url}/wp-json/wp/v2/media/${wpMediaId}`, { headers });
            let wpUrl = '';
            if (mediaResp.ok) {
              const mediaData = (await mediaResp.json()) as Record<string, unknown>;
              wpUrl = (mediaData.source_url as string) ?? '';
            }
            uploadedMedia[role] = { wpId: wpMediaId, wpUrl };
          }
        }
      }

      // Step 3: Upload section images
      if (sectionEntries.length > 0) {
        for (let i = 0; i < sectionEntries.length; i++) {
          const [role, assetId] = sectionEntries[i];
          sendEvent('uploading_images', `Uploading image ${i + 1} of ${sectionEntries.length}...`, i + 1, sectionEntries.length);
          const asset = assetsById.get(assetId) as Record<string, unknown> | undefined;
          if (!asset) continue;
          const imageUrl = (asset.webp_url as string) || (asset.url as string);
          if (!imageUrl) continue;
          const altText = body.altTexts?.[role] ?? (asset.alt_text as string) ?? '';
          const wpMediaId = await uploadImageToWordPress(imageUrl, altText, site_url, auth);
          const mediaResp = await fetch(`${site_url}/wp-json/wp/v2/media/${wpMediaId}`, { headers });
          let wpUrl = '';
          if (mediaResp.ok) {
            const mediaData = (await mediaResp.json()) as Record<string, unknown>;
            wpUrl = (mediaData.source_url as string) ?? '';
          }
          uploadedMedia[role] = { wpId: wpMediaId, wpUrl };
        }
      }

      // Step 4: Compose HTML
      sendEvent('composing', 'Converting markdown to HTML...');
      const draftJson = draft.draft_json as Record<string, unknown> | null;
      let blogBody = (draftJson?.full_draft as string) ?? '';

      if (body.imageMap) {
        const htmlContent = markdownToHtml(blogBody);
        blogBody = stitchImagesAfterH2(htmlContent, uploadedMedia, body.altTexts ?? {});
      } else {
        for (const [role, media] of Object.entries(uploadedMedia)) {
          if (role === 'featured_image') continue;
          const placeholder = new RegExp(`<!--\\s*IMAGE:${role}\\s*-->`, 'gi');
          const imgTag = `<figure><img src="${media.wpUrl}" alt="" class="wp-image-${media.wpId}" /></figure>`;
          blogBody = blogBody.replace(placeholder, imgTag);
        }
        blogBody = markdownToHtml(blogBody);
      }

      // Step 5: Resolve categories
      const prodSettings = draft.production_settings_json as Record<string, unknown> | null;
      const categoryNames = body.categories ?? (prodSettings?.categories as string[]) ?? [];
      const tagNames = body.tags ?? (prodSettings?.tags as string[]) ?? [];

      if (categoryNames.length > 0) {
        sendEvent('categories', `Resolving ${categoryNames.length} categories...`);
      }
      const categoryIds = await resolveCategories(categoryNames, site_url, headers);

      // Step 6: Resolve tags
      if (tagNames.length > 0) {
        sendEvent('tags', `Resolving ${tagNames.length} tags...`);
      }
      const tagIds = await resolveTags(tagNames, site_url, headers);

      // Step 7: Publish
      sendEvent('publishing', 'Creating post on WordPress...');
      const seo = body.seoOverrides;
      const postData: Record<string, unknown> = {
        title: seo?.title ?? draft.title ?? draftJson?.title ?? 'Untitled',
        slug: seo?.slug ?? (draftJson?.slug as string) ?? undefined,
        content: blogBody,
        excerpt: seo?.metaDescription ?? (draftJson?.meta_description as string) ?? '',
        status: body.mode === 'schedule' ? 'future' : body.mode,
      };
      if (body.mode === 'schedule' && body.scheduledDate) postData.date = body.scheduledDate;
      if (categoryIds.length > 0) postData.categories = categoryIds;
      if (tagIds.length > 0) postData.tags = tagIds;

      const featured = uploadedMedia['featured_image'];
      if (featured) postData.featured_media = featured.wpId;

      const existingPostId = (draft.wordpress_post_id as number | null) ?? null;
      let wpResponse: Response;
      if (existingPostId) {
        wpResponse = await fetch(`${site_url}/wp-json/wp/v2/posts/${existingPostId}`, {
          method: 'PUT', headers, body: JSON.stringify(postData),
        });
      } else {
        wpResponse = await fetch(`${site_url}/wp-json/wp/v2/posts`, {
          method: 'POST', headers, body: JSON.stringify(postData),
        });
      }

      if (!wpResponse.ok) {
        const errText = await wpResponse.text();
        sendError('publishing', `WordPress error: ${errText}`);
        return;
      }

      const wpPost = (await wpResponse.json()) as Record<string, unknown>;
      const wpPostId = wpPost.id as number;
      const wpLink = wpPost.link as string;

      // Update draft in DB
      await sb.from('content_drafts').update({
        wordpress_post_id: wpPostId,
        published_url: wpLink,
        status: body.mode === 'schedule' ? 'scheduled' : 'published',
        published_at: new Date().toISOString(),
      }).eq('id', body.draftId);

      sendDone({ wordpress_post_id: wpPostId, published_url: wpLink });
    } catch (error: any) {
      request.log.error({ err: error }, 'Publish stream error');
      try {
        const data = JSON.stringify({ step: 'error', message: error.message ?? 'Unknown error', error: true });
        reply.raw.write(`data: ${data}\n\n`);
        reply.raw.end();
      } catch {
        // Reply already ended
      }
    }
  });
```

- [ ] **Step 2: Extract loadDraftForPublish and resolveWpConfig helpers**

To avoid code duplication, extract two small helpers used by both the original and streaming endpoint. Place them near the top of the route file, after the existing helpers:

```typescript
async function loadDraftForPublish(sb: ReturnType<typeof createServiceClient>, draftId: string) {
  const { data: draft, error } = await sb
    .from('content_drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle();
  if (error) throw error;
  return draft;
}

async function resolveWpConfig(sb: ReturnType<typeof createServiceClient>, configId?: string) {
  if (!configId) return null;
  const { data: config, error } = await sb
    .from('wordpress_configs')
    .select('*')
    .eq('id', configId)
    .maybeSingle();
  if (error) throw error;
  if (!config) return null;
  const { decrypt } = await import('../lib/crypto.js');
  return {
    site_url: config.site_url as string,
    username: config.username as string,
    password: decrypt(config.password as string),
  };
}
```

- [ ] **Step 3: Verify API builds**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/wordpress.ts
git commit -m "feat(wordpress): add SSE streaming endpoint for publish progress"
```

---

### Task 6: PublishProgress Component

**Files:**
- Create: `apps/app/src/components/publish/PublishProgress.tsx`

- [ ] **Step 1: Create the publish progress stepper component**

```typescript
'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, ExternalLink } from 'lucide-react';

interface ProgressEvent {
  step: string;
  message: string;
  progress?: number;
  total?: number;
  error?: boolean;
  result?: { wordpress_post_id: number; published_url: string };
}

const STEP_ORDER = [
  { key: 'preparing', label: 'Preparing content' },
  { key: 'uploading_featured', label: 'Uploading featured image' },
  { key: 'uploading_images', label: 'Uploading section images' },
  { key: 'composing', label: 'Composing HTML' },
  { key: 'categories', label: 'Resolving categories' },
  { key: 'tags', label: 'Resolving tags' },
  { key: 'publishing', label: 'Publishing to WordPress' },
  { key: 'done', label: 'Done' },
];

interface PublishProgressProps {
  publishBody: Record<string, unknown>;
  onComplete: (result: { wordpressPostId: number; publishedUrl: string }) => void;
  onError: (message: string) => void;
}

export function PublishProgress({ publishBody, onComplete, onError }: PublishProgressProps) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [currentStep, setCurrentStep] = useState<string>('preparing');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ wordpress_post_id: number; published_url: string } | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function stream() {
      try {
        const response = await fetch('/api/wordpress/publish-draft/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(publishBody),
        });

        if (!response.ok || !response.body) {
          onError('Failed to start publish stream');
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as ProgressEvent;
              setEvents((prev) => [...prev, event]);
              setCurrentStep(event.step);

              if (event.error) {
                setError(event.message);
                onError(event.message);
                return;
              }

              if (event.step === 'done' && event.result) {
                setResult(event.result);
                onComplete({
                  wordpressPostId: event.result.wordpress_post_id,
                  publishedUrl: event.result.published_url,
                });
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream connection failed';
        setError(msg);
        onError(msg);
      }
    }

    void stream();
  }, [publishBody, onComplete, onError]);

  function stepStatus(stepKey: string): 'pending' | 'active' | 'done' | 'error' {
    if (error && currentStep === stepKey) return 'error';
    const currentIdx = STEP_ORDER.findIndex((s) => s.key === currentStep);
    const stepIdx = STEP_ORDER.findIndex((s) => s.key === stepKey);
    if (stepIdx < currentIdx) return 'done';
    if (stepIdx === currentIdx) return result ? 'done' : 'active';
    return 'pending';
  }

  const lastEvent = events[events.length - 1];

  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <div className="space-y-3">
          {STEP_ORDER.map((step) => {
            const status = stepStatus(step.key);
            return (
              <div key={step.key} className="flex items-center gap-3">
                {status === 'done' && <Check className="h-4 w-4 text-green-500 shrink-0" />}
                {status === 'active' && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                {status === 'error' && <X className="h-4 w-4 text-red-500 shrink-0" />}
                {status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${
                    status === 'active' ? 'text-foreground font-medium'
                      : status === 'done' ? 'text-muted-foreground'
                      : status === 'error' ? 'text-red-500'
                      : 'text-muted-foreground/50'
                  }`}>
                    {step.label}
                  </span>
                  {status === 'active' && lastEvent && (
                    <p className="text-xs text-muted-foreground mt-0.5">{lastEvent.message}</p>
                  )}
                  {status === 'error' && error && (
                    <p className="text-xs text-red-400 mt-0.5">{error}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {result && (
          <div className="rounded-md bg-green-50 dark:bg-green-950 p-3 space-y-2">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              Published successfully!
            </p>
            <a
              href={result.published_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 underline"
            >
              View post <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit -p apps/app/tsconfig.json`
Expected: PASS (component not imported yet, so no downstream issues)

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/publish/PublishProgress.tsx
git commit -m "feat(publish): add PublishProgress SSE stepper component"
```

---

### Task 7: PreviewEngine Component

**Files:**
- Create: `apps/app/src/components/engines/PreviewEngine.tsx`

- [ ] **Step 1: Create the preview engine component**

This is the largest component. It fetches draft + assets + review data, builds a live preview, and lets the user reassign images, edit categories/tags/SEO.

```typescript
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight, Eye, X, Plus, GripVertical, ImageIcon, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ContextBanner } from './ContextBanner';
import type { PipelineContext, PipelineStage, PreviewResult, StageResult } from './types';

interface ContentAsset {
  id: string;
  url: string;
  webpUrl: string | null;
  role: string | null;
  altText: string | null;
}

interface PreviewEngineProps {
  channelId: string;
  context: PipelineContext;
  draftId: string;
  onComplete: (result: StageResult) => void;
  onBack?: (targetStage?: PipelineStage) => void;
}

interface SlotAssignment {
  role: string;
  label: string;
  assetId: string | null;
  altText: string;
}

export function PreviewEngine({ channelId, context, draftId, onComplete, onBack }: PreviewEngineProps) {
  const [loading, setLoading] = useState(true);
  const [draftData, setDraftData] = useState<Record<string, unknown> | null>(null);
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [slots, setSlots] = useState<SlotAssignment[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [seo, setSeo] = useState({ title: '', slug: '', metaDescription: '' });
  const [publishDate, setPublishDate] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');

  // Fetch draft + assets + extract review data
  useEffect(() => {
    async function load() {
      try {
        const [draftRes, assetsRes] = await Promise.all([
          fetch(`/api/content-drafts/${draftId}`),
          fetch(`/api/assets?content_id=${draftId}`),
        ]);
        const draftJson = await draftRes.json();
        const assetsJson = await assetsRes.json();

        const draft = draftJson.data as Record<string, unknown>;
        setDraftData(draft);

        const rawAssets = Array.isArray(assetsJson.data)
          ? assetsJson.data
          : (assetsJson.data?.assets ?? []);
        const mapped: ContentAsset[] = (rawAssets as Array<Record<string, unknown>>).map((a) => ({
          id: a.id as string,
          url: (a.source_url as string) ?? (a.url as string) ?? '',
          webpUrl: (a.webp_url as string) ?? null,
          role: (a.role as string) ?? null,
          altText: (a.alt_text as string) ?? null,
        }));
        setAssets(mapped);

        // Build slots from draft outline
        const dj = draft.draft_json as Record<string, unknown> | null;
        const outline = (dj?.outline as Array<Record<string, unknown>>) ?? [];
        const builtSlots: SlotAssignment[] = [
          {
            role: 'featured_image',
            label: 'Featured Image',
            assetId: mapped.find((a) => a.role === 'featured_image')?.id ?? null,
            altText: mapped.find((a) => a.role === 'featured_image')?.altText ?? '',
          },
        ];
        outline.forEach((section, i) => {
          const role = `body_section_${i + 1}`;
          const existing = mapped.find((a) => a.role === role);
          builtSlots.push({
            role,
            label: (section.h2 as string) ?? `Section ${i + 1}`,
            assetId: existing?.id ?? null,
            altText: existing?.altText ?? '',
          });
        });
        setSlots(builtSlots);

        // Extract publication plan from review feedback
        const reviewFeedback = draft.review_feedback_json as Record<string, unknown> | null;
        const pubPlan = (reviewFeedback?.publication_plan as Record<string, unknown>) ?? {};
        const blogPlan = (pubPlan.blog as Record<string, unknown>) ?? {};
        const finalSeo = (blogPlan.final_seo as Record<string, unknown>) ?? {};

        setCategories((blogPlan.categories as string[]) ?? []);
        setTags((blogPlan.tags as string[]) ?? []);
        setSeo({
          title: (finalSeo.title as string) ?? (draft.title as string) ?? '',
          slug: (finalSeo.slug as string) ?? (dj?.slug as string) ?? '',
          metaDescription: (finalSeo.meta_description as string) ?? (dj?.meta_description as string) ?? '',
        });
        setPublishDate((blogPlan.recommended_publish_date as string) ?? '');
      } catch {
        toast.error('Failed to load preview data');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [draftId]);

  // Build composed HTML for preview
  const composedHtml = useMemo(() => {
    if (!draftData) return '';
    const dj = draftData.draft_json as Record<string, unknown> | null;
    const markdown = (dj?.full_draft as string) ?? '';

    // Simple markdown → HTML (client-side approximation)
    let html = markdown
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[h|b|p|f])/gm, '');
    html = `<p>${html}</p>`;

    // Insert featured image at top
    const featuredSlot = slots.find((s) => s.role === 'featured_image');
    if (featuredSlot?.assetId) {
      const asset = assets.find((a) => a.id === featuredSlot.assetId);
      if (asset) {
        const imgUrl = asset.webpUrl ?? asset.url;
        html = `<figure class="featured"><img src="${imgUrl}" alt="${featuredSlot.altText}" style="width:100%;max-height:400px;object-fit:cover;border-radius:8px;" /></figure>\n` + html;
      }
    }

    // Insert section images after each <h2>
    const h2Regex = /<h2>(.*?)<\/h2>/gi;
    let h2Index = 0;
    html = html.replace(h2Regex, (match) => {
      h2Index++;
      const slot = slots.find((s) => s.role === `body_section_${h2Index}`);
      if (slot?.assetId) {
        const asset = assets.find((a) => a.id === slot.assetId);
        if (asset) {
          const imgUrl = asset.webpUrl ?? asset.url;
          return `${match}\n<figure><img src="${imgUrl}" alt="${slot.altText}" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin:16px 0;" /></figure>`;
        }
      }
      return match;
    });

    return html;
  }, [draftData, slots, assets]);

  // Handle slot image assignment change
  const updateSlotAsset = useCallback((role: string, assetId: string | null) => {
    setSlots((prev) => prev.map((s) => s.role === role ? { ...s, assetId } : s));
  }, []);

  const updateSlotAlt = useCallback((role: string, altText: string) => {
    setSlots((prev) => prev.map((s) => s.role === role ? { ...s, altText } : s));
  }, []);

  // Handle approve
  function handleApprove() {
    const imageMap: Record<string, string> = {};
    const altTexts: Record<string, string> = {};
    for (const slot of slots) {
      if (slot.assetId) {
        imageMap[slot.role] = slot.assetId;
        altTexts[slot.role] = slot.altText;
      }
    }

    if (!imageMap['featured_image']) {
      toast.error('Featured image is required');
      return;
    }

    const result: PreviewResult = {
      imageMap,
      altTexts,
      categories,
      tags,
      seoOverrides: seo,
      suggestedPublishDate: publishDate || undefined,
      composedHtml,
    };
    onComplete(result);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading preview...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ContextBanner stage="preview" context={context} onBack={onBack} />

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Eye className="h-5 w-5" /> Post Preview
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and adjust the final post before publishing.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left panel: Controls */}
        <div className="space-y-4">

          {/* Image Assignments */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Image Assignments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {slots.map((slot) => (
                <div key={slot.role} className="space-y-1.5 p-2 rounded border">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <Badge variant={slot.role === 'featured_image' ? 'default' : 'outline'} className="text-[10px]">
                      {slot.role === 'featured_image' ? 'Featured' : slot.role.replace('body_', '')}
                    </Badge>
                    <span className="text-xs truncate flex-1">{slot.label}</span>
                  </div>
                  <select
                    value={slot.assetId ?? ''}
                    onChange={(e) => updateSlotAsset(slot.role, e.target.value || null)}
                    className="w-full text-xs border rounded px-2 py-1 bg-background"
                  >
                    <option value="">No image</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.role ?? 'Unnamed'} — {a.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={slot.altText}
                    onChange={(e) => updateSlotAlt(slot.role, e.target.value)}
                    placeholder="Alt text..."
                    className="text-xs h-7"
                  />
                  {slot.assetId && (
                    <img
                      src={assets.find((a) => a.id === slot.assetId)?.url ?? ''}
                      alt={slot.altText}
                      className="h-16 w-full object-cover rounded"
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* SEO */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">SEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Title</Label>
                <Input value={seo.title} onChange={(e) => setSeo({ ...seo, title: e.target.value })} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Slug</Label>
                <Input value={seo.slug} onChange={(e) => setSeo({ ...seo, slug: e.target.value })} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Meta Description</Label>
                <Textarea value={seo.metaDescription} onChange={(e) => setSeo({ ...seo, metaDescription: e.target.value })} rows={2} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Suggested Publish Date</Label>
                <Input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} className="text-sm" />
              </div>
            </CardContent>
          </Card>

          {/* Categories */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <Badge key={cat} variant="secondary" className="gap-1 text-xs">
                    {cat}
                    <button onClick={() => setCategories((prev) => prev.filter((c) => c !== cat))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Add category..."
                  className="text-xs h-7"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCategory.trim()) {
                      setCategories((prev) => [...prev, newCategory.trim()]);
                      setNewCategory('');
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  disabled={!newCategory.trim()}
                  onClick={() => { setCategories((prev) => [...prev, newCategory.trim()]); setNewCategory(''); }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="gap-1 text-xs">
                    {tag}
                    <button onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add tag..."
                  className="text-xs h-7"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTag.trim()) {
                      setTags((prev) => [...prev, newTag.trim()]);
                      setNewTag('');
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  disabled={!newTag.trim()}
                  onClick={() => { setTags((prev) => [...prev, newTag.trim()]); setNewTag(''); }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right panel: Live preview */}
        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" /> Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="prose prose-sm dark:prose-invert max-w-none max-h-[70vh] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: composedHtml }}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleApprove} className="gap-2">
          Approve & Continue to Publish <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => onBack?.()}>
          Back to Assets
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit -p apps/app/tsconfig.json`
Expected: May show errors in PipelineOrchestrator (not wired yet). Component itself should be clean.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/engines/PreviewEngine.tsx
git commit -m "feat(preview): add PreviewEngine component with live HTML preview"
```

---

### Task 8: Wire Preview Stage into PipelineOrchestrator

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`

- [ ] **Step 1: Import PreviewEngine**

Add import at the top, near other engine imports:

```typescript
import { PreviewEngine } from '@/components/engines/PreviewEngine';
```

- [ ] **Step 2: Update buildContext to accumulate preview data**

In `buildContext()` function, after the assets block (around line 95), add:

```typescript
    if (sr.preview) {
      ctx.previewImageMap = sr.preview.imageMap;
      ctx.previewAltTexts = sr.preview.altTexts;
      ctx.previewCategories = sr.preview.categories;
      ctx.previewTags = sr.preview.tags;
      ctx.previewSeoOverrides = sr.preview.seoOverrides;
      ctx.previewPublishDate = sr.preview.suggestedPublishDate;
    }
```

- [ ] **Step 3: Add preview case to renderActiveEngine**

In the `renderActiveEngine` switch, add a case for 'preview' between assets and publish:

```typescript
      case 'preview':
        if (!ctx.draftId) {
          return (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading draft...
                </div>
              </CardContent>
            </Card>
          );
        }
        return (
          <PreviewEngine
            channelId={channelId}
            context={ctx}
            draftId={ctx.draftId}
            onComplete={handleStageComplete}
            onBack={handleBack}
          />
        );
```

- [ ] **Step 4: Update draftData fetch useEffect**

In the useEffect that fetches draftData (around line 331), add 'preview' to the stage check:

Change:
```typescript
if ((stage === 'review' || stage === 'publish' || stage === 'assets') && ctx.draftId && (needsFresh || !draftData)) {
```
To:
```typescript
const needsFresh = stage === 'publish';
if ((stage === 'review' || stage === 'publish' || stage === 'assets' || stage === 'preview') && ctx.draftId && (needsFresh || !draftData)) {
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npx tsc --noEmit -p apps/app/tsconfig.json`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/components/pipeline/PipelineOrchestrator.tsx
git commit -m "feat(pipeline): wire PreviewEngine into orchestrator"
```

---

### Task 9: Update PublishEngine + PublishPanel — Show Preview Summary + SSE Progress

**Files:**
- Modify: `apps/app/src/components/engines/PublishEngine.tsx`
- Modify: `apps/app/src/components/preview/PublishPanel.tsx`

- [ ] **Step 1: Update PublishEngine to pass preview data and use SSE**

Rewrite `apps/app/src/components/engines/PublishEngine.tsx`:

```typescript
'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { PublishPanel } from '@/components/preview/PublishPanel';
import { PublishProgress } from '@/components/publish/PublishProgress';
import { ContextBanner } from './ContextBanner';
import type { PipelineContext, PipelineStage, PublishResult, StageResult } from './types';

interface PublishEngineProps {
  channelId: string;
  context: PipelineContext;
  draftId: string;
  draft: {
    id: string;
    title: string | null;
    status: string;
    wordpress_post_id: number | null;
    published_url: string | null;
  };
  assetCount: number;
  onComplete: (result: StageResult) => void;
  onBack?: (targetStage?: PipelineStage) => void;
}

export function PublishEngine({
  channelId,
  context,
  draftId,
  draft,
  assetCount,
  onComplete,
  onBack,
}: PublishEngineProps) {
  const [publishing, setPublishing] = useState(false);
  const [publishBody, setPublishBody] = useState<Record<string, unknown> | null>(null);

  function handlePublish(params: { mode: string; configId: string; scheduledDate?: string }) {
    const body: Record<string, unknown> = {
      draftId,
      configId: params.configId,
      mode: params.mode,
      scheduledDate: params.scheduledDate,
    };

    // Inject preview data from pipeline context
    if (context.previewImageMap) body.imageMap = context.previewImageMap;
    if (context.previewAltTexts) body.altTexts = context.previewAltTexts;
    if (context.previewCategories) body.categories = context.previewCategories;
    if (context.previewTags) body.tags = context.previewTags;
    if (context.previewSeoOverrides) body.seoOverrides = context.previewSeoOverrides;

    setPublishBody(body);
    setPublishing(true);
  }

  const handleStreamComplete = useCallback((result: { wordpressPostId: number; publishedUrl: string }) => {
    toast.success('Published successfully!');
    const publishResult: PublishResult = {
      wordpressPostId: result.wordpressPostId,
      publishedUrl: result.publishedUrl,
    };
    onComplete(publishResult);
  }, [onComplete]);

  const handleStreamError = useCallback((message: string) => {
    toast.error(message);
    setPublishing(false);
    setPublishBody(null);
  }, []);

  return (
    <div className="space-y-6">
      <ContextBanner stage="publish" context={context} onBack={onBack} />

      {publishing && publishBody ? (
        <div className="max-w-lg">
          <PublishProgress
            publishBody={publishBody}
            onComplete={handleStreamComplete}
            onError={handleStreamError}
          />
        </div>
      ) : (
        <div className="max-w-lg">
          <PublishPanel
            draftId={draftId}
            draftStatus={draft.status}
            hasAssets={assetCount > 0}
            wordpressPostId={draft.wordpress_post_id}
            publishedUrl={draft.published_url}
            onPublish={handlePublish}
            isPublishing={publishing}
            previewData={context.previewSeoOverrides ? {
              categories: context.previewCategories ?? [],
              tags: context.previewTags ?? [],
              seo: context.previewSeoOverrides,
              featuredImageUrl: context.featuredImageUrl,
              imageCount: context.assetIds?.length ?? 0,
              suggestedDate: context.previewPublishDate,
            } : undefined}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update PublishPanel to show preview summary**

Add `previewData` prop to PublishPanel and show a read-only summary section. In `apps/app/src/components/preview/PublishPanel.tsx`, update the props interface and add the summary:

Add to PublishPanelProps interface:

```typescript
  previewData?: {
    categories: string[];
    tags: string[];
    seo: { title: string; slug: string; metaDescription: string };
    featuredImageUrl?: string;
    imageCount: number;
    suggestedDate?: string;
  };
```

Add the prop to the destructured params and render a summary section before the WordPress site selector, inside the `{(canPublish || isPublished) && (` block:

```typescript
            {/* Preview summary (read-only) */}
            {previewData && (
              <div className="space-y-3 p-3 rounded-md border bg-muted/30">
                <p className="text-xs font-medium">Publishing Summary</p>
                <div className="space-y-1.5 text-xs">
                  <div><span className="text-muted-foreground">Title:</span> {previewData.seo.title}</div>
                  <div><span className="text-muted-foreground">Slug:</span> /{previewData.seo.slug}</div>
                  <div><span className="text-muted-foreground">Images:</span> {previewData.imageCount}</div>
                  {previewData.categories.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-muted-foreground">Categories:</span>
                      {previewData.categories.map((c) => (
                        <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  )}
                  {previewData.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-muted-foreground">Tags:</span>
                      {previewData.tags.map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
```

Also add `Badge` to imports in PublishPanel:
```typescript
import { Badge } from '@/components/ui/badge';
```

Pre-fill scheduledDate from `previewData.suggestedDate` if available. In the component, after existing state declarations:
```typescript
  useEffect(() => {
    if (previewData?.suggestedDate && !scheduledDate) {
      setScheduledDate(previewData.suggestedDate);
    }
  }, [previewData?.suggestedDate]);
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit -p apps/app/tsconfig.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/engines/PublishEngine.tsx apps/app/src/components/preview/PublishPanel.tsx
git commit -m "feat(publish): show preview summary + SSE progress in publish flow"
```

---

### Task 10: Add ContextBanner Support for Preview Stage

**Files:**
- Modify: `apps/app/src/components/engines/ContextBanner.tsx`

- [ ] **Step 1: Add 'preview' to the stage label map**

In `ContextBanner.tsx`, find where stage labels are mapped and add:

```typescript
preview: 'Preview',
```

If there's a stage → icon mapping, add:
```typescript
preview: Eye,
```

And import `Eye` from lucide-react if not already imported.

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/engines/ContextBanner.tsx
git commit -m "feat(context): add preview stage to ContextBanner"
```

---

## Execution Order

| # | Task | Scope | Depends On |
|---|------|-------|------------|
| 1 | Pipeline types | types.ts | None |
| 2 | PipelineStages UI | PipelineStages.tsx | Task 1 |
| 3 | publishDraftSchema | pipeline.ts (shared) | None |
| 4 | H2 stitching logic | wordpress.ts | Task 3 |
| 5 | SSE streaming endpoint | wordpress.ts | Task 4 |
| 6 | PublishProgress component | PublishProgress.tsx | None |
| 7 | PreviewEngine component | PreviewEngine.tsx | Task 1 |
| 8 | Wire into orchestrator | PipelineOrchestrator.tsx | Tasks 1, 2, 7 |
| 9 | Publish engine + panel update | PublishEngine.tsx, PublishPanel.tsx | Tasks 1, 5, 6 |
| 10 | ContextBanner update | ContextBanner.tsx | None |

Tasks 1, 3, 6, 10 can run in parallel. Tasks 4-5 are sequential. Tasks 7-9 depend on earlier tasks.
