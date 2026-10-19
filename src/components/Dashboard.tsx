// Team performance dashboard (Team 7 / Team 12). Data comes from public.dashboards.
// Rendered on the server; no interactivity so the facilitator reads the whole thing.

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

const SERIES_COLORS = ["var(--accent)", "#c4622d", "#7a5af8"];

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
  const W = 560, H = 220, L = 44, R = 12, T = 12, B = 28;
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
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {Math.round(t * 10) / 10}
            </text>
          </g>
        ))}
        {target != null && (
          <g>
            <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} stroke="var(--muted)" strokeDasharray="4 4" />
            <text x={W - R} y={y(target) - 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              target {target}{unit}
            </text>
          </g>
        )}
        {weeks.map((w, i) => (
          <text key={w} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{w}</text>
        ))}
        {series.map((s, si) => (
          <g key={s.label}>
            <polyline
              fill="none"
              stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
              strokeWidth="2.5"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={SERIES_COLORS[si % SERIES_COLORS.length]}>
                <title>{`${s.label} ${weeks[i]}: ${v}${unit}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-xs text-muted">
        {series.map((s, si) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Panel({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h3 className="mb-3 font-semibold">
        <span className="muted mr-2">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Dashboard({ data }: { data: DashboardData }) {
  const p = data.primary;
  const maxShrink = Math.max(...Object.values(data.shrinkage.byDay), data.shrinkage.target);
  const days = WEEKDAYS.filter((d) => d in data.shrinkage.byDay);
  // Agent order follows the agent table (tenured first, then new hires).
  const agentOrder = data.agentTable.rows.map((r) => String(r[0]).replace(/ \(new hire\)$/, ""));
  const qualityAgents = [
    ...agentOrder.filter((a) => a in data.quality.byAgent),
    ...Object.keys(data.quality.byAgent).filter((a) => !agentOrder.includes(a)),
  ];
  const absences = Object.entries(data.shrinkage.absences.byAgent).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const bands = Object.entries(p.bands).sort(([a], [b]) => Number(b.startsWith("Tenured")) - Number(a.startsWith("Tenured")));
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-warn px-3 py-2 text-sm font-medium text-warn">{data.label}</div>
      <div>
        <h2 className="h2">{data.team} performance dashboard</h2>
        <p className="muted">
          {data.channel} · {data.headcount} agents · Team Manager {data.manager} · Six weeks shown, {data.weeks[0]}–
          {data.weeks[data.weeks.length - 1]}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel n={1} title={`${p.long} by tenure band`}>
          <LineChart
            title={`${p.name} trend by tenure band`}
            weeks={data.weeks}
            unit={p.unit}
            target={p.target}
            series={[{ label: "Team", values: p.team }, ...bands.map(([label, values]) => ({ label, values }))]}
          />
          <div className="overflow-x-auto">
            <table className="table mt-2">
              <thead>
                <tr><th>{p.name} ({p.unit})</th>{data.weeks.map((w) => <th key={w}>{w}</th>)}</tr>
              </thead>
              <tbody>
                {[["Team", p.team] as const, ...bands].map(([label, values]) => (
                  <tr key={label}><td>{label}</td>{values.map((v, i) => <td key={i}>{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel n={6} title="Event log">
          <ol className="space-y-2 text-sm">
            {data.events.map((e) => (
              <li key={e.week + e.text} className="flex gap-3">
                <span className="badge">{e.week}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel n={2} title="Agent table">
        <p className="muted mb-2">{data.agentTable.note}</p>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr>{data.agentTable.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {data.agentTable.rows.map((r) => (
                <tr key={String(r[0])}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel n={3} title={`${data.quality.name} by agent and huddle attendance`}>
          <LineChart
            title={`Team ${data.quality.name}`}
            weeks={data.weeks}
            unit={data.quality.scale === "%" ? "%" : ""}
            domain={data.quality.scale === "%" ? [70, 100] : [3, 5]}
            series={[{ label: `Team ${data.quality.name}`, values: data.quality.team }]}
          />
          <div className="overflow-x-auto">
            <table className="table mt-2">
              <thead>
                <tr>
                  <th>Agent</th>
                  {data.weeks.map((w) => <th key={w}>{w}</th>)}
                  {data.huddles.sessions.map((s) => <th key={s}>Huddle {s}</th>)}
                </tr>
              </thead>
              <tbody>
                {qualityAgents.map((agent) => [agent, data.quality.byAgent[agent]] as const).map(([agent, values]) => (
                  <tr key={agent}>
                    <td>{agent}</td>
                    {values.map((v, i) => <td key={i}>{v}</td>)}
                    {(data.huddles.attended[agent] ?? []).map((a, i) => (
                      <td key={`h${i}`}>{a ? "✓" : <span className="text-danger">missed</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel n={4} title="Shrinkage by weekday">
            <div className="space-y-1.5" role="img" aria-label="Shrinkage by weekday">
              {days.map((day) => [day, data.shrinkage.byDay[day]] as const).map(([day, v]) => (
                <div key={day} className="flex items-center gap-2 text-sm">
                  <span className="w-10 text-muted">{day}</span>
                  <div className="relative h-4 flex-1 rounded bg-background">
                    <div
                      className={`h-4 rounded ${v > data.shrinkage.target ? "bg-warn" : "bg-accent"}`}
                      style={{ width: `${(v / maxShrink) * 100}%` }}
                    />
                    <div
                      className="absolute top-0 h-4 border-l-2 border-dashed border-muted"
                      style={{ left: `${(data.shrinkage.target / maxShrink) * 100}%` }}
                      title={`target ${data.shrinkage.target}%`}
                    />
                  </div>
                  <span className="w-10 text-right">{v}%</span>
                </div>
              ))}
              <p className="muted">Dashed line: target {data.shrinkage.target}%.</p>
            </div>
            <table className="table mt-3">
              <thead>
                <tr><th>{data.shrinkage.absences.day} absences since {data.shrinkage.absences.since}</th><th>Count</th></tr>
              </thead>
              <tbody>
                {absences.map(([a, n]) => (
                  <tr key={a}><td>{a}</td><td>{n}</td></tr>
                ))}
                <tr><td className="font-medium">Total</td><td className="font-medium">{data.shrinkage.absences.total}</td></tr>
              </tbody>
            </table>
          </Panel>

          <Panel n={5} title="Hiring panel: last 8 hires">
            <p className="muted mb-2">{data.hiring.note}</p>
            <table className="table">
              <thead><tr><th>Hire</th><th>Interview rating (1–5)</th><th>90-day status</th></tr></thead>
              <tbody>
                {data.hiring.rows.map(([name, rating, status]) => (
                  <tr key={name}><td>{name}</td><td>{rating}</td><td>{status}</td></tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </div>
  );
}
