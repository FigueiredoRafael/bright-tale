/**
 * WordPress Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import yaml from 'js-yaml';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { markdownToHtml } from '../lib/utils.js';
import {
  publishToWordPressSchema,
  fetchTagsQuerySchema,
  fetchCategoriesQuerySchema,
} from '@brighttale/shared/schemas/wordpress';

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
  // Download image from URL
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new ApiError(400, 'Failed to download image from source URL');
  }

  const imageBlob = await imageResponse.blob();
  const arrayBuffer = await imageBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Get filename from URL or generate one
  const urlParts = imageUrl.split('/');
  const filename = urlParts[urlParts.length - 1].split('?')[0] || 'image.jpg';

  // Upload to WordPress
  const uploadResponse = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': imageBlob.type || 'image/jpeg',
    },
    body: buffer,
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
   * POST /publish — Full publish flow
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

  /**
   * POST /publish-draft — F2-043. Publica um content_drafts.draft_json no WP.
   * Mapping:
   *   title        → draft.title ou draft_json.title
   *   content      → draft_json.body (ou outro campo longo via findContent)
   *   excerpt      → draft_json.meta_description | hook | summary
   *   status       → "draft" | "publish" | "future" (com scheduled_at)
   *   tags/categories → draft_json.keywords[] (criadas se não existirem)
   *   scheduled_at → F2-024 scheduling (status=future + date ISO)
   *
   * Body:
   *   { draftId: uuid, configId?: uuid, status?: 'draft'|'publish'|'future',
   *     scheduledAt?: ISO date, categories?: string[], tags?: string[] }
   */
  fastify.post('/publish-draft', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = z.object({
        draftId: z.string().uuid(),
        configId: z.string().uuid().optional(),
        status: z.enum(['draft', 'publish', 'future']).default('publish'),
        scheduledAt: z.string().datetime().optional(),
        categories: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      }).parse(request.body);

      if (body.status === 'future' && !body.scheduledAt) {
        throw new ApiError(400, 'scheduledAt required when status=future', 'BAD_REQUEST');
      }

      // Load draft
      const { data: draft } = await sb
        .from('content_drafts')
        .select('*')
        .eq('id', body.draftId)
        .maybeSingle();
      if (!draft) throw new ApiError(404, 'Draft not found', 'NOT_FOUND');
      if (draft.type !== 'blog') throw new ApiError(400, 'Only blog drafts can publish to WordPress', 'WRONG_TYPE');
      if (!draft.draft_json) throw new ApiError(400, 'Draft has no content yet — generate first', 'NO_CONTENT');

      // Extract fields from draft_json (handles various agent shapes).
      const dj = draft.draft_json as Record<string, unknown>;
      function findLong(node: unknown, keys: string[], depth = 0): string | null {
        if (depth > 6) return null;
        if (node && typeof node === 'object' && !Array.isArray(node)) {
          const o = node as Record<string, unknown>;
          for (const k of keys) {
            const v = o[k];
            if (typeof v === 'string' && v.length > 50) return v;
          }
          for (const v of Object.values(o)) {
            const r = findLong(v, keys, depth + 1);
            if (r) return r;
          }
        }
        return null;
      }
      const content = findLong(dj, ['body', 'content', 'text', 'markdown', 'draft', 'post', 'article', 'full_text']) ?? '';
      const excerpt = findLong(dj, ['meta_description', 'summary', 'description', 'hook']) ?? '';
      const title = (draft.title as string | null) ?? (dj.title as string | null) ?? 'Sem título';
      const keywords = (dj.keywords as string[] | undefined) ?? (dj.tags as string[] | undefined) ?? [];

      // WP credentials
      const configQuery = sb.from('wordpress_configs').select('*');
      const { data: config } = body.configId
        ? await configQuery.eq('id', body.configId).maybeSingle()
        : await configQuery.limit(1).maybeSingle();
      if (!config) throw new ApiError(404, 'WordPress not configured — configure em /settings/wordpress', 'NO_WP_CONFIG');

      const site_url = (config.site_url as string).replace(/\/$/, '');
      const username = config.username as string;
      const password = decrypt(config.password as string);
      const auth = Buffer.from(`${username}:${password}`).toString('base64');

      // POST to WP
      const payload: Record<string, unknown> = {
        title,
        content,
        excerpt,
        status: body.status,
      };
      if (body.scheduledAt) payload.date = body.scheduledAt;

      const tagList = body.tags ?? keywords;
      if (tagList.length > 0) {
        // Resolve/create tags (best-effort; skip failures silently).
        const tagIds: number[] = [];
        for (const tagName of tagList.slice(0, 10)) {
          try {
            const res = await fetch(`${site_url}/wp-json/wp/v2/tags`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
              body: JSON.stringify({ name: tagName }),
            });
            const json = await res.json() as { id?: number; code?: string; data?: { term_id?: number } };
            if (json.id) tagIds.push(json.id);
            else if (json.code === 'term_exists' && json.data?.term_id) tagIds.push(json.data.term_id);
          } catch { /* skip */ }
        }
        if (tagIds.length > 0) payload.tags = tagIds;
      }

      const wpRes = await fetch(`${site_url}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify(payload),
      });
      if (!wpRes.ok) {
        const err = await wpRes.text();
        throw new ApiError(wpRes.status, `WordPress: ${err.slice(0, 200)}`, 'WP_ERROR');
      }
      const wpPost = await wpRes.json() as { id: number; link: string; status: string };

      // Update draft status
      const newStatus = body.status === 'publish' ? 'published' : body.status === 'future' ? 'scheduled' : 'approved';
      await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
      })
        .update({
          status: newStatus,
          published_at: body.status === 'publish' ? new Date().toISOString() : null,
          scheduled_at: body.scheduledAt ?? null,
          published_url: wpPost.link,
        })
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
}
