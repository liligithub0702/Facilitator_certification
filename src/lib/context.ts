import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Facilitator-facing context: what the programme is and the situation they step into.
// Defaults live here so nothing needs a database change; admins override them in
// Admin -> Settings, which saves to settings.context. Blank lines separate paragraphs.

export type FacilitatorContext = {
  programme: string;
  briefing_A: string;
  briefing_B: string;
};

export const DEFAULT_CONTEXT: FacilitatorContext = {
  programme: `TMU is the Capability programme that develops Team Managers (TMs): how they coach agents, read performance data, lead with emotional intelligence and hire well. As a TMU facilitator you deliver it, and you also coach TMs one-to-one on the floor.

This re-certification checks that you can do that in practice: read a team's data, run a coaching session using the coaching cycle, spot what works and what doesn't in a real conversation, and teach a section to a room. It is not a test of recalling content.

All teams, people and numbers in the cases are fictional and built for the assessment.`,

  briefing_A: `You are the Team Manager of Team 7: a voice team of 14 agents in the Customer Care operation for a telecom client, a mobile and broadband provider. The team handles billing, plan and account queries.

It's the start of the month and you are planning your coaching. Below is your team's last six weeks of performance (W1–W6), this week's coaching flag from quality monitoring, and a profile of every agent.

Decide which agent you will coach first. This will be your first coaching session with them this month. Then prepare the session, hold it live (your certifier plays the agent) and document it, following the coaching cycle.`,

  briefing_B: `You are the Team Manager of Team 12: a chat team of 14 agents in the Customer Care operation for a telecom client, a mobile and broadband provider. The team handles billing, plan and refund queries.

It's the start of the month and you are planning your coaching. Below is your team's last six weeks of performance (W1–W6), this week's coaching flag from quality monitoring, and a profile of every agent.

Decide which agent you will coach first. This will be your first coaching session with them this month. Then prepare the session, hold it live (your certifier plays the agent) and document it, following the coaching cycle.`,
};

export async function getContext(supabase: SupabaseClient): Promise<FacilitatorContext> {
  const { data } = await supabase.from("settings").select("value").eq("key", "context").maybeSingle();
  const saved = (data?.value ?? {}) as Partial<FacilitatorContext>;
  return {
    programme: saved.programme?.trim() || DEFAULT_CONTEXT.programme,
    briefing_A: saved.briefing_A?.trim() || DEFAULT_CONTEXT.briefing_A,
    briefing_B: saved.briefing_B?.trim() || DEFAULT_CONTEXT.briefing_B,
  };
}

export const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
