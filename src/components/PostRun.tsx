"use client";

import { useState } from "react";
import type { RunResult } from "./GameCanvas";
import type { SubmitResult } from "@/lib/client/api";
import { shareScoreCard, quipFor } from "@/lib/client/scorecard";
import { track } from "@/lib/client/api";

interface Props {
  run: RunResult;
  best: number;
  isBest: boolean;
  submitted: SubmitResult | null;
  pending: boolean;
  /** The run had a signed token, so a failed send will be retried later. */
  queued: boolean;
  runsToday: number;
  name: string;
  onPlayAgain: () => void;
  onLeaderboard: () => void;
}

/**
 * Button order is deliberate: Play Again is the biggest thing on the screen
 * because booth throughput depends on it, Share is second because it is what
 * pulls in people who never walked past the stall.
 */
export default function PostRun({
  run,
  best,
  isBest,
  submitted,
  pending,
  queued,
  runsToday,
  name,
  onPlayAgain,
  onLeaderboard,
}: Props) {
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState("");

  async function share() {
    setSharing(true);
    setShareNote("");
    const result = await shareScoreCard({
      name,
      score: run.score,
      rank: submitted?.rank ?? null,
      totalPlayers: submitted?.totalPlayers ?? null,
      fedoras: run.fedoras,
      seconds: run.durationMs / 1000,
      seed: run.seed,
      isBest,
    });
    setSharing(false);
    track(result === "shared" ? "share" : "share_fallback");
    if (result === "downloaded") setShareNote("Saved to your downloads.");
    if (result === "failed") setShareNote("Couldn't build the card — try again.");
  }

  return (
    <div className="overlay sheet">
      {isBest && <div className="chip">NEW PERSONAL BEST</div>}
      <h1>{run.score}</h1>
      <div className="sub">{quipFor(run.score)}</div>
      <div className="row" style={{ justifyContent: "center" }}>
        <span className="chip">BEST {best}</span>
        <span className="chip">{run.fedoras} FEDORAS</span>
        <span className="chip">{(run.durationMs / 1000).toFixed(1)}s</span>
      </div>
      {submitted && (
        <div className="sub">
          RANK #{submitted.rank} OF {submitted.totalPlayers}
        </div>
      )}
      {!submitted && !pending && (
        <div className="sub">
          {queued
            ? "SAVED ON THIS PHONE — WILL SYNC WHEN WIFI RETURNS"
            : "SAVED ON THIS PHONE — OFFLINE, SO IT IS NOT ON THE BOARD"}
        </div>
      )}
      {pending && <div className="sub">SENDING TO THE BOARD…</div>}

      <div className="row">
        <button className="primary" onClick={onPlayAgain}>
          PLAY AGAIN
        </button>
      </div>
      <div className="row">
        <button className="gold" onClick={share} disabled={sharing}>
          {sharing ? "BUILDING…" : "SHARE SCORE"}
        </button>
      </div>
      <div className="row">
        <button className="ghost" onClick={onLeaderboard}>
          VIEW LEADERBOARD
        </button>
      </div>
      <div className="sub">RUNS TODAY: {runsToday}</div>
      {shareNote && <div className="sub">{shareNote}</div>}
    </div>
  );
}
