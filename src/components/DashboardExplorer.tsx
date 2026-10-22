"use client";

// Interactive parts of the team dashboard: the agent explorer ("Who do you want to coach?")
// and the filterable QA audit log. Modelled on the slicers and QA Audits sheet of the
// KPI Performance Dashboard workbook, kept to a few clear filters.

import { useEffect, useMemo, useState } from "react";
import { Panel, Sparkline, type DashboardData, type QaAudit } from "./Dashboard";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-bold tracking-wide text-brand-gray uppercase">{label}</span>
      <select className="input min-w-36" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="inline-flex rounded-full bg-canvas p-1 text-sm">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 font-semibold transition ${value === v ? "bg-paper text-brand-indigo shadow-soft" : "text-ink-soft"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function AuditCard({ a, pass }: { a: QaAudit; pass: number }) {
  return (
    <li className="rounded-chip border border-line bg-paper p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge">{a.week}</span>
        <span className="font-semibold">{a.call_type}</span>
        <span className={`badge ml-auto ${a.score >= pass ? "border-ok/30 bg-ok-bg text-ok" : "border-danger/30 bg-danger-bg text-danger"}`}>
          {a.score}% · {a.score >= pass ? "Pass" : "Fail"}
        </span>
      </div>
      <p className="mt-1.5">{a.driver_3}</p>
      <p className="mt-1 text-xs text-brand-gray">
        {a.driver_1 === "—" ? "No driver" : `${a.driver_1} › ${a.driver_2}`} · {a.agent_related ? "Agent related" : "Not agent related"}
      </p>
    </li>
  );
}

type SortKey = "agent" | "primary" | "qa" | "csat" | "calls" | "attendance" | "fails";

export function AgentExplorer({ data, storageKey, flaggedAgent }: { data: DashboardData; storageKey?: string; flaggedAgent?: string }) {
  const weeks = data.weeks;
  const pass = data.qa_pass ?? 82;
  const p = data.primary;
  const unit = p.unit === "%" ? "%" : " s";
  const [week, setWeek] = useState("all");
  const [tenure, setTenure] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "agent", dir: 1 });
  const [selected, setSelected] = useState("");

  // Remember the choice for the preparation form (per browser; the form is the record).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      // Browser storage only exists after mount; reading it here avoids a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSelected(saved);
    } catch {
      /* storage unavailable */
    }
  }, [storageKey]);
  const choose = (name: string) => {
    setSelected(name);
    if (!storageKey) return;
    try {
      if (name) window.localStorage.setItem(storageKey, name);
      else window.localStorage.removeItem(storageKey);
    } catch {
      /* storage unavailable */
    }
  };

  const agents = useMemo(() => [...new Set(data.weekly!.map((w) => w.agent))], [data.weekly]);
  const rows = useMemo(() => {
    const inWeek = (w: string) => week === "all" || w === week;
    const list = agents.map((agent) => {
      const ws = data.weekly!.filter((w) => w.agent === agent && inWeek(w.week));
      const audits = (data.qa_audits ?? []).filter((a) => a.agent === agent && inWeek(a.week));
      const t = ws[0]?.tenure ?? "";
      return {
        agent,
        tenure: t,
        primary: r1(avg(ws.map((w) => w.primary))),
        qa: Math.round(avg(ws.map((w) => w.qa))),
        csat: r1(avg(ws.map((w) => w.csat))),
        calls: ws.reduce((s, w) => s + w.calls, 0),
        attendance: Math.round(avg(ws.map((w) => w.attendance))),
        audits: audits.length,
        fails: audits.filter((a) => a.score < pass).length,
      };
    });
    return list
      .filter((r) => tenure === "all" || r.tenure === tenure)
      .sort((a, b) => {
        const k = sort.key;
        const va = a[k], vb = b[k];
        return (typeof va === "string" ? va.localeCompare(String(vb)) : (va as number) - (vb as number)) * sort.dir;
      });
  }, [agents, data.weekly, data.qa_audits, week, tenure, sort, pass]);

  const head = (key: SortKey, label: string, right = true) => (
    <th className={right ? "text-right" : ""}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-bold uppercase hover:text-brand-indigo"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "agent" ? 1 : -1 }))}
      >
        {label}
        <span aria-hidden className="text-[10px]">{sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  const profile = data.profiles?.find((x) => x.name === selected);
  const agentWeeks = data.weekly!.filter((w) => w.agent === selected);
  const agentAudits = (data.qa_audits ?? []).filter((a) => a.agent === selected && (week === "all" || a.week === week));

  return (
    <div className="space-y-5">
      <section className="card border-l-4 border-l-brand-magenta">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-64 flex-1">
            <p className="eyebrow">Your choice</p>
            <h3 className="mt-1 text-lg font-extrabold">Who do you want to coach?</h3>
            <p className="text-sm text-brand-gray">Pick an agent to see their profile, week-by-week numbers and QA observations. You confirm your choice on the next step.</p>
          </div>
          <select className="input max-w-64 text-base font-semibold" value={selected} onChange={(e) => choose(e.target.value)} aria-label="Who do you want to coach?">
            <option value="">Choose an agent…</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
                {a === flaggedAgent ? " (coaching flag)" : ""}
              </option>
            ))}
          </select>
        </div>
      </section>

      {selected && (
        <section className="card space-y-5">
          <div className="flex flex-wrap items-start gap-5">
            <div className="flex items-center gap-3">
              <span className="grid size-14 place-items-center rounded-full bg-brand-indigo text-lg font-extrabold text-white">{selected.slice(0, 2).toUpperCase()}</span>
              <div>
                <p className="text-xl font-extrabold">{selected}</p>
                <p className="text-sm text-brand-gray">{profile?.tenure}</p>
              </div>
            </div>
            {profile && (
              <dl className="grid flex-1 gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs font-bold tracking-wide text-brand-gray uppercase">About</dt><dd>{profile.about}</dd></div>
                <div><dt className="text-xs font-bold tracking-wide text-brand-gray uppercase">Interests</dt><dd>{profile.interests}</dd></div>
                <div><dt className="text-xs font-bold tracking-wide text-brand-gray uppercase">Coaching preference</dt><dd>{profile.coaching}</dd></div>
              </dl>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Week by week</th>
                  <th>Trend</th>
                  {weeks.map((w) => (
                    <th key={w} className={`text-right ${week === w ? "text-brand-magenta" : ""}`}>{w}</th>
                  ))}
                  <th className="text-right">Target</th>
                </tr>
              </thead>
              <tbody>
                {([
                  [`${p.name} (${p.unit})`, (w: (typeof agentWeeks)[number]) => w.primary, String(p.target)],
                  ["QA %", (w: (typeof agentWeeks)[number]) => w.qa, String(pass)],
                  ["CSAT", (w: (typeof agentWeeks)[number]) => w.csat, "—"],
                  ["Calls", (w: (typeof agentWeeks)[number]) => w.calls, "—"],
                  ["Attendance %", (w: (typeof agentWeeks)[number]) => w.attendance, "—"],
                ] as const).map(([label, get, target]) => {
                  const vals = weeks.map((wk) => agentWeeks.find((x) => x.week === wk)).map((x) => (x ? get(x) : null));
                  return (
                    <tr key={label}>
                      <td className="font-semibold">{label}</td>
                      <td><Sparkline values={vals.filter((v): v is number => v != null)} /></td>
                      {vals.map((v, i) => (
                        <td key={i} className={`text-right tabular-nums ${week === weeks[i] ? "font-bold" : ""}`}>{v ?? "—"}</td>
                      ))}
                      <td className="text-right text-brand-gray tabular-nums">{target}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="font-extrabold">QA observations {week === "all" ? "(all weeks)" : `(${week})`}</h4>
            <p className="mb-3 text-sm text-brand-gray">From QA audits of {selected}&apos;s calls. Pass mark {pass}%.</p>
            {agentAudits.length ? (
              <ul className="grid gap-2 md:grid-cols-2">
                {agentAudits.map((a, i) => (
                  <AuditCard key={i} a={a} pass={pass} />
                ))}
              </ul>
            ) : (
              <p className="muted">No audits for this filter.</p>
            )}
          </div>
        </section>
      )}

      <Panel title="All agents" what={`Filter by week and tenure; click a column to sort, or a row to open that agent. ${week === "all" ? "Figures are six-week averages (calls are totals)." : `Figures are for ${week}.`}${data.bridge ? ` ${data.bridge}` : ""}`}>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <Select label="Week" value={week} onChange={setWeek} options={[["all", "All weeks"], ...weeks.map((w) => [w, w] as [string, string])]} />
          <div>
            <span className="mb-1 block text-xs font-bold tracking-wide text-brand-gray uppercase">Tenure</span>
            <Segmented value={tenure} onChange={setTenure} options={[["all", "All"], ["Tenured", "Tenured"], ["New hire", "New hires"]]} />
          </div>
          <p className="ml-auto text-sm text-brand-gray">
            Targets: {p.name} {p.target}
            {unit.trim()} · QA {pass}%
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                {head("agent", "Agent", false)}
                {head("primary", `${p.name} (${p.unit})`)}
                {head("qa", "QA %")}
                {head("csat", "CSAT")}
                {head("calls", "Calls")}
                {head("attendance", "Attendance %")}
                {head("fails", "QA fails")}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.agent}
                  onClick={() => choose(r.agent)}
                  className={`cursor-pointer ${selected === r.agent ? "[&>td]:bg-brand-indigo/6" : ""}`}
                >
                  <td className="font-semibold">
                    {r.agent}
                    {r.tenure === "New hire" && <span className="badge ml-2 border-brand-blue/30 bg-brand-blue/8 text-brand-blue">New hire</span>}
                  </td>
                  <td className="text-right tabular-nums">{r.primary}</td>
                  <td className="text-right tabular-nums">{r.qa}</td>
                  <td className="text-right tabular-nums">{r.csat}</td>
                  <td className="text-right tabular-nums">{r.calls}</td>
                  <td className="text-right tabular-nums">{r.attendance}</td>
                  <td className="text-right tabular-nums">
                    {r.fails} <span className="text-brand-gray">/ {r.audits}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function QaAuditLog({ data }: { data: DashboardData }) {
  const audits = data.qa_audits ?? [];
  const pass = data.qa_pass ?? 82;
  const [week, setWeek] = useState("all");
  const [agent, setAgent] = useState("all");
  const [driver, setDriver] = useState("all");
  const [related, setRelated] = useState("all");
  const [result, setResult] = useState("all");

  const agents = [...new Set(audits.map((a) => a.agent))].sort();
  const drivers = [...new Set(audits.map((a) => a.driver_1).filter((d) => d !== "—"))].sort();
  const shown = audits.filter(
    (a) =>
      (week === "all" || a.week === week) &&
      (agent === "all" || a.agent === agent) &&
      (driver === "all" || a.driver_1 === driver) &&
      (related === "all" || (related === "yes") === a.agent_related) &&
      (result === "all" || (result === "pass") === a.score >= pass),
  );
  const top = Object.entries(
    shown.filter((a) => a.driver_1 !== "—").reduce<Record<string, number>>((m, a) => ((m[`${a.driver_1} › ${a.driver_2}`] = (m[`${a.driver_1} › ${a.driver_2}`] ?? 0) + 1), m), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxTop = Math.max(1, ...top.map(([, n]) => n));

  if (!audits.length) return <p className="muted">No QA audits loaded for this team.</p>;
  return (
    <Panel title="QA audits" what={`Every audited call this period, with what drove the score. Pass mark ${pass}%. Filter to look for patterns: by person, by week, or agent-related versus process and tools.`}>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Select label="Week" value={week} onChange={setWeek} options={[["all", "All weeks"], ...data.weeks.map((w) => [w, w] as [string, string])]} />
        <Select label="Agent" value={agent} onChange={setAgent} options={[["all", "All agents"], ...agents.map((a) => [a, a] as [string, string])]} />
        <Select label="Driver" value={driver} onChange={setDriver} options={[["all", "All drivers"], ...drivers.map((d) => [d, d] as [string, string])]} />
        <Select label="Agent related?" value={related} onChange={setRelated} options={[["all", "All"], ["yes", "Agent related"], ["no", "Not agent related"]]} />
        <Select label="Result" value={result} onChange={setResult} options={[["all", "All"], ["pass", "Pass"], ["fail", "Fail"]]} />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <div className="rounded-chip bg-canvas p-3">
            <p className="text-xs font-bold tracking-wide text-brand-gray uppercase">Audits</p>
            <p className="text-2xl font-extrabold">{shown.length}</p>
          </div>
          <div className="rounded-chip bg-canvas p-3">
            <p className="text-xs font-bold tracking-wide text-brand-gray uppercase">Pass rate</p>
            <p className="text-2xl font-extrabold">{shown.length ? Math.round((shown.filter((a) => a.score >= pass).length / shown.length) * 100) : 0}%</p>
          </div>
        </div>
        <div className="rounded-chip bg-canvas p-3">
          <p className="mb-2 text-xs font-bold tracking-wide text-brand-gray uppercase">Most common drivers</p>
          <div className="space-y-1.5">
            {top.map(([d, n]) => (
              <div key={d} className="flex items-center gap-2 text-sm">
                <span className="w-56 shrink-0 truncate" title={d}>{d}</span>
                <div className="h-3 flex-1 rounded-full bg-paper">
                  <div className="h-3 rounded-full bg-brand-indigo" style={{ width: `${(n / maxTop) * 100}%` }} />
                </div>
                <span className="w-6 text-right font-bold tabular-nums">{n}</span>
              </div>
            ))}
            {!top.length && <p className="muted">No drivers for this filter.</p>}
          </div>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto rounded-chip border border-line">
        <table className="table">
          <thead className="sticky top-0">
            <tr>
              <th>Week</th>
              <th>Agent</th>
              <th>Call type</th>
              <th className="text-right">Score</th>
              <th>Driver</th>
              <th>Root cause</th>
              <th>Agent related</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a, i) => (
              <tr key={i}>
                <td>{a.week}</td>
                <td className="font-semibold">{a.agent}</td>
                <td>{a.call_type}</td>
                <td className="text-right tabular-nums">
                  <span className={a.score >= pass ? "" : "font-bold text-danger"}>{a.score}%</span>
                </td>
                <td className="whitespace-nowrap">{a.driver_1 === "—" ? "—" : `${a.driver_1} › ${a.driver_2}`}</td>
                <td>{a.driver_3}</td>
                <td>{a.agent_related ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
