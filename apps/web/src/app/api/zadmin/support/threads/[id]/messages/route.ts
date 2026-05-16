import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/admin-check';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('[zadmin/messages] auth error:', authError.message);
      return jsonError('Auth error', 'AUTH_ERROR', 500);
    }
    if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
    if (!(await isAdminUser(supabase, user.id))) return jsonError('Forbidden', 'FORBIDDEN', 403);

    const db = createAdminClient();

    const { data: messages, error } = await db
      .from('support_messages')
      .select('id, role, content, created_at')
      .eq('thread_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[zadmin/messages] DB error:', JSON.stringify(error));
      return jsonError(error.message, 'DB_ERROR', 500);
    }

    // Reset unread counter — best-effort, don't block the response
    void Promise.resolve(
      db.from('support_threads').update({ user_unread_count: 0 } as Record<string, unknown>).eq('id', id),
    ).then(({ error: e }) => {
      if (e) console.error('[zadmin/messages] reset unread error:', e.message);
    }).catch((e: unknown) => {
      console.error('[zadmin/messages] reset unread rejected:', e);
    });

    return NextResponse.json({ data: { messages: messages ?? [] }, error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[zadmin/messages] unexpected error:', msg);
    return jsonError(msg, 'INTERNAL_ERROR', 500);
  }
}
