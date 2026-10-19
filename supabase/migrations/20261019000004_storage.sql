-- Private bucket for the Module 2 recordings. No storage policies are defined, so only the
-- server (service role) can read it; facilitators get a short-lived signed URL after the app
-- has checked their assignment and replay count.
insert into storage.buckets (id, name, public)
values ('module2-recordings', 'module2-recordings', false)
on conflict (id) do nothing;
