// Team performance dashboard (Team 7 / Team 12). Data comes from public.dashboards.
// Rendered on the server; no interactivity so the facilitator reads the whole thing.
//
// Design rule: present the data clearly, but never judge it. No red/green "good/bad"
// colouring, because spotting the signals (and ruling out the distractor) is exactly
// what Module 1 assesses. Targets are shown as reference lines and rows instead.

import type { ReactNode } from "react";

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
};

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
];

/** Mini trend line. Pass a fixed `domain` when comparing rows, so small wobbles stay small. */
function Sparkline({ values, domain, color = "var(--color-brand-indigo)" }: { values: number[]; domain?: [number, number]; color?: string }) {
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

function Panel({ title, what, children, className = "" }: { title: string; what: string; children: ReactNode; className?: string }) {
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

export function Dashboard({ data }: { data: DashboardData }) {
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
          {[data.channel, "Telecom client", `${data.headcount} agents`, `Team Manager: ${data.manager}`, `${data.weeks[0]}–${last} (six weeks)`].map((c) => (
            <span key={c} className="rounded-full bg-white/10 px-3 py-1 font-semibold ring-1 ring-white/15">
              {c}
            </span>
          ))}
        </div>
      </section>

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

      {/* Agent table */}
      <Panel title="Agents" what={data.agentTable.note}>
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
