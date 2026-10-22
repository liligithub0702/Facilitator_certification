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

This re-certification checks that you can do that in practice: read a team's data, coach a TM to their own plan, spot what works and what doesn't in a real conversation, and teach a section to a room. It is not a test of recalling content.

All teams, people and numbers in the cases are fictional and built for the assessment.`,

  briefing_A: `You are supporting the Customer Care operation for a telecom client: a mobile and broadband provider. Team 7 is a voice team of 14 agents handling billing, plan and account queries.

Their Team Manager, Alex, has booked a coaching session with you. Alex will bring a situation from the team; you won't know which one in advance.

Before the session you have 15 minutes with Team 7's last six weeks of performance (W1–W6). Read all of it as you would before meeting a TM on the floor: what changed, when, for whom, and what might explain it.`,

  briefing_B: `You are supporting the Customer Care operation for a telecom client: a mobile and broadband provider. Team 12 is a chat team of 14 agents handling billing, plan and refund queries.

Their Team Manager, Alex, has booked a coaching session with you. Alex will bring a situation from the team; you won't know which one in advance.

Before the session you have 15 minutes with Team 12's last six weeks of performance (W1–W6). Read all of it as you would before meeting a TM on the floor: what changed, when, for whom, and what might explain it.`,
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
