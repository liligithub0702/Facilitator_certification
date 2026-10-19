-- Security regression test for RLS and the facilitator RPCs.
-- Runs inside one transaction and rolls back. Needs the demo users from supabase/seed.sql.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db-security-test.sql
\o /dev/null
begin;

create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- Fixtures (as superuser)
with c as (
  insert into cohorts (name, program_id, region, week_start)
  select 'Test cohort', id, 'Philippines', current_date from programs limit 1 returning id
) insert into ctx select 'cohort', id from c;
insert into cohort_members select (select v from ctx where k = 'cohort'), id from profiles where role = 'facilitator';
with a as (
  insert into attempts (facilitator_id, cohort_id)
  values ('44444444-4444-4444-4444-444444444441', (select v from ctx where k = 'cohort')) returning id
) insert into ctx select 'attempt', id from a;
with s as (
  insert into module_submissions (attempt_id, module, scenario_id)
  select (select v from ctx where k = 'attempt'), 1, id from scenarios where family = 'case-1' and version = 'A' returning id
) insert into ctx select 'm1', id from s;
with s as (
  insert into module_submissions (attempt_id, module, scenario_id)
  select (select v from ctx where k = 'attempt'), 2, id from scenarios where family = 'rec-coaching' and version = 'A' returning id
) insert into ctx select 'm2', id from s;

create function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: % did not raise', label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'ok: % -> %', label, sqlerrm;
end $$;
create function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- ---------------- Facilitator ----------------
set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444441';

select pg_temp.expect((select count(*) from scenarios) = 0, 'facilitator cannot read scenarios');
select pg_temp.expect((select count(*) from answer_key_items) = 0, 'facilitator cannot read answer keys');
select pg_temp.expect((select count(*) from learner_cards) = 0, 'facilitator sees no unassigned cards');
select pg_temp.expect((select count(*) from dashboards) = 0, 'dashboard hidden before Module 1 starts');
select pg_temp.expect((select count(*) from module_submissions) = 2, 'facilitator sees own submissions');
select pg_temp.expect_error($$select start_module((select v from ctx where k = 'm1'))$$, 'start without consent');
select accept_consent((select v from ctx where k = 'attempt'));
select pg_temp.expect_error($$select start_module((select v from ctx where k = 'm2'))$$, 'Module 2 gate');
select pg_temp.expect((select phase from start_module((select v from ctx where k = 'm1'))) = 'dashboard', 'Module 1 starts on dashboard');
select pg_temp.expect((select count(*) from dashboards) = 1, 'assigned dashboard visible after start');
select pg_temp.expect((select readout = '{}' from save_response((select v from ctx where k = 'm1'), '{"observations":"x"}')), 'readout not writable during dashboard phase');
select pg_temp.expect((select phase from advance_phase((select v from ctx where k = 'm1'))) = 'readout', 'advance to readout');
select pg_temp.expect((select status from save_response((select v from ctx where k = 'm1'), '{"observations":"trend"}', true)) = 'submitted', 'readout submits');
select pg_temp.expect((select readout->>'observations' from save_response((select v from ctx where k = 'm1'), '{"observations":"changed"}', true)) = 'trend', 'readout locked after submit');
select pg_temp.expect_error($$update module_submissions set readout = '{}' where id = (select v from ctx where k = 'm1')$$, 'direct update of readout');
update module_submissions set result = 'passed' where id = (select v from ctx where k = 'm1');
select pg_temp.expect((select result is null from module_submissions where id = (select v from ctx where k = 'm1')), 'facilitator cannot set own result');
select pg_temp.expect_error($$select * from leader_overview()$$, 'facilitator cannot call leader_overview');
select pg_temp.expect_error($$insert into tags (submission_id, at_seconds, note) values ((select v from ctx where k = 'm2'), 1, 'x')$$, 'direct tag insert');

-- ---------------- Unassigned grader ----------------
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect((select count(*) from module_submissions) = 0, 'unassigned grader sees no submissions');
select pg_temp.expect((select count(*) from scenarios) = 12, 'grader reads scenario library');

reset role;
insert into cohort_graders values ((select v from ctx where k = 'cohort'), '22222222-2222-2222-2222-222222222222');
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect((select count(*) from module_submissions) = 2, 'assigned grader sees cohort submissions');
update module_submissions set result = 'passed', status = 'graded' where id = (select v from ctx where k = 'm1');
select pg_temp.expect((select result = 'passed' from module_submissions where id = (select v from ctx where k = 'm1')), 'grader sets result');
select pg_temp.expect_error($$update module_submissions set readout = '{}' where id = (select v from ctx where k = 'm1')$$, 'grader cannot rewrite readout');

-- ---------------- Facilitator continues ----------------
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444441';
select pg_temp.expect((select phase from start_module((select v from ctx where k = 'm2'))) = 'watching', 'Module 2 unlocks after pass');
select record_play((select v from ctx where k = 'm2'));
select record_play((select v from ctx where k = 'm2'));
select pg_temp.expect_error($$select record_play((select v from ctx where k = 'm2'))$$, 'third play refused');
select pg_temp.expect((select note from add_tag((select v from ctx where k = 'm2'), 63.5, 'leading question')) = 'leading question', 'tag saved');
select pg_temp.expect((select count(*) from gradings) = 0, 'facilitator cannot see gradings');

-- ---------------- Other facilitator ----------------
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444442';
select pg_temp.expect((select count(*) from module_submissions) = 0, 'peer cannot see other submissions');
select pg_temp.expect((select count(*) from tags) = 0, 'peer cannot see other tags');
select pg_temp.expect_error($$select save_response((select v from ctx where k = 'm2'), '{}')$$, 'peer cannot write others');

-- ---------------- Leader ----------------
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.expect((select count(*) from leader_overview()) = 1, 'leader overview');
select pg_temp.expect((select count(*) from tags) = 0, 'leader cannot see tags');
select pg_temp.expect((select count(*) from recordings) = 0, 'leader cannot see recordings');

-- ---------------- Anonymous ----------------
reset role;
set local role anon;
select pg_temp.expect_error($$select count(*) from profiles$$, 'anon has no table access');

rollback;
