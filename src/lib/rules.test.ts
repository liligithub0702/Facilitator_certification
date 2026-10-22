import { describe, expect, it } from "vitest";
import { calibrationDiff, computeOutcome, DOC_RUBRIC, evaluateModule, maxLevel, PREP_RUBRIC, rubricTotal, tallyAnswerKey } from "./rules";

const keyA = [
  { id: "A1", kind: "effective" as const },
  { id: "A2", kind: "subtle_miss" as const },
  { id: "A3", kind: "clear_miss" as const },
  { id: "A4", kind: "effective" as const },
  { id: "A5", kind: "critical_miss" as const },
  { id: "A6", kind: "clear_miss" as const },
  { id: "A7", kind: "subtle_miss" as const },
  { id: "A8", kind: "clear_miss" as const },
  { id: "A9", kind: "clear_miss" as const },
  { id: "A10", kind: "effective" as const },
];
const standardA = { critical: 1, clear: 3, subtle: 1, effective: 2 };

describe("evaluateModule", () => {
  it("passes when every primary dimension is 3+ and no red flag", () => {
    const r = evaluateModule({ module: 1, primaryDimensions: [1, 3, 4, 5], scores: { 1: 3, 3: 4, 4: 3, 5: 3 }, redFlags: [] });
    expect(r.result).toBe("passed");
  });
  it("fails on any primary below 3", () => {
    const r = evaluateModule({ module: 1, primaryDimensions: [1, 3], scores: { 1: 3, 3: 2 }, redFlags: [] });
    expect(r.result).toBe("not_passed");
  });
  it("ignores supporting dimensions for the pass rule", () => {
    const r = evaluateModule({ module: 2, primaryDimensions: [6], scores: { 3: 1, 6: 3 }, redFlags: [],
      answerKey: { tally: tallyAnswerKey(keyA, ["A5", "A3", "A6", "A8", "A2", "A1", "A4"]), standard: standardA } });
    expect(r.result).toBe("passed");
  });
  it("a red flag caps the module at not passed", () => {
    const r = evaluateModule({ module: 1, primaryDimensions: [1], scores: { 1: 4 }, redFlags: ["m1_solution_first_5"] });
    expect(r.result).toBe("not_passed");
  });
  it("missing the critical miss fails Module 2 whatever else is found", () => {
    const all = keyA.map((k) => k.id).filter((id) => id !== "A5");
    const r = evaluateModule({ module: 2, primaryDimensions: [6], scores: { 6: 4 }, redFlags: [],
      answerKey: { tally: tallyAnswerKey(keyA, all), standard: standardA } });
    expect(r.result).toBe("not_passed");
    expect(r.autoRedFlags).toEqual(["m2_missed_critical"]);
  });
  it("Module 2 fails below the clear-miss threshold", () => {
    const r = evaluateModule({ module: 2, primaryDimensions: [6], scores: { 6: 3 }, redFlags: [],
      answerKey: { tally: tallyAnswerKey(keyA, ["A5", "A3", "A2", "A1", "A4"]), standard: standardA } });
    expect(r.result).toBe("not_passed");
    expect(r.reasons.join()).toMatch(/Clear misses/);
  });
  it("is incomplete until every primary dimension is scored", () => {
    expect(evaluateModule({ module: 3, primaryDimensions: [1, 2], scores: { 1: 3 }, redFlags: [] }).result).toBeNull();
  });
  it("caps Application at 2 when there is no practice", () => {
    expect(maxLevel(3, 5, ["m3_no_practice"])).toBe(2);
    expect(maxLevel(3, 5, [])).toBe(4);
  });
});

describe("computeOutcome", () => {
  const p = (module: 1 | 2 | 3, result: "passed" | "not_passed" | null, tryNo = 1) => ({ module, result, tryNo });
  it("certified when all three passed", () => {
    expect(computeOutcome([p(1, "passed"), p(2, "passed"), p(3, "passed")])).toBe("certified");
  });
  it("development required when one module not passed", () => {
    expect(computeOutcome([p(1, "not_passed")])).toBe("development_required");
  });
  it("development required on an open red flag", () => {
    expect(computeOutcome([p(1, "passed"), p(2, "passed"), p(3, "passed")], true)).toBe("development_required");
  });
  it("reassessment required when two modules not passed", () => {
    expect(computeOutcome([p(1, "passed"), p(2, "not_passed"), p(3, "not_passed")])).toBe("reassessment_required");
  });
  it("reassessment required when a second try fails", () => {
    expect(computeOutcome([p(1, "not_passed"), p(1, "not_passed", 2)])).toBe("reassessment_required");
  });
  it("a passed second try clears the first failure", () => {
    expect(computeOutcome([p(1, "not_passed"), p(1, "passed", 2), p(2, "passed"), p(3, "passed")])).toBe("certified");
  });
  it("in progress otherwise", () => {
    expect(computeOutcome([p(1, "passed"), p(2, null)])).toBe("in_progress");
  });
});

describe("readout and calibration", () => {
  it("preparation below half marks is a development area", () => {
    expect(rubricTotal({ choice: 1, observations: 1, root_cause: 0, adaptation: 1 }, PREP_RUBRIC)).toEqual({ total: 3, max: 8, complete: true, developmentArea: true });
    expect(rubricTotal({ choice: 2, observations: 2, root_cause: 1, adaptation: 1 }, PREP_RUBRIC).developmentArea).toBe(false);
    expect(rubricTotal({ ssc: 2 }, DOC_RUBRIC).complete).toBe(false);
  });
  it("calibration diff by dimension", () => {
    expect(calibrationDiff({ 1: 3, 3: 2 }, { 1: 4, 3: 2 })).toEqual([
      { dimension: 1, a: 3, b: 4, diff: 1 },
      { dimension: 3, a: 2, b: 2, diff: 0 },
    ]);
  });
});
