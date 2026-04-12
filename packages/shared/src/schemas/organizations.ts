import { z } from 'zod';

// ─── Roles ───────────────────────────────────────────────────────────────────

export const orgRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type OrgRole = z.infer<typeof orgRoleSchema>;

export const planSchema = z.enum(['free', 'starter', 'creator', 'pro']);
export type Plan = z.infer<typeof planSchema>;

// ─── Organization CRUD ───────────────────────────────────────────────────────

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  logoUrl: z.string().url().optional().nullable(),
});

export type UpdateOrg = z.infer<typeof updateOrgSchema>;

// ─── Invites ─────────────────────────────────────────────────────────────────

export const createInviteSchema = z.object({
  email: z.string().email(),
  role: orgRoleSchema.exclude(['owner']),
});

export type CreateInvite = z.infer<typeof createInviteSchema>;

// ─── Member management ──────────────────────────────────────────────────────

export const updateMemberRoleSchema = z.object({
  role: orgRoleSchema.exclude(['owner']),
});

export type UpdateMemberRole = z.infer<typeof updateMemberRoleSchema>;

export const updateMemberCreditLimitSchema = z.object({
  creditLimit: z.number().int().positive().nullable(),
});

export type UpdateMemberCreditLimit = z.infer<typeof updateMemberCreditLimitSchema>;
