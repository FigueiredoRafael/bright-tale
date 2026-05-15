import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

export interface NotificationTemplate {
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

function mapRow(row: {
  type: string;
  label: string;
  title_template: string;
  body_template: string | null;
  default_action_url: string | null;
  available_variables: unknown;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}): NotificationTemplate {
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

/** GET /api/zadmin/notification-templates — list all templates (any manager role). */
export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager) return jsonError('Forbidden', 'FORBIDDEN', 403);

  const db = createAdminClient();
  const { data: rows, error } = await db
    .from('notification_templates')
    .select('type, label, title_template, body_template, default_action_url, available_variables, is_system, created_at, updated_at')
    .order('label', { ascending: true });

  if (error) return jsonError(error.message, 'DB_ERROR', 500);

  const templates = (rows ?? []).map(mapRow);
  return NextResponse.json({ data: templates, error: null });
}
