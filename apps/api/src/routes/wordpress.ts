/**
 * WordPress Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { authenticateWithUser } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { markdownToHtml } from '../lib/utils.js';
import { convertToWebP } from '../lib/image/webp.js';
import { getKeyByToken, createKey, consumeKey, deleteKey } from '../lib/idempotency.js';
import {
  publishToWordPressSchema,
  fetchTagsQuerySchema,
  fetchCategoriesQuerySchema,
} from '@brighttale/shared/schemas/wordpress';
import { publishDraftSchema } from '@brighttale/shared/schemas/pipeline';
import { ingest, flushAxiom } from '../lib/axiom.js';
import { loadPersonaForDraft } from '../lib/personas.js';

export interface WpPostDataInput {
  title: string;
  slug?: string;
  content: string;
  excerpt: string;
  status: string;
  date?: string;
  categories?: number[];
  tags?: number[];
  featuredMedia?: number;
  authorId?: number | null;
}

export function buildWpPostData(input: WpPostDataInput): Record<string, unknown> {
  const postData: Record<string, unknown> = {
    title: input.title,
    content: input.content,
    excerpt: input.excerpt,
    status: input.status,
  };
  if (input.slug) postData.slug = input.slug;
  if (input.date) postData.date = input.date;
  if (input.categories?.length) postData.categories = input.categories;
  if (input.tags?.length) postData.tags = input.tags;
  if (input.featuredMedia) postData.featured_media = input.featuredMedia;
  if (input.authorId != null) postData.author = input.authorId;
  return postData;
}

// Helper: Upload image to WordPress Media Library
async function uploadImageToWordPress(
  imageUrl: string,
  altText: string,
  siteUrl: string,
  auth: string,
): Promise<number> {
  let buffer: Buffer;
  let mimeType = 'image/jpeg';

  if (imageUrl.startsWith('/')) {
    // Local file — read from disk (apps/api/public/)
    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
    const localPath = path.resolve(apiRoot, imageUrl.replace(/^\//, ''));
    if (!localPath.startsWith(apiRoot)) {
      throw new ApiError(400, 'Invalid image path');
    }
    if (!fs.existsSync(localPath)) {
      throw new ApiError(400, `Local image not found: ${imageUrl}`);
    }
    buffer = fs.readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
  } else {
    // Remote URL — download
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new ApiError(400, 'Failed to download image from source URL');
    }
    const imageBlob = await imageResponse.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    mimeType = imageBlob.type || 'image/jpeg';
  }

  // Get filename from URL or generate one
  const urlParts = imageUrl.split('/');
  const filename = urlParts[urlParts.length - 1].split('?')[0] || 'image.jpg';

  // Upload to WordPress
  const uploadResponse = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': mimeType,
    },
    body: new Uint8Array(buffer),
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new ApiError(
      uploadResponse.status,
      `Failed to upload image to WordPress: ${errorText}`,
    );
  }

  const mediaData = await uploadResponse.json() as any;

  // Set alt text
  if (altText) {
    await fetch(`${siteUrl}/wp-json/wp/v2/media/${mediaData.id}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ alt_text: altText }),
    });
  }

  return mediaData.id;
}

/**
 * Stitch images into HTML after <h2> tags by position.
 * body_section_1 → after 1st <h2>, body_section_2 → after 2nd <h2>, etc.
 */
function stitchImagesAfterH2(
  html: string,
  uploadedMedia: Record<string, { wpId: number; wpUrl: string }>,
  altTexts: Record<string, string>,
): string {
  const h2Regex = /<h2[^>]*>.*?<\/h2>/gi;
  const h2Matches: { index: number; length: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = h2Regex.exec(html)) !== null) {
    h2Matches.push({ index: match.index, length: match[0].length });
  }

  const insertions: { afterIndex: number; html: string }[] = [];
  for (const [role, media] of Object.entries(uploadedMedia)) {
    if (role === 'featured_image') continue;
    const sectionMatch = role.match(/body_section_(\d+)/);
    if (!sectionMatch) continue;
    const sectionNum = parseInt(sectionMatch[1], 10);
    const h2 = h2Matches[sectionNum - 1];
    if (!h2) continue;
    const alt = (altTexts[role] ?? '').replace(/"/g, '&quot;');
    const figureTag = `<figure class="wp-block-image"><img src="${media.wpUrl}" alt="${alt}" class="wp-image-${media.wpId}" /></figure>`;
    insertions.push({ afterIndex: h2.index + h2.length, html: figureTag });
  }

  insertions.sort((a, b) => b.afterIndex - a.afterIndex);
  let result = html;
  for (const ins of insertions) {
    result = result.slice(0, ins.afterIndex) + '\n' + ins.html + '\n' + result.slice(ins.afterIndex);
  }

  return result;
}

