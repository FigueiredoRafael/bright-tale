-- Backfill: create personal org for any user that has a profile but no org_membership.
-- Happens when:
--  - user signed up before the auto-create-org trigger existed
--  - user was created directly via Supabase (not via Fastify /auth/signup hook)
--  - the trigger failed silently

do $$
declare
  u record;
  new_org_id uuid;
  user_email text;
  org_slug text;
begin
  for u in
    select up.id
    from public.user_profiles up
    left join public.org_memberships m on m.user_id = up.id
    where m.id is null
  loop
    -- Get user email for org name
    select email into user_email from auth.users where id = u.id;

    org_slug := 'personal-' || replace(u.id::text, '-', '');

    -- Create org
    insert into public.organizations (name, slug, plan)
    values (
      coalesce(split_part(user_email, '@', 1), 'My Organization'),
      org_slug,
      'free'
    )
    returning id into new_org_id;

    -- Make user the owner
    insert into public.org_memberships (org_id, user_id, role, accepted_at)
    values (new_org_id, u.id, 'owner', now());
  end loop;
end $$;

-- Also handle users in auth.users that don't even have user_profiles rows yet.
-- This can happen if the Supabase signup bypassed the onPostSignUp hook.
do $$
declare
  u record;
begin
  for u in
    select au.id
    from auth.users au
    left join public.user_profiles up on up.id = au.id
    where up.id is null
  loop
    -- Insert the profile — the create_personal_org trigger will handle the org
    insert into public.user_profiles (id, email)
    select au.id, au.email from auth.users au where au.id = u.id
    on conflict (id) do nothing;
  end loop;
end $$;
