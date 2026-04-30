/**
 * Autopilot Templates CRUD Routes
 *
 * GET    /                      — List user's templates (with optional channel filter)
 * POST   /                      — Create new template
 * PUT    /:id                   — Update template
 * DELETE /:id                   — Delete template
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from '@brighttale/shared/types/database';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import {
  createAutopilotTemplateSchema,
  updateAutopilotTemplateSchema,
} from '@brighttale/shared/schemas/autopilotTemplates.js';

export async function autopilotTemplatesRoutes(
  fastify: FastifyInstance
): Promise<void> {
  /**
   * GET / — List templates owned by user
   * Optional ?channelId=<uuid> to include channel-scoped templates
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const userId = request.userId ?? '';
      const { channelId } = request.query as { channelId?: string };

      // Validate channel ownership if channelId is provided
      if (channelId) {
        const { data: channel } = await sb
          .from('channels')
          .select('user_id')
          .eq('id', channelId)
          .maybeSingle();
        if (!channel) {
          return reply.status(404).send({
            data: null,
            error: { code: 'NOT_FOUND', message: 'Channel not found' },
          });
        }
        if (channel.user_id !== userId) {
          return reply.status(403).send({
            data: null,
            error: { code: 'FORBIDDEN', message: 'Forbidden' },
          });
        }
      }

      let query = sb
        .from('autopilot_templates')
        .select('*')
        .eq('user_id', userId);

      if (channelId) {
        // Return both globals (channel_id IS NULL) and channel-scoped
        query = query.or(`channel_id.is.null,channel_id.eq.${channelId}`);
      } else {
        // Return only globals
        query = query.is('channel_id', null);
      }

      const { data, error } = await query.order('created_at', {
        ascending: false,
      });

      if (error) throw error;

      return reply.send({
        data: { items: data ?? [] },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST / — Create a new template
   * If isDefault: true, first call clear_autopilot_default RPC, then insert
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const userId = request.userId ?? '';

      // Validate request body
      const parsed = createAutopilotTemplateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          data: null,
          error: {
            code: 'INVALID_BODY',
            message: parsed.error.message,
          },
        });
      }
      const body = parsed.data;

      // Validate channel ownership if channelId is provided
      if (body.channelId) {
        const { data: channel } = await sb
          .from('channels')
          .select('user_id')
          .eq('id', body.channelId)
          .maybeSingle();
        if (!channel) {
          return reply.status(404).send({
            data: null,
            error: { code: 'NOT_FOUND', message: 'Channel not found' },
          });
        }
        if (channel.user_id !== userId) {
          return reply.status(403).send({
            data: null,
            error: { code: 'FORBIDDEN', message: 'Forbidden' },
          });
        }
      }

      // If setting as default, clear other defaults first
      if (body.isDefault) {
        // Type cast: Supabase-generated RPC type incorrectly marks p_channel_id as non-null,
        // but the function handles NULL via `is not distinct from`
        const { error: rpcError } = await sb.rpc('clear_autopilot_default', {
          p_user_id: userId,
          p_channel_id: body.channelId,
        } as any);
        if (rpcError) throw rpcError;
      }

      // Insert the new template
      const newTemplate: Database['public']['Tables']['autopilot_templates']['Insert'] =
        {
          user_id: userId,
          channel_id: body.channelId,
          name: body.name,
          config_json: body.configJson,
          is_default: body.isDefault,
        };

      const { data, error } = await sb
        .from('autopilot_templates')
        .insert([newTemplate])
        .select();

      if (error) throw error;

      return reply.status(201).send({
        data: data?.[0] ?? null,
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:id — Update a template
   * If isDefault: true is being SET (not just present), call RPC first
   */
  fastify.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const userId = request.userId ?? '';
      const templateId = (request.params as { id: string }).id;

      // Validate request body
      const parsed = updateAutopilotTemplateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          data: null,
          error: {
            code: 'INVALID_BODY',
            message: parsed.error.message,
          },
        });
      }
      const body = parsed.data;

      // Verify ownership
      const { data: template, error: selectError } = await sb
        .from('autopilot_templates')
        .select('id, user_id, channel_id')
        .eq('id', templateId)
        .maybeSingle();

      if (selectError) throw selectError;
      if (!template) {
        return reply.status(404).send({
          data: null,
          error: {
            code: 'NOT_FOUND',
            message: 'Template not found',
          },
        });
      }

      if (template.user_id !== userId) {
        return reply.status(403).send({
          data: null,
          error: {
            code: 'FORBIDDEN',
            message: 'Not authorized to update this template',
          },
        });
      }

      // Validate channel ownership if channelId is being updated
      if (body.channelId !== undefined && body.channelId !== null) {
        const { data: channel } = await sb
          .from('channels')
          .select('user_id')
          .eq('id', body.channelId)
          .maybeSingle();
        if (!channel) {
          return reply.status(404).send({
            data: null,
            error: { code: 'NOT_FOUND', message: 'Channel not found' },
          });
        }
        if (channel.user_id !== userId) {
          return reply.status(403).send({
            data: null,
            error: { code: 'FORBIDDEN', message: 'Forbidden' },
          });
        }
      }

      // If setting isDefault to true, clear other defaults first
      if (body.isDefault === true) {
        // Type cast: Supabase-generated RPC type incorrectly marks p_channel_id as non-null,
        // but the function handles NULL via `is not distinct from`
        const { error: rpcError } = await sb.rpc('clear_autopilot_default', {
          p_user_id: userId,
          p_channel_id: template.channel_id,
        } as any);
        if (rpcError) throw rpcError;
      }

      // Build update object (only include fields that were provided)
      const updateData: Database['public']['Tables']['autopilot_templates']['Update'] =
        {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.configJson !== undefined) updateData.config_json = body.configJson;
      if (body.isDefault !== undefined) updateData.is_default = body.isDefault;
      if (body.channelId !== undefined) updateData.channel_id = body.channelId;

      const { data, error } = await sb
        .from('autopilot_templates')
        .update(updateData)
        .eq('id', templateId)
        .select();

      if (error) throw error;

      return reply.send({
        data: data?.[0] ?? null,
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /:id — Delete a template
   * Verification that the template is owned by the user
   */
  fastify.delete(
    '/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        const userId = request.userId ?? '';
        const templateId = (request.params as { id: string }).id;

        // Verify ownership
        const { data: template, error: selectError } = await sb
          .from('autopilot_templates')
          .select('id, user_id')
          .eq('id', templateId)
          .maybeSingle();

        if (selectError) throw selectError;
        if (!template) {
          return reply.status(404).send({
            data: null,
            error: {
              code: 'NOT_FOUND',
              message: 'Template not found',
            },
          });
        }

        if (template.user_id !== userId) {
          return reply.status(403).send({
            data: null,
            error: {
              code: 'FORBIDDEN',
              message: 'Not authorized to delete this template',
            },
          });
        }

        const { error } = await sb
          .from('autopilot_templates')
          .delete()
          .eq('id', templateId);

        if (error) throw error;

        return reply.send({
          data: { ok: true },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );
}
