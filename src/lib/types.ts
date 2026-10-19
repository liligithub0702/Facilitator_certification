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

export const READOUT_FIELDS = [
  { key: "observation_1", label: "Observation 1" },
  { key: "observation_2", label: "Observation 2" },
  { key: "observation_3", label: "Observation 3" },
  { key: "hypothesis", label: "Hypothesis" },
  { key: "question_1", label: "Question for the Team Manager 1" },
  { key: "question_2", label: "Question for the Team Manager 2" },
] as const;

export const DEBRIEF_FIELDS = [
  { key: "observed", label: "What you observed" },
  { key: "effective", label: "What was effective, and why" },
  { key: "missed", label: "What was missed, and its likely impact" },
  { key: "feedback", label: "The feedback you would give the Team Manager, in your own words" },
  { key: "coach_differently", label: "What you would coach differently" },
] as const;
