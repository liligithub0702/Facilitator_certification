import { requireRole } from "@/lib/auth";
import type { Dimension } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { getContext } from "@/lib/context";
import { saveContext, saveDimension, saveSignupDomains, saveTimers } from "../actions";

export default async function SettingsPage() {
  const { supabase } = await requireRole("admin");
  const [{ data: timersRow }, { data: dims }, { data: coverage }, { data: signupRow }] = await Promise.all([
    supabase.from("settings").select("value").eq("key", "timers").single(),
    supabase.from("dimensions").select("*").order("id").returns<Dimension[]>(),
    supabase.from("module_dimensions").select("*"),
    supabase.from("settings").select("value").eq("key", "signup").maybeSingle(),
  ]);
  const domains = ((signupRow?.value as { allowed_domains?: string[] })?.allowed_domains ?? []).join(", ");
  const t = (timersRow?.value ?? {}) as Record<string, number>;
  const context = await getContext(supabase);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Settings" sub="What facilitators read, who can sign up, timers and scorecard levels." />

      <form action={saveContext} className="card space-y-4">
        <div>
          <h2 className="h2">What facilitators read</h2>
          <p className="muted">Leave a blank line between paragraphs. Clear a box to go back to the default text.</p>
        </div>
        <label className="block">
          <span className="label">About the programme (facilitator home page)</span>
          <textarea name="programme" defaultValue={context.programme} className="input min-h-40" />
        </label>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="label">Your situation: Team 7 (Version A, voice)</span>
            <textarea name="briefing_A" defaultValue={context.briefing_A} className="input min-h-56" />
          </label>
          <label className="block">
            <span className="label">Your situation: Team 12 (Version B, chat, for reassessments)</span>
            <textarea name="briefing_B" defaultValue={context.briefing_B} className="input min-h-56" />
          </label>
        </div>
        <p className="muted">Shown before Module 1 starts and above the dashboard. Don&apos;t reveal the case: Alex&apos;s situation must stay unknown until the live session.</p>
        <button className="btn btn-primary">Save text</button>
      </form>

      <form action={saveSignupDomains} className="card space-y-3">
        <h2 className="h2">Who can sign up</h2>
        <label className="block">
          <span className="label">Allowed email domains</span>
          <input name="allowed_domains" defaultValue={domains} placeholder="e.g. sutherlandglobal.com" className="input max-w-md" />
        </label>
        <p className="muted">
          Empty = anyone can sign up. With domains listed, only those addresses can create an account; people you invite from Users are
          always allowed. New accounts start as facilitators.
        </p>
        <button className="btn btn-primary">Save</button>
      </form>

      <form action={saveTimers} className="card grid gap-3 sm:grid-cols-3">
        <h2 className="h2 sm:col-span-3">Timers</h2>
        <label><span className="label">Module 1 dashboard review (min)</span><input name="m1_dashboard_min" type="number" defaultValue={(t.m1_dashboard_sec ?? 900) / 60} className="input" /></label>
        <label><span className="label">Module 1 readout (min)</span><input name="m1_readout_min" type="number" defaultValue={(t.m1_readout_sec ?? 300) / 60} className="input" /></label>
        <label><span className="label">Module 2 debrief (min)</span><input name="m2_debrief_min" type="number" defaultValue={(t.m2_debrief_sec ?? 1500) / 60} className="input" /></label>
        <label><span className="label">Module 2 plays (1 view + replays)</span><input name="m2_max_plays" type="number" defaultValue={t.m2_max_plays ?? 2} className="input" /></label>
        <label><span className="label">Network grace after a deadline (sec)</span><input name="grace_sec" type="number" defaultValue={t.grace_sec ?? 10} className="input" /></label>
        <div className="flex items-end"><button className="btn btn-primary">Save timers</button></div>
        <p className="muted sm:col-span-3">Changes apply to modules started after saving.</p>
      </form>

      <section className="space-y-3">
        <h2 className="h2">Scorecard levels</h2>
        <p className="muted">
          Working draft for calibration with COE. Pass rule: every primary dimension 3 or higher and no red flag. Coverage:{" "}
          {[1, 2, 3].map((m) => `M${m} primary ${coverage?.filter((c) => c.module === m && c.weight === "primary").map((c) => c.dimension_id).join(", ")}`).join(" · ")}
        </p>
        {dims?.map((d) => (
          <form key={d.id} action={saveDimension.bind(null, d.id)} className="card grid gap-2 md:grid-cols-5">
            <label className="md:col-span-5"><span className="label">{d.id}. Name</span><input name="name" defaultValue={d.name} className="input" /></label>
            {([1, 2, 3, 4] as const).map((l) => (
              <label key={l}>
                <span className="label">{l} – {["Not yet", "Developing", "Meets standard", "Role model"][l - 1]}</span>
                <textarea name={`level_${l}`} defaultValue={d[`level_${l}`]} className="input min-h-20" />
              </label>
            ))}
            <div className="flex items-end"><button className="btn">Save</button></div>
          </form>
        ))}
      </section>
    </div>
  );
}
