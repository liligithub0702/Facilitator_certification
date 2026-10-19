import { requireRole } from "@/lib/auth";
import type { Dimension } from "@/lib/types";
import { saveDimension, saveTimers } from "../actions";

export default async function SettingsPage() {
  const { supabase } = await requireRole("admin");
  const [{ data: timersRow }, { data: dims }, { data: coverage }] = await Promise.all([
    supabase.from("settings").select("value").eq("key", "timers").single(),
    supabase.from("dimensions").select("*").order("id").returns<Dimension[]>(),
    supabase.from("module_dimensions").select("*"),
  ]);
  const t = (timersRow?.value ?? {}) as Record<string, number>;

  return (
    <div className="space-y-6">
      <h1 className="h1">Settings</h1>

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
