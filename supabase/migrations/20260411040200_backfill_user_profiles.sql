-- Backfill user_profiles for existing auth.users that don't have a row yet.
-- This handles users that signed up before user_profiles was introduced,
-- or before the onPostSignUp hook was configured.

insert into public.user_profiles (id, email, first_name, last_name)
select
  a.id,
  a.email,
  a.raw_user_meta_data->>'first_name' as first_name,
  a.raw_user_meta_data->>'last_name'  as last_name
from auth.users a
where a.email is not null
  and not exists (
    select 1 from public.user_profiles p where p.id = a.id
  );
