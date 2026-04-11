/**
 * Assets Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { saveAssetSchema, searchUnsplashQuerySchema } from '@brighttale/shared/schemas/assets';
import {
  generateImageRequestSchema,
  suggestPromptsRequestSchema,
} from '@brighttale/shared/schemas/imageGeneration';
import { getImageProvider } from '../lib/ai/imageIndex.js';
import { saveImageLocally, deleteImageFile } from '../lib/files/imageStorage.js';
import {
  generateBlogFeaturedImagePrompt,
  generateBlogSectionImagePrompt,
  generateVideoThumbnailPrompt,
  generateVideoChapterImagePrompt,
  generateStandalonePrompt,
  extractAgentImagePrompt,
} from '../lib/ai/promptGenerators.js';

export async function assetsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /download — Bulk ZIP download of selected generated images
   * Must be registered BEFORE /:id to avoid param conflict
   */
  fastify.get('/download', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const idsParam = url.searchParams.get('ids');
      const projectId = url.searchParams.get('projectId');

      let query = sb.from('assets').select('*').eq('source', 'generated');

      if (idsParam) {
        const ids = idsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        query = query.in('id', ids);
      } else if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data: assets, error } = await query;
      if (error) throw error;

      const validAssets = (assets ?? []).filter(
        (a: any) => a.local_path && fs.existsSync(path.resolve(process.cwd(), a.local_path)),
      );

      if (validAssets.length === 0) {
        throw new ApiError(404, 'No downloadable assets found', 'NOT_FOUND');
      }

      // Create ZIP archive in memory
      const archive = archiver('zip', { zlib: { level: 6 } });
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        archive.on('data', (chunk: Buffer) => chunks.push(chunk));
        archive.on('end', resolve);
        archive.on('error', reject);

        for (const asset of validAssets) {
          const absolutePath = path.resolve(process.cwd(), asset.local_path!);
          const ext = path.extname(absolutePath).slice(1) || 'jpg';
          const role = asset.role ?? 'image';
          const filename = `${role}-${asset.id.slice(0, 8)}.${ext}`;
          archive.file(absolutePath, { name: filename });
        }

        archive.finalize();
      });

      const zipBuffer = Buffer.concat(chunks);
      const timestamp = new Date().toISOString().slice(0, 10);
      const zipName = `images-${timestamp}.zip`;

      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${zipName}"`)
        .header('Content-Length', String(zipBuffer.length))
        .send(zipBuffer);
    } catch (error) {
      request.log.error({ err: error }, 'Bulk download error');
      return sendError(reply, error);
    }
  });

  /**
   * GET /project/:projectId — Get all assets for a specific project
   * Must be registered BEFORE /:id to avoid param conflict
   */
  fastify.get('/project/:projectId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { projectId } = request.params as { projectId: string };

      // Verify project exists
      const { data: project, error: projErr } = await sb
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .maybeSingle();

      if (projErr) throw projErr;

      if (!project) {
        throw new ApiError(404, 'Project not found', 'NOT_FOUND');
      }

      const { data: assets, error } = await sb
        .from('assets')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return reply.send({
        data: {
          assets,
          count: (assets ?? []).length,
        },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list assets for project');
      return sendError(reply, error);
    }
  });

  /**
   * POST /generate/suggest-prompts — Template-based prompt suggestions (pure function, no DB)
   * Must be registered BEFORE /generate to avoid route conflict
   */
  fastify.post(
    '/generate/suggest-prompts',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const validated = suggestPromptsRequestSchema.parse(request.body);
        const suggestions: string[] = [];

        // If agent already generated a prompt for this role, include it first
        const agentPrompt = extractAgentImagePrompt(
          validated.agent_image_prompts,
          validated.role,
        );
        if (agentPrompt) {
          suggestions.push(agentPrompt);
        }

        const { content_type, role, title = '', outline, chapters, thumbnail } = validated;

        if (content_type === 'blog') {
          if (role === 'featured') {
            if (!agentPrompt) {
              suggestions.push(
                generateBlogFeaturedImagePrompt(title, undefined, 'professional'),
              );
            }
            suggestions.push(generateBlogFeaturedImagePrompt(title, undefined, 'casual'));
          } else {
            const sectionMatch = role.match(/^section_(\d+)$/);
            if (sectionMatch) {
              const idx = parseInt(sectionMatch[1], 10) - 1;
              const section = outline?.[idx];
              if (section) {
                if (!agentPrompt) {
                  suggestions.push(
                    generateBlogSectionImagePrompt(section.h2, section.key_points),
                  );
                }
                suggestions.push(generateBlogSectionImagePrompt(section.h2));
              }
            }
          }
        }

        if (content_type === 'video') {
          if (role === 'thumbnail_option_1') {
            if (!agentPrompt) {
              suggestions.push(
                generateVideoThumbnailPrompt(
                  title,
                  thumbnail?.visual_concept,
                  thumbnail?.emotion,
                ),
              );
            }
            suggestions.push(
              generateVideoThumbnailPrompt(title, 'dramatic close-up', 'curiosity'),
            );
          }
          if (role === 'thumbnail_option_2') {
            if (!agentPrompt) {
              suggestions.push(
                generateVideoThumbnailPrompt(title, thumbnail?.visual_concept, 'intrigue'),
              );
            }
            suggestions.push(
              generateVideoThumbnailPrompt(title, 'wide establishing shot', 'shock'),
            );
          }
          const chapterMatch = role.match(/^chapter_(\d+)$/);
          if (chapterMatch) {
            const idx = parseInt(chapterMatch[1], 10) - 1;
            const chapter = chapters?.[idx];
            if (chapter) {
              if (!agentPrompt) {
                suggestions.push(generateVideoChapterImagePrompt(chapter.title));
              }
              suggestions.push(
                `Cinematic still for "${chapter.title}". Natural lighting, documentary style, visually rich.`,
              );
            }
          }
        }

        if (content_type === 'standalone') {
          suggestions.push(
            generateStandalonePrompt(title || 'abstract concept', 'editorial_photo'),
          );
          suggestions.push(
            generateStandalonePrompt(title || 'abstract concept', 'digital_illustration'),
          );
          suggestions.push(generateStandalonePrompt(title || 'abstract concept', 'minimalist'));
        }

        // Always provide at least one generic fallback
        if (suggestions.length === 0) {
          suggestions.push(
            `Professional photograph related to "${title || role}". Clean composition, natural lighting, high quality, no text.`,
          );
        }

        // Deduplicate, keep max 3
        const unique = [...new Set(suggestions)].slice(0, 3);

        return reply.send({ data: { suggestions: unique }, error: null });
      } catch (error) {
        request.log.error({ err: error }, 'Failed to generate prompt suggestions');
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /generate — Generate an image with the active AI image provider
   */
  fastify.post('/generate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const validated = generateImageRequestSchema.parse(request.body);

      const provider = await getImageProvider();

      const results = await provider.generateImages({
        prompt: validated.prompt,
        numImages: validated.numImages,
        aspectRatio: validated.aspectRatio,
        outputMimeType: validated.outputMimeType,
      });

      if (results.length === 0) {
        throw new ApiError(502, 'No images were generated', 'GENERATION_FAILED');
      }

      // Save all generated images and create Asset records
      const assets = await Promise.all(
        results.map(async (result: { base64: string; mimeType: string }) => {
          const { localPath, publicUrl } = await saveImageLocally(
            result.base64,
            result.mimeType,
            validated.project_id,
          );

          const { data, error } = await sb
            .from('assets')
            .insert({
              project_id: validated.project_id ?? null,
              asset_type: 'image',
              source: 'generated',
              source_url: publicUrl,
              local_path: localPath,
              prompt: validated.prompt,
              role: validated.role ?? null,
              content_type: validated.content_type ?? null,
              content_id: validated.content_id ?? null,
            })
            .select()
            .single();

          if (error) throw error;
          return data;
        }),
      );

      return reply
        .status(201)
        .send({ data: assets.length === 1 ? assets[0] : assets, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Image generation error');
      return sendError(reply, error);
    }
  });

  /**
   * GET /unsplash/search — Proxy to Unsplash API
   */
  fastify.get('/unsplash/search', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const params = searchUnsplashQuerySchema.parse(
        Object.fromEntries(url.searchParams),
      );

      const accessKey = process.env.UNSPLASH_ACCESS_KEY;

      if (!accessKey) {
        throw new ApiError(
          500,
          'Unsplash API key not configured. Please set UNSPLASH_ACCESS_KEY environment variable.',
          'CONFIGURATION_ERROR',
        );
      }

      const unsplashUrl = new URL('https://api.unsplash.com/search/photos');
      unsplashUrl.searchParams.set('query', params.query);
      unsplashUrl.searchParams.set('page', params.page.toString());
      unsplashUrl.searchParams.set('per_page', params.per_page.toString());
      if (params.orientation) {
        unsplashUrl.searchParams.set('orientation', params.orientation);
      }

      const response = await fetch(unsplashUrl.toString(), {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(
          response.status,
          `Unsplash API error: ${errorText || response.statusText}`,
          'UPSTREAM_ERROR',
        );
      }

      const responseData = await response.json() as any;

      const results = responseData.results.map(
        (photo: {
          id: string;
          description: string | null;
          alt_description: string | null;
          urls: {
            raw: string;
            full: string;
            regular: string;
            small: string;
            thumb: string;
          };
          links: {
            html: string;
            download_location: string;
          };
          user: {
            name: string;
            username: string;
            links: {
              html: string;
            };
          };
          width: number;
          height: number;
        }) => ({
          id: photo.id,
          description: photo.description || photo.alt_description || '',
          alt_text: photo.alt_description || photo.description || '',
          urls: {
            raw: photo.urls.raw,
            full: photo.urls.full,
            regular: photo.urls.regular,
            small: photo.urls.small,
            thumb: photo.urls.thumb,
          },
          links: {
            html: photo.links.html,
            download_location: photo.links.download_location,
          },
          user: {
            name: photo.user.name,
            username: photo.user.username,
            profile: photo.user.links.html,
          },
          width: photo.width,
          height: photo.height,
        }),
      );

      return reply.send({
        data: {
          results,
          total: responseData.total,
          total_pages: responseData.total_pages,
          page: params.page,
          per_page: params.per_page,
        },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Unsplash search error');
      return sendError(reply, error);
    }
  });

  /**
   * GET / — List assets with optional filters/pagination
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const { searchParams } = url;

      const projectId = searchParams.get('projectId');
      const contentType = searchParams.get('contentType');
      const role = searchParams.get('role');
      const source = searchParams.get('source');
      const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));

      let query = sb.from('assets').select('*', { count: 'exact' });
      if (projectId) query = query.eq('project_id', projectId);
      if (contentType) query = query.eq('content_type', contentType);
      if (role) query = query.eq('role', role);
      if (source) query = query.eq('source', source);

      const { data: assets, count, error } = await query
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (error) throw error;

      return reply.send({
        data: { assets, total: count ?? 0, page, limit },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list assets');
      return sendError(reply, error);
    }
  });

  /**
   * POST / — Save a new asset record (unsplash/upload)
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = saveAssetSchema.parse(request.body);

      // Verify project exists
      const { data: project, error: projErr } = await sb
        .from('projects')
        .select('id')
        .eq('id', body.project_id)
        .maybeSingle();

      if (projErr) throw projErr;

      if (!project) {
        throw new ApiError(404, 'Project not found', 'NOT_FOUND');
      }

      const { data: asset, error } = await sb
        .from('assets')
        .insert({
          project_id: body.project_id,
          asset_type: body.asset_type,
          source: body.source,
          source_url: body.source_url,
          alt_text: body.alt_text,
          wordpress_id: body.wordpress_id,
          wordpress_url: body.wordpress_url,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: { asset }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to save asset');
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/download — Stream a single generated image file as an attachment
   */
  fastify.get('/:id/download', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: asset, error } = await sb
        .from('assets')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;

      if (!asset) {
        throw new ApiError(404, 'Asset not found', 'NOT_FOUND');
      }

      if (!asset.local_path) {
        throw new ApiError(400, 'Asset has no local file to download', 'NO_LOCAL_FILE');
      }

      const absolutePath = path.resolve(process.cwd(), asset.local_path);

      if (!fs.existsSync(absolutePath)) {
        throw new ApiError(404, 'File not found on disk', 'FILE_NOT_FOUND');
      }

      const ext = path.extname(absolutePath).slice(1) || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const filename = `image-${id.slice(0, 8)}.${ext}`;

      const fileBuffer = fs.readFileSync(absolutePath);

      return reply
        .header('Content-Type', mimeType)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Content-Length', String(fileBuffer.length))
        .send(fileBuffer);
    } catch (error) {
      request.log.error({ err: error }, 'Error downloading asset');
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /:id — Delete asset and optionally remove local file
   */
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: asset, error } = await sb
        .from('assets')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;

      if (!asset) {
        throw new ApiError(404, 'Asset not found', 'NOT_FOUND');
      }

      // Remove local file for generated images
      if (asset.source === 'generated' && asset.local_path) {
        await deleteImageFile(asset.local_path);
      }

      const { error: delErr } = await sb.from('assets').delete().eq('id', id);
      if (delErr) throw delErr;

      return reply.send({
        data: { deleted: true, asset_id: id, message: 'Asset deleted successfully' },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete asset');
      return sendError(reply, error);
    }
  });
}
