"use client";

// Team performance dashboard (Team 7 / Team 12). Data comes from public.dashboards.
// Tabbed so it stays easy to navigate; the Agents and QA audits tabs are filterable.
//
// Design rule: present the data clearly, but never judge it. No red/green "good/bad"
// colouring, because spotting the signals (and ruling out the distractor) is exactly
// what Module 1 assesses. Targets are shown as reference lines and rows instead.

import { useRef, useState, type ReactNode } from "react";
import { AgentExplorer, QaAuditLog } from "./DashboardExplorer";

export type DashboardData = {
  label: string;
  team: string;
  channel: string;
  manager: string;
  headcount: number;
  weeks: string[];
  primary: {
    name: string;
    long: string;
    unit: string;
    target: number;
    lowerIsBetter: boolean;
    team: number[];
    bands: Record<string, number[]>;
  };
  agentTable: { note: string; columns: string[]; rows: (string | number)[][] };
  quality: { name: string; scale: string; team: number[]; byAgent: Record<string, number[]> };
  huddles: { sessions: string[]; attended: Record<string, boolean[]> };
  shrinkage: {
    target: number;
    byDay: Record<string, number>;
    absences: { day: string; since: string; total: number; byAgent: Record<string, number> };
  };
  hiring: { note: string; rows: [string, number, string][] };
  events: { week: string; text: string }[];
  /** "Meet your team": one profile per agent (added in migration 6). */
  profiles?: AgentProfile[];
  /** Bridge targets for new hires, shown with the agent table. */
  bridge?: string;
  /** Weekly KPIs per agent (migration 7). `primary` is the team's primary metric (AHT or repeat contacts). */
  weekly?: WeeklyRow[];
  /** QA audit log in the format of the "QA Audits" sheet (migration 7). */
  qa_audits?: QaAudit[];
  qa_pass?: number;
};

export type WeeklyRow = { agent: string; week: string; tenure: string; primary: number; qa: number; csat: number; calls: number; attendance: number };
export type QaAudit = {
  agent: string;
  week: string;
  call_type: string;
  score: number;
  pass: boolean;
  driver_1: string;
  driver_2: string;
  driver_3: string;
  agent_related: boolean;
};

export type AgentProfile = { name: string; tenure: string; about: string; interests: string; coaching: string };

/** The facilitator-visible part of the case: the agent flagged for coaching this week. */
export type CoachingFlag = { agent: string; public: { headline: string; observations: string[] } };

// jsonb does not keep key order, so the display order is fixed here.
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SERIES_COLORS = ["var(--color-brand-indigo)", "var(--color-brand-magenta)", "var(--color-brand-blue)"];

const GLOSSARY: [string, string][] = [
  ["AHT (average handle time)", "Average length of a call, including talk, hold and after-call work, in seconds. Lower is faster."],
  ["Repeat contacts", "Share of customers who contact again within 7 days about the same issue. Lower is better."],
  ["QA", "Quality assurance score: how well calls or chats follow the quality standard, as a percentage."],
  ["CSAT", "Customer satisfaction from post-contact surveys, on a 1–5 scale."],
  ["Shrinkage", "Share of scheduled time agents are unavailable (absence, lateness and similar). Lower is better."],
  ["Tenure band", "Agents grouped by time on the team: tenured, or new hires who joined in W1."],
  ["Huddle", "The short team meeting held each week."],
  ["90-day status", "Whether a hire was still on the team 90 days after joining."],
  ["Bridge targets", "Lower targets new hires work towards during their first months, before full targets apply."],
  ["KB", "Knowledge base: the program's articles on products and processes."],
];

/** Mini trend line. Pass a fixed `domain` when comparing rows, so small wobbles stay small. */
export function Sparkline({ values, domain, color = "var(--color-brand-indigo)" }: { values: number[]; domain?: [number, number]; color?: string }) {
  const W = 80, H = 24;
  const [min, max] = domain ?? [Math.min(...values), Math.max(...values)];
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i * W) / (values.length - 1)},${H - 2 - ((v - min) * (H - 4)) / span}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-20" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

