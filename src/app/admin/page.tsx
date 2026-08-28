"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import "../globals.css";
import type { AdminStats } from "@/app/api/admin/stats/route";

export const dynamic = "force-dynamic";

/** Deliberately plain. This page exists to get data out, not to look nice. */
function Admin() {
  const key = useSearchParams().get("key") ?? "";
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!key) return setError("Add ?key=… to the URL.");
    const res = await fetch(`/api/admin/stats?key=${encodeURIComponent(key)}`);
    if (!res.ok) return setError(res.status === 401 ? "Wrong key." : "Load failed.");
    setError("");
    setStats((await res.json()) as AdminStats);
  }, [key]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  async function act(action: string, playerId?: string) {
    setBusy(true);
    await fetch(`/api/admin/action?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, playerId }),
    });
    setBusy(false);
    void load();
  }

  const maxRuns = Math.max(1, ...(stats?.runsPerHour.map((r) => r.runs) ?? [1]));

  return (
    <main className="doc-page" style={S.page}>
      <h2 style={S.h}>E-Cell Agent Run — admin</h2>
      {error && <p style={S.err}>{error}</p>}
      {stats && (
        <>
          <div style={S.grid}>
            <Stat label="Players" value={stats.players} />
            <Stat label="Opted in" value={stats.optedIn} />
            <Stat label="Runs total" value={stats.runsTotal} />
            <Stat label="Runs 24h" value={stats.runsToday} />
            <Stat label="Rejected" value={stats.rejected} />
            <Stat label="Frozen" value={stats.frozen ? "YES" : "no"} />
          </div>

          <h3 style={S.h}>Funnel (24h)</h3>
          <p style={S.mono}>
            {["qr_open", "onboard_complete", "first_run", "run_end", "share"]
              .map((k) => `${k}: ${stats.funnel[k] ?? 0}`)
              .join("   ·   ")}
          </p>
          <p style={S.mono}>
            scan → first run:{" "}
            {stats.funnel.qr_open
              ? `${Math.round((100 * (stats.funnel.first_run ?? 0)) / stats.funnel.qr_open)}%`
              : "—"}{" "}
            (the number to watch)
          </p>

          <h3 style={S.h}>Runs per hour (UTC)</h3>
          <div style={S.scrollX}>
            <div style={S.chart}>
            {stats.runsPerHour.map((b) => (
              <div key={b.hour} style={S.bar} title={`${b.hour}: ${b.runs}`}>
                <div
                  style={{
                    ...S.barFill,
                    height: `${(b.runs / maxRuns) * 100}%`,
                  }}
                />
                <span style={S.barLabel}>{b.hour.slice(0, 2)}</span>
              </div>
            ))}
            </div>
          </div>

          <h3 style={S.h}>Export</h3>
          <p>
            <a href={`/api/admin/export?key=${encodeURIComponent(key)}`} style={S.link}>
              All players CSV
            </a>
            {" · "}
            <a
              href={`/api/admin/export?key=${encodeURIComponent(key)}&optedIn=1`}
              style={S.link}
            >
              Opted-in only CSV
            </a>
          </p>

          <h3 style={S.h}>Leaderboard freeze</h3>
          <button
            style={S.btn}
            disabled={busy}
            onClick={() => act(stats.frozen ? "unfreeze" : "freeze")}
          >
            {stats.frozen ? "Unfreeze leaderboard" : "Freeze leaderboard (end of fair)"}
          </button>

          <h3 style={S.h}>Recent sign-ups</h3>
          <div style={S.scrollX}>
          <table style={S.table}>
            <tbody>
              {stats.recent.map((p) => (
                <tr key={p.id}>
                  <td style={S.td}>{p.name}</td>
                  <td style={S.td}>{p.email}</td>
                  <td style={S.td}>{p.best}</td>
                  <td style={S.td}>{p.runs}</td>
                  <td style={S.td}>
                    <button
                      style={S.small}
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Hide ${p.name} from the leaderboard?`)) {
                          void act("soft_delete", p.id);
                        }
                      }}
                    >
                      hide
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p style={S.mono}>
            Hidden entries are soft-deleted: they keep their rows and can be restored
            with the API, they just leave the board.
          </p>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={S.stat}>
      <div style={S.statValue}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
    background: "#fff",
    color: "#111",
    padding: 20,
    minHeight: "100vh",
    width: "100%",
    maxWidth: 900,
    margin: "0 auto",
  },
  /* Wide children (24-bar chart, 5-column table) scroll in their own lane
     instead of forcing the whole page sideways on a phone. */
  scrollX: { overflowX: "auto", maxWidth: "100%" },
  h: { fontFamily: "inherit", fontSize: 18, margin: "22px 0 8px" },
  err: { color: "#b00" },
  mono: { fontSize: 13, lineHeight: 1.6, overflowWrap: "anywhere" },
  grid: { display: "flex", flexWrap: "wrap", gap: 10 },
  stat: { border: "1px solid #333", padding: "8px 12px", minWidth: 110 },
  statValue: { fontSize: 26, fontWeight: 700 },
  statLabel: { fontSize: 12, textTransform: "uppercase", color: "#555" },
  chart: { display: "flex", alignItems: "flex-end", gap: 3, height: 130, minWidth: 480 },
  bar: {
    flex: 1,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  barFill: { width: "100%", background: "#2c6fb5", minHeight: 2 },
  barLabel: { fontSize: 9, color: "#666" },
  table: { borderCollapse: "collapse", width: "100%", fontSize: 13, minWidth: 520 },
  td: { borderBottom: "1px solid #ddd", padding: "5px 6px" },
  link: { color: "#2c6fb5" },
  btn: { padding: "8px 12px", fontSize: 14, cursor: "pointer" },
  small: { fontSize: 11, cursor: "pointer" },
};

export default function AdminPage() {
  return (
    <Suspense fallback={<p style={{ padding: 20 }}>loading…</p>}>
      <Admin />
    </Suspense>
  );
}
