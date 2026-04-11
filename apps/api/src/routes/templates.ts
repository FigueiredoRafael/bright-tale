/**
 * Templates Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '@/middleware/authenticate';
import { createServiceClient } from '@/lib/supabase';
import { sendError } from '@/lib/api/fastify-errors';
import { ApiError } from '@/lib/api/errors';
import { resolveTemplate } from '@/lib/queries/templates';
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
} from '@brighttale/shared/schemas/templates';

export async function templatesRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET / — List templates with optional filters/pagination
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const params = listTemplatesQuerySchema.parse(Object.fromEntries(url.searchParams));

      const page = params.page || 1;
      const limit = params.limit || 20;
      const sortField = params.sort || 'created_at';
      const sortOrder = params.order || 'desc';

      let countQuery = sb.from('templates').select('*', { count: 'exact', head: true });
      let dataQuery = sb
        .from('templates')
        .select('*, parent:parent_template_id(id, name, type), children:templates!parent_template_id(count)');

      if (params.type) {
        countQuery = countQuery.eq('type', params.type);
        dataQuery = dataQuery.eq('type', params.type);
      }

      if (params.parent_template_id) {
        countQuery = countQuery.eq('parent_template_id', params.parent_template_id);
        dataQuery = dataQuery.eq('parent_template_id', params.parent_template_id);
      }

      if (params.search) {
        countQuery = countQuery.ilike('name', `%${params.search}%`);
        dataQuery = dataQuery.ilike('name', `%${params.search}%`);
      }

      const [{ count: total, error: countErr }, { data: templates, error: dataErr }] =
        await Promise.all([
          countQuery,
          dataQuery
            .order(sortField, { ascending: sortOrder === 'asc' })
            .range((page - 1) * limit, page * limit - 1),
        ]);

      if (countErr) throw countErr;
      if (dataErr) throw dataErr;

      return reply.send({
        data: {
          data: templates,
          pagination: {
            page,
            limit,
            total: total ?? 0,
            totalPages: Math.ceil((total ?? 0) / limit),
          },
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST / — Create a new template
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createTemplateSchema.parse(request.body);

      // Validate JSON format
      try {
        JSON.parse(data.config_json);
      } catch {
        throw new ApiError(400, 'Invalid JSON in config_json', 'INVALID_JSON');
      }

      // If parent_template_id is provided, verify it exists and matches type
      if (data.parent_template_id) {
        const { data: parentTemplate, error: parentErr } = await sb
          .from('templates')
          .select('id, type')
          .eq('id', data.parent_template_id)
          .maybeSingle();

        if (parentErr) throw parentErr;

        if (!parentTemplate) {
          throw new ApiError(404, 'Parent template not found', 'PARENT_NOT_FOUND');
        }

        if (parentTemplate.type !== data.type) {
          throw new ApiError(400, 'Parent template must be of the same type', 'TYPE_MISMATCH');
        }
      }

      const { data: template, error } = await sb
        .from('templates')
        .insert({
          name: data.name,
          type: data.type,
          config_json: data.config_json,
          parent_template_id: data.parent_template_id,
          user_id: request.userId ?? null,
        })
        .select('*, parent:parent_template_id(id, name, type)')
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: template, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/resolved — Get resolved template (merged with parent chain)
   * Must be registered before /:id to avoid route conflict
   */
  fastify.get('/:id/resolved', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const resolved = await resolveTemplate(id);

      if (!resolved) {
        throw new ApiError(404, 'Template not found', 'NOT_FOUND');
      }

      return reply.send({ data: { resolvedTemplate: resolved }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id — Get template details by ID
   */
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: template, error } = await sb
        .from('templates')
        .select(
          '*, parent:parent_template_id(id, name, type, config_json), children:templates!parent_template_id(id, name, type, created_at)',
        )
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!template) {
        throw new ApiError(404, 'Template not found', 'NOT_FOUND');
      }

      // Parse config_json for response
      let parsedConfig;
      try {
        parsedConfig = JSON.parse(template.config_json);
      } catch {
        parsedConfig = template.config_json;
      }

      return reply.send({
        data: {
          ...template,
          config_json: template.config_json,
          config: parsedConfig,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:id — Update template by ID (with circular inheritance check)
   */
  fastify.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateTemplateSchema.parse(request.body);

      // Check if template exists
      const { data: existing, error: findErr } = await sb
        .from('templates')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Template not found', 'NOT_FOUND');
      }

      // Validate JSON format if config_json is provided
      if (data.config_json) {
        try {
          JSON.parse(data.config_json);
        } catch {
          throw new ApiError(400, 'Invalid JSON in config_json', 'INVALID_JSON');
        }
      }

      // If parent_template_id is being updated, verify it exists and check for cycles
      if (data.parent_template_id !== undefined && data.parent_template_id !== null) {
        if (data.parent_template_id === id) {
          throw new ApiError(400, 'Template cannot be its own parent', 'SELF_REFERENCE');
        }

        const { data: parentTemplate, error: parentErr } = await sb
          .from('templates')
          .select('id, type')
          .eq('id', data.parent_template_id)
          .maybeSingle();

        if (parentErr) throw parentErr;

        if (!parentTemplate) {
          throw new ApiError(404, 'Parent template not found', 'PARENT_NOT_FOUND');
        }

        const newType = data.type || existing.type;
        if (parentTemplate.type !== newType) {
          throw new ApiError(400, 'Parent template must be of the same type', 'TYPE_MISMATCH');
        }

        // Prevent circular inheritance
        const visited = new Set<string>([id]);
        let checkParentId: string | null = data.parent_template_id;

        while (checkParentId) {
          if (visited.has(checkParentId)) {
            throw new ApiError(400, 'Circular template inheritance detected', 'CIRCULAR_INHERITANCE');
          }
          visited.add(checkParentId);

          const { data: parentCheck } = (await sb
            .from('templates')
            .select('parent_template_id')
            .eq('id', checkParentId)
            .maybeSingle()) as { data: { parent_template_id: string | null } | null };

          checkParentId = parentCheck?.parent_template_id || null;
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.name) updateData.name = data.name;
      if (data.type) updateData.type = data.type;
      if (data.config_json) updateData.config_json = data.config_json;
      if (data.parent_template_id !== undefined)
        updateData.parent_template_id = data.parent_template_id;

      const { data: template, error } = await sb
        .from('templates')
        .update(updateData as any)
        .eq('id', id)
        .select('*, parent:parent_template_id(id, name, type)')
        .single();

      if (error) throw error;

      return reply.send({ data: template, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /:id — Delete template (check for child templates first)
   */
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      // Check if template exists and has children
      const { data: existing, error: findErr } = await sb
        .from('templates')
        .select('id, children:templates!parent_template_id(count)')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Template not found', 'NOT_FOUND');
      }

      // Check if template has children
      const childCount = (existing as any).children?.[0]?.count ?? 0;
      if (childCount > 0) {
        throw new ApiError(
          400,
          `Cannot delete template that has ${childCount} child template(s)`,
          'HAS_CHILDREN',
        );
      }

      const { error } = await sb.from('templates').delete().eq('id', id);
      if (error) throw error;

      return reply.send({
        data: { success: true, message: 'Template deleted successfully' },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
