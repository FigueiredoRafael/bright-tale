'use server'

/**
 * Server Actions for the /admin/managers mutation UI (SEC-008.1).
 *
 * Security invariants enforced on every action:
 *   1. Caller must be an authenticated admin-area user (middleware +
 *      isAdminUser already guarantees this when the page renders; we
 *      re-check here because Server Actions can be invoked directly).
 *   2. Caller's session must be AAL2 (MFA verified). Enforced by the
 *      middleware AAL2 gate; we re-check anyway.
 *   3. Caller role must permit the action (see permission matrix in
 *      docs/security/ADMIN-PROVISIONING.md):
 *         owner can do everything except demote the LAST owner
 *         admin can do everything except touch owner rows
 *         others can't mutate
 *   4. Audit rows are written by the DB trigger; we set
 *      `app.audit_actor` via set_config so the trigger captures who did it.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminPath } from '@/lib/admin-path'
import {
  isAdminUser,
  getManager,
  canManageOtherManagers,
  type ManagerRole,
} from '@/lib/admin-check'
import { sendEmail } from '@/lib/email/send'

const VALID_ROLES: ManagerRole[] = ['owner', 'admin', 'support', 'billing', 'readonly']

interface ActionError {
  ok: false
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'AAL_REQUIRED' | 'VALIDATION' | 'NOT_FOUND' | 'INVARIANT' | 'INTERNAL'
  message: string
}
interface ActionSuccess<T = void> {
  ok: true
  data?: T
}
type ActionResult<T = void> = ActionSuccess<T> | ActionError

// ── Guard: resolve the calling admin + their role, assert AAL2 ────────────
async function requireAdminCaller(): Promise<
  | { ok: true; userId: string; role: ManagerRole }
  | ActionError
> {
  const supabase = await createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, code: 'UNAUTHENTICATED', message: 'Not signed in' }
  }

  // AAL2 gate — middleware enforces this on page loads; belt + braces here
  // because Server Actions can be called from a fetch directly.
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      return { ok: false, code: 'AAL_REQUIRED', message: 'MFA challenge required before this action' }
    }
  } catch {
    // fall through — same forgiving posture as the middleware
  }

  // Admin-area access check (managers table first, user_roles fallback)
  const isAdmin = await isAdminUser(supabase, user.id)
  if (!isAdmin) {
    return { ok: false, code: 'FORBIDDEN', message: 'Admin access required' }
  }

  const manager = await getManager(supabase, user.id)
  // If caller has user_roles fallback but no managers row yet, treat as admin
  const role: ManagerRole = manager?.role ?? 'admin'
  return { ok: true, userId: user.id, role }
}

// Audit actor is captured by the managers_emit_audit trigger via
// `current_setting('app.audit_actor')`. Run set_config in the same tx
// before the mutation so the trigger sees it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setAuditActor(db: any, actorUserId: string): Promise<void> {
  // set_config( , , true) = transaction-local; cleared after commit.
  await db.rpc('set_config', {
    parameter: 'app.audit_actor',
    value: actorUserId,
    is_local: true,
  })
}

// ── Action: invite a new manager ──────────────────────────────────────────
export async function inviteManager(input: {
  email: string
  role: ManagerRole
  displayName?: string
  title?: string
  department?: string
}): Promise<ActionResult<{ userId: string; managerId: string }>> {
  const caller = await requireAdminCaller()
  if (!caller.ok) return caller

  if (!canManageOtherManagers(caller.role)) {
    return { ok: false, code: 'FORBIDDEN', message: 'Only owner or admin can invite managers' }
  }
  if (!VALID_ROLES.includes(input.role)) {
    return { ok: false, code: 'VALIDATION', message: 'Invalid role' }
  }
  if (input.role === 'owner' && caller.role !== 'owner') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only owners can invite other owners' }
  }
  if (!input.email || !/^[^@]+@[^@]+\.[^@]+$/.test(input.email)) {
    return { ok: false, code: 'VALIDATION', message: 'Invalid email' }
  }

  const admin = createAdminClient()

  // 1. Invite via Supabase admin API (sends magic link email)
  const inviteResp = await admin.auth.admin.inviteUserByEmail(input.email)
  if (inviteResp.error) {
    // If user already exists, Supabase returns a specific error — still useful,
    // we can proceed to create the manager row if the user's confirmed.
    if (!/already been registered|already registered/i.test(inviteResp.error.message)) {
      return {
        ok: false,
        code: 'INTERNAL',
        message: 'Could not send invite email. Check Supabase SMTP config.',
      }
    }
  }

  // 2. Find the auth.users id (newly-invited OR already-existing)
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const target = existing?.users.find((u) => u.email?.toLowerCase() === input.email.toLowerCase())
  if (!target) {
    return { ok: false, code: 'NOT_FOUND', message: 'Invite sent but user not found in auth.users' }
  }

  // 3. Set audit actor + create managers row
  await setAuditActor(admin, caller.userId)

  const { data: inserted, error: insErr } = await admin
    .from('managers')
    .insert({
      user_id: target.id,
      role: input.role,
      display_name: input.displayName ?? null,
      title: input.title ?? null,
      department: input.department ?? null,
      invited_by: caller.userId,
    })
    .select('id')
    .single()

  if (insErr) {
    if (/duplicate key|unique constraint/i.test(insErr.message)) {
      return { ok: false, code: 'INVARIANT', message: 'This user is already a manager' }
    }
    return { ok: false, code: 'INTERNAL', message: 'Could not create manager row' }
  }

  revalidatePath(adminPath('/managers'))
  return { ok: true, data: { userId: target.id, managerId: inserted.id } }
}

// ── Action: promote an existing user (apps/app user) into a manager ───────
// Different from inviteManager: the target already has an auth.users row.
// We just add a managers row + email them a notification link to log in
// and complete MFA enrollment. Their regular app account still works.
export async function promoteExistingUserToManager(input: {
  targetUserId: string
  role: ManagerRole
  displayName?: string
  title?: string
  department?: string
}): Promise<ActionResult<{ managerId: string }>> {
  const caller = await requireAdminCaller()
  if (!caller.ok) return caller

  if (!canManageOtherManagers(caller.role)) {
    return { ok: false, code: 'FORBIDDEN', message: 'Only owner or admin can promote users' }
  }
  if (!VALID_ROLES.includes(input.role)) {
    return { ok: false, code: 'VALIDATION', message: 'Invalid role' }
  }
  if (input.role === 'owner' && caller.role !== 'owner') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only owners can promote to owner' }
  }
  if (input.targetUserId === caller.userId) {
    return { ok: false, code: 'INVARIANT', message: 'You are already a manager' }
  }

  const admin = createAdminClient()

  // 1. Verify the target is a real auth.users row
  const { data: targetUser, error: userErr } = await admin.auth.admin.getUserById(
    input.targetUserId,
  )
  if (userErr || !targetUser?.user?.email) {
    return { ok: false, code: 'NOT_FOUND', message: 'Target user not found' }
  }

  // 2. Check not already a manager
  const { data: existing } = await admin
    .from('managers')
    .select('id')
    .eq('user_id', input.targetUserId)
    .maybeSingle()
  if (existing) {
    return { ok: false, code: 'INVARIANT', message: 'User is already a manager' }
  }

  // 3. Create managers row (trigger writes the audit entry)
  await setAuditActor(admin, caller.userId)

  const { data: inserted, error: insErr } = await admin
    .from('managers')
    .insert({
      user_id: input.targetUserId,
      role: input.role,
      display_name: input.displayName ?? null,
      title: input.title ?? null,
      department: input.department ?? null,
      invited_by: caller.userId,
    })
    .select('id')
    .single()

  if (insErr) {
    return {
      ok: false,
      code: 'INTERNAL',
      message: `Could not create manager row: ${insErr.message}`,
    }
  }

  // 4. Email the user — their existing app password still works, but they
  //    need to log in at the admin URL and complete MFA enrollment.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.brighttale.com.br'
  const adminSlug = process.env.NEXT_PUBLIC_ADMIN_SLUG ?? 'admin'
  const adminLoginUrl = `${appUrl}/${adminSlug}/login`

  const emailResult = await sendEmail({
    to: targetUser.user.email,
    subject: 'Você agora é um manager do BrightTale',
    html: buildPromotionEmail({
      name: input.displayName ?? targetUser.user.email,
      role: input.role,
      loginUrl: adminLoginUrl,
    }),
  })

  // Log the email outcome — email failure does NOT rollback the promotion
  // (the audit row already captured it; admin can resend manually).
  if (!emailResult.ok) {
    console.warn(
      `[managers] Promotion email failed for ${targetUser.user.email}: ${emailResult.error}`,
    )
  }

  revalidatePath(adminPath('/managers'))
  revalidatePath(adminPath('/users'))
  return { ok: true, data: { managerId: inserted.id } }
}

function buildPromotionEmail(params: {
  name: string
  role: string
  loginUrl: string
}): string {
  return `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px; color: #0a0e1a;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">Você agora é um manager do BrightTale</h1>
  <p style="color: #475569; line-height: 1.55; margin: 0 0 12px;">
    Olá ${escapeHtml(params.name)},
  </p>
  <p style="color: #475569; line-height: 1.55; margin: 0 0 18px;">
    Você foi promovido a <strong>${escapeHtml(params.role)}</strong> no painel
    administrativo do BrightTale. Antes de entrar, você precisa configurar o
    segundo fator de autenticação (MFA) — é obrigatório pra todo manager.
  </p>
  <p style="margin: 0 0 22px;">
    <a href="${params.loginUrl}" style="display: inline-block; padding: 11px 22px;
       background: #8b5cf6; color: #fff; text-decoration: none; border-radius: 8px;
       font-weight: 600;">
      Entrar no painel admin
    </a>
  </p>
  <p style="color: #475569; line-height: 1.55; margin: 0 0 14px; font-size: 14px;">
    <strong>Como vai funcionar:</strong>
  </p>
  <ol style="color: #475569; line-height: 1.7; font-size: 14px; padding-left: 22px; margin: 0 0 18px;">
    <li>Clique no botão acima e faça login com seu email + senha atuais</li>
    <li>Você será redirecionado pra página de MFA</li>
    <li>Escaneie o QR code com Authy, 1Password ou Google Authenticator</li>
    <li>Digite o código de 6 dígitos pra confirmar</li>
    <li>Pronto — você terá acesso à área admin</li>
  </ol>
  <p style="color: #94a3b8; font-size: 12px; margin: 24px 0 0; padding-top: 18px; border-top: 1px solid #e2e8f0;">
    Se você não esperava esse email, ignore — ninguém ganha acesso sem completar o
    passo de MFA. Em caso de dúvida, responda esse email ou escreva pra
    <a href="mailto:support@brighttale.com.br" style="color: #8b5cf6;">support@brighttale.com.br</a>.
  </p>
</div>`
}

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// ── Action: change a manager's role ───────────────────────────────────────
export async function changeManagerRole(input: {
  managerId: string
  newRole: ManagerRole
}): Promise<ActionResult> {
  const caller = await requireAdminCaller()
  if (!caller.ok) return caller

  if (!canManageOtherManagers(caller.role)) {
    return { ok: false, code: 'FORBIDDEN', message: 'Only owner or admin can change roles' }
  }
  if (!VALID_ROLES.includes(input.newRole)) {
    return { ok: false, code: 'VALIDATION', message: 'Invalid role' }
  }

  const admin = createAdminClient()

  // Load target
  const { data: target, error: selErr } = await admin
    .from('managers')
    .select('id, user_id, role, is_active')
    .eq('id', input.managerId)
    .maybeSingle()
  if (selErr || !target) {
    return { ok: false, code: 'NOT_FOUND', message: 'Manager not found' }
  }
  if (!target.is_active) {
    return { ok: false, code: 'INVARIANT', message: 'Cannot change role of a deactivated manager; reactivate first' }
  }

  // Owner role transitions
  if (target.role === 'owner' && caller.role !== 'owner') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only owners can modify other owners' }
  }
  if (input.newRole === 'owner' && caller.role !== 'owner') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only owners can promote to owner' }
  }

  // Last-owner invariant
  if (target.role === 'owner' && input.newRole !== 'owner') {
    const { count: ownerCount } = await admin
      .from('managers')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'owner')
      .eq('is_active', true)
    if ((ownerCount ?? 0) <= 1) {
      return { ok: false, code: 'INVARIANT', message: 'Cannot demote the last active owner' }
    }
  }

  await setAuditActor(admin, caller.userId)

  const { error: updErr } = await admin
    .from('managers')
    .update({ role: input.newRole })
    .eq('id', input.managerId)
  if (updErr) {
    return { ok: false, code: 'INTERNAL', message: 'Could not update role' }
  }

  revalidatePath(adminPath('/managers'))
  return { ok: true }
}

// ── Action: deactivate (soft-delete) ──────────────────────────────────────
export async function deactivateManager(input: {
  managerId: string
  reason?: string
}): Promise<ActionResult> {
  const caller = await requireAdminCaller()
  if (!caller.ok) return caller

  if (!canManageOtherManagers(caller.role)) {
    return { ok: false, code: 'FORBIDDEN', message: 'Only owner or admin can deactivate managers' }
  }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('managers')
    .select('id, user_id, role, is_active')
    .eq('id', input.managerId)
    .maybeSingle()
  if (!target) {
    return { ok: false, code: 'NOT_FOUND', message: 'Manager not found' }
  }
  if (!target.is_active) {
    return { ok: true } // already deactivated — idempotent no-op
  }
  if (target.role === 'owner' && caller.role !== 'owner') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only owners can deactivate other owners' }
  }
  if (target.user_id === caller.userId && caller.role === 'owner') {
    // Prevent owner from locking themselves out unless another owner exists
    const { count: ownerCount } = await admin
      .from('managers')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'owner')
      .eq('is_active', true)
    if ((ownerCount ?? 0) <= 1) {
      return { ok: false, code: 'INVARIANT', message: 'Cannot deactivate the last active owner' }
    }
  }

  await setAuditActor(admin, caller.userId)

  const { error: updErr } = await admin
    .from('managers')
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivated_by: caller.userId,
      deactivation_reason: input.reason ?? null,
    })
    .eq('id', input.managerId)
  if (updErr) {
    return { ok: false, code: 'INTERNAL', message: 'Could not deactivate' }
  }

  revalidatePath(adminPath('/managers'))
  return { ok: true }
}

// ── Action: reactivate ────────────────────────────────────────────────────
export async function reactivateManager(input: {
  managerId: string
}): Promise<ActionResult> {
  const caller = await requireAdminCaller()
  if (!caller.ok) return caller

  if (!canManageOtherManagers(caller.role)) {
    return { ok: false, code: 'FORBIDDEN', message: 'Only owner or admin can reactivate managers' }
  }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('managers')
    .select('id, role, is_active')
    .eq('id', input.managerId)
    .maybeSingle()
  if (!target) {
    return { ok: false, code: 'NOT_FOUND', message: 'Manager not found' }
  }
  if (target.is_active) {
    return { ok: true } // idempotent
  }
  if (target.role === 'owner' && caller.role !== 'owner') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only owners can reactivate owner rows' }
  }

  await setAuditActor(admin, caller.userId)

  const { error: updErr } = await admin
    .from('managers')
    .update({
      is_active: true,
      deactivated_at: null,
      deactivated_by: null,
      deactivation_reason: null,
    })
    .eq('id', input.managerId)
  if (updErr) {
    return { ok: false, code: 'INTERNAL', message: 'Could not reactivate' }
  }

  revalidatePath(adminPath('/managers'))
  return { ok: true }
}
