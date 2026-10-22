import { describe, expect, it } from "vitest";
import { assignCards, assignModule2Recordings, assignSections, module1ScenarioFor, type ScenarioRef } from "./assignment";

const m1: ScenarioRef[] = ["case-1", "case-2", "case-3", "spare"].flatMap((family) =>
  (["A", "B"] as const).map((version) => ({ id: `${family}-${version}`, module: 1 as const, family, version, isSpare: family === "spare" })),
);
const m2: ScenarioRef[] = ["rec-coaching", "rec-hiring"].flatMap((family) =>
  (["A", "B"] as const).map((version) => ({ id: `${family}-${version}`, module: 2 as const, family, version, isSpare: false })),
);
const fac = (id: string, region = "India", isReassessment = false, seen: string[] = []) => ({ id, region, isReassessment, seenScenarioIds: seen });

describe("module1ScenarioFor", () => {
  const team: ScenarioRef[] = (["A", "B"] as const).map((version) => ({ id: `team-${version}`, module: 1, family: "team-coaching", version, isSpare: false }));
  it("first try gets Team 7 (A), reassessment gets Team 12 (B)", () => {
    expect(module1ScenarioFor(false, [...m1, ...team])?.id).toBe("team-A");
    expect(module1ScenarioFor(true, [...m1, ...team])?.id).toBe("team-B");
  });
  it("ignores the retired per-case scenarios", () => {
    expect(module1ScenarioFor(false, m1)).toBeUndefined();
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
