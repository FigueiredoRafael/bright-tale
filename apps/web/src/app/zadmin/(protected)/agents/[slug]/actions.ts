'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_INTERNAL } from '@/lib/admin-path';

interface UpdatePayload {
  id: string;
  name: string;
  instructions: string;
  input_schema: string | null;
  output_schema: string | null;
  recommended_provider: string | null;
  recommended_model: string | null;
  sections_json: Record<string, unknown> | null;
}

export async function updateAgentAction(payload: UpdatePayload) {
  const db = createAdminClient();
  const { error } = await db
    .from('agent_prompts')
    .update({
      name: payload.name,
      instructions: payload.instructions,
      input_schema: payload.input_schema,
      output_schema: payload.output_schema,
      recommended_provider: payload.recommended_provider,
      recommended_model: payload.recommended_model,
      sections_json: payload.sections_json,
    })
    .eq('id', payload.id);

  if (error) return { ok: false as const, message: error.message };
  revalidatePath(`${ADMIN_INTERNAL}/agents`);
  revalidatePath(`${ADMIN_INTERNAL}/agents/${payload.id}`);
  return { ok: true as const };
}
