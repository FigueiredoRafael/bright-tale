/**
 * Team Management Fastify Route Plugin
 * F1-004: Members + invites for the current user's organization
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import {
  createInviteSchema,
  updateMemberRoleSchema,
} from '@brighttale/shared/schemas/organizations';

/** Helper: get user's membership + org_id, throw if not found */
async function requireMembership(userId: string) {
  const sb = createServiceClient();
  const { data } = await sb
    .from('org_memberships')
    .select('org_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!data) throw new ApiError(404, 'No organization found for this user', 'NOT_FOUND');
  return data;
}

export async function orgMembersRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /members — List org members
   */
  fastify.get('/members', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { org_id } = await requireMembership(request.userId);

      const { data: members, error } = await sb
        .from('org_memberships')
        .select('id, user_id, role, credit_limit, credits_used_cycle, invited_at, accepted_at, created_at, user_profiles(first_name, last_name, email, avatar_url)')
        .eq('org_id', org_id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return reply.send({ data: { members }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /invites — Invite a member by email
   */
  fastify.post('/invites', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { org_id, role } = await requireMembership(request.userId);
      if (!['owner', 'admin'].includes(role)) {
        throw new ApiError(403, 'Only owners and admins can invite members', 'FORBIDDEN');
      }

      const body = createInviteSchema.parse(request.body);

      // Check if already a member
      const { data: existingUser } = await sb
        .from('user_profiles')
        .select('id')
        .eq('email', body.email)
        .single();

      if (existingUser) {
        const { data: existingMember } = await sb
          .from('org_memberships')
          .select('id')
          .eq('org_id', org_id)
          .eq('user_id', existingUser.id)
          .single();

        if (existingMember) {
          throw new ApiError(409, 'User is already a member of this organization', 'CONFLICT');
        }
      }

      // Check for pending invite
      const { data: existingInvite } = await sb
        .from('org_invites')
        .select('id')
        .eq('org_id', org_id)
        .eq('email', body.email)
        .eq('status', 'pending')
        .single();

      if (existingInvite) {
        throw new ApiError(409, 'An invite is already pending for this email', 'CONFLICT');
      }

      // Create invite
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: invite, error } = await sb
        .from('org_invites')
        .insert({
          org_id,
          email: body.email,
          role: body.role,
          invited_by: request.userId,
          token,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) throw error;

      // TODO: Send invite email via Supabase/Resend when email service is wired

      return reply.status(201).send({ data: invite, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /invites/:token/accept — Accept an invite
   */
  fastify.post<{ Params: { token: string } }>('/invites/:token/accept', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { token } = request.params;

      // Find the invite
      const { data: invite, error: findError } = await sb
        .from('org_invites')
        .select('*')
        .eq('token', token)
        .eq('status', 'pending')
        .single();

      if (findError || !invite) {
        throw new ApiError(404, 'Invite not found or already used', 'NOT_FOUND');
      }

      // Check expiry
      if (new Date(invite.expires_at) < new Date()) {
        await sb.from('org_invites').update({ status: 'expired' }).eq('id', invite.id);
        throw new ApiError(410, 'This invite has expired', 'GONE');
      }

      // Create membership
      const { error: memberError } = await sb
        .from('org_memberships')
        .insert({
          org_id: invite.org_id,
          user_id: request.userId,
          role: invite.role,
          invited_by: invite.invited_by,
          invited_at: invite.created_at,
          accepted_at: new Date().toISOString(),
        });

      if (memberError) {
        if (memberError.code === '23505') {
          throw new ApiError(409, 'You are already a member of this organization', 'CONFLICT');
        }
        throw memberError;
      }

      // Mark invite as accepted
      await sb
        .from('org_invites')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invite.id);

      return reply.send({ data: { accepted: true, org_id: invite.org_id }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PATCH /members/:userId/role — Change a member's role (owner only)
   */
  fastify.patch<{ Params: { userId: string } }>('/members/:userId/role', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { org_id, role: callerRole } = await requireMembership(request.userId);
      if (callerRole !== 'owner') {
        throw new ApiError(403, 'Only the owner can change roles', 'FORBIDDEN');
      }

      const { userId: targetUserId } = request.params;
      const body = updateMemberRoleSchema.parse(request.body);

      if (targetUserId === request.userId) {
        throw new ApiError(400, 'Cannot change your own role', 'BAD_REQUEST');
      }

      const { data: updated, error } = await sb
        .from('org_memberships')
        .update({ role: body.role })
        .eq('org_id', org_id)
        .eq('user_id', targetUserId)
        .select()
        .single();

      if (error) throw error;
      if (!updated) throw new ApiError(404, 'Member not found', 'NOT_FOUND');

      return reply.send({ data: updated, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /members/:userId — Remove a member (admin+ only)
   */
  fastify.delete<{ Params: { userId: string } }>('/members/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { org_id, role: callerRole } = await requireMembership(request.userId);
      if (!['owner', 'admin'].includes(callerRole)) {
        throw new ApiError(403, 'Only owners and admins can remove members', 'FORBIDDEN');
      }

      const { userId: targetUserId } = request.params;

      if (targetUserId === request.userId) {
        throw new ApiError(400, 'Cannot remove yourself', 'BAD_REQUEST');
      }

      // Can't remove the owner
      const { data: target } = await sb
        .from('org_memberships')
        .select('role')
        .eq('org_id', org_id)
        .eq('user_id', targetUserId)
        .single();

      if (!target) throw new ApiError(404, 'Member not found', 'NOT_FOUND');
      if (target.role === 'owner') {
        throw new ApiError(403, 'Cannot remove the organization owner', 'FORBIDDEN');
      }

      const { error } = await sb
        .from('org_memberships')
        .delete()
        .eq('org_id', org_id)
        .eq('user_id', targetUserId);

      if (error) throw error;

      return reply.send({ data: { removed: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