function LineChart({
  weeks,
  series,
  target,
  unit,
  title,
  domain,
}: {
  weeks: string[];
  series: { label: string; values: number[] }[];
  target?: number;
  unit: string;
  title: string;
  /** Fixed y-axis range; otherwise fitted to the data. */
  domain?: [number, number];
}) {
  const W = 560, H = 230, L = 46, R = 16, T = 14, B = 28;
  const all = series.flatMap((s) => s.values).concat(target != null ? [target] : []);
  const min = Math.min(...all), max = Math.max(...all);
  const pad = domain ? 0 : (max - min) * 0.15 || 1;
  const [lo, hi] = domain ?? [min - pad, max + pad];
  const x = (i: number) => L + (i * (W - L - R)) / (weeks.length - 1);
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const ticks = domain ? [lo, (lo + hi) / 2, hi] : [lo + pad, (lo + hi) / 2, hi - pad];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-brand-gray)">
              {Math.round(t * 10) / 10}
            </text>
          </g>
        ))}
        {target != null && (
          <g>
            <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} stroke="var(--color-brand-gray)" strokeDasharray="5 4" />
            <text x={W - R} y={y(target) - 6} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--color-brand-gray)">
              Target {target}
              {unit}
            </text>
          </g>
        )}
        {weeks.map((w, i) => (
          <text key={w} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-brand-gray)">
            {w}
          </text>
        ))}
        {series.map((s, si) => (
          <g key={s.label}>
            <polyline
              fill="none"
              stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
              strokeWidth="2.5"
              strokeLinejoin="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="white" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth="2">
                <title>{`${s.label} ${weeks[i]}: ${v}${unit}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-xs font-semibold text-ink-soft">
        {series.map((s, si) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-5 rounded-full" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
            {s.label}
          </span>
        ))}
        {target != null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed border-brand-gray" />
            Target
          </span>
        )}
      </figcaption>
    </figure>
  );
}

export function Panel({ title, what, children, className = "" }: { title: string; what: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <h3 className="text-base font-extrabold">{title}</h3>
      <p className="mt-0.5 mb-4 text-sm text-brand-gray">{what}</p>
      {children}
    </section>
  );
}

function Tile({ label, value, sub, spark, domain }: { label: string; value: string; sub: string; spark?: number[]; domain?: [number, number] }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-bold tracking-wide text-brand-gray uppercase">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-[28px] leading-none font-extrabold tracking-tight">{value}</p>
        {spark && <Sparkline values={spark} domain={domain} />}
      </div>
      <p className="mt-2 text-xs text-ink-soft">{sub}</p>
    </div>
  );
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString();

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function FlagCard({ flag, profile }: { flag: CoachingFlag; profile?: AgentProfile }) {
  return (
    <section className="card border-l-4 border-l-brand-magenta">
      <p className="eyebrow">This week&apos;s coaching flag</p>
      <div className="mt-2 grid gap-5 lg:grid-cols-[260px_1fr]">
        <div className="rounded-card bg-[linear-gradient(160deg,var(--color-brand-indigo-soft),var(--color-brand-indigo-deep))] p-5 text-white">
          <span className="grid size-14 place-items-center rounded-full bg-white/15 text-lg font-extrabold ring-2 ring-white/30">{initials(flag.agent)}</span>
          <p className="mt-3 text-xl font-extrabold">{flag.agent}</p>
          {profile && (
            <dl className="mt-2 space-y-2 text-sm text-white/85">
              <div><dt className="text-[11px] font-bold tracking-wide text-white/55 uppercase">Tenure</dt><dd>{profile.tenure}</dd></div>
              <div><dt className="text-[11px] font-bold tracking-wide text-white/55 uppercase">About</dt><dd>{profile.about}</dd></div>
              <div><dt className="text-[11px] font-bold tracking-wide text-white/55 uppercase">Interests</dt><dd>{profile.interests}</dd></div>
              <div><dt className="text-[11px] font-bold tracking-wide text-white/55 uppercase">Coaching preference</dt><dd>{profile.coaching}</dd></div>
            </dl>
          )}
        </div>
        <div>
          <h3 className="text-lg font-extrabold">{flag.public.headline}</h3>
          <p className="mt-1 text-sm text-brand-gray">From this month&apos;s data and call monitoring. This would be your first coaching session with {flag.agent} this month.</p>
          <ul className="mt-3 space-y-2 text-[15px]">
            {flag.public.observations.map((o) => (
              <li key={o} className={/^[a-z]\)/.test(o) ? "ml-6 text-ink-soft" : "flex gap-2"}>
                {!/^[a-z]\)/.test(o) && <span className="text-brand-magenta">●</span>}
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const TABS = [
  { id: "overview", label: "Team overview" },
  { id: "agents", label: "Agents" },
  { id: "qa", label: "QA audits" },
  { id: "attendance", label: "Attendance & hiring" },
  { id: "team", label: "Meet your team" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Dashboard({
  data,
  flag,
  storageKey,
}: {
  data: DashboardData;
  flag?: CoachingFlag | null;
  /** Where the "Who do you want to coach?" choice is remembered for the preparation form. */
  storageKey?: string;
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const tabsTop = useRef<HTMLDivElement>(null);
  const openTab = (id: TabId) => {
    setTab(id);
    // If the reader has scrolled past the tabs, bring the new section's start into view.
    const el = tabsTop.current;
    if (el && el.getBoundingClientRect().top < 0) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 140, behavior: "smooth" });
  };
  const p = data.primary;
  const last = data.weeks[data.weeks.length - 1];
  const days = WEEKDAYS.filter((d) => d in data.shrinkage.byDay);
  const dayValues = days.map((d) => data.shrinkage.byDay[d]);
  const maxShrink = Math.max(...dayValues, data.shrinkage.target);
  // Agent order follows the agent table (tenured first, then new hires).
  const agentOrder = data.agentTable.rows.map((r) => String(r[0]).replace(/ \(new hire\)$/, ""));
  const qualityAgents = [
    ...agentOrder.filter((a) => a in data.quality.byAgent),
    ...Object.keys(data.quality.byAgent).filter((a) => !agentOrder.includes(a)),
  ];
  const absences = Object.entries(data.shrinkage.absences.byAgent).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const bands = Object.entries(p.bands).sort(([a], [b]) => Number(b.startsWith("Tenured")) - Number(a.startsWith("Tenured")));
  const qaCol = data.agentTable.columns.findIndex((c) => c.startsWith("QA"));
  const teamQa = qaCol >= 0 ? avg(data.agentTable.rows.map((r) => Number(r[qaCol]))) : null;
  const qualityLast = data.quality.team[data.quality.team.length - 1];
  const qualityUnit = data.quality.scale === "%" ? "%" : "";
  const qualityDomain: [number, number] = data.quality.scale === "%" ? [70, 100] : [3, 5];

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="relative overflow-hidden rounded-panel bg-[linear-gradient(135deg,var(--color-brand-indigo-soft),var(--color-brand-indigo)_45%,var(--color-brand-indigo-deep))] p-6 text-white shadow-mid">
        <div className="pointer-events-none absolute -top-24 -right-10 size-64 rounded-full bg-brand-magenta/30 blur-3xl" />
        <span className="inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-white/85 uppercase ring-1 ring-white/20">
          {data.label}
        </span>
        <h2 className="mt-3 text-2xl font-extrabold tracking-tight">{data.team} performance dashboard</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {[data.channel, "Telecom client", `${data.headcount} agents`, "Team Manager: you", `${data.weeks[0]}–${last} (six weeks)`].map((c) => (
            <span key={c} className="rounded-full bg-white/10 px-3 py-1 font-semibold ring-1 ring-white/15">
              {c}
            </span>
          ))}
        </div>
      </section>

      {flag && <FlagCard flag={flag} profile={data.profiles?.find((p) => p.name === flag.agent)} />}

      <div ref={tabsTop} />
      <nav className="no-print sticky top-[132px] z-[5] -mx-1 flex gap-1 overflow-x-auto rounded-full border border-line bg-paper/95 p-1 shadow-soft backdrop-blur" role="tablist" aria-label="Dashboard sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => openTab(t.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition ${tab === t.id ? "bg-brand-indigo text-white" : "text-ink-soft hover:bg-canvas"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
      {/* Snapshot */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={`${p.name} · team, ${last}`}
          value={`${p.team[p.team.length - 1]}${p.unit === "%" ? "%" : " " + p.unit}`}
          sub={`Target ${p.target}${p.unit === "%" ? "%" : " " + p.unit} · ${data.weeks[0]}: ${p.team[0]}`}
          spark={p.team}
        />
        {teamQa != null && <Tile label="QA · team, 6-week average" value={`${Math.round(teamQa)}%`} sub="Target 82%" />}
        <Tile label={`${data.quality.name} · team, ${last}`} value={`${fmt1(qualityLast)}${qualityUnit}`} sub={`${data.weeks[0]}: ${fmt1(data.quality.team[0])}${qualityUnit}`} spark={data.quality.team} domain={qualityDomain} />
        <Tile label="Shrinkage · weekly average" value={`${fmt1(avg(dayValues))}%`} sub={`Target ${data.shrinkage.target}% · by weekday below`} />
      </div>

      {/* Event log */}
      <Panel title="Event log" what="What changed on the team, by week. Use it to line up changes in the data with what happened.">
        <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data.weeks.map((w) => {
            const evs = data.events.filter((e) => e.week === w);
            return (
              <li key={w} className="rounded-chip border border-line bg-canvas p-3">
                <p className="text-xs font-extrabold text-brand-indigo">{w}</p>
                {evs.length ? (
                  evs.map((e) => (
                    <p key={e.text} className="mt-1 text-sm leading-snug">
                      {e.text}
                    </p>
                  ))
                ) : (
                  <p className="mt-1 text-sm text-brand-gray">No changes logged</p>
                )}
              </li>
            );
          })}
        </ol>
      </Panel>

      {/* Primary metric trend */}
      <Panel title={`${p.long} by tenure band`} what={`Weekly ${p.name} for the whole team and split by tenure. The dashed line is the target.`}>
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-center">
          <LineChart
            title={`${p.name} trend by tenure band`}
            weeks={data.weeks}
            unit={p.unit}
            target={p.target}
            series={[{ label: "Team", values: p.team }, ...bands.map(([label, values]) => ({ label, values }))]}
          />
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{p.name} ({p.unit})</th>
                  {data.weeks.map((w) => (
                    <th key={w} className="text-right">{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[["Team", p.team] as const, ...bands].map(([label, values]) => (
                  <tr key={label}>
                    <td className="font-semibold">{label}</td>
                    {values.map((v, i) => (
                      <td key={i} className="text-right tabular-nums">{v}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="text-brand-gray">Target</td>
                  {data.weeks.map((w) => (
                    <td key={w} className="text-right text-brand-gray tabular-nums">{p.target}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      {/* Quality by agent + huddles */}
      <Panel
        title={`${data.quality.name} by agent, and huddle attendance`}
        what={`Weekly ${data.quality.name} per agent (${data.quality.scale}) with the team trend, and who attended the last three huddles.`}
      >
        <div className="space-y-5">
          <div className="max-w-2xl">
            <p className="mb-2 text-sm font-bold">Team {data.quality.name}</p>
            <LineChart
              title={`Team ${data.quality.name}`}
              weeks={data.weeks}
              unit={qualityUnit}
              domain={qualityDomain}
              series={[{ label: `Team ${data.quality.name}`, values: data.quality.team }]}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Trend</th>
                  {data.weeks.map((w) => (
                    <th key={w} className="text-right">{w}</th>
                  ))}
                  {data.huddles.sessions.map((s) => (
                    <th key={s} className="text-center">Huddle {s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qualityAgents.map((agent) => {
                  const values = data.quality.byAgent[agent];
                  return (
                    <tr key={agent}>
                      <td className="font-semibold">{agent}</td>
                      <td><Sparkline values={values} domain={qualityDomain} /></td>
                      {values.map((v, i) => (
                        <td key={i} className="text-right tabular-nums">{v}</td>
                      ))}
                      {(data.huddles.attended[agent] ?? []).map((a, i) => (
                        <td key={`h${i}`} className="text-center">
                          {a ? <span className="text-brand-gray">✓</span> : <span className="badge">missed</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

        </>
      )}

      {tab === "agents" && (
        data.weekly?.length ? (
          <AgentExplorer data={data} storageKey={storageKey} flaggedAgent={flag?.agent} />
        ) : (
          <>
      {/* Agent table */}
      <Panel title="Agents" what={`${data.agentTable.note}${data.bridge ? ` ${data.bridge}` : ""}`}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                {data.agentTable.columns.map((c, i) => (
                  <th key={c} className={i >= 2 ? "text-right" : ""}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.agentTable.rows.map((r) => {
                const name = String(r[0]);
                const isNew = name.endsWith("(new hire)");
                return (
                  <tr key={name}>
                    <td className="font-semibold">
                      {name.replace(/ \(new hire\)$/, "")}
                      {isNew && <span className="badge ml-2 border-brand-blue/30 bg-brand-blue/8 text-brand-blue">New hire</span>}
                    </td>
                    {r.slice(1).map((c, i) => (
                      <td key={i} className={i >= 1 ? "text-right tabular-nums" : ""}>{c}</td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td className="text-brand-gray">Target</td>
                <td />
                {data.agentTable.columns.slice(2).map((c) => (
                  <td key={c} className="text-right text-brand-gray tabular-nums">
                    {c.startsWith(p.name) ? p.target : c.startsWith("QA") ? 82 : "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

          </>
        )
      )}

      {tab === "qa" && <QaAuditLog data={data} />}

      {tab === "attendance" && (
        <>
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Shrinkage */}
        <Panel title="Shrinkage by weekday" what={`Average share of scheduled time lost on each weekday. The dashed line is the ${data.shrinkage.target}% target.`}>
          <div className="space-y-2" role="img" aria-label="Shrinkage by weekday">
            {days.map((day) => {
              const v = data.shrinkage.byDay[day];
              return (
                <div key={day} className="flex items-center gap-3 text-sm">
                  <span className="w-10 font-semibold text-ink-soft">{day}</span>
                  <div className="relative h-5 flex-1 rounded-full bg-canvas">
                    <div className="h-5 rounded-full bg-brand-indigo" style={{ width: `${(v / maxShrink) * 100}%` }} />
                    <div
                      className="absolute -top-1 h-7 border-l-2 border-dashed border-brand-gray"
                      style={{ left: `${(data.shrinkage.target / maxShrink) * 100}%` }}
                      title={`Target ${data.shrinkage.target}%`}
                    />
                  </div>
                  <span className="w-10 text-right font-bold tabular-nums">{v}%</span>
                </div>
              );
            })}
          </div>
          <table className="table mt-5">
            <thead>
              <tr>
                <th>{data.shrinkage.absences.day} absences since {data.shrinkage.absences.since}</th>
                <th className="text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {absences.map(([a, n]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td className="text-right tabular-nums">{n}</td>
                </tr>
              ))}
              <tr>
                <td className="font-bold">Total</td>
                <td className="text-right font-bold tabular-nums">{data.shrinkage.absences.total}</td>
              </tr>
            </tbody>
          </table>
        </Panel>

        {/* Hiring */}
        <Panel title="Hiring panel: last 8 hires" what={`${data.hiring.note} 90-day status shows whether each hire stayed.`}>
          <table className="table">
            <thead>
              <tr>
                <th>Hire</th>
                <th>Interview rating</th>
                <th>90-day status</th>
              </tr>
            </thead>
            <tbody>
              {data.hiring.rows.map(([name, rating, status]) => (
                <tr key={name}>
                  <td className="font-semibold">{name}</td>
                  <td>
                    <span className="tracking-[0.15em] text-brand-indigo" aria-label={`${rating} out of 5`}>
                      {"●".repeat(rating)}
                      <span className="text-line-strong">{"●".repeat(5 - rating)}</span>
                    </span>
                    <span className="ml-2 text-brand-gray tabular-nums">{rating}/5</span>
                  </td>
                  <td>{status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

        </>
      )}

      {tab === "team" && (
        <>
      {data.profiles && data.profiles.length > 0 && (
        <Panel title="Meet your team" what="Who your agents are and how each of them likes to be coached.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.profiles.map((p) => (
              <div key={p.name} className={`rounded-card border p-4 ${flag?.agent === p.name ? "border-brand-magenta/50 bg-brand-magenta/5" : "border-line bg-canvas"}`}>
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-indigo text-sm font-extrabold text-white">{initials(p.name)}</span>
                  <div>
                    <p className="font-extrabold">{p.name}</p>
                    <p className="text-xs text-brand-gray">{p.tenure}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm">{p.about}</p>
                <p className="mt-2 text-xs text-ink-soft"><strong>Interests:</strong> {p.interests}</p>
                <p className="mt-1 text-xs text-ink-soft"><strong>Coaching preference:</strong> {p.coaching}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

        </>
      )}

      <details className="card">
        <summary className="cursor-pointer font-extrabold">Glossary: what the metrics mean</summary>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {GLOSSARY.map(([term, def]) => (
            <div key={term} className="rounded-chip bg-canvas p-3">
              <dt className="text-sm font-bold">{term}</dt>
              <dd className="mt-0.5 text-sm text-ink-soft">{def}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
