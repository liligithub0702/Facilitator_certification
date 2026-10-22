// Row shapes for the tables the app reads. Regenerate full types with `npm run db:types`
// once the Supabase project is linked, and swap these for the generated ones if preferred.
import type { AnswerKeyKind, ModuleNo, ModuleResult, Outcome } from "./rules";

export type Role = "facilitator" | "grader" | "admin" | "leader";
export type Region = "Philippines" | "India" | "Egypt" | "Colombia";
export const REGIONS: Region[] = ["Philippines", "India", "Egypt", "Colombia"];

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  region: Region | null;
};

export type Cohort = {
  id: string;
  name: string;
  program_id: string;
  region: Region | null;
  week_start: string;
  teach_back_at: string | null;
};

export type Attempt = {
  id: string;
  facilitator_id: string;
  cohort_id: string;
  cycle: string;
  consent_at: string | null;
};

export type Submission = {
  id: string;
  attempt_id: string;
  module: ModuleNo;
  try_no: number;
  scenario_id: string | null;
  section_id: string | null;
  dashboard_version: "A" | "B";
  status: "assigned" | "in_progress" | "submitted" | "graded";
  phase: string | null;
  phase_deadline: string | null;
  started_at: string | null;
  readout: Record<string, string>;
  debrief: Record<string, string>;
  video_plays: number;
  session_at: string | null;
  submitted_at: string | null;
  result: ModuleResult | null;
};

export type Scenario = {
  id: string;
  module: 1 | 2;
  family: string;
  version: "A" | "B";
  title: string;
  is_spare: boolean;
  brief: Record<string, unknown>;
  video_path: string | null;
  active: boolean;
};

export type AnswerKeyItem = {
  id: string;
  scenario_id: string;
  code: string;
  at_label: string;
  behaviour: string;
  kind: AnswerKeyKind;
  strong_debrief: string;
  sort: number;
};

export type Dimension = {
  id: number;
  name: string;
  level_1: string;
  level_2: string;
  level_3: string;
  level_4: string;
};

export type Tag = { id: string; submission_id: string; at_seconds: number; note: string; created_at: string };

export type OutcomeRow = {
  attempt_id: string;
  outcome: Outcome;
  development_plan: string | null;
  reassess_by: string | null;
  feedback: string | null;
};

export type SummaryItem = { text: string; evidence: string };
export type ExecSummaryContent = {
  outcome: SummaryItem;
  programs: SummaryItem;
  strength_1: SummaryItem;
  strength_2: SummaryItem;
  development_1: SummaryItem;
  development_2: SummaryItem;
  next_step: SummaryItem;
};

export type FormField = { key: string; label: string; hint?: string; kind?: "agent" };

/** Module 1, step 2: Preparation (coaching cycle stage 1). Stored in module_submissions.readout. */
export const READOUT_FIELDS: readonly FormField[] = [
  { key: "agent", label: "Who will you coach first?", kind: "agent" },
  { key: "why", label: "Why this agent, and why now?", hint: "Point to the data and notes that made you choose." },
  { key: "observations", label: "Key observations", hint: "What the data and call notes show about this agent: strengths as well as gaps." },
  { key: "root_cause", label: "Likely root cause(s) to explore", hint: "Hypotheses to test with the agent, not conclusions." },
  { key: "adapt", label: "How you'll adapt to this agent", hint: "Their profile, tenure and how they like to be coached." },
  { key: "opening", label: "Your opening", hint: "How you'll start the conversation and build rapport." },
];

/** Module 1, step 4: Documentation and follow-through (coaching cycle stages 3–4). Stored in debrief. */
export const COACHING_FORM_FIELDS: readonly FormField[] = [
  { key: "start", label: "Start", hint: "What the agent agreed to start doing." },
  { key: "stop", label: "Stop", hint: "What the agent agreed to stop doing." },
  { key: "continue", label: "Continue", hint: "What's working that the agent should keep doing." },
  { key: "action_plan", label: "SMART action plan", hint: "Specific, measurable, owned by the agent, with a date." },
  { key: "follow_up", label: "Follow-through plan", hint: "When you'll check in, and how you'll observe, validate and recognise progress." },
  { key: "commitment", label: "The agent's commitment", hint: "In their words, as agreed in the session." },
];

export const DEBRIEF_FIELDS: readonly FormField[] = [
  { key: "observed", label: "What you observed" },
  { key: "effective", label: "What was effective, and why" },
  { key: "missed", label: "What was missed, and its likely impact" },
  { key: "feedback", label: "The feedback you would give the Team Manager, in your own words" },
  { key: "coach_differently", label: "What you would coach differently" },
];
