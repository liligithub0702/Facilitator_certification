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

/**
 * Module 1: every agent is a scenario and the facilitator chooses who to coach, so the only
 * choice is the team: Team 7 (Version A) for a first try, Team 12 (Version B) for a reassessment.
 */
export function module1ScenarioFor(isReassessment: boolean, scenarios: ScenarioRef[]): ScenarioRef | undefined {
  const version = isReassessment ? "B" : "A";
  return scenarios.find((s) => s.module === 1 && s.family === "team-coaching" && s.version === version);
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
