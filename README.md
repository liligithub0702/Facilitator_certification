# TMU Facilitator Certification

The app for the Q4 2026 TMU facilitator re-certification. Facilitators take three modules, graders score them against the scorecard, and leaders get an overview and exec summaries.

- **Facilitators**: give recording consent. Module 1 follows the TMU coaching cycle, with the facilitator playing the Team Manager: review the team dashboard, this week's coaching flag and every agent's profile, then choose an agent (15 min); prepare the session (10 min); coach that agent live while the certifier plays them; then complete the coaching form (Start / Stop / Continue, SMART plan, follow-through; 10 min). All timers run on the server. The dashboard is tabbed (Team overview, Agents, QA audits, Attendance & hiring, Meet your team); the Agents tab filters by week and tenure, sorts by any column and has a "Who do you want to coach?" dropdown that opens the agent's profile, week-by-week KPIs and QA observations (QA audit log in the format of the KPI Performance Dashboard workbook), and pre-fills the preparation form. Each case flags a different agent (Case 1: a new joiner below bridge targets; Case 2: a tenured top performer slipping; Case 3: a tenured agent skipping the KB and process; spare: attendance). Module 2: watch a recording (one replay allowed), tag moments, then write a 25-minute debrief. Module 2 unlocks only after Module 1 is passed. Module 3: see the assigned section, the session date and the learner cards they play.
- **Graders**: work a queue filtered by module, cohort and region. They see the evidence on the left and the scorecard on the right. Red flags automatically set a module to not passed. The Module 2 answer key appears as a checklist. Calibration diffs show when a submission has two gradings. Graders also set the outcome with the rules engine's suggestion, and write or approve an AI-drafted exec summary.
- **Admins**: create cohorts, create accounts, reset passwords and set roles (people can also create their own account and start as facilitators). Auto-assign hands out cases, recordings, sections and learner cards by the rules in the requirements doc. Admins can override any assignment, open a reassessment on the alternate version, and edit timers and scorecard levels.
- **Leaders**: see status by facilitator, region and program, the average score per dimension, and approved exec summaries. They can export to PDF from the browser's print dialog.

## Architecture

| Layer | Choice | Why |
| --- | --- | --- |
| Hosting | **Vercel**, Next.js 16 App Router | Server components and server actions keep every data call on the server. Preview deployments per branch. |
| Database and auth | **Supabase** (Postgres, Auth, Storage) | Row-level security enforces the "cannot see" column of the roles table inside the database itself, not only in the UI. |
| Sign-in | Email + password with self sign-up, plus optional Microsoft (Entra ID) SSO | No emails are sent, so no SMTP is needed. New accounts are always facilitators; admins can limit sign-up to work email domains (enforced in the database) and reset passwords. |
| Timers and gates | Postgres `SECURITY DEFINER` functions (`start_module`, `save_response`, `advance_phase`, `record_play`, `add_tag`, `sync_submission`) | Deadlines use the database clock. The browser cannot extend a timer, skip the Module 2 gate or exceed the replay limit. |
| Module 2 videos | Private Storage bucket `module2-recordings` | The server hands a 45-minute signed URL only to a facilitator whose Module 2 is in progress. |
| Module 1 and 3 recordings | Teams links attached by the grader (v1 scope) | Matches the requirements: in-browser recording is v2. |
| Exec summaries | Claude API (`claude-opus-5-5`, structured output) | Drafts follow the fixed structure from scores and grader notes. A grader must approve a draft before leaders see it. |

### Security model

- Every table has RLS enabled, and the `anon` role has no access.
- Facilitators **never** receive scenarios, role-player briefs, twists, answer keys, gradings or other people's records. They read only their own submissions, their assigned dashboard version (after they start Module 1), the public part of their own case's coaching flag (via `case_brief()`, never the role-play brief), section titles and the learner cards they personally play (via `my_cards()`).
- Facilitators cannot write tables directly. Column grants stop graders and admins from rewriting a facilitator's readout or debrief.
- Graders see only cohorts they are assigned to. Leaders get aggregates through `leader_overview()` and `dimension_averages()` and see approved summaries only, with no recordings, tags or raw notes.
- `scripts/db-security-test.sql` runs 33 checks for these rules. CI runs it on every PR.

### Code map

```
supabase/migrations/   schema, RLS + RPCs, reference content (dashboards, cases, answer keys, cards), storage bucket
supabase/seed.sql      local demo users (admin, grader, leader, 3 facilitators @example.com)
supabase/templates/    email templates, only needed if you switch back to email links
src/lib/rules.ts       pass rules, red flags, answer-key standard, outcome logic (unit tested)
src/lib/assignment.ts  case / recording / section / learner-card assignment (unit tested)
src/lib/exec-summary.ts  Claude draft of the exec summary
src/app/facilitator    consent, module flows, Team 7/12 dashboard, video + tags, debrief
src/app/grader         queue, evidence + scorecard, calibration, outcome, exec summary
src/app/admin          cohorts, auto-assign, users and passwords, scenario library, settings
src/app/leader         overview, dimension averages, approved summaries, PDF export
src/proxy.ts           session refresh + sign-in redirect (Next 16 "proxy", formerly middleware)
```

## Deploy: Supabase and Vercel

