/**
 * WordPress Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import yaml from 'js-yaml';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { markdownToHtml } from '../lib/utils.js';
import { convertToWebP } from '../lib/image/webp.js';
import {
  publishToWordPressSchema,
  fetchTagsQuerySchema,
  fetchCategoriesQuerySchema,
} from '@brighttale/shared/schemas/wordpress';
import { publishDraftSchema } from '@brighttale/shared/schemas/pipeline';

const createConfigSchema = z.object({
  site_url: z.string().url('Invalid WordPress site URL'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const updateConfigSchema = z.object({
  site_url: z.string().url('Invalid WordPress site URL').optional(),
  username: z.string().min(1, 'Username is required').optional(),
  password: z.string().min(1, 'Password is required').optional(),
});

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
    // Local file — read from disk (relative to apps/api/public/)
    const localPath = path.resolve(process.cwd(), 'public', imageUrl.replace(/^\//, ''));
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

// Helper: Resolve WordPress config (fetch and decrypt)
async function resolveWpConfig(sb: ReturnType<typeof createServiceClient>, configId?: string) {
  if (!configId) return null;
  const { data: config, error } = await sb
    .from('wordpress_configs')
    .select('*')
    .eq('id', configId)
    .maybeSingle();
  if (error) throw error;
  if (!config) return null;
  return {
    site_url: config.site_url as string,
    username: config.username as string,
    password: decrypt(config.password as string),
  };
}

export async function wordpressRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /config — Create new WordPress config (password encrypted)
   */
  fastify.post('/config', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = createConfigSchema.parse(request.body);

      // Check if encryption is available
      if (!process.env.ENCRYPTION_SECRET) {
        return reply.status(500).send({
          data: null,
          error: {
            message:
              'ENCRYPTION_SECRET environment variable is not set. Please configure it in your .env file.',
            code: 'CONFIGURATION_ERROR',
          },
        });
      }

      // Encrypt password before storing
      const encryptedPassword = encrypt(body.password);

      const { data: config, error } = await sb
        .from('wordpress_configs')
        .insert({
          site_url: body.site_url,
          username: body.username,
          password: encryptedPassword,
        })
        .select()
        .single();

      if (error) throw error;

      request.log.info(`WordPress config created: ${config.id}`);

      return reply.status(201).send({
        data: {
          id: config.id,
          site_url: config.site_url,
          username: config.username,
          created_at: config.created_at,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /config — List all configs (passwords masked)
   */
  fastify.get('/config', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { data: configs, error } = await sb
        .from('wordpress_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Mask passwords in response
      const maskedConfigs = (configs ?? []).map((c: any) => ({
        id: c.id,
        site_url: c.site_url,
        username: c.username,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }));

      return reply.send({ data: maskedConfigs, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /config/:id — Get config (password masked)
   */
  fastify.get('/config/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: config, error } = await sb
        .from('wordpress_configs')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!config) {
        throw new ApiError(404, 'WordPress config not found', 'NOT_FOUND');
      }

      return reply.send({
        data: {
          id: config.id,
          site_url: config.site_url,
          username: config.username,
          created_at: config.created_at,
          updated_at: config.updated_at,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /config/:id — Update config (password re-encrypted if changed)
   */
  fastify.put('/config/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const body = updateConfigSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb
        .from('wordpress_configs')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;
      if (!existing) {
        throw new ApiError(404, 'WordPress config not found', 'NOT_FOUND');
      }

      // Encrypt new password if provided
      const updateData: Record<string, string> = {};
      if (body.site_url) updateData.site_url = body.site_url;
      if (body.username) updateData.username = body.username;
      if (body.password) {
        if (!process.env.ENCRYPTION_SECRET) {
          return reply.status(500).send({
            data: null,
            error: {
              message:
                'ENCRYPTION_SECRET environment variable is not set. Please configure it in your .env file.',
              code: 'CONFIGURATION_ERROR',
            },
          });
        }
        updateData.password = encrypt(body.password);
      }

      const { data: updated, error } = await sb
        .from('wordpress_configs')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      request.log.info(`WordPress config updated: ${id}`);

      return reply.send({
        data: {
          id: updated.id,
          site_url: updated.site_url,
          username: updated.username,
          updated_at: updated.updated_at,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PATCH /config/:id — Same as PUT
   */
  fastify.patch('/config/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const body = updateConfigSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb
        .from('wordpress_configs')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;
      if (!existing) {
        throw new ApiError(404, 'WordPress config not found', 'NOT_FOUND');
      }

      const updateData: Record<string, string> = {};
      if (body.site_url) updateData.site_url = body.site_url;
      if (body.username) updateData.username = body.username;
      if (body.password) {
        if (!process.env.ENCRYPTION_SECRET) {
          return reply.status(500).send({
            data: null,
            error: {
              message:
                'ENCRYPTION_SECRET environment variable is not set. Please configure it in your .env file.',
              code: 'CONFIGURATION_ERROR',
            },
          });
        }
        updateData.password = encrypt(body.password);
      }

      const { data: updated, error } = await sb
        .from('wordpress_configs')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      request.log.info(`WordPress config updated: ${id}`);

      return reply.send({
        data: {
          id: updated.id,
          site_url: updated.site_url,
          username: updated.username,
          updated_at: updated.updated_at,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /config/:id — Delete config
   */
  fastify.delete('/config/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: existing, error: findErr } = await sb
        .from('wordpress_configs')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;
      if (!existing) {
        throw new ApiError(404, 'WordPress config not found', 'NOT_FOUND');
      }

      const { error } = await sb.from('wordpress_configs').delete().eq('id', id);
      if (error) throw error;

      request.log.info(`WordPress config deleted: ${id}`);

      return reply.send({ data: { deleted: true, id }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * @deprecated Use POST /publish-draft instead for content_drafts pipeline.
   * POST /publish — Legacy publish flow (uses projects/stages tables).
   */
  fastify.post('/publish', { preHandler: [authenticate] }, async (request, reply) => {
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

      if (body.config_id) {
        // Use stored config
        const { data: config, error: cfgErr } = await sb
          .from('wordpress_configs')
          .select('*')
          .eq('id', body.config_id)
          .maybeSingle();

        if (cfgErr) throw cfgErr;

        if (!config) {
          throw new ApiError(404, 'WordPress config not found');
        }

        site_url = config.site_url;
        username = config.username;
        password = decrypt(config.password);
      } else if (body.site_url && body.username && body.password) {
        // Use provided credentials
        site_url = body.site_url;
        username = body.username;
        password = body.password;
      } else {
        throw new ApiError(
          400,
          'Either config_id or site_url/username/password must be provided',
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
            featuredAsset.source_url ?? '',
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
              asset.source_url ?? '',
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
      const postData: Record<string, unknown> = {
        title: blogContent.title,
        slug: blogContent.slug,
        content: htmlContent,
        excerpt: blogContent.meta_description,
        status: body.status,
      };

      if (categoryIds.length > 0) {
        postData.categories = categoryIds;
      }

      if (tagIds.length > 0) {
        postData.tags = tagIds;
      }

      if (featuredMediaId) {
        postData.featured_media = featuredMediaId;
      }

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
        if (!draftRaw) throw new ApiError(404, 'Draft not found');
        const draft = draftRaw as Record<string, unknown>;
        if ((draft.status as string) !== 'approved' && (draft.status as string) !== 'scheduled') {
          throw new ApiError(400, 'Draft must be approved before publishing');
        }

        sendEvent('preparing', 'Loading WordPress configuration...');
        const wpConfig = await resolveWpConfig(sb, body.configId);
        if (!wpConfig) throw new ApiError(404, 'WordPress config not found');

        const { site_url, username, password } = wpConfig;
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
          const { data: assets } = await sb
            .from('assets')
            .select('*')
            .eq('content_id', body.draftId);

          for (const rawAsset of assets ?? []) {
            const asset = rawAsset as Record<string, unknown>;
            if (asset.id !== featuredAssetId) continue;

            const imageUrl = (asset.source_url as string);
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

            const imageUrl = (asset.source_url as string);
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

          // Stitch images after H2 tags
          blogBody = stitchImagesAfterH2(blogBody, uploadedMedia, body.altTexts ?? {});
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

            const imageUrl = (asset.source_url as string);
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
        const postData: Record<string, unknown> = {
          title: body.seoOverrides?.title ?? draft.title ?? draftJson?.title ?? 'Untitled',
          slug: body.seoOverrides?.slug ?? (draftJson?.slug as string) ?? undefined,
          content: blogBody,
          excerpt: body.seoOverrides?.metaDescription ?? (draftJson?.meta_description as string) ?? '',
          status: body.mode === 'schedule' ? 'future' : body.mode,
        };
        if (body.mode === 'schedule' && body.scheduledDate) {
          postData.date = body.scheduledDate;
        }
        if (categoryIds.length > 0) postData.categories = categoryIds;
        if (tagIds.length > 0) postData.tags = tagIds;

        const featured = uploadedMedia['featured_image'];
        if (featured) postData.featured_media = featured.wpId;

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
        }

        await sb
          .from('content_drafts')
          .update(updateFields as never)
          .eq('id', body.draftId);

        // Send completion event
        sendDone({
          published: true,
          wordpress_post_id: wpPost.id,
          published_url: wpPost.link,
          status: wpPost.status,
        });
      } catch (innerError) {
        if (innerError instanceof ApiError) {
          sendSseError('error', innerError.message);
        } else {
          const msg = innerError instanceof Error ? innerError.message : 'Unknown error';
          sendSseError('error', msg);
        }
      }
    } catch (error) {
      request.log.error({ err: error }, 'WordPress publish-draft/stream error');
      try {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        reply.raw.write(`data: ${JSON.stringify({ step: 'error', message: msg, error: true })}\n\n`);
        reply.raw.end();
      } catch (writeErr) {
        request.log.error({ err: writeErr }, 'Failed to send error event');
      }
    }
  });

  /**
   * GET /tags — Fetch WordPress tags
   */
  fastify.get('/tags', { preHandler: [authenticate] }, async (request, reply) => {
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
  fastify.get('/categories', { preHandler: [authenticate] }, async (request, reply) => {
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
  fastify.post('/publish-draft', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = publishDraftSchema.parse(request.body);

      // Load draft (cast to Record — new columns not yet in generated types)
      const { data: draftRaw, error: draftErr } = await sb
        .from('content_drafts')
        .select('*')
        .eq('id', body.draftId)
        .maybeSingle();
      if (draftErr) throw draftErr;
      if (!draftRaw) throw new ApiError(404, 'Draft not found');
      const draft = draftRaw as Record<string, unknown>;
      if ((draft.status as string) !== 'approved' && (draft.status as string) !== 'scheduled') {
        throw new ApiError(400, 'Draft must be approved before publishing');
      }

      // Get WordPress credentials
      let site_url: string;
      let username: string;
      let password: string;

      if (body.configId) {
        const { data: config, error: cfgErr } = await sb
          .from('wordpress_configs')
          .select('*')
          .eq('id', body.configId)
          .maybeSingle();
        if (cfgErr) throw cfgErr;
        if (!config) throw new ApiError(404, 'WordPress config not found');
        site_url = config.site_url;
        username = config.username;
        password = decrypt(config.password);
      } else {
        throw new ApiError(400, 'configId is required for publish-draft');
      }

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

          const imageUrl = (asset.source_url as string);
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

        // Then stitch images after H2 tags
        blogBody = stitchImagesAfterH2(blogBody, uploadedMedia, body.altTexts ?? {});
      } else {
        // Legacy flow: fetch all assets, upload all, replace placeholders
        const { data: assets } = await sb
          .from('assets')
          .select('*')
          .eq('content_id', body.draftId);

        for (const rawAsset of assets ?? []) {
          const asset = rawAsset as Record<string, unknown>;
          const imageUrl = (asset.source_url as string);
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
      const postData: Record<string, unknown> = {
        title: body.seoOverrides?.title ?? draft.title ?? draftJson?.title ?? 'Untitled',
        slug: body.seoOverrides?.slug ?? (draftJson?.slug as string) ?? undefined,
        content: blogBody,
        excerpt: body.seoOverrides?.metaDescription ?? (draftJson?.meta_description as string) ?? '',
        status: body.mode === 'schedule' ? 'future' : body.mode,
      };
      if (body.mode === 'schedule' && body.scheduledDate) {
        postData.date = body.scheduledDate;
      }
      if (categoryIds.length > 0) postData.categories = categoryIds;
      if (tagIds.length > 0) postData.tags = tagIds;

      const featured = uploadedMedia['featured_image'];
      if (featured) postData.featured_media = featured.wpId;

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
      }

      await sb
        .from('content_drafts')
        .update(updateFields as never)
        .eq('id', body.draftId);

      return reply.status(201).send({
        data: {
          published: true,
          wordpress_post_id: wpPost.id,
          wordpress_url: wpPost.link,
          status: wpPost.status,
        },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'WordPress publish-draft error');
      return sendError(reply, error);
    }
  });
}
