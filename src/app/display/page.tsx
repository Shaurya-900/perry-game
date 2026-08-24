"use client";

import { useEffect, useRef, useState } from "react";
import "../globals.css";
import "./display.css";
import type { LeaderboardPayload } from "@/app/api/leaderboard/route";
import { qrDataUrl, gameUrl } from "@/lib/qr";

/**
 * The booth display. Designed to be read from three metres away on whatever
 * monitor is at the stall: ten rows, huge type, and a QR big enough to scan
 * from the queue. Polls every 5 seconds — a new score is on the wall within
 * the five second window the brief asks for.
 */
export default function Display() {
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [error, setError] = useState(false);
  const prevRanks = useRef<Map<string, number>>(new Map());
  const [moved, setMoved] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const json = (await res.json()) as LeaderboardPayload;
        if (!alive) return;
        const changed = new Set<string>();
        for (const row of json.top) {
          const before = prevRanks.current.get(row.playerId);
          if (before === undefined || before > row.rank) changed.add(row.playerId);
        }
        prevRanks.current = new Map(json.top.map((r) => [r.playerId, r.rank]));
        setMoved(changed);
        setData(json);
        setError(false);
      } catch {
        if (alive) setError(true);
      }
    }
    void poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Generated on the client only: the QR needs a canvas.
  const [qr, setQr] = useState("");
  useEffect(() => setQr(qrDataUrl(gameUrl(), 420)), []);
  const rows = data?.top.slice(0, 10) ?? [];

  return (
    <div className="display">
      <div className="head">
        <div className="title">
          E-CELL AGENT RUN
          <small>SHIV NADAR UNIVERSITY · CLUB FAIR</small>
        </div>
        <div className="counter">
          PLAYERS TODAY
          <b>{data?.playersToday ?? "—"}</b>
        </div>
      </div>

      <div className="lb-rows">
        {rows.map((r, i) => (
          <div
            key={r.playerId}
            className={`lb-row top${i + 1} ${moved.has(r.playerId) ? "moved" : ""}`}
          >
            <span className="rank">#{r.rank}</span>
            <span className="name">{r.name}</span>
            <span className="score">{r.score}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="empty">
            {error ? "RECONNECTING…" : "NO AGENTS YET. BE THE FIRST."}
          </div>
        )}
      </div>

      <div className="foot">
        <div className="cta">
          SCAN TO PLAY <span>· TOP 4 WIN AN E-CELL GIFT</span>
          {data?.frozen && <div className="frozen">LEADERBOARD FINAL</div>}
        </div>
        <div className="qr">{qr && <img src={qr} alt="Scan to play" />}</div>
      </div>
    </div>
  );
}
