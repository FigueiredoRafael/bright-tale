/**
 * AI Config Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { encrypt } from '../lib/crypto.js';
import { getAIAdapter } from '../lib/ai/index.js';
import { createAIConfigSchema, updateAIConfigSchema } from '@brighttale/shared/schemas/ai';
import { discoveryInputSchema } from '@brighttale/shared/schemas/discovery';

export async function aiConfigRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /config — Create a new AI provider config
   */
  fastify.post('/config', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const validated = createAIConfigSchema.parse(request.body);

      if (!process.env.ENCRYPTION_SECRET) {
        return reply.status(500).send({
          error: 'Server configuration error',
          message:
            'ENCRYPTION_SECRET environment variable is not set. Please configure it in your .env file.',
        });
      }

      const encryptedKey = encrypt(validated.api_key);

      if (validated.is_active) {
        await sb.from('ai_provider_configs').update({ is_active: false }).eq('is_active', true);
      }

      const { data: config, error } = await sb
        .from('ai_provider_configs')
        .insert({
          provider: validated.provider,
          api_key: encryptedKey,
          is_active: validated.is_active,
          config_json: validated.config_json,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.send({
        id: config.id,
        provider: config.provider,
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
   * GET /config — List all AI provider configs
   */
  fastify.get('/config', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { data: configs, error } = await sb
        .from('ai_provider_configs')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const safeConfigs = (configs ?? []).map((config: any) => ({
        id: config.id,
        provider: config.provider,
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
   * GET /config/:id — Get a single AI provider config
   */
  fastify.get('/config/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: config, error } = await sb
        .from('ai_provider_configs')
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
   * PUT /config/:id — Update an AI provider config
   */
  fastify.put('/config/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const validated = updateAIConfigSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb
        .from('ai_provider_configs')
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
            error: 'Server configuration error',
            message:
              'ENCRYPTION_SECRET environment variable is not set. Please configure it in your .env file.',
          });
        }
        updateData.api_key = encrypt(validated.api_key);
      }

      if (validated.is_active !== undefined) {
        updateData.is_active = validated.is_active;

        if (validated.is_active) {
          await sb
            .from('ai_provider_configs')
            .update({ is_active: false })
            .neq('id', id)
            .eq('is_active', true);
        }
      }

      if (validated.config_json !== undefined) {
        updateData.config_json = validated.config_json;
      }

      const { data: config, error } = await sb
        .from('ai_provider_configs')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return reply.send({
        id: config.id,
        provider: config.provider,
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
   * DELETE /config/:id — Delete an AI provider config
   */
  fastify.delete('/config/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { error } = await sb.from('ai_provider_configs').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ success: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /discovery — Run AI discovery
   */
  fastify.post('/discovery', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = discoveryInputSchema.parse(request.body);

      const adapter = await getAIAdapter();
      const output = await adapter.generateDiscovery(body);

      return reply.send({ discovery_output: output });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
