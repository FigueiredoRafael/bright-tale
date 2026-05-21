import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/admin-check';
import { sendEmail } from '@/lib/email/send';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

function apiBase() {
  return (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
  if (!(await isAdminUser(supabase, user.id))) return jsonError('Forbidden', 'FORBIDDEN', 403);

  const body = await req.json() as { content?: string };
  if (!body.content?.trim()) return jsonError('content is required', 'INVALID_BODY', 400);

  // Forward to apps/api to insert message + update thread status
  const apiRes = await fetch(`${apiBase()}/support/threads/${id}/human-reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': process.env.INTERNAL_API_KEY ?? '',
      'x-user-id': user.id,
    },
    body: JSON.stringify({ content: body.content }),
  });

  const apiJson = await apiRes.json() as { data: { ok: boolean; userId: string } | null; error: { message: string } | null };
  if (!apiRes.ok || apiJson.error) {
    return NextResponse.json(apiJson, { status: apiRes.status });
  }

  // Send email notification to the user (fire-and-forget)
  const targetUserId = apiJson.data?.userId;
  if (targetUserId) {
    void (async () => {
      try {
        const db = createAdminClient();
        // Get user email from auth via service role
        const { data: { users } } = await db.auth.admin.listUsers();
        const targetUser = users.find((u) => u.id === targetUserId);
        if (targetUser?.email) {
          await sendEmail({
            to: targetUser.email,
            subject: 'Sua solicitação de suporte foi respondida — BrightTale',
            html: `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0e1a;color:#e6edf7;border-radius:12px;">
                <h2 style="margin:0 0 12px;color:#2DD4A8;font-size:18px;">Suporte BrightTale</h2>
                <p style="margin:0 0 16px;color:#8b98b0;font-size:14px;">Sua solicitação foi respondida por um membro da nossa equipe:</p>
                <div style="background:#121826;border:1px solid #263146;border-radius:8px;padding:16px;margin-bottom:16px;">
                  <p style="margin:0;font-size:14px;line-height:1.6;color:#e6edf7;">${body.content?.replace(/\n/g, '<br>')}</p>
                </div>
                <p style="margin:0;font-size:12px;color:#8b98b0;">
                  Acesse o chat de suporte no seu painel para continuar a conversa.
                </p>
              </div>
            `,
          });
        }
      } catch {
        // email failure never blocks the response
      }
    })();
  }

  return NextResponse.json({ data: { ok: true }, error: null });
}
