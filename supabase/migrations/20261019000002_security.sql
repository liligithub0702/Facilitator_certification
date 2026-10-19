-- Row-level security and the facilitator-facing RPCs.
--
-- Principles:
--  * Every table has RLS on; nothing is readable by `anon`.
--  * Facilitators never see scenarios, answer keys, role-player briefs, twists, gradings or
--    other facilitators' records. They read only their own attempt/submissions, their assigned
--    dashboard version, the section titles and the learner cards they personally play.
--  * Facilitators cannot write tables directly. Their writes go through SECURITY DEFINER
--    functions that enforce consent, the Module 1 -> Module 2 gate and the server-side timers.
--  * Graders see and grade only cohorts they are assigned to. Admins see everything.
--  * Leaders get aggregates through functions and approved exec summaries only.

-- ---------------------------------------------------------------------------
-- Helper predicates (SECURITY DEFINER so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------
create function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create function public.is_grader() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('grader', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create function public.is_leader() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('leader', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create function public.grades_cohort(p_cohort uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.cohort_graders cg
    join public.profiles p on p.id = cg.grader_id and p.role = 'grader'
    where cg.cohort_id = p_cohort and cg.grader_id = auth.uid()
  )
$$;

create function public.can_grade_attempt(p_attempt uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.grades_cohort((select cohort_id from public.attempts where id = p_attempt))
$$;

create function public.can_grade_submission(p_submission uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_grade_attempt((select attempt_id from public.module_submissions where id = p_submission))
$$;

create function public.owns_attempt(p_attempt uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attempts where id = p_attempt and facilitator_id = auth.uid())
$$;

create function public.owns_submission(p_submission uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.module_submissions ms
    join public.attempts a on a.id = ms.attempt_id
    where ms.id = p_submission and a.facilitator_id = auth.uid()
  )
$$;

create function public.shares_cohort(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cohort_members me
    join public.cohort_members them on them.cohort_id = me.cohort_id
    where me.facilitator_id = auth.uid() and them.facilitator_id = p_other
  )
$$;

create function public.grading_submission(p_grading uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select submission_id from public.gradings where id = p_grading
$$;

create function public.owns_grading(p_grading uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.gradings where id = p_grading and grader_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.programs enable row level security;
alter table public.cohorts enable row level security;
alter table public.cohort_members enable row level security;
alter table public.cohort_graders enable row level security;
alter table public.settings enable row level security;
alter table public.dimensions enable row level security;
alter table public.module_dimensions enable row level security;
alter table public.dashboards enable row level security;
alter table public.scenarios enable row level security;
alter table public.answer_key_items enable row level security;
alter table public.sections enable row level security;
alter table public.learner_cards enable row level security;
alter table public.attempts enable row level security;
alter table public.module_submissions enable row level security;
alter table public.recordings enable row level security;
alter table public.tags enable row level security;
alter table public.card_assignments enable row level security;
alter table public.gradings enable row level security;
alter table public.scores enable row level security;
alter table public.red_flags enable row level security;
alter table public.outcomes enable row level security;
alter table public.exec_summaries enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- profiles
create policy "profiles: self" on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "profiles: staff read" on public.profiles for select to authenticated
  using (public.is_grader() or public.is_leader());
create policy "profiles: cohort peers" on public.profiles for select to authenticated
  using (public.shares_cohort(id));
create policy "profiles: admin write" on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- reference/config tables: readable by any signed-in user, written by admins
create policy "programs: read" on public.programs for select to authenticated using (true);
create policy "programs: admin" on public.programs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "settings: read" on public.settings for select to authenticated using (true);
create policy "settings: admin" on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "dimensions: read" on public.dimensions for select to authenticated using (true);
create policy "dimensions: admin" on public.dimensions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "module_dimensions: read" on public.module_dimensions for select to authenticated using (true);
create policy "module_dimensions: admin" on public.module_dimensions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "sections: read" on public.sections for select to authenticated using (true);
create policy "sections: admin" on public.sections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- dashboards: staff, plus facilitators once they have started Module 1 on that version
create policy "dashboards: staff" on public.dashboards for select to authenticated
  using (public.is_grader());
create policy "dashboards: facilitator in module 1" on public.dashboards for select to authenticated
  using (exists (
    select 1 from public.module_submissions ms
    join public.attempts a on a.id = ms.attempt_id
    where a.facilitator_id = auth.uid() and ms.module = 1
      and ms.dashboard_version = dashboards.version and ms.started_at is not null
  ));
create policy "dashboards: admin" on public.dashboards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- grader-only content
create policy "scenarios: graders" on public.scenarios for select to authenticated
  using (public.is_grader());
create policy "scenarios: admin" on public.scenarios for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "answer_key: graders" on public.answer_key_items for select to authenticated
  using (public.is_grader());
create policy "answer_key: admin" on public.answer_key_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- learner cards: graders see all; a facilitator sees only cards they play
create policy "cards: graders" on public.learner_cards for select to authenticated
  using (public.is_grader());
create policy "cards: own" on public.learner_cards for select to authenticated
  using (exists (
    select 1 from public.card_assignments ca where ca.card_id = learner_cards.id and ca.peer_id = auth.uid()
  ));
create policy "cards: admin" on public.learner_cards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- cohorts
create policy "cohorts: read" on public.cohorts for select to authenticated
  using (
    public.grades_cohort(id) or public.is_leader()
    or exists (select 1 from public.cohort_members m where m.cohort_id = cohorts.id and m.facilitator_id = auth.uid())
  );
create policy "cohorts: admin" on public.cohorts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "cohort_members: read" on public.cohort_members for select to authenticated
  using (facilitator_id = auth.uid() or public.grades_cohort(cohort_id) or public.is_leader());
create policy "cohort_members: admin" on public.cohort_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "cohort_graders: read" on public.cohort_graders for select to authenticated
  using (grader_id = auth.uid() or public.is_admin());
create policy "cohort_graders: admin" on public.cohort_graders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- attempts
create policy "attempts: read" on public.attempts for select to authenticated
  using (facilitator_id = auth.uid() or public.can_grade_attempt(id) or public.is_leader());
create policy "attempts: admin" on public.attempts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- module submissions
create policy "submissions: own" on public.module_submissions for select to authenticated
  using (public.owns_attempt(attempt_id));
create policy "submissions: graders" on public.module_submissions for select to authenticated
  using (public.can_grade_attempt(attempt_id));
create policy "submissions: graders update" on public.module_submissions for update to authenticated
  using (public.can_grade_attempt(attempt_id)) with check (public.can_grade_attempt(attempt_id));
create policy "submissions: admin" on public.module_submissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Graders/admins may only touch assignment and result columns; facilitator content
-- (readout, debrief, timers, plays) is written exclusively by the RPCs below.
revoke update on public.module_submissions from authenticated;
grant update (status, result, result_set_at, session_at, scenario_id, section_id, dashboard_version)
  on public.module_submissions to authenticated;

-- recordings: facilitator sees own; graders/admin manage
create policy "recordings: own" on public.recordings for select to authenticated
  using (public.owns_submission(submission_id));
create policy "recordings: graders" on public.recordings for all to authenticated
  using (public.can_grade_submission(submission_id)) with check (public.can_grade_submission(submission_id));

-- tags: facilitator reads own (writes via add_tag); graders read
create policy "tags: own" on public.tags for select to authenticated
  using (public.owns_submission(submission_id));
create policy "tags: graders" on public.tags for select to authenticated
  using (public.can_grade_submission(submission_id));

-- card assignments: the peer who plays the card, graders, admin
create policy "card_assignments: own" on public.card_assignments for select to authenticated
  using (peer_id = auth.uid());
create policy "card_assignments: graders" on public.card_assignments for select to authenticated
  using (public.can_grade_submission(submission_id));
create policy "card_assignments: admin" on public.card_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- gradings, scores, red flags: graders of the cohort only (never facilitators or leaders)
create policy "gradings: read" on public.gradings for select to authenticated
  using (public.can_grade_submission(submission_id));
create policy "gradings: insert own" on public.gradings for insert to authenticated
  with check (grader_id = auth.uid() and public.can_grade_submission(submission_id));
create policy "gradings: update own" on public.gradings for update to authenticated
  using (public.owns_grading(id) and public.can_grade_submission(submission_id))
  with check (public.can_grade_submission(submission_id));
create policy "gradings: admin delete" on public.gradings for delete to authenticated
  using (public.is_admin());

create policy "scores: read" on public.scores for select to authenticated
  using (public.can_grade_submission(public.grading_submission(grading_id)));
create policy "scores: write own" on public.scores for all to authenticated
  using (public.owns_grading(grading_id)) with check (public.owns_grading(grading_id));

create policy "red_flags: read" on public.red_flags for select to authenticated
  using (public.can_grade_submission(public.grading_submission(grading_id)));
create policy "red_flags: write own" on public.red_flags for all to authenticated
  using (public.owns_grading(grading_id)) with check (public.owns_grading(grading_id));

-- outcomes: facilitator sees own; graders set; leaders read
create policy "outcomes: own" on public.outcomes for select to authenticated
  using (public.owns_attempt(attempt_id));
create policy "outcomes: leaders" on public.outcomes for select to authenticated
  using (public.is_leader());
create policy "outcomes: graders" on public.outcomes for all to authenticated
  using (public.can_grade_attempt(attempt_id)) with check (public.can_grade_attempt(attempt_id));

-- exec summaries: graders edit; leaders read approved only
create policy "exec: graders" on public.exec_summaries for all to authenticated
  using (public.can_grade_attempt(attempt_id)) with check (public.can_grade_attempt(attempt_id));
create policy "exec: leaders approved" on public.exec_summaries for select to authenticated
  using (status = 'approved' and public.is_leader());

-- ---------------------------------------------------------------------------
-- Facilitator RPCs: consent, gate and server-enforced timers
-- ---------------------------------------------------------------------------
create function public.setting_int(p_path text[], p_default int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> p_path[2:])::int from public.settings where key = p_path[1]), p_default)
$$;

-- Applies any expired timer: Module 1 dashboard -> readout -> locked, Module 2 debrief -> locked.
-- Time keeps running if the facilitator closes the tab.
create function public.sync_submission(p_submission uuid) returns public.module_submissions
language plpgsql security definer set search_path = '' as $$
declare
  s public.module_submissions;
  grace interval := make_interval(secs => public.setting_int(array['timers', 'grace_sec'], 10));
begin
  if not (public.owns_submission(p_submission) or public.can_grade_submission(p_submission)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into s from public.module_submissions where id = p_submission for update;

  if s.status = 'in_progress' and s.module = 1 and s.phase = 'dashboard' and now() > s.phase_deadline then
    update public.module_submissions
       set phase = 'readout',
           phase_deadline = s.phase_deadline
             + make_interval(secs => public.setting_int(array['timers', 'm1_readout_sec'], 300))
     where id = s.id returning * into s;
  end if;

  if s.status = 'in_progress' and s.phase in ('readout', 'debrief') and now() > s.phase_deadline + grace then
    update public.module_submissions
       set status = 'submitted',
           phase = case when s.module = 1 then 'coaching' else 'locked' end,
           submitted_at = s.phase_deadline
     where id = s.id returning * into s;
  end if;

  return s;
end $$;

create function public.accept_consent(p_attempt uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.owns_attempt(p_attempt) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.attempts set consent_at = coalesce(consent_at, now()) where id = p_attempt;
end $$;

create function public.start_module(p_submission uuid) returns public.module_submissions
language plpgsql security definer set search_path = '' as $$
declare
  s public.module_submissions;
  a public.attempts;
begin
  if not public.owns_submission(p_submission) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into s from public.module_submissions where id = p_submission for update;
  select * into a from public.attempts where id = s.attempt_id;

  if a.consent_at is null then
    raise exception 'Recording consent is required before starting.';
  end if;
  if s.status <> 'assigned' then
    return s; -- idempotent
  end if;
  if s.module not in (1, 2) then
    raise exception 'Module 3 is run live by the certifier.';
  end if;
  if s.module = 1 and s.scenario_id is null then
    raise exception 'No case has been assigned yet.';
  end if;
  if s.module = 2 then
    if s.scenario_id is null then
      raise exception 'No recording has been assigned yet.';
    end if;
    -- Gate: the latest Module 1 try in this attempt must be passed.
    if coalesce((
      select result from public.module_submissions
      where attempt_id = s.attempt_id and module = 1
      order by try_no desc limit 1
    ), 'not_passed') <> 'passed' then
      raise exception 'Module 2 unlocks after Module 1 is passed.';
    end if;
  end if;

  update public.module_submissions
     set status = 'in_progress',
         started_at = now(),
         phase = case when s.module = 1 then 'dashboard' else 'watching' end,
         phase_deadline = case when s.module = 1
           then now() + make_interval(secs => public.setting_int(array['timers', 'm1_dashboard_sec'], 900))
           else null end
   where id = s.id returning * into s;
  return s;
end $$;

-- Moves on early: M1 dashboard -> readout, M2 watching -> debrief.
create function public.advance_phase(p_submission uuid) returns public.module_submissions
language plpgsql security definer set search_path = '' as $$
declare
  s public.module_submissions;
begin
  if not public.owns_submission(p_submission) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  s := public.sync_submission(p_submission);
  if s.status <> 'in_progress' then
    return s;
  end if;
  if s.module = 1 and s.phase = 'dashboard' then
    update public.module_submissions
       set phase = 'readout',
           phase_deadline = now() + make_interval(secs => public.setting_int(array['timers', 'm1_readout_sec'], 300))
     where id = s.id returning * into s;
  elsif s.module = 2 and s.phase = 'watching' then
    update public.module_submissions
       set phase = 'debrief',
           phase_deadline = now() + make_interval(secs => public.setting_int(array['timers', 'm2_debrief_sec'], 1500))
     where id = s.id returning * into s;
  end if;
  return s;
end $$;

-- Saves the M1 readout (phase 'readout') or M2 debrief (phase 'debrief').
-- p_final submits and locks. After the deadline the save is refused and the form locks
-- with whatever was last saved.
create function public.save_response(p_submission uuid, p_content jsonb, p_final boolean default false)
returns public.module_submissions
language plpgsql security definer set search_path = '' as $$
declare
  s public.module_submissions;
begin
  if not public.owns_submission(p_submission) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_content) <> 'object' or length(p_content::text) > 30000 then
    raise exception 'Response is too long.';
  end if;
  s := public.sync_submission(p_submission);
  if s.status <> 'in_progress' or s.phase not in ('readout', 'debrief') then
    return s; -- locked: caller shows the locked state
  end if;

  if s.phase = 'readout' then
    update public.module_submissions set readout = p_content where id = s.id returning * into s;
  else
    update public.module_submissions set debrief = p_content where id = s.id returning * into s;
  end if;

  if p_final then
    update public.module_submissions
       set status = 'submitted',
           phase = case when s.module = 1 then 'coaching' else 'locked' end,
           submitted_at = now()
     where id = s.id returning * into s;
  end if;
  return s;
end $$;

-- Module 2: counts plays from the start. One play plus one replay by default.
create function public.record_play(p_submission uuid) returns public.module_submissions
language plpgsql security definer set search_path = '' as $$
declare
  s public.module_submissions;
begin
  if not public.owns_submission(p_submission) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into s from public.module_submissions where id = p_submission for update;
  if s.module <> 2 or s.status <> 'in_progress' then
    raise exception 'Recording is not available.';
  end if;
  if s.video_plays >= public.setting_int(array['timers', 'm2_max_plays'], 2) then
    raise exception 'You have used your replay.';
  end if;
  update public.module_submissions set video_plays = video_plays + 1 where id = s.id returning * into s;
  return s;
end $$;

create function public.add_tag(p_submission uuid, p_at_seconds numeric, p_note text) returns public.tags
language plpgsql security definer set search_path = '' as $$
declare
  s public.module_submissions;
  t public.tags;
begin
  if not public.owns_submission(p_submission) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  s := public.sync_submission(p_submission);
  if s.module <> 2 or s.status <> 'in_progress' then
    raise exception 'Tagging is closed.';
  end if;
  insert into public.tags (submission_id, at_seconds, note)
  values (p_submission, greatest(p_at_seconds, 0), left(coalesce(p_note, ''), 500))
  returning * into t;
  return t;
end $$;

-- Module 3: the cards this facilitator plays, with whose teach-back they belong to.
-- (Peers cannot read each other's submissions, so this joins on their behalf.)
create function public.my_cards()
returns table (assignment_id uuid, presenter_name text, card_name text, instruction text, plays_during public.card_phase, session_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select ca.id, coalesce(p.full_name, p.email), lc.name, lc.instruction, lc.plays_during, ms.session_at
  from public.card_assignments ca
  join public.learner_cards lc on lc.id = ca.card_id
  join public.module_submissions ms on ms.id = ca.submission_id
  join public.attempts a on a.id = ms.attempt_id
  join public.profiles p on p.id = a.facilitator_id
  where ca.peer_id = auth.uid()
  order by 2, lc.plays_during
$$;

-- ---------------------------------------------------------------------------
-- Leader aggregates (no recordings, no raw notes)
-- ---------------------------------------------------------------------------
create function public.leader_overview()
returns table (
  attempt_id uuid, facilitator_name text, email text, region text, program text, cohort text,
  m1 text, m2 text, m3 text, outcome public.outcome_kind
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_leader() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select a.id, p.full_name, p.email, coalesce(c.region, p.region), pr.name, c.name,
    (select coalesce(ms.result::text, ms.status::text) from public.module_submissions ms
      where ms.attempt_id = a.id and ms.module = 1 order by ms.try_no desc limit 1),
    (select coalesce(ms.result::text, ms.status::text) from public.module_submissions ms
      where ms.attempt_id = a.id and ms.module = 2 order by ms.try_no desc limit 1),
    (select coalesce(ms.result::text, ms.status::text) from public.module_submissions ms
      where ms.attempt_id = a.id and ms.module = 3 order by ms.try_no desc limit 1),
    coalesce(o.outcome, 'in_progress')
  from public.attempts a
  join public.profiles p on p.id = a.facilitator_id
  join public.cohorts c on c.id = a.cohort_id
  join public.programs pr on pr.id = c.program_id
  left join public.outcomes o on o.attempt_id = a.id
  order by 4, 2;
end $$;

create function public.dimension_averages()
returns table (dimension_id smallint, name text, avg_level numeric, n bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_leader() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select d.id, d.name, round(avg(sc.level), 2), count(sc.level)
  from public.dimensions d
  left join public.scores sc on sc.dimension_id = d.id
    and exists (select 1 from public.gradings g where g.id = sc.grading_id
                and not g.is_calibration and g.submitted_at is not null)
  group by d.id, d.name
  order by d.id;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.handle_new_user() from authenticated;
