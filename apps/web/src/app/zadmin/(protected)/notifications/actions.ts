'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export interface UserSearchResult {
  id: string;
  email: string;
  name: string;
}

/**
 * Search users by email fragment (case-insensitive, max 5 results).
 * Uses the admin client so it can read user_profiles regardless of RLS.
 */
export async function searchUser(query: string): Promise<UserSearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const db = createAdminClient();
  const { data, error } = await db
    .from('user_profiles')
    .select('id, email, first_name, last_name')
    .ilike('email', `%${query.trim()}%`)
    .limit(5);

  if (error || !data) return [];

  return data.map((p) => ({
    id: p.id as string,
    email: p.email as string,
    name:
      [p.first_name, p.last_name].filter(Boolean).join(' ') ||
      (p.email as string),
  }));
}
