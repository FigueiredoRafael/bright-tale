import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';
import { z } from 'zod';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

interface NotificationTemplateRow {
  type: string;
  label: string;
  title_template: string;
  body_template: string | null;
  default_action_url: string | null;
  available_variables: unknown;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

interface NotificationTemplate {
  type: string;
  label: string;
  titleTemplate: string;
  bodyTemplate: string | null;
  defaultActionUrl: string | null;
  availableVariables: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: NotificationTemplateRow): NotificationTemplate {
  const vars = Array.isArray(row.available_variables) ? (row.available_variables as string[]) : [];
  return {
    type: row.type,
    label: row.label,
    titleTemplate: row.title_template,
    bodyTemplate: row.body_template,
    defaultActionUrl: row.default_action_url,
    availableVariables: vars,
    isSystem: row.is_system,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const updateSchema = z.object({
  titleTemplate: z.string().min(1).max(300),
  bodyTemplate: z.string().max(1000).nullable().optional(),
  defaultActionUrl: z.string().max(500).nullable().optional(),
});

/**
 * PUT /api/zadmin/notification-templates/[type]
 * Owner or admin only. Updates title/body/url templates.
 * Cannot change type, label, is_system, or available_variables.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager || (manager.role !== 'owner' && manager.role !== 'admin')) {
    return jsonError('Forbidden', 'FORBIDDEN', 403);
  }

  const { type } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON', 'INVALID_JSON', 400);
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message, 'VALIDATION_ERROR', 422);

  const { titleTemplate, bodyTemplate, defaultActionUrl } = parsed.data;

  const db = createAdminClient();

  const { data: updated, error } = await db
    .from('notification_templates')
    .update({
      title_template: titleTemplate,
      body_template: bodyTemplate ?? null,
      default_action_url: defaultActionUrl ?? null,
    })
    .eq('type', type)
    .select('type, label, title_template, body_template, default_action_url, available_variables, is_system, created_at, updated_at')
    .maybeSingle<NotificationTemplateRow>();

  if (error) return jsonError(error.message, 'DB_ERROR', 500);
  if (!updated) return jsonError('Template não encontrado', 'NOT_FOUND', 404);

  return NextResponse.json({ data: mapRow(updated), error: null });
}