// Helper: Resolve categories (fetch existing or create new)
async function resolveCategories(
  categoryNames: string[] | string | undefined,
  siteUrl: string,
  headers: Record<string, string>,
): Promise<number[]> {
  // Normalize input to array
  const names = Array.isArray(categoryNames)
    ? categoryNames
    : typeof categoryNames === 'string'
      ? [categoryNames]
      : [];

  if (names.length === 0) return [];

  console.log(`[WP Publish] Resolving categories: ${names.join(', ')}`);

  try {
    // Fetch existing categories (up to 100 for now, should be enough for most blogs)
    const response = await fetch(`${siteUrl}/wp-json/wp/v2/categories?per_page=100`, { headers });

    if (!response.ok) {
      console.error(
        `[WP Publish] Failed to fetch existing categories: ${response.status} ${response.statusText}`,
      );
    }

    const existingCategories = (response.ok ? await response.json() : []) as any[];
    const categoryIds: number[] = [];

    for (const name of names) {
      if (!name || typeof name !== 'string') continue;

      const trimmedName = name.trim();
      if (!trimmedName) continue;

      const existing = existingCategories.find(
        (c: any) => c.name.toLowerCase() === trimmedName.toLowerCase(),
      );

      if (existing) {
        console.log(`[WP Publish] Found existing category: ${trimmedName} (ID: ${existing.id})`);
        categoryIds.push(existing.id);
      } else {
        // Create new category
        console.log(`[WP Publish] Creating new category: ${trimmedName}`);
        const createResponse = await fetch(`${siteUrl}/wp-json/wp/v2/categories`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: trimmedName }),
        });

        if (createResponse.ok) {
          const newCategory = await createResponse.json() as any;
          console.log(
            `[WP Publish] Successfully created category: ${trimmedName} (ID: ${newCategory.id})`,
          );
          categoryIds.push(newCategory.id);
        } else {
          const errorData = (await createResponse.json().catch(() => ({}))) as any;
          console.error(`[WP Publish] Failed to create category "${trimmedName}":`, errorData);
        }
      }
    }

    return categoryIds;
  } catch (error) {
    console.error('[WP Publish] Error in resolveCategories:', error);
    return [];
  }
}

// Helper: Resolve tags (fetch existing or create new)
async function resolveTags(
  tagNames: string[] | string | undefined,
  siteUrl: string,
  headers: Record<string, string>,
): Promise<number[]> {
  // Normalize input to array
  const names = Array.isArray(tagNames)
    ? tagNames
    : typeof tagNames === 'string'
      ? [tagNames]
      : [];

  if (names.length === 0) return [];

  console.log(`[WP Publish] Resolving tags: ${names.join(', ')}`);

  try {
    // Fetch existing tags (up to 100 for now)
    const response = await fetch(`${siteUrl}/wp-json/wp/v2/tags?per_page=100`, { headers });

    if (!response.ok) {
      console.error(
        `[WP Publish] Failed to fetch existing tags: ${response.status} ${response.statusText}`,
      );
    }

    const existingTags = (response.ok ? await response.json() : []) as any[];
    const tagIds: number[] = [];

    for (const name of names) {
      if (!name || typeof name !== 'string') continue;

      const trimmedName = name.trim();
      if (!trimmedName) continue;

      const existing = existingTags.find(
        (t: any) => t.name.toLowerCase() === trimmedName.toLowerCase(),
      );

      if (existing) {
        console.log(`[WP Publish] Found existing tag: ${trimmedName} (ID: ${existing.id})`);
        tagIds.push(existing.id);
      } else {
        // Create new tag
        console.log(`[WP Publish] Creating new tag: ${trimmedName}`);
        const createResponse = await fetch(`${siteUrl}/wp-json/wp/v2/tags`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: trimmedName }),
        });

        if (createResponse.ok) {
          const newTag = await createResponse.json() as any;
          console.log(
            `[WP Publish] Successfully created tag: ${trimmedName} (ID: ${newTag.id})`,
          );
          tagIds.push(newTag.id);
        } else {
          const errorData = (await createResponse.json().catch(() => ({}))) as any;
          console.error(`[WP Publish] Failed to create tag "${trimmedName}":`, errorData);
        }
      }
    }

    return tagIds;
  } catch (error) {
    console.error('[WP Publish] Error in resolveTags:', error);
    return [];
  }
}

