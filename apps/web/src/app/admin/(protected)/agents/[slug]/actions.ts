'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

interface UpdatePayload {
  id: string;
  name: string;
  instructions: string;
  input_schema: string | null;
  output_schema: string | null;
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
    })
    .eq('id', payload.id);

  if (error) return { ok: false as const, message: error.message };
  revalidatePath('/admin/agents');
  revalidatePath(`/admin/agents/${payload.id}`);
  return { ok: true as const };
}
