// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isAdminUser(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();

  return data?.role === 'admin';
}
