-- TMU Facilitator Re-Certification: core schema.
-- Mirrors the data model in the requirements doc: Facilitator (profiles), Cohort, Program,
-- Scenario (+version), Attempt, ModuleSubmission, Recording, Tag, ScorecardTemplate
-- (dimensions + module_dimensions + settings), Score, RedFlag, Outcome, ExecSummary.

create type public.app_role as enum ('facilitator', 'grader', 'admin', 'leader');
create type public.scenario_version as enum ('A', 'B');
create type public.submission_status as enum ('assigned', 'in_progress', 'submitted', 'graded');
create type public.module_result as enum ('passed', 'not_passed');
create type public.outcome_kind as enum ('in_progress', 'certified', 'development_required', 'reassessment_required');
create type public.answer_key_kind as enum ('effective', 'subtle_miss', 'clear_miss', 'critical_miss');
create type public.card_phase as enum ('content', 'practice');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'facilitator',
  region text check (region in ('Philippines', 'India', 'Egypt', 'Colombia')),
  created_at timestamptz not null default now()
);

-- Role comes from app_metadata, which only the service role can set (admin invite flow).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role, region)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_app_meta_data ->> 'full_name'),
    coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'facilitator'),
    new.raw_app_meta_data ->> 'region'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Programs, cohorts
-- ---------------------------------------------------------------------------
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  program_id uuid not null references public.programs (id),
  region text check (region in ('Philippines', 'India', 'Egypt', 'Colombia')),
  week_start date not null,
  teach_back_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.cohort_members (
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  facilitator_id uuid not null references public.profiles (id) on delete cascade,
  primary key (cohort_id, facilitator_id)
);

create table public.cohort_graders (
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  grader_id uuid not null references public.profiles (id) on delete cascade,
  primary key (cohort_id, grader_id)
);

-- ---------------------------------------------------------------------------
-- Configuration (admin-editable): timers, pass thresholds, scorecard levels
-- ---------------------------------------------------------------------------
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.dimensions (
  id smallint primary key check (id between 1 and 6),
  name text not null,
  level_1 text not null,
  level_2 text not null,
  level_3 text not null,
  level_4 text not null
);

create table public.module_dimensions (
  module smallint not null check (module between 1 and 3),
  dimension_id smallint not null references public.dimensions (id),
  weight text not null check (weight in ('primary', 'supporting')),
  primary key (module, dimension_id)
);

-- ---------------------------------------------------------------------------
-- Content. Dashboards and sections are facilitator-visible; everything else is grader-only.
-- ---------------------------------------------------------------------------
create table public.dashboards (
  version public.scenario_version primary key,
  team_name text not null,
  data jsonb not null
);

-- Module 1 cases and Module 2 recordings. `family` groups the A/B versions of the same case.
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  module smallint not null check (module in (1, 2)),
  family text not null,          -- 'case-1' | 'case-2' | 'case-3' | 'spare' | 'rec-coaching' | 'rec-hiring'
  version public.scenario_version not null,
  title text not null,
  is_spare boolean not null default false,
  brief jsonb not null default '{}'::jsonb, -- role-player brief, twists, what good looks like, red flags, pass standard
  video_path text,                -- Module 2: object path in the private `module2-recordings` bucket
  active boolean not null default true,
  unique (family, version)
);

create table public.answer_key_items (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  code text not null,
  at_label text not null,
  behaviour text not null,
  kind public.answer_key_kind not null,
  strong_debrief text not null,
  sort smallint not null default 0,
  unique (scenario_id, code)
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  priority boolean not null default false,
  active boolean not null default true
);

create table public.learner_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  instruction text not null,
  plays_during public.card_phase not null,
  tests text not null
);

-- ---------------------------------------------------------------------------
-- Attempts and submissions
-- ---------------------------------------------------------------------------
-- One attempt = one certification cycle for one facilitator.
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  facilitator_id uuid not null references public.profiles (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id),
  cycle text not null default 'Q4-2026',
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (facilitator_id, cohort_id)
);

-- One row per module try. try_no 2 is the reassessment on the alternate version.
create table public.module_submissions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  module smallint not null check (module between 1 and 3),
  try_no smallint not null default 1 check (try_no in (1, 2)),
  scenario_id uuid references public.scenarios (id),   -- modules 1 and 2
  section_id uuid references public.sections (id),     -- module 3
  dashboard_version public.scenario_version not null default 'A',
  status public.submission_status not null default 'assigned',
  phase text,                    -- M1: dashboard | readout | coaching ; M2: watching | debrief
  phase_deadline timestamptz,
  started_at timestamptz,
  readout jsonb not null default '{}'::jsonb,
  debrief jsonb not null default '{}'::jsonb,
  video_plays smallint not null default 0,
  session_at timestamptz,        -- live coaching / teach-back slot
  submitted_at timestamptz,
  result public.module_result,
  result_set_at timestamptz,
  created_at timestamptz not null default now(),
  unique (attempt_id, module, try_no)
);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.module_submissions (id) on delete cascade,
  url text not null check (url ~* '^https://'),
  label text,
  added_by uuid references public.profiles (id),
  delete_after date,
  created_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.module_submissions (id) on delete cascade,
  at_seconds numeric(7, 1) not null check (at_seconds >= 0),
  note text not null check (length(note) <= 500),
  created_at timestamptz not null default now()
);

-- Module 3: which peer plays which card in whose teach-back.
create table public.card_assignments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.module_submissions (id) on delete cascade,
  card_id uuid not null references public.learner_cards (id),
  peer_id uuid not null references public.profiles (id),
  unique (submission_id, card_id)
);

-- ---------------------------------------------------------------------------
-- Grading
-- ---------------------------------------------------------------------------
create table public.gradings (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.module_submissions (id) on delete cascade,
  grader_id uuid not null references public.profiles (id),
  is_calibration boolean not null default false, -- second, independent grading for calibration
  readout_scores jsonb not null default '{}'::jsonb,  -- M1: {observations, hypothesis, questions} 0-2 each
  answer_key_hits uuid[] not null default '{}',       -- M2: answer_key_items identified
  computed_result public.module_result,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (submission_id, grader_id)
);

create table public.scores (
  grading_id uuid not null references public.gradings (id) on delete cascade,
  dimension_id smallint not null references public.dimensions (id),
  level smallint not null check (level between 1 and 4),
  evidence text,   -- one line of observed behaviour, with timestamp
  primary key (grading_id, dimension_id)
);

create table public.red_flags (
  id uuid primary key default gen_random_uuid(),
  grading_id uuid not null references public.gradings (id) on delete cascade,
  code text not null,
  note text,
  unique (grading_id, code)
);

create table public.outcomes (
  attempt_id uuid primary key references public.attempts (id) on delete cascade,
  outcome public.outcome_kind not null,
  development_plan text,
  reassess_by date,
  feedback text,           -- written feedback the facilitator sees
  set_by uuid references public.profiles (id),
  set_at timestamptz not null default now()
);

create table public.exec_summaries (
  attempt_id uuid primary key references public.attempts (id) on delete cascade,
  content jsonb not null,  -- {outcome, programs, strengths[2], development_areas[2], next_step} each with evidence
  status text not null default 'draft' check (status in ('draft', 'approved')),
  generated_by_ai boolean not null default false,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index on public.module_submissions (attempt_id);
create index on public.attempts (cohort_id);
create index on public.attempts (facilitator_id);
create index on public.tags (submission_id);
create index on public.gradings (submission_id);
create index on public.card_assignments (peer_id);
create index on public.cohort_graders (grader_id);
create index on public.cohort_members (facilitator_id);
