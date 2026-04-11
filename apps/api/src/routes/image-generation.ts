/**
 * Image Generation Config Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '@/middleware/authenticate';
import { createServiceClient } from '@/lib/supabase';
import { sendError } from '@/lib/api/fastify-errors';
import { encrypt } from '@/lib/crypto';
import {
  imageGeneratorConfigSchema,
  updateImageGeneratorConfigSchema,
} from '@brighttale/shared/schemas/imageGeneration';

export async function imageGenerationRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /config — Create a new image generator config
   */
  fastify.post('/config', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const validated = imageGeneratorConfigSchema.parse(request.body);

      if (!process.env.ENCRYPTION_SECRET) {
        return reply.status(500).send({
          error: 'Server configuration error',
          message: 'ENCRYPTION_SECRET environment variable is not set.',
        });
      }

      const encryptedKey = encrypt(validated.api_key);

      if (validated.is_active) {
        await sb
          .from('image_generator_configs')
          .update({ is_active: false })
          .eq('is_active', true);
      }

      const { data: config, error } = await sb
        .from('image_generator_configs')
        .insert({
          provider: validated.provider,
          api_key: encryptedKey,
          model: validated.model,
          is_active: validated.is_active,
          config_json: validated.config_json,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.send({
        id: config.id,
        provider: config.provider,
        model: config.model,
        is_active: config.is_active,
        config_json: config.config_json,
        created_at: config.created_at,
        updated_at: config.updated_at,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /config — List all image generator configs
   */
  fastify.get('/config', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { data: configs, error } = await sb
        .from('image_generator_configs')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const safeConfigs = (configs ?? []).map((config: any) => ({
        id: config.id,
        provider: config.provider,
        model: config.model,
        is_active: config.is_active,
        config_json: config.config_json,
        created_at: config.created_at,
        updated_at: config.updated_at,
        has_api_key: !!config.api_key,
      }));

      return reply.send(safeConfigs);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /config/:id — Get a single image generator config
   */
  fastify.get('/config/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: config, error } = await sb
        .from('image_generator_configs')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!config) {
        return reply.status(404).send({ error: 'Config not found' });
      }

      return reply.send({
        id: config.id,
        provider: config.provider,
        model: config.model,
        is_active: config.is_active,
        config_json: config.config_json,
        created_at: config.created_at,
        updated_at: config.updated_at,
        has_api_key: !!config.api_key,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /config/:id — Update an image generator config
   */
  fastify.put('/config/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const validated = updateImageGeneratorConfigSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb
        .from('image_generator_configs')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        return reply.status(404).send({ error: 'Config not found' });
      }

      const updateData: Record<string, unknown> = {};

      if (validated.api_key) {
        if (!process.env.ENCRYPTION_SECRET) {
          return reply.status(500).send({
            error: 'ENCRYPTION_SECRET environment variable is not set.',
          });
        }
        updateData.api_key = encrypt(validated.api_key);
      }

      if (validated.model !== undefined) updateData.model = validated.model;
      if (validated.config_json !== undefined) updateData.config_json = validated.config_json;

      if (validated.is_active !== undefined) {
        updateData.is_active = validated.is_active;
        if (validated.is_active) {
          await sb
            .from('image_generator_configs')
            .update({ is_active: false })
            .neq('id', id)
            .eq('is_active', true);
        }
      }

      const { data: config, error } = await sb
        .from('image_generator_configs')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return reply.send({
        id: config.id,
        provider: config.provider,
        model: config.model,
        is_active: config.is_active,
        config_json: config.config_json,
        created_at: config.created_at,
        updated_at: config.updated_at,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /config/:id — Delete an image generator config
   */
  fastify.delete('/config/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { error } = await sb.from('image_generator_configs').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
