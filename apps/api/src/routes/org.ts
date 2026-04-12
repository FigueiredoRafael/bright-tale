/**
 * Organization Fastify Route Plugin
 * F1-003: CRUD for the current user's organization
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { updateOrgSchema } from '@brighttale/shared/schemas/organizations';

export async function orgRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET / — Get the current user's organization
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      // Find the user's org membership (first org = primary)
      const { data: membership, error: memberError } = await sb
        .from('org_memberships')
        .select('org_id, role')
        .eq('user_id', request.userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (memberError || !membership) {
        throw new ApiError(404, 'No organization found for this user', 'NOT_FOUND');
      }

      const { data: org, error: orgError } = await sb
        .from('organizations')
        .select('*')
        .eq('id', membership.org_id)
        .single();

      if (orgError || !org) {
        throw new ApiError(404, 'Organization not found', 'NOT_FOUND');
      }

      return reply.send({
        data: { ...org, role: membership.role },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT / — Update the current user's organization (admin+ only)
   */
  fastify.put('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const body = updateOrgSchema.parse(request.body);

      // Check role
      const { data: membership } = await sb
        .from('org_memberships')
        .select('org_id, role')
        .eq('user_id', request.userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (!membership) throw new ApiError(404, 'No organization found', 'NOT_FOUND');
      if (!['owner', 'admin'].includes(membership.role)) {
        throw new ApiError(403, 'Only owners and admins can update the organization', 'FORBIDDEN');
      }

      // Build update object (snake_case for DB)
      const { data: org, error } = await sb
        .from('organizations')
        .update({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.slug !== undefined && { slug: body.slug }),
          ...(body.logoUrl !== undefined && { logo_url: body.logoUrl }),
        })
        .eq('id', membership.org_id)
        .select()
        .single();

      if (error) throw error;

      return reply.send({ data: org, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE / — Delete the current user's organization (owner only)
   */
  fastify.delete('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      // Check role
      const { data: membership } = await sb
        .from('org_memberships')
        .select('org_id, role')
        .eq('user_id', request.userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (!membership) throw new ApiError(404, 'No organization found', 'NOT_FOUND');
      if (membership.role !== 'owner') {
        throw new ApiError(403, 'Only the owner can delete the organization', 'FORBIDDEN');
      }

      const { error } = await sb
        .from('organizations')
        .delete()
        .eq('id', membership.org_id);

      if (error) throw error;

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