### 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com). Use the **Pro plan** for daily backups and point-in-time recovery, since this data is the record of certification.
2. **Region:** pick it with the privacy team (see open decisions below). `ap-southeast-1` (Singapore) is the default suggestion because it sits closest to the Philippines and India. Keep the Vercel function region next to the database: `vercel.json` sets `sin1`.
3. Push the schema and reference content:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push          # applies supabase/migrations (seed.sql is local-only)
   ```

   No terminal? Paste `supabase/setup-all.sql` (all migrations joined in order) into the dashboard's **SQL Editor** once and click **Run**. Regenerate it whenever a migration is added.

### 2. Configure Supabase Auth (dashboard → Authentication)

- **Sign In / Providers → User signups:** leave "Allow new users to sign up" on, and keep the **Email** provider enabled.
- **Sign In / Providers → Email:** turn **off "Confirm email"**. Sign-in is by password and the app sends no email, so new accounts must be usable straight away.
- To limit sign-ups to work emails, set the allowed domains in the app under **Admin → Settings**.
- **URL Configuration:** set Site URL to your production URL (e.g. `https://tmu-cert.vercel.app`). Add these redirect URLs: `https://tmu-cert.vercel.app/**`, `https://*-<your-team>.vercel.app/**` (previews) and `http://localhost:3000/**`.
- **Email templates and SMTP** are not needed while sign-in is by password. The templates in `supabase/templates/` are kept for a later switch to email links, which would also need custom SMTP.
- **Optional, Microsoft SSO:** enable the Azure provider with an Entra ID app registration. Set the redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`. Then set `NEXT_PUBLIC_AZURE_SSO_ENABLED=true` in Vercel. If you limit sign-ups to work domains, Microsoft sign-ins from other domains are blocked too.

### 3. Upload the Module 2 recordings

In **Storage → module2-recordings**, upload the four videos with these exact file names: `rec-coaching-A.mp4`, `rec-hiring-A.mp4`, `rec-coaching-B.mp4` and `rec-hiring-B.mp4`. Admin → Scenario library shows which ones are uploaded. Burn the subtitles for all four regions into the videos: the v1 player has no separate subtitle track.

### 4. Deploy to Vercel

1. In Vercel, **Add New → Project** and import this GitHub repo. The framework is detected as Next.js.
2. Add the Supabase integration (**Integrations → Supabase**) and connect it to the project. It fills the Supabase URL and keys for every environment; the app accepts its `NEXT_PUBLIC_*` names. Or set them by hand from `.env.example`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. All are read on the server only.
3. Add these environment variables yourself:
   - `SITE_URL`: the production URL. Set it for Production only; previews fall back to `VERCEL_URL`.
   - `ANTHROPIC_API_KEY`: for AI-drafted exec summaries. Without it, the "Draft with AI" button is hidden.
   - `NEXT_PUBLIC_AZURE_SSO_ENABLED`: `true` once SSO is configured.
4. Deploy. Pushes to `main` deploy to production, and other branches get preview URLs.

> Previews share the production database unless you enable [Supabase branching](https://supabase.com/docs/guides/deployment/branching) or point Preview env vars at a separate staging project. Use a staging project before real facilitator data is loaded.

### 5. Create the first admin

1. Open the app and use **Create account** on the login page.
2. In the Supabase **SQL editor**, run:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@company.com';
   ```
3. Reload the app. From then on, create accounts and set roles from **Admin → Users**.

### 6. Run a cycle

1. **Admin → Cohorts:** create a cohort of 3–4 people with a region and week, add facilitators, and assign two graders. Click **Auto-assign**, then check the warnings.
2. Set the Module 1 coaching slot per facilitator from the grader's submission page (the facilitator's coaching form opens once that time has passed), and the Module 3 teach-back date on the cohort page.
3. Graders attach the Teams recording links and grade. A second grader on the same submission counts as a calibration grading, and the app shows the per-dimension differences.
4. After grading, open **Outcome & exec summary** and confirm the outcome. Draft the summary, edit it and approve it.
5. If a module is not passed, the cohort page offers **Open reassessment**: a second try on Version B or the spare case.

## Local development

You need Docker and Node 22.

```bash
npm install
npx supabase start            # Postgres, Auth, Storage; applies migrations + seed
cp .env.example .env.local    # paste the publishable + secret keys printed by `supabase start`
npm run dev                   # http://localhost:3000
```

Sign in as `admin@example.com`, `grader@example.com`, `leader@example.com` or `fac1@example.com` (`fac2`, `fac3` also exist), all with the password `password123`.

| Command | What it does |
| --- | --- |
| `npm run lint` / `npm run typecheck` / `npm test` | ESLint, TypeScript, Vitest (rules and assignment) |
| `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run db:test` | RLS and RPC security test (rolls back) |
| `npx supabase db reset` | Rebuild the local DB from migrations and seed |
| `npm run db:types` | Generate full DB types from the linked project |

Change the schema with a new file in `supabase/migrations/` (`npx supabase migration new <name>`). Never edit a migration that has already run in production.

## Open items carried from the requirements doc

- **Consent wording, storage location and retention:** the consent text in the app is a placeholder, marked as such on screen. Confirm it with the privacy team for all four regions. That review also settles the Supabase region.
- **Pass rules and outcome definitions** are COE proposals. They live in one file (`src/lib/rules.ts`, with tests), plus the Module 2 thresholds in each recording's `brief.pass_standard`.
- **Version B (Team 12) briefs and answer keys** were adapted automatically from Version A. Each one is flagged "draft wording" in the scenario library until COE reviews it.
- **Module 3 section pool** is the proposed list. Edit `public.sections` once Design confirms scope.
- **Who sees exec summaries:** currently the `leader` role. Give Regional Leads, COE and SVP the leader role.
- **Pilot:** the pilot runs on forms and Teams before the app. Fix the scorecard from the pilot, then update dimension levels in Admin → Settings.
