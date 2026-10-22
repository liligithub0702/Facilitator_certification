-- Local development only (`supabase db reset`). Reference content lives in migrations so it
-- also reaches the hosted project with `supabase db push`.
--
-- Demo users: sign in at http://localhost:3000/login with one of these addresses and the
-- password "password123".
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change, encrypted_password)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'admin@example.com', now(),
   '{"provider":"email","providers":["email"],"role":"admin"}', '{"full_name":"Demo Admin"}', now(), now(), '', '', '', '', extensions.crypt('password123', extensions.gen_salt('bf'))),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'grader@example.com', now(),
   '{"provider":"email","providers":["email"],"role":"grader"}', '{"full_name":"Demo Grader"}', now(), now(), '', '', '', '', extensions.crypt('password123', extensions.gen_salt('bf'))),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'leader@example.com', now(),
   '{"provider":"email","providers":["email"],"role":"leader"}', '{"full_name":"Demo Leader"}', now(), now(), '', '', '', '', extensions.crypt('password123', extensions.gen_salt('bf'))),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444441', 'authenticated', 'authenticated', 'fac1@example.com', now(),
   '{"provider":"email","providers":["email"],"role":"facilitator","region":"Philippines"}', '{"full_name":"Facilitator One"}', now(), now(), '', '', '', '', extensions.crypt('password123', extensions.gen_salt('bf'))),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444442', 'authenticated', 'authenticated', 'fac2@example.com', now(),
   '{"provider":"email","providers":["email"],"role":"facilitator","region":"Philippines"}', '{"full_name":"Facilitator Two"}', now(), now(), '', '', '', '', extensions.crypt('password123', extensions.gen_salt('bf'))),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444443', 'authenticated', 'authenticated', 'fac3@example.com', now(),
   '{"provider":"email","providers":["email"],"role":"facilitator","region":"Philippines"}', '{"full_name":"Facilitator Three"}', now(), now(), '', '', '', '', extensions.crypt('password123', extensions.gen_salt('bf')));

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now()
from auth.users where email like '%@example.com';
