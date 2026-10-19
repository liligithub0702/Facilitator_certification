// Pass rules and outcome logic from the scorecard section of the requirements doc.
// Pure functions so they can be unit-tested and recalibrated with COE in one place.

export type ModuleNo = 1 | 2 | 3;
export type ModuleResult = "passed" | "not_passed";
export type Outcome =
  | "in_progress"
  | "certified"
  | "development_required"
  | "reassessment_required";
export type AnswerKeyKind = "effective" | "subtle_miss" | "clear_miss" | "critical_miss";

export const MODULE_NAMES: Record<ModuleNo, string> = {
  1: "Capability Demonstration",
  2: "Observation & Diagnosis",
  3: "Teach-Back",
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  in_progress: "In progress",
  certified: "Certified",
  development_required: "Development Required",
  reassessment_required: "Reassessment Required",
};

export type RedFlagDef = { code: string; label: string; auto?: boolean };

const ANY_MODULE: RedFlagDef[] = [
  { code: "any_inaccurate", label: "Inaccurate or harmful content" },
  { code: "any_disrespect", label: "Disrespect to a learner" },
];

export const RED_FLAGS: Record<ModuleNo, RedFlagDef[]> = {
  1: [
    { code: "m1_solution_first_5", label: "Gives the solution in the first 5 minutes" },
    { code: "m1_agrees_wrong_plan", label: "Agrees with a plan that targets the wrong people" },
    ...ANY_MODULE,
  ],
  2: [
    { code: "m2_missed_critical", label: "Misses the critical miss (A5 or B7)", auto: true },
    ...ANY_MODULE,
  ],
  3: [{ code: "m3_no_practice", label: "No learner practice in the section" }, ...ANY_MODULE],
};

export type PassStandard = {
  critical: number;
  clear: number;
  subtle: number;
  effective: number;
  feedback_points?: number;
};

export type Tally = Record<AnswerKeyKind, { hit: number; total: number }>;

export function tallyAnswerKey(items: { id: string; kind: AnswerKeyKind }[], hits: string[]): Tally {
  const hitSet = new Set(hits);
  const tally: Tally = {
    critical_miss: { hit: 0, total: 0 },
    clear_miss: { hit: 0, total: 0 },
    subtle_miss: { hit: 0, total: 0 },
    effective: { hit: 0, total: 0 },
  };
  for (const item of items) {
    tally[item.kind].total += 1;
    if (hitSet.has(item.id)) tally[item.kind].hit += 1;
  }
  return tally;
}

export function passStandardShortfalls(tally: Tally, standard: PassStandard): string[] {
  const out: string[] = [];
  const check = (kind: AnswerKeyKind, need: number, label: string) => {
    if (tally[kind].hit < need) out.push(`${label}: ${tally[kind].hit} of ${need} required`);
  };
  check("critical_miss", standard.critical, "Critical miss identified");
  check("clear_miss", standard.clear, "Clear misses identified");
  check("subtle_miss", standard.subtle, "Subtle misses identified");
  check("effective", standard.effective, "Effective behaviours named");
  return out;
}

export type ModuleEvaluation = {
  result: ModuleResult | null; // null = scorecard incomplete
  reasons: string[];
  autoRedFlags: string[];
};

/**
 * A module is passed when every primary dimension scores 3 or higher and no red flag is
 * recorded. Module 2 additionally requires the critical miss and the pass standard.
 */
export function evaluateModule(input: {
  module: ModuleNo;
  primaryDimensions: number[];
  scores: Record<number, number | undefined>;
  redFlags: string[];
  answerKey?: { tally: Tally; standard: PassStandard };
}): ModuleEvaluation {
  const reasons: string[] = [];
  const autoRedFlags: string[] = [];

  if (input.module === 2 && input.answerKey) {
    if (input.answerKey.tally.critical_miss.hit < Math.max(1, input.answerKey.standard.critical)) {
      autoRedFlags.push("m2_missed_critical");
    }
  }
  const flags = new Set([...input.redFlags, ...autoRedFlags]);

  const missing = input.primaryDimensions.filter((d) => input.scores[d] == null);
  if (missing.length > 0) {
    return { result: null, reasons: [`Score every primary dimension (missing ${missing.join(", ")})`], autoRedFlags };
  }

  for (const d of input.primaryDimensions) {
    const level = input.scores[d]!;
    if (level < 3) reasons.push(`Dimension ${d} scored ${level} (needs 3 or higher)`);
  }
  for (const f of flags) {
    const def = RED_FLAGS[input.module].find((r) => r.code === f);
    reasons.push(`Red flag: ${def?.label ?? f}`);
  }
  if (input.module === 2 && input.answerKey) {
    reasons.push(...passStandardShortfalls(input.answerKey.tally, input.answerKey.standard).filter((r) => !r.startsWith("Critical")));
  }
  return { result: reasons.length === 0 ? "passed" : "not_passed", reasons, autoRedFlags };
}

/** Module 3: delivering content without learner practice cannot score above 2 on Application. */
export function maxLevel(module: ModuleNo, dimensionId: number, redFlags: string[]): number {
  if (module === 3 && dimensionId === 5 && redFlags.includes("m3_no_practice")) return 2;
  return 4;
}

export type ReadoutScores = { observations?: number; hypothesis?: number; questions?: number };

export function readoutTotal(s: ReadoutScores): { total: number; complete: boolean; developmentArea: boolean } {
  const parts = [s.observations, s.hypothesis, s.questions];
  const complete = parts.every((p) => p != null);
  const total = parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
  return { total, complete, developmentArea: complete && total < 3 };
}

export type ModuleTry = { module: ModuleNo; tryNo: number; result: ModuleResult | null };

/**
 * Outcome rules (proposal, to confirm with COE):
 *  - Certified: all three modules passed; no red flag open
 *  - Development Required: one module not passed, or a red flag recorded
 *  - Reassessment Required: a module failed on a second attempt, or two or more modules not passed
 */
export function computeOutcome(tries: ModuleTry[], openRedFlag = false): Outcome {
  const latest = new Map<ModuleNo, ModuleTry>();
  for (const t of tries) {
    const cur = latest.get(t.module);
    if (!cur || t.tryNo > cur.tryNo) latest.set(t.module, t);
  }
  const failedSecond = tries.some((t) => t.tryNo >= 2 && t.result === "not_passed");
  const notPassed = [...latest.values()].filter((t) => t.result === "not_passed").length;

  if (failedSecond || notPassed >= 2) return "reassessment_required";
  if (notPassed === 1 || openRedFlag) return "development_required";
  const allPassed = ([1, 2, 3] as ModuleNo[]).every((m) => latest.get(m)?.result === "passed");
  return allPassed ? "certified" : "in_progress";
}

/** Calibration: per-dimension difference between two independent gradings. */
export function calibrationDiff(a: Record<number, number>, b: Record<number, number>) {
  const dims = [...new Set([...Object.keys(a), ...Object.keys(b)].map(Number))].sort((x, y) => x - y);
  return dims.map((d) => ({
    dimension: d,
    a: a[d] ?? null,
    b: b[d] ?? null,
    diff: a[d] != null && b[d] != null ? Math.abs(a[d] - b[d]) : null,
  }));
}
