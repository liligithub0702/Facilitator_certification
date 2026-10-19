// Case, recording, section and learner-card assignment rules (requirements doc, "Case assignment",
// Module 2 and Module 3). Pure and deterministic so admins get the same result on re-run.

export type ScenarioRef = {
  id: string;
  module: 1 | 2;
  family: string;
  version: "A" | "B";
  isSpare: boolean;
};

export type FacilitatorRef = {
  id: string;
  region: string | null;
  /** Second try of the module: must get Version B or the spare, never a scenario already seen. */
  isReassessment: boolean;
  seenScenarioIds: string[];
};

export type RegionStats = Record<string, { total: number; case3: number }>;

const MAIN_CASES = ["case-3", "case-1", "case-2"];

/**
 * Module 1 cases:
 *  - no two facilitators in the same cohort week get the same case (family)
 *  - at least one in three facilitators per region gets Case 3
 *  - reassessments use Version B or the spare case, never one already seen
 */
export function assignModule1Cases(args: {
  facilitators: FacilitatorRef[];
  scenarios: ScenarioRef[];
  familiesUsedThisWeek?: string[];
  regionStats?: RegionStats;
}): { assignments: Record<string, string>; warnings: string[] } {
  const used = new Set(args.familiesUsedThisWeek ?? []);
  const stats: RegionStats = structuredClone(args.regionStats ?? {});
  const assignments: Record<string, string> = {};
  const warnings: string[] = [];
  const cases = args.scenarios.filter((s) => s.module === 1);

  // First tries first so the main cases go to them; reassessments draw from B/spare.
  const ordered = [...args.facilitators].sort(
    (a, b) => Number(a.isReassessment) - Number(b.isReassessment) || a.id.localeCompare(b.id),
  );

  for (const f of ordered) {
    const region = f.region ?? "Unassigned";
    const st = (stats[region] ??= { total: 0, case3: 0 });
    const seen = new Set(f.seenScenarioIds);
    const seenFamilies = new Set(cases.filter((c) => seen.has(c.id)).map((c) => c.family));

    const eligible = cases.filter((c) => {
      if (seen.has(c.id) || used.has(c.family)) return false;
      return f.isReassessment ? c.version === "B" || c.isSpare : c.version === "A";
    });

    const needCase3 = st.case3 < Math.ceil((st.total + 1) / 3);
    const rank = (c: ScenarioRef) => {
      let r = 0;
      if (seenFamilies.has(c.family)) r += 100; // prefer a case they have not met at all
      if (!f.isReassessment && c.isSpare) r += 50; // spare is held back for reassessment
      if (needCase3 && c.family !== "case-3") r += 10;
      const order = MAIN_CASES.indexOf(c.family);
      r += order === -1 ? MAIN_CASES.length : order;
      if (f.isReassessment && c.version === "B") r -= 0.5; // Version B before the spare
      return r;
    };
    const pick = eligible.sort((a, b) => rank(a) - rank(b))[0];

    if (!pick) {
      warnings.push(`No eligible case left for facilitator ${f.id} this week.`);
      continue;
    }
    assignments[f.id] = pick.id;
    used.add(pick.family);
    st.total += 1;
    if (pick.family === "case-3") st.case3 += 1;
  }

  for (const [region, st] of Object.entries(stats)) {
    if (st.total > 0 && st.case3 * 3 < st.total) {
      warnings.push(
        `${region}: ${st.case3} of ${st.total} facilitators have Case 3 (target at least one in three). Schedule some in another week.`,
      );
    }
  }
  return { assignments, warnings };
}

/** Module 2: alternate the coaching (A) and hiring (B) recordings across the cohort. */
export function assignModule2Recordings(args: {
  facilitators: FacilitatorRef[];
  scenarios: ScenarioRef[];
}): { assignments: Record<string, string>; warnings: string[] } {
  const recs = args.scenarios.filter((s) => s.module === 2);
  const families = ["rec-coaching", "rec-hiring"];
  const assignments: Record<string, string> = {};
  const warnings: string[] = [];
  const ordered = [...args.facilitators].sort((a, b) => a.id.localeCompare(b.id));

  ordered.forEach((f, i) => {
    const version = f.isReassessment ? "B" : "A";
    const preferred = [families[i % 2], families[(i + 1) % 2]];
    const pick = preferred
      .map((fam) => recs.find((r) => r.family === fam && r.version === version && !f.seenScenarioIds.includes(r.id)))
      .find(Boolean);
    if (pick) assignments[f.id] = pick.id;
    else warnings.push(`No eligible recording for facilitator ${f.id}.`);
  });
  return { assignments, warnings };
}

/** Module 3: one section per facilitator, priority section first, distinct within the cohort. */
export function assignSections(
  facilitatorIds: string[],
  sections: { id: string; priority: boolean }[],
): Record<string, string> {
  const pool = [...sections].sort((a, b) => Number(b.priority) - Number(a.priority));
  const out: Record<string, string> = {};
  [...facilitatorIds].sort().forEach((id, i) => {
    if (pool.length) out[id] = pool[i % pool.length].id;
  });
  return out;
}

/**
 * Module 3 learner cards: two per teach-back, one played during content and one during
 * practice, each given to a different peer (never the presenter). Rotates through the deck
 * so the cohort sees a spread of disruptions.
 */
export function assignCards(
  presenterIds: string[],
  cards: { id: string; playsDuring: "content" | "practice" }[],
): { presenterId: string; cardId: string; peerId: string }[] {
  const ids = [...presenterIds].sort();
  const content = cards.filter((c) => c.playsDuring === "content");
  const practice = cards.filter((c) => c.playsDuring === "practice");
  const out: { presenterId: string; cardId: string; peerId: string }[] = [];
  if (ids.length < 2 || !content.length || !practice.length) return out;

  ids.forEach((presenterId, i) => {
    const peers = ids.filter((p) => p !== presenterId);
    const p1 = peers[i % peers.length];
    const p2 = peers[(i + 1) % peers.length];
    out.push({ presenterId, cardId: content[i % content.length].id, peerId: p1 });
    out.push({ presenterId, cardId: practice[i % practice.length].id, peerId: p2 });
  });
  return out;
}
