"use client";

import type { LeaderboardPayload } from "@/app/api/leaderboard/route";

interface Props {
  data: LeaderboardPayload | null;
  loading: boolean;
  myId: string | null;
  myName: string;
  onClose: () => void;
}

/**
 * Phone view: the top ten, your own row pinned underneath if you are not in
 * it, and — the bit that actually drives another run — exactly how many points
 * you are short.
 */
export default function Leaderboard({ data, loading, myId, myName, onClose }: Props) {
  const top = data?.top.slice(0, 10) ?? [];
  const inTop = top.some((r) => r.playerId === myId);

  return (
    <div className="overlay sheet">
      <h2>LEADERBOARD</h2>
      {data?.frozen && <div className="chip">FINAL · LOCKED IN</div>}
      <div className="panel">
        {loading && !data && <div className="sub">LOADING…</div>}
        {!loading && !data && (
          <div className="sub">
            Can&apos;t reach the leaderboard right now. Your score is saved and will
            go up automatically.
          </div>
        )}
        {data && (
          <table className="board">
            <tbody>
              {top.map((r) => (
                <tr key={r.playerId} className={r.playerId === myId ? "me" : ""}>
                  <td className="rank">#{r.rank}</td>
                  <td>{r.name}</td>
                  <td className="score">{r.score}</td>
                </tr>
              ))}
              {!inTop && data.me && (
                <tr className="me">
                  <td className="rank">#{data.me.rank}</td>
                  <td>{myName}</td>
                  <td className="score">{data.me.score}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {data?.me && !inTop && data.me.toTopTen > 0 && (
        <div className="sub">
          YOU&apos;RE #{data.me.rank} — {data.me.toTopTen} POINTS FROM THE TOP 10
        </div>
      )}
      {data && (
        <div className="sub">{data.totalPlayers} AGENTS ON THE BOARD</div>
      )}
      <div className="row">
        <button onClick={onClose}>BACK</button>
      </div>
    </div>
  );
}