// Helper: Load draft for publishing
async function loadDraftForPublish(sb: ReturnType<typeof createServiceClient>, draftId: string) {
  const { data: draft, error } = await sb
    .from('content_drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle();
  if (error) throw error;
  return draft;
}


export async function wordpressRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * @deprecated Use POST /publish-draft instead for content_drafts pipeline.
   * POST /publish — Legacy publish flow (uses projects/stages tables).
   */
  fastify.post('/publish', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = publishToWordPressSchema.parse(request.body);

      // Get the project with its production stage
      const { data: project, error: projErr } = await sb
        .from('projects')
        .select('*')
        .eq('id', body.project_id)
        .maybeSingle();

      if (projErr) throw projErr;

      if (!project) {
        throw new ApiError(404, 'Project not found');
      }

      // Get the latest production stage
      const { data: stages, error: stageErr } = await sb
        .from('stages')
        .select('*')
        .eq('project_id', body.project_id)
        .eq('stage_type', 'production')
        .order('version', { ascending: false })
        .limit(1);

      if (stageErr) throw stageErr;

      if (!stages || stages.length === 0) {
        throw new ApiError(400, 'No production content found for this project');
      }

      // Parse production YAML to get blog content
      const productionStage = stages[0];
      const yamlContent = productionStage.yaml_artifact;
      const productionData = yaml.load(yamlContent) as any;

      const blogContent =
        productionData?.production_output?.blog || productionData?.blog || null;

      if (!blogContent || !blogContent.full_draft) {
        throw new ApiError(400, 'No blog content found in production stage');
      }

      // Get WordPress credentials
      let site_url: string;
      let username: string;
      let password: string;

      if (body.site_url && body.username && body.password) {
        // Use provided credentials (backward compatibility)
        site_url = body.site_url;
        username = body.username;
        password = body.password;
      } else if (project.channel_id) {
        // Derive from project's channel
        const { data: wpCfg } = await sb
          .from('wordpress_configs')
          .select('site_url, username, password')
          .eq('channel_id', project.channel_id as string)
          .maybeSingle();

        if (!wpCfg) {
          throw new ApiError(400, 'Channel has no WordPress configured', 'NO_WP_CONFIG');
        }

        site_url = wpCfg.site_url as string;
        username = wpCfg.username as string;
        password = decrypt(wpCfg.password as string);
      } else {
        throw new ApiError(
          400,
          'Project has no channel, and no site credentials provided',
        );
      }

      // Create Basic Auth header
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      const headers = {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      };

      // Get all project assets for image replacement
      const { data: assets, error: assetsErr } = await sb
        .from('assets')
        .select('*')
        .eq('project_id', body.project_id);

      if (assetsErr) throw assetsErr;

      // Upload featured image to WordPress if specified
      let featuredMediaId: number | null = null;
      if (body.featured_image_asset_id) {
        const featuredAsset = (assets ?? []).find(
          (a: any) => a.id === body.featured_image_asset_id,
        );
        if (featuredAsset) {
          featuredMediaId = await uploadImageToWordPress(
            featuredAsset.webp_url ?? featuredAsset.source_url ?? '',
            featuredAsset.alt_text || blogContent.title,
            site_url,
            auth,
          );

          // Update asset with WordPress media ID
          await sb
            .from('assets')
            .update({ wordpress_id: featuredMediaId })
            .eq('id', featuredAsset.id);
        }
      }

      // Process blog content and replace image placeholders
      let processedContent = blogContent.full_draft;
      const imagePlaceholderRegex = /<!--\s*IMAGE:([a-z0-9]+)\s*-->/gi;
      const matches = [...processedContent.matchAll(imagePlaceholderRegex)];

      for (const match of matches) {
        const [fullMatch, assetId] = match;
        const asset = (assets ?? []).find((a: any) => a.id === assetId);

        if (asset) {
          // Upload image to WordPress if not already uploaded
          let wpMediaId = asset.wordpress_id;
          if (!wpMediaId) {
            wpMediaId = await uploadImageToWordPress(
              asset.webp_url ?? asset.source_url ?? '',
              asset.alt_text || '',
              site_url,
              auth,
            );

            // Update asset with WordPress media ID
            await sb
              .from('assets')
              .update({ wordpress_id: wpMediaId })
              .eq('id', asset.id);
          }

          // Get WordPress media details to get URL
          const mediaResponse = await fetch(
            `${site_url}/wp-json/wp/v2/media/${wpMediaId}`,
            { headers },
          );
          if (mediaResponse.ok) {
            const mediaData = await mediaResponse.json() as any;
            const imgTag = `<img src="${mediaData.source_url}" alt="${asset.alt_text || ''}" class="wp-image-${wpMediaId}" />`;

            // Update asset with WordPress URL
            await sb
              .from('assets')
              .update({ wordpress_url: mediaData.source_url })
              .eq('id', asset.id);

            // Replace placeholder with img tag
            processedContent = processedContent.replace(fullMatch, imgTag);
          }
        }
      }

      // Convert markdown to HTML for WordPress Classic Editor
      const htmlContent = markdownToHtml(processedContent);

      // Resolve categories (create if needed)
      const categoryIds = await resolveCategories(body.categories || [], site_url, headers);

      // Resolve tags (create if needed)
      const tagIds = await resolveTags(body.tags || [], site_url, headers);

      // Prepare WordPress post data
      const postData = buildWpPostData({
        title: blogContent.title,
        slug: blogContent.slug,
        content: htmlContent,
        excerpt: blogContent.meta_description,
        status: body.status,
        categories: categoryIds.length > 0 ? categoryIds : undefined,
        tags: tagIds.length > 0 ? tagIds : undefined,
        featuredMedia: featuredMediaId || undefined,
      });

      // Publish to WordPress
      const response = await fetch(`${site_url}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(postData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(
          response.status,
          `WordPress publish failed: ${errorText || response.statusText}`,
        );
      }

      const wordpressPost = await response.json() as any;

      // Update project status
      await sb
        .from('projects')
        .update({
          status: body.status === 'publish' ? 'completed' : project.status,
        })
        .eq('id', body.project_id);

      return reply.status(201).send({
        data: {
          published: true,
          wordpress_post_id: wordpressPost.id,
          wordpress_url: wordpressPost.link,
          status: wordpressPost.status,
          message: 'Successfully published to WordPress',
        },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'WordPress publish error');
      return sendError(reply, error);
    }
  });

  // Legacy publish-draft removed — see POST /publish-draft below (with image upload + WebP).

  /**
   * POST /publish-draft/stream — Streaming version with SSE progress updates.
   * Emits events for each step: preparing, uploading_featured, uploading_images, composing, categories, tags, publishing, done.
   */
  fastify.post('/publish-draft/stream', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = publishDraftSchema.parse(request.body);


      // Idempotency: replay cached result if token already consumed
      if (body.idempotencyToken) {
        const existing = await getKeyByToken(body.idempotencyToken);

        if (existing && existing.consumed && existing.response) {
          return reply.send({ data: existing.response, error: null });
        }

        const key = await createKey(body.idempotencyToken, { purpose: 'wordpress:publish-draft' });

        if (key && '_alreadyInFlight' in key) {
          throw new ApiError(409, 'This publish request is already being processed');
        }
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const sendEvent = (step: string, message: string, progress?: number, total?: number) => {
        const data = JSON.stringify({ step, message, progress, total });
        reply.raw.write(`data: ${data}\n\n`);
      };

      const sendSseError = (step: string, message: string) => {
        const data = JSON.stringify({ step, message, error: true });
        reply.raw.write(`data: ${data}\n\n`);
        reply.raw.end();
      };

      const sendDone = (result: Record<string, unknown>) => {
        const data = JSON.stringify({ step: 'done', message: 'Published!', result });
        reply.raw.write(`data: ${data}\n\n`);
        reply.raw.end();
      };

      try {
        // Step 1: Preparing — load draft and config
        sendEvent('preparing', 'Loading draft data...');
        const draftRaw = await loadDraftForPublish(sb, body.draftId);
        if (!draftRaw) {
          throw new ApiError(404, 'Draft not found');
        }
        const draft = draftRaw as Record<string, unknown>;
        const draftStatus = draft.status as string;
        const persona = await loadPersonaForDraft(draft, sb);


        if (draftStatus === 'publishing') {
          throw new ApiError(409, 'Draft is already being published');
        }
        if (draftStatus !== 'approved' && draftStatus !== 'scheduled') {
          throw new ApiError(400, 'Draft must be approved before publishing');
        }

        // Atomic status update — only succeeds if status hasn't changed since we checked
        const { data: lockResult } = await sb
          .from('content_drafts')
          .update({ status: 'publishing' } as never)
          .eq('id', body.draftId)
          .in('status', ['approved', 'scheduled'])
          .select('id');


        if (!lockResult?.length) {
          throw new ApiError(409, 'Draft is already being published');
        }

        sendEvent('preparing', 'Loading WordPress configuration...');
        if (!draft.channel_id) draft.channel_id = body.channelId ?? null;
        if (!draft.channel_id && draft.project_id) {
          const { data: proj } = await sb.from('projects').select('channel_id').eq('id', draft.project_id as string).maybeSingle();
          if (proj?.channel_id) draft.channel_id = proj.channel_id;
        }
        if (!draft.channel_id) {
          throw new ApiError(400, 'Draft has no channel', 'VALIDATION_ERROR');
        }

        const { data: wpCfg } = await sb
          .from('wordpress_configs')
          .select('site_url, username, password')
          .eq('channel_id', draft.channel_id as string)
          .maybeSingle();
        if (!wpCfg) {
          throw new ApiError(400, 'Channel has no WordPress configured', 'NO_WP_CONFIG');
        }

        const site_url = wpCfg.site_url as string;
        const username = wpCfg.username as string;
        const password = decrypt(wpCfg.password as string);
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        const headers = {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        };

        // Step 2: Preparing featured image
        const draftJson = draft.draft_json as Record<string, unknown> | null;
        let blogBody = (draftJson?.full_draft as string) ?? '';
        const uploadedMedia: Record<string, { wpId: number; wpUrl: string }> = {};

        sendEvent('uploading_featured', 'Uploading featured image...');
        let featuredAssetId: string | undefined;
        if (body.imageMap?.['featured_image']) {
          featuredAssetId = body.imageMap['featured_image'] as string;
          const { data: assets, error: assetsErr } = await sb
            .from('assets')
            .select('*')
            .eq('content_id', body.draftId);


          for (const rawAsset of assets ?? []) {
            const asset = rawAsset as Record<string, unknown>;
            if (asset.id !== featuredAssetId) continue;

            const imageUrl = (asset.webp_url as string) || (asset.source_url as string);
            if (!imageUrl) continue;

            const wpMediaId = await uploadImageToWordPress(
              imageUrl,
              (asset.alt_text as string) || (draft.title as string) || '',
              site_url,
              auth,
            );

            // Get media URL from WordPress
            const mediaResp = await fetch(`${site_url}/wp-json/wp/v2/media/${wpMediaId}`, {
              headers,
            });
            let wpUrl = '';
            if (mediaResp.ok) {
              const mediaData = (await mediaResp.json()) as Record<string, unknown>;
              wpUrl = (mediaData.source_url as string) ?? '';
            }

            uploadedMedia['featured_image'] = { wpId: wpMediaId, wpUrl };
            break;
          }
        }

        // Step 3: Uploading section images
        if (body.imageMap) {
          // New flow: upload only images in imageMap
          const { data: assets } = await sb
            .from('assets')
            .select('*')
            .eq('content_id', body.draftId);

          const assetsToUpload = assets?.filter((asset: any) =>
            body.imageMap && Object.values(body.imageMap).includes(asset.id as string) &&
            asset.id !== featuredAssetId,
          ) ?? [];

          const total = assetsToUpload.length;
          for (let i = 0; i < total; i++) {
            const rawAsset = assetsToUpload[i];
            const asset = rawAsset as Record<string, unknown>;
            const assetId = asset.id as string;

            sendEvent(
              'uploading_images',
              `Uploading image ${i + 1} of ${total}...`,
              i + 1,
              total,
            );

            const imageUrl = (asset.webp_url as string) || (asset.source_url as string);
            if (!imageUrl) continue;

            const wpMediaId = await uploadImageToWordPress(
              imageUrl,
              (asset.alt_text as string) || (draft.title as string) || '',
              site_url,
              auth,
            );

            // Get media URL from WordPress
            const mediaResp = await fetch(`${site_url}/wp-json/wp/v2/media/${wpMediaId}`, {
              headers,
            });
            let wpUrl = '';
            if (mediaResp.ok) {
              const mediaData = (await mediaResp.json()) as Record<string, unknown>;
              wpUrl = (mediaData.source_url as string) ?? '';
            }

            // Find the role by looking up in imageMap
            const role = Object.entries(body.imageMap).find(([_, id]) => id === assetId)?.[0];
            if (role) {
              uploadedMedia[role] = { wpId: wpMediaId, wpUrl };
            }
          }

          // Convert markdown to HTML
          sendEvent('composing', 'Converting markdown to HTML...');
          blogBody = markdownToHtml(blogBody);

          // Translate assetId-keyed altTexts → role-keyed for stitchImagesAfterH2
          const roleAltTexts: Record<string, string> = {};
          if (body.imageMap && body.altTexts) {
            for (const [role, assetId] of Object.entries(body.imageMap)) {
              const text = body.altTexts[assetId as string];
              if (text) roleAltTexts[role] = text;
            }
          }

          // Stitch images after H2 tags
          blogBody = stitchImagesAfterH2(blogBody, uploadedMedia, roleAltTexts);
        } else {
          // Legacy flow: fetch all assets, upload all, replace placeholders
          const { data: assets } = await sb
            .from('assets')
            .select('*')
            .eq('content_id', body.draftId);

          const total = assets?.length ?? 0;
          for (let i = 0; i < total; i++) {
            const rawAsset = assets?.[i];
            if (!rawAsset) continue;
            const asset = rawAsset as Record<string, unknown>;

            sendEvent(
              'uploading_images',
              `Uploading image ${i + 1} of ${total}...`,
              i + 1,
              total,
            );

            const imageUrl = (asset.webp_url as string) || (asset.source_url as string);
            if (!imageUrl) continue;

            const wpMediaId = await uploadImageToWordPress(
              imageUrl,
              (asset.alt_text as string) || (draft.title as string) || '',
              site_url,
              auth,
            );

            // Get media URL from WordPress
            const mediaResp = await fetch(`${site_url}/wp-json/wp/v2/media/${wpMediaId}`, {
              headers,
            });
            let wpUrl = '';
            if (mediaResp.ok) {
              const mediaData = (await mediaResp.json()) as Record<string, unknown>;
              wpUrl = (mediaData.source_url as string) ?? '';
            }

            const role = (asset.role as string) ?? `position_${(asset.position as number) ?? 0}`;
            uploadedMedia[role] = { wpId: wpMediaId, wpUrl };
          }

          // Replace placeholders
          sendEvent('composing', 'Converting markdown to HTML...');
          for (const [role, media] of Object.entries(uploadedMedia)) {
            if (role === 'featured_image') continue;
            const placeholder = new RegExp(`<!--\\s*IMAGE:${role}\\s*-->`, 'gi');
            const imgTag = `<figure><img src="${media.wpUrl}" alt="" class="wp-image-${media.wpId}" /></figure>`;
            blogBody = blogBody.replace(placeholder, imgTag);
          }

          blogBody = markdownToHtml(blogBody);
        }

        // Step 4: Resolve categories
        sendEvent('categories', 'Resolving categories...');
        const prodSettings = draft.production_settings_json as Record<string, unknown> | null;
        const categoryNames = body.categories
          ?? (prodSettings?.categories as string[])
          ?? [];
        const categoryIds = await resolveCategories(categoryNames, site_url, headers);

        // Step 5: Resolve tags
        sendEvent('tags', 'Resolving tags...');
        const tagNames = body.tags ?? (prodSettings?.tags as string[]) ?? [];
        const tagIds = await resolveTags(tagNames, site_url, headers);

        // Step 6: Publishing
        sendEvent('publishing', 'Creating post on WordPress...');
        const postData = buildWpPostData({
          title: body.seoOverrides?.title ?? (draft.title as string) ?? (draftJson?.title as string) ?? 'Untitled',
          slug: body.seoOverrides?.slug ?? (draftJson?.slug as string) ?? undefined,
          content: blogBody,
          excerpt: body.seoOverrides?.metaDescription ?? (draftJson?.meta_description as string) ?? '',
          status: body.mode === 'schedule' ? 'future' : body.mode,
          date: body.mode === 'schedule' && body.scheduledDate ? body.scheduledDate : undefined,
          categories: categoryIds.length > 0 ? categoryIds : undefined,
          tags: tagIds.length > 0 ? tagIds : undefined,
          featuredMedia: uploadedMedia['featured_image']?.wpId,
          authorId: body.authorId ?? persona?.wpAuthorId ?? null,
        });


        // Create or update WordPress post
        const existingPostId = (draft.wordpress_post_id as number | null) ?? null;
        let wpResponse: Response;
        if (existingPostId) {
          wpResponse = await fetch(`${site_url}/wp-json/wp/v2/posts/${existingPostId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(postData),
          });
        } else {
          wpResponse = await fetch(`${site_url}/wp-json/wp/v2/posts`, {
            method: 'POST',
            headers,
            body: JSON.stringify(postData),
          });
        }


        if (!wpResponse.ok) {
          const errorText = await wpResponse.text();
          throw new ApiError(wpResponse.status, `WordPress publish failed: ${errorText}`);
        }

        const wpPost = (await wpResponse.json()) as Record<string, unknown>;


        // Update draft in DB
        const updateFields: Record<string, unknown> = {
          wordpress_post_id: wpPost.id,
          published_url: wpPost.link,
        };
        if (body.mode === 'publish') {
          updateFields.status = 'published';
          updateFields.published_at = new Date().toISOString();
        } else if (body.mode === 'schedule') {
          updateFields.status = 'scheduled';
          updateFields.scheduled_at = body.scheduledDate;
        } else {
          updateFields.status = 'approved';
        }


        await sb
          .from('content_drafts')
          .update(updateFields as never)
          .eq('id', body.draftId);


        // Consume idempotency token on success
        const doneResult = {
          published: true,
          wordpress_post_id: wpPost.id,
          published_url: wpPost.link,
          status: wpPost.status,
        };
        if (body.idempotencyToken) {
          await consumeKey(body.idempotencyToken, doneResult);
        }

        // Send completion event
        sendDone(doneResult);
      } catch (innerError) {
        request.log.error({
          draftId: body.draftId,
          idempotencyToken: body.idempotencyToken,
          error: innerError instanceof Error ? innerError.message : String(innerError),
          errorType: innerError instanceof ApiError ? 'ApiError' : typeof innerError,
        }, 'WordPress publish-draft/stream error');

        // Revert status from 'publishing' back to 'approved' on failure
        try {
          await sb.from('content_drafts').update({ status: 'approved' } as never).eq('id', body.draftId);
        } catch (revertErr) {
        }

        if (body.idempotencyToken) {
          try {
            await deleteKey(body.idempotencyToken);
          } catch (deleteErr) {
          }
        }

        if (innerError instanceof ApiError) {
          sendSseError('error', innerError.message);
        } else {
          const msg = innerError instanceof Error ? innerError.message : 'Unknown error';
          sendSseError('error', msg);
        }
      }
    } catch (error) {
      const draftId = (request.body as Record<string, unknown>)?.draftId as string | undefined;
      const idempotencyToken = (request.body as Record<string, unknown>)?.idempotencyToken as string | undefined;

      request.log.error({
        draftId,
        idempotencyToken,
        err: error,
        errorMessage: error instanceof Error ? error.message : String(error),
      }, 'WordPress publish-draft/stream error');

      const rawBody = (request.body as Record<string, unknown>) ?? {};
      if (rawBody.draftId) {
        try {
          const fallbackSb = createServiceClient();
          await fallbackSb.from('content_drafts').update({ status: 'approved' } as never).eq('id', rawBody.draftId as string);
        } catch (fallbackErr) {
        }
      }
      if (rawBody.idempotencyToken) {
        try {
          await deleteKey(rawBody.idempotencyToken as string);
        } catch (fallbackErr) {
        }
      }
      try {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        reply.raw.write(`data: ${JSON.stringify({ step: 'error', message: msg, error: true })}\n\n`);
        reply.raw.end();
      } catch (writeErr) {
      }
    }
  });

  /**
   * GET /tags — Fetch WordPress tags
   */
  fastify.get('/tags', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const params = fetchTagsQuerySchema.parse(Object.fromEntries(url.searchParams));

      // Get WordPress credentials
      let site_url: string;
      let username: string;
      let password: string;

      if (params.config_id) {
        const sb = createServiceClient();
        const { data: config, error } = await sb
          .from('wordpress_configs')
          .select('*')
          .eq('id', params.config_id)
          .maybeSingle();

        if (error) throw error;

        if (!config) {
          throw new ApiError(404, 'WordPress config not found');
        }

        site_url = config.site_url;
        username = config.username;
        password = decrypt(config.password);
      } else if (params.site_url && params.username && params.password) {
        // Use provided credentials
        site_url = params.site_url;
        username = params.username;
        password = params.password;
      } else {
        throw new ApiError(
          400,
          'Either config_id or site_url/username/password must be provided',
        );
      }

      // Create Basic Auth header
      const auth = Buffer.from(`${username}:${password}`).toString('base64');

      // Fetch tags from WordPress
      const response = await fetch(`${site_url}/wp-json/wp/v2/tags?per_page=100`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(
          response.status,
          `Failed to fetch tags: ${errorText || response.statusText}`,
        );
      }

      const tags = await response.json() as any;

      return reply.send({
        data: {
          tags: tags.map((tag: { id: number; name: string; slug: string; count: number }) => ({
            id: tag.id,
            name: tag.name,
            slug: tag.slug,
            count: tag.count,
          })),
          total: tags.length,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /categories — Fetch WordPress categories
   */
  fastify.get('/categories', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const params = fetchCategoriesQuerySchema.parse(Object.fromEntries(url.searchParams));

      // Get WordPress credentials
      let site_url: string;
      let username: string;
      let password: string;

      if (params.config_id) {
        const sb = createServiceClient();
        const { data: config, error } = await sb
          .from('wordpress_configs')
          .select('*')
          .eq('id', params.config_id)
          .maybeSingle();

        if (error) throw error;

        if (!config) {
          throw new ApiError(404, 'WordPress config not found');
        }

        site_url = config.site_url;
        username = config.username;
        password = decrypt(config.password);
      } else if (params.site_url && params.username && params.password) {
        site_url = params.site_url;
        username = params.username;
        password = params.password;
      } else {
        throw new ApiError(
          400,
          'Either config_id or site_url/username/password must be provided',
        );
      }

      // Create Basic Auth header
      const auth = Buffer.from(`${username}:${password}`).toString('base64');

      // Fetch categories from WordPress
      const response = await fetch(`${site_url}/wp-json/wp/v2/categories?per_page=100`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(
          response.status,
          `Failed to fetch categories: ${errorText || response.statusText}`,
        );
      }

      const categories = await response.json() as any;

      return reply.send({
        data: {
          categories: categories.map(
            (cat: { id: number; name: string; slug: string; count: number }) => ({
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              count: cat.count,
            }),
          ),
          total: categories.length,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /publish-draft — New publish flow for content_drafts pipeline.
   * Uploads images (WebP preferred), resolves taxonomies, creates/updates WP post.
   */
  fastify.post('/publish-draft', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = publishDraftSchema.parse(request.body);


      // Idempotency: replay cached result if token already consumed
      if (body.idempotencyToken) {
        const existing = await getKeyByToken(body.idempotencyToken);

        if (existing && existing.consumed && existing.response) {
          return reply.send({ data: existing.response, error: null });
        }

        const key = await createKey(body.idempotencyToken, { purpose: 'wordpress:publish-draft' });

        if (key && '_alreadyInFlight' in key) {
          throw new ApiError(409, 'This publish request is already being processed');
        }
      }

      // Load draft (cast to Record — new columns not yet in generated types)
      const { data: draftRaw, error: draftErr } = await sb
        .from('content_drafts')
        .select('*')
        .eq('id', body.draftId)
        .maybeSingle();
      if (draftErr) throw draftErr;
      if (!draftRaw) {
        throw new ApiError(404, 'Draft not found');
      }
      const draft = draftRaw as Record<string, unknown>;
      const draftStatus = draft.status as string;
      const persona = await loadPersonaForDraft(draft, sb);


      if (draftStatus === 'publishing') {
        throw new ApiError(409, 'Draft is already being published');
      }
      if (draftStatus !== 'approved' && draftStatus !== 'scheduled') {
        throw new ApiError(400, 'Draft must be approved before publishing');
      }

      // Atomic status update — only succeeds if status hasn't changed since we checked
      const { data: lockResult } = await sb
        .from('content_drafts')
        .update({ status: 'publishing' } as never)
        .eq('id', body.draftId)
        .in('status', ['approved', 'scheduled'])
        .select('id');


      if (!lockResult?.length) {
        throw new ApiError(409, 'Draft is already being published');
      }

      // Get WordPress credentials — body.channelId → draft.channel_id → project.channel_id
      if (!draft.channel_id) draft.channel_id = body.channelId ?? null;
      if (!draft.channel_id && draft.project_id) {
        const { data: proj } = await sb.from('projects').select('channel_id').eq('id', draft.project_id as string).maybeSingle();
        if (proj?.channel_id) draft.channel_id = proj.channel_id;
      }
      if (!draft.channel_id) {
        throw new ApiError(400, 'Draft has no channel', 'VALIDATION_ERROR');
      }

      const { data: wpCfg } = await sb
        .from('wordpress_configs')
        .select('site_url, username, password')
        .eq('channel_id', draft.channel_id as string)
        .maybeSingle();
      if (!wpCfg) {
        throw new ApiError(400, 'Channel has no WordPress configured', 'NO_WP_CONFIG');
      }

      const site_url = wpCfg.site_url as string;
      const username = wpCfg.username as string;
      const password = decrypt(wpCfg.password as string);

      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      const headers = {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      };

      // Process blog content — upload images and convert to HTML
      const draftJson = draft.draft_json as Record<string, unknown> | null;
      let blogBody = (draftJson?.full_draft as string) ?? '';

      const uploadedMedia: Record<string, { wpId: number; wpUrl: string }> = {};

      if (body.imageMap) {
        // New flow: only upload images from imageMap, then use stitchImagesAfterH2
        const { data: assets } = await sb
          .from('assets')
          .select('*')
          .eq('content_id', body.draftId);

        for (const rawAsset of assets ?? []) {
          const asset = rawAsset as Record<string, unknown>;
          const assetId = asset.id as string;

          // Only process assets in the imageMap
          if (!Object.values(body.imageMap).includes(assetId)) continue;

          const imageUrl = (asset.webp_url as string) || (asset.source_url as string);
          if (!imageUrl) continue;

          const wpMediaId = await uploadImageToWordPress(
            imageUrl,
            (asset.alt_text as string) || (draft.title as string) || '',
            site_url,
            auth,
          );

          // Get media URL from WordPress
          const mediaResp = await fetch(`${site_url}/wp-json/wp/v2/media/${wpMediaId}`, { headers });
          let wpUrl = '';
          if (mediaResp.ok) {
            const mediaData = (await mediaResp.json()) as Record<string, unknown>;
            wpUrl = (mediaData.source_url as string) ?? '';
          }

          // Find the role by looking up in imageMap
          const role = Object.entries(body.imageMap).find(([_, id]) => id === assetId)?.[0];
          if (role) {
            uploadedMedia[role] = { wpId: wpMediaId, wpUrl };
          }
        }

        // Convert markdown to HTML first
        blogBody = markdownToHtml(blogBody);

        // Translate assetId-keyed altTexts → role-keyed for stitchImagesAfterH2
        const roleAltTexts: Record<string, string> = {};
        if (body.imageMap && body.altTexts) {
          for (const [role, assetId] of Object.entries(body.imageMap)) {
            const text = body.altTexts[assetId as string];
            if (text) roleAltTexts[role] = text;
          }
        }

        // Then stitch images after H2 tags
        blogBody = stitchImagesAfterH2(blogBody, uploadedMedia, roleAltTexts);
      } else {
        // Legacy flow: fetch all assets, upload all, replace placeholders
        const { data: assets } = await sb
          .from('assets')
          .select('*')
          .eq('content_id', body.draftId);

        for (const rawAsset of assets ?? []) {
          const asset = rawAsset as Record<string, unknown>;
          const imageUrl = (asset.webp_url as string) || (asset.source_url as string);
          if (!imageUrl) continue;

          const wpMediaId = await uploadImageToWordPress(
            imageUrl,
            (asset.alt_text as string) || (draft.title as string) || '',
            site_url,
            auth,
          );

          // Get media URL from WordPress
          const mediaResp = await fetch(`${site_url}/wp-json/wp/v2/media/${wpMediaId}`, { headers });
          let wpUrl = '';
          if (mediaResp.ok) {
            const mediaData = (await mediaResp.json()) as Record<string, unknown>;
            wpUrl = (mediaData.source_url as string) ?? '';
          }

          const role = (asset.role as string) ?? `position_${(asset.position as number) ?? 0}`;
          uploadedMedia[role] = { wpId: wpMediaId, wpUrl };
        }

        // Replace placeholders like <!-- IMAGE:featured_image --> or <!-- IMAGE:body_section_1 -->
        for (const [role, media] of Object.entries(uploadedMedia)) {
          if (role === 'featured_image') continue; // handled separately
          const placeholder = new RegExp(`<!--\\s*IMAGE:${role}\\s*-->`, 'gi');
          const imgTag = `<figure><img src="${media.wpUrl}" alt="" class="wp-image-${media.wpId}" /></figure>`;
          blogBody = blogBody.replace(placeholder, imgTag);
        }

        // Convert markdown to HTML
        blogBody = markdownToHtml(blogBody);
      }

      // Resolve categories and tags — freeform, create-if-missing
      const prodSettings = draft.production_settings_json as Record<string, unknown> | null;
      const categoryNames = body.categories
        ?? (prodSettings?.categories as string[])
        ?? [];
      const tagNames = body.tags
        ?? (prodSettings?.tags as string[])
        ?? [];

      const categoryIds = await resolveCategories(categoryNames, site_url, headers);
      const tagIds = await resolveTags(tagNames, site_url, headers);

      // Build post data — apply seoOverrides if present
      const postData = buildWpPostData({
        title: body.seoOverrides?.title ?? (draft.title as string) ?? (draftJson?.title as string) ?? 'Untitled',
        slug: body.seoOverrides?.slug ?? (draftJson?.slug as string) ?? undefined,
        content: blogBody,
        excerpt: body.seoOverrides?.metaDescription ?? (draftJson?.meta_description as string) ?? '',
        status: body.mode === 'schedule' ? 'future' : body.mode,
        date: body.mode === 'schedule' && body.scheduledDate ? body.scheduledDate : undefined,
        categories: categoryIds.length > 0 ? categoryIds : undefined,
        tags: tagIds.length > 0 ? tagIds : undefined,
        featuredMedia: uploadedMedia['featured_image']?.wpId,
        authorId: body.authorId ?? persona?.wpAuthorId ?? null,
      });

      // Create or update WordPress post
      const existingPostId = (draft.wordpress_post_id as number | null) ?? null;

      let wpResponse: Response;
      if (existingPostId) {
        wpResponse = await fetch(`${site_url}/wp-json/wp/v2/posts/${existingPostId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(postData),
        });
      } else {
        wpResponse = await fetch(`${site_url}/wp-json/wp/v2/posts`, {
          method: 'POST',
          headers,
          body: JSON.stringify(postData),
        });
      }


      if (!wpResponse.ok) {
        const errorText = await wpResponse.text();
        throw new ApiError(wpResponse.status, `WordPress publish failed: ${errorText}`);
      }

      const wpPost = (await wpResponse.json()) as Record<string, unknown>;


      // Update draft with WordPress data
      const updateFields: Record<string, unknown> = {
        wordpress_post_id: wpPost.id,
        published_url: wpPost.link,
      };
      if (body.mode === 'publish') {
        updateFields.status = 'published';
        updateFields.published_at = new Date().toISOString();
      } else if (body.mode === 'schedule') {
        updateFields.status = 'scheduled';
        updateFields.scheduled_at = body.scheduledDate;
      } else {
        updateFields.status = 'approved';
      }


      await sb
        .from('content_drafts')
        .update(updateFields as never)
        .eq('id', body.draftId);


      const result = {
        published: true,
        wordpress_post_id: wpPost.id,
        wordpress_url: wpPost.link,
        status: wpPost.status,
      };

      // Consume idempotency token on success
      if (body.idempotencyToken) {
        await consumeKey(body.idempotencyToken, result);
      }


      return reply.status(201).send({ data: result, error: null });
    } catch (error) {
      // Revert status from 'publishing' back to 'approved' on failure
      const sb = createServiceClient();
      const body = (request.body as Record<string, unknown>) ?? {};
      const draftId = body.draftId as string | undefined;
      const idempotencyToken = body.idempotencyToken as string | undefined;

      request.log.error({
        draftId,
        idempotencyToken,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof ApiError ? 'ApiError' : typeof error,
      }, 'WordPress publish-draft error');

      if (body.draftId) {
        try {
          await sb.from('content_drafts').update({ status: 'approved' } as never).eq('id', body.draftId as string);
        } catch (revertErr) {
        }
      }
      if (body.idempotencyToken) {
        try {
          await deleteKey(body.idempotencyToken as string);
        } catch (deleteErr) {
        }
      }

      return sendError(reply, error);
    }
  });

  /**
   * GET /blog-metrics — Fetch public blog metrics from a WordPress site
   * Calls the WP REST API (no auth needed for published posts).
   */
  fastify.get('/blog-metrics', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      const { url } = request.query as { url?: string };
      if (!url) throw new ApiError(400, 'url query param is required', 'VALIDATION_ERROR');

      // Axiom test event
      ingest({
        type: 'blog_metrics_refresh',
        userId: request.headers['x-user-id'],
        blogUrl: url,
        test: true,
        customTestObject: {
          source: 'blog-metrics-button',
          timestamp: new Date().toISOString(),
          message: 'Axiom integration test event',
        },
      });

      // Normalize URL
      const siteUrl = url.replace(/\/+$/, '');
      const apiBase = `${siteUrl}/wp-json/wp/v2`;

      // Fetch recent posts (just 5, with total count from headers)
      const postsRes = await fetch(`${apiBase}/posts?per_page=5&_fields=id,title,date,link,status&orderby=date&order=desc`, {
        headers: { 'User-Agent': 'BrightTale/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!postsRes.ok) {
        throw new ApiError(502, 'Could not reach WordPress REST API. Make sure the site has WP REST API enabled.', 'WP_API_ERROR');
      }

      const totalPosts = parseInt(postsRes.headers.get('X-WP-Total') ?? '0', 10);
      const totalPages = parseInt(postsRes.headers.get('X-WP-TotalPages') ?? '0', 10);
      const posts = (await postsRes.json()) as Array<{
        id: number;
        title: { rendered: string };
        date: string;
        link: string;
        status: string;
      }>;

      const recentPosts = posts.map((p) => ({
        id: p.id,
        title: p.title.rendered,
        date: p.date,
        link: p.link,
      }));

      await flushAxiom();

      return reply.send({
        data: {
          totalPosts,
          totalPages,
          recentPosts,
          lastPublished: recentPosts[0]?.date ?? null,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
