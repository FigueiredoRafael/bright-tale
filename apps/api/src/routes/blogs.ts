/**
 * Blogs Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '@/middleware/authenticate';
import { createServiceClient } from '@/lib/supabase';
import { sendError } from '@/lib/api/fastify-errors';
import { ApiError } from '@/lib/api/errors';
import { markdownToHtml } from '@/lib/utils';
import type { BlogOutput } from '@brighttale/shared/types/agents';

// Query schema for listing
const listQuerySchema = z.object({
  status: z.enum(['draft', 'review', 'approved', 'published']).optional(),
  project_id: z.string().optional(),
  idea_id: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Create schema
const createBlogSchema = z.object({
  title: z.string().min(1).max(500),
  slug: z.string().min(1).max(200),
  meta_description: z.string().default(''),
  full_draft: z.string().default(''),
  outline: z
    .array(
      z.object({
        h2: z.string(),
        key_points: z.array(z.string()).default([]),
        word_count_target: z.number().default(300),
      }),
    )
    .optional(),
  primary_keyword: z.string().optional(),
  secondary_keywords: z.array(z.string()).default([]),
  affiliate_integration: z
    .object({
      placement: z.enum(['intro', 'middle', 'conclusion']).optional(),
      copy: z.string().optional(),
      product_link_placeholder: z.string().optional(),
      rationale: z.string().optional(),
    })
    .optional(),
  internal_links_suggested: z
    .array(
      z.object({
        topic: z.string(),
        anchor_text: z.string(),
      }),
    )
    .optional(),
  word_count: z.number().default(0),
  status: z.enum(['draft', 'review', 'approved', 'published']).default('draft'),
  project_id: z.string().optional(),
  idea_id: z.string().optional(),
});

// Update schema
const updateBlogSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  slug: z.string().min(1).max(200).optional(),
  meta_description: z.string().optional(),
  full_draft: z.string().optional(),
  outline: z
    .array(
      z.object({
        h2: z.string(),
        key_points: z.array(z.string()).default([]),
        word_count_target: z.number().default(300),
      }),
    )
    .optional(),
  primary_keyword: z.string().optional(),
  secondary_keywords: z.array(z.string()).optional(),
  affiliate_integration: z
    .object({
      placement: z.enum(['intro', 'middle', 'conclusion']).optional(),
      copy: z.string().optional(),
      product_link_placeholder: z.string().optional(),
      rationale: z.string().optional(),
    })
    .optional(),
  internal_links_suggested: z
    .array(
      z.object({
        topic: z.string(),
        anchor_text: z.string(),
      }),
    )
    .optional(),
  word_count: z.number().optional(),
  status: z.enum(['draft', 'review', 'approved', 'published']).optional(),
  project_id: z.string().nullable().optional(),
  idea_id: z.string().nullable().optional(),
  wordpress_post_id: z.number().nullable().optional(),
  wordpress_url: z.string().nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
});

// Wrap HTML content in full document with styling
function wrapInHtmlDocument(bodyHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1, h2, h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
        h1 { font-size: 2em; }
        h2 { font-size: 1.5em; color: #444; }
        h3 { font-size: 1.2em; color: #555; }
        p { margin-bottom: 1em; }
        blockquote {
            border-left: 4px solid #007bff;
            padding-left: 1em;
            margin: 1em 0;
            color: #555;
            font-style: italic;
        }
        code {
            background: #f4f4f4;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-size: 0.9em;
        }
        pre {
            background: #f4f4f4;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
        }
        pre code {
            background: none;
            padding: 0;
        }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
        ul, ol { margin-bottom: 1em; }
        li { margin-bottom: 0.5em; }
        hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// Generate clean markdown export
function generateMarkdownExport(blog: BlogOutput): string {
  let md = `# ${blog.title}\n\n`;

  // Meta section
  md += `---\n`;
  md += `slug: ${blog.slug}\n`;
  md += `meta_description: "${blog.meta_description}"\n`;
  if (blog.primary_keyword) {
    md += `primary_keyword: ${blog.primary_keyword}\n`;
  }
  if (blog.secondary_keywords && blog.secondary_keywords.length > 0) {
    md += `secondary_keywords: [${blog.secondary_keywords.join(', ')}]\n`;
  }
  md += `word_count: ${blog.word_count}\n`;
  md += `---\n\n`;

  // Full draft
  md += blog.full_draft || '';

  // Affiliate section if present
  if (blog.affiliate_integration?.copy) {
    md += `\n\n---\n\n## Affiliate Information\n\n`;
    md += `**Placement:** ${blog.affiliate_integration.placement}\n\n`;
    md += `**Copy:** ${blog.affiliate_integration.copy}\n\n`;
    if (blog.affiliate_integration.rationale) {
      md += `**Rationale:** ${blog.affiliate_integration.rationale}\n`;
    }
  }

  return md;
}

export async function blogsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET / — List blog drafts with filters/pagination
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const query = listQuerySchema.parse(Object.fromEntries(url.searchParams));

      const { status, project_id, idea_id, search, page, limit } = query;

      let countQuery = sb.from('blog_drafts').select('*', { count: 'exact', head: true });
      let dataQuery = sb
        .from('blog_drafts')
        .select(
          'id, title, slug, meta_description, word_count, status, primary_keyword, project_id, idea_id, wordpress_post_id, wordpress_url, published_at, created_at, updated_at',
        );

      // Filter by user_id when present
      if (request.userId) {
        countQuery = countQuery.eq('user_id', request.userId);
        dataQuery = dataQuery.eq('user_id', request.userId);
      }

      if (status) {
        countQuery = countQuery.eq('status', status);
        dataQuery = dataQuery.eq('status', status);
      }
      if (project_id) {
        countQuery = countQuery.eq('project_id', project_id);
        dataQuery = dataQuery.eq('project_id', project_id);
      }
      if (idea_id) {
        countQuery = countQuery.eq('idea_id', idea_id);
        dataQuery = dataQuery.eq('idea_id', idea_id);
      }
      if (search) {
        const searchFilter = `title.ilike.%${search}%,slug.ilike.%${search}%,primary_keyword.ilike.%${search}%`;
        countQuery = countQuery.or(searchFilter);
        dataQuery = dataQuery.or(searchFilter);
      }

      const [{ count: total, error: countErr }, { data: blogs, error: dataErr }] =
        await Promise.all([
          countQuery,
          dataQuery.order('updated_at', { ascending: false }).range((page - 1) * limit, page * limit - 1),
        ]);

      if (countErr) throw countErr;
      if (dataErr) throw dataErr;

      return reply.send({
        data: {
          blogs,
          pagination: {
            page,
            limit,
            total: total ?? 0,
            total_pages: Math.ceil((total ?? 0) / limit),
          },
        },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list blogs');
      return sendError(reply, error);
    }
  });

  /**
   * POST / — Create blog draft
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createBlogSchema.parse(request.body);

      const { data: blog, error } = await sb
        .from('blog_drafts')
        .insert({
          title: data.title,
          slug: data.slug,
          meta_description: data.meta_description,
          full_draft: data.full_draft,
          outline_json: data.outline ? JSON.stringify(data.outline) : null,
          primary_keyword: data.primary_keyword,
          secondary_keywords: data.secondary_keywords,
          affiliate_placement: data.affiliate_integration?.placement,
          affiliate_copy: data.affiliate_integration?.copy,
          affiliate_link: data.affiliate_integration?.product_link_placeholder,
          affiliate_rationale: data.affiliate_integration?.rationale,
          internal_links_json: data.internal_links_suggested
            ? JSON.stringify(data.internal_links_suggested)
            : null,
          word_count: data.word_count,
          status: data.status,
          project_id: data.project_id,
          idea_id: data.idea_id,
          user_id: request.userId ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: { blog }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create blog');
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id — Get blog with BlogOutput transform
   */
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: blog, error } = await sb
        .from('blog_drafts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!blog) {
        throw new ApiError(404, 'Blog not found', 'NOT_FOUND');
      }

      // Transform to BlogOutput format
      const blogOutput: BlogOutput = {
        title: blog.title,
        slug: blog.slug,
        meta_description: blog.meta_description,
        full_draft: blog.full_draft,
        outline: blog.outline_json ? JSON.parse(blog.outline_json) : [],
        primary_keyword: blog.primary_keyword || '',
        secondary_keywords: blog.secondary_keywords,
        affiliate_integration: {
          placement:
            (blog.affiliate_placement as 'intro' | 'middle' | 'conclusion') || 'middle',
          copy: blog.affiliate_copy || '',
          product_link_placeholder: blog.affiliate_link || '',
          rationale: blog.affiliate_rationale || '',
        },
        internal_links_suggested: blog.internal_links_json
          ? JSON.parse(blog.internal_links_json)
          : [],
        word_count: blog.word_count,
      };

      return reply.send({
        data: {
          blog: {
            id: blog.id,
            ...blogOutput,
            status: blog.status,
            project_id: blog.project_id,
            idea_id: blog.idea_id,
            wordpress_post_id: blog.wordpress_post_id,
            wordpress_url: blog.wordpress_url,
            published_at: blog.published_at,
            created_at: blog.created_at,
            updated_at: blog.updated_at,
          },
        },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get blog');
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:id — Update blog (full update)
   */
  fastify.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    return handleBlogUpdate(request, reply);
  });

  /**
   * PATCH /:id — Update blog (partial update, same logic as PUT)
   */
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    return handleBlogUpdate(request, reply);
  });

  /**
   * DELETE /:id — Delete blog
   */
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      // Check if blog exists
      const { data: existing, error: findErr } = await sb
        .from('blog_drafts')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Blog not found', 'NOT_FOUND');
      }

      const { error } = await sb.from('blog_drafts').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete blog');
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/export — Export blog in markdown/html/json format
   */
  fastify.get('/:id/export', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const url = new URL(request.url, 'http://localhost');
      const format = url.searchParams.get('format') || 'markdown';

      const { data: blog, error } = await sb
        .from('blog_drafts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!blog) {
        throw new ApiError(404, 'Blog not found', 'NOT_FOUND');
      }

      // Transform to BlogOutput format
      const blogOutput: BlogOutput = {
        title: blog.title,
        slug: blog.slug,
        meta_description: blog.meta_description,
        full_draft: blog.full_draft,
        outline: blog.outline_json ? JSON.parse(blog.outline_json) : [],
        primary_keyword: blog.primary_keyword || '',
        secondary_keywords: blog.secondary_keywords,
        affiliate_integration: {
          placement:
            (blog.affiliate_placement as 'intro' | 'middle' | 'conclusion') || 'middle',
          copy: blog.affiliate_copy || '',
          product_link_placeholder: blog.affiliate_link || '',
          rationale: blog.affiliate_rationale || '',
        },
        internal_links_suggested: blog.internal_links_json
          ? JSON.parse(blog.internal_links_json)
          : [],
        word_count: blog.word_count,
      };

      switch (format) {
        case 'html': {
          const bodyHtml = markdownToHtml(blogOutput.full_draft);
          const html = wrapInHtmlDocument(bodyHtml, blogOutput.title);
          return reply
            .header('Content-Type', 'text/html; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${blog.slug}.html"`)
            .send(html);
        }

        case 'json': {
          return reply
            .header('Content-Disposition', `attachment; filename="${blog.slug}.json"`)
            .send({
              id: blog.id,
              ...blogOutput,
              status: blog.status,
              project_id: blog.project_id,
              idea_id: blog.idea_id,
              created_at: blog.created_at,
              updated_at: blog.updated_at,
            });
        }

        case 'markdown':
        default: {
          const markdown = generateMarkdownExport(blogOutput);
          return reply
            .header('Content-Type', 'text/markdown; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${blog.slug}.md"`)
            .send(markdown);
        }
      }
    } catch (error) {
      request.log.error({ err: error }, 'Failed to export blog');
      return sendError(reply, error);
    }
  });

  // Shared update handler for PUT and PATCH
  async function handleBlogUpdate(request: any, reply: any) {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateBlogSchema.parse(request.body);

      // Check if blog exists
      const { data: existing, error: findErr } = await sb
        .from('blog_drafts')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Blog not found', 'NOT_FOUND');
      }

      // Build update data
      const updateData: Record<string, unknown> = {};

      if (data.title !== undefined) updateData.title = data.title;
      if (data.slug !== undefined) updateData.slug = data.slug;
      if (data.meta_description !== undefined) updateData.meta_description = data.meta_description;
      if (data.full_draft !== undefined) updateData.full_draft = data.full_draft;
      if (data.outline !== undefined) updateData.outline_json = JSON.stringify(data.outline);
      if (data.primary_keyword !== undefined) updateData.primary_keyword = data.primary_keyword;
      if (data.secondary_keywords !== undefined)
        updateData.secondary_keywords = data.secondary_keywords;
      if (data.word_count !== undefined) updateData.word_count = data.word_count;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.project_id !== undefined) updateData.project_id = data.project_id;
      if (data.idea_id !== undefined) updateData.idea_id = data.idea_id;
      if (data.wordpress_post_id !== undefined)
        updateData.wordpress_post_id = data.wordpress_post_id;
      if (data.wordpress_url !== undefined) updateData.wordpress_url = data.wordpress_url;
      if (data.published_at !== undefined) {
        updateData.published_at = data.published_at
          ? new Date(data.published_at).toISOString()
          : null;
      }

      // Handle affiliate integration
      if (data.affiliate_integration) {
        if (data.affiliate_integration.placement !== undefined) {
          updateData.affiliate_placement = data.affiliate_integration.placement;
        }
        if (data.affiliate_integration.copy !== undefined) {
          updateData.affiliate_copy = data.affiliate_integration.copy;
        }
        if (data.affiliate_integration.product_link_placeholder !== undefined) {
          updateData.affiliate_link = data.affiliate_integration.product_link_placeholder;
        }
        if (data.affiliate_integration.rationale !== undefined) {
          updateData.affiliate_rationale = data.affiliate_integration.rationale;
        }
      }

      // Handle internal links
      if (data.internal_links_suggested !== undefined) {
        updateData.internal_links_json = JSON.stringify(data.internal_links_suggested);
      }

      const { data: blog, error } = await sb
        .from('blog_drafts')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return reply.send({ data: { blog }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update blog');
      return sendError(reply, error);
    }
  }
}
