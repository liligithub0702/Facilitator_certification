import { describe, expect, it } from "vitest";
import { assignCards, assignModule1Cases, assignModule2Recordings, assignSections, type ScenarioRef } from "./assignment";

const m1: ScenarioRef[] = ["case-1", "case-2", "case-3", "spare"].flatMap((family) =>
  (["A", "B"] as const).map((version) => ({ id: `${family}-${version}`, module: 1 as const, family, version, isSpare: family === "spare" })),
);
const m2: ScenarioRef[] = ["rec-coaching", "rec-hiring"].flatMap((family) =>
  (["A", "B"] as const).map((version) => ({ id: `${family}-${version}`, module: 2 as const, family, version, isSpare: false })),
);
const fac = (id: string, region = "India", isReassessment = false, seen: string[] = []) => ({ id, region, isReassessment, seenScenarioIds: seen });

describe("assignModule1Cases", () => {
  it("gives distinct cases in a cohort week and Case 3 to at least one in three", () => {
    const { assignments, warnings } = assignModule1Cases({ facilitators: [fac("a"), fac("b"), fac("c")], scenarios: m1 });
    const families = Object.values(assignments).map((id) => id.replace(/-[AB]$/, ""));
    expect(new Set(families).size).toBe(3);
    expect(families).toContain("case-3");
    expect(Object.values(assignments).every((id) => id.endsWith("-A"))).toBe(true);
    expect(warnings).toEqual([]);
  });
  it("keeps the spare for reassessment unless needed", () => {
    const { assignments } = assignModule1Cases({ facilitators: [fac("a"), fac("b"), fac("c")], scenarios: m1 });
    expect(Object.values(assignments)).not.toContain("spare-A");
  });
  it("reassessment gets Version B or spare and never a seen scenario", () => {
    const { assignments } = assignModule1Cases({ facilitators: [fac("r", "Egypt", true, ["case-1-A"])], scenarios: m1 });
    const pick = assignments.r;
    expect(pick === "spare-A" || pick.endsWith("-B")).toBe(true);
    expect(pick.startsWith("case-1")).toBe(false);
  });
  it("respects families already used in the same week", () => {
    const { assignments } = assignModule1Cases({ facilitators: [fac("a")], scenarios: m1, familiesUsedThisWeek: ["case-3"] });
    expect(assignments.a).not.toMatch(/^case-3/);
  });
  it("warns when Case 3 coverage falls below one in three", () => {
    const { warnings } = assignModule1Cases({
      facilitators: [fac("a")], scenarios: m1, familiesUsedThisWeek: ["case-3"], regionStats: { India: { total: 2, case3: 0 } },
    });
    expect(warnings.join()).toMatch(/Case 3/);
  });
});

describe("module 2 and 3", () => {
  it("alternates recordings and uses Version B on reassessment", () => {
    const { assignments } = assignModule2Recordings({ facilitators: [fac("a"), fac("b"), fac("c", "India", true)], scenarios: m2 });
    expect(assignments).toEqual({ a: "rec-coaching-A", b: "rec-hiring-A", c: "rec-coaching-B" });
  });
  it("priority section goes first and sections are distinct", () => {
    const out = assignSections(["b", "a"], [{ id: "s1", priority: false }, { id: "hire", priority: true }]);
    expect(out).toEqual({ a: "hire", b: "s1" });
  });
  it("two cards per teach-back, never to the presenter, different peers when possible", () => {
    const cards = [
      { id: "skeptic", playsDuring: "content" as const },
      { id: "veteran", playsDuring: "content" as const },
      { id: "silent", playsDuring: "practice" as const },
      { id: "shortcut", playsDuring: "practice" as const },
    ];
    const out = assignCards(["a", "b", "c", "d"], cards);
    expect(out).toHaveLength(8);
    for (const p of ["a", "b", "c", "d"]) {
      const mine = out.filter((o) => o.presenterId === p);
      expect(mine.every((o) => o.peerId !== p)).toBe(true);
      expect(new Set(mine.map((o) => o.peerId)).size).toBe(2);
    }
  });
});
