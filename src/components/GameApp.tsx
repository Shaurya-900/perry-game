"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameCanvas, { type CanvasMode, type GameHandle, type RunResult } from "./GameCanvas";
import Onboarding from "./Onboarding";
import PostRun from "./PostRun";
import Leaderboard from "./Leaderboard";
import {
  loadPlayer,
  makePlayer,
  savePlayer,
  type LocalPlayer,
} from "@/lib/client/player";
import {
  fetchLeaderboard,
  flushQueue,
  registerPlayer,
  sendLive,
  startRun,
  submitRun,
  track,
  type SubmitResult,
} from "@/lib/client/api";
import type { LeaderboardPayload } from "@/app/api/leaderboard/route";
import { loadMuted, setMuted as setAudioMuted, sfx } from "@/game/audio";
import { parseChallenge, type Challenge } from "@/lib/qr";

type Phase = "boot" | "onboarding" | "ready" | "playing" | "over";

/** A token is refreshed well before the server's ten minute window closes. */
const TOKEN_MAX_AGE = 7 * 60 * 1000;

export default function GameApp() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [player, setPlayer] = useState<LocalPlayer | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [pending, setPending] = useState(false);
  const [queued, setQueued] = useState(false);
  const [isBest, setIsBest] = useState(false);
  const [board, setBoard] = useState<LeaderboardPayload | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardLoading, setBoardLoading] = useState(false);
  const [muted, setMuted] = useState(true);
  const [challenge, setChallenge] = useState<Challenge | null>(null);

  const gameRef = useRef<GameHandle>(null);
  const tokenRef = useRef<{ token: string; seed: number; at: number } | null>(null);
  /**
   * The token the run currently in progress will submit with. Held separately
   * so the NEXT run's token can be fetched while this one is being played.
   */
  const runTokenRef = useRef<{ token: string; seed: number; at: number } | null>(null);
  const playerRef = useRef<LocalPlayer | null>(null);
  playerRef.current = player;
  const challengeRef = useRef<Challenge | null>(null);
  challengeRef.current = challenge;

  const persist = useCallback((p: LocalPlayer) => {
    playerRef.current = p;
    savePlayer(p);
    setPlayer({ ...p });
  }, []);

  /** Pull a signed run token ahead of time so tapping PLAY is instant. */
  const primeToken = useCallback(async () => {
    const p = playerRef.current;
    if (!p?.playerId) return;
    const cur = tokenRef.current;
    if (cur && Date.now() - cur.at < TOKEN_MAX_AGE) return;
    const res = await startRun(p.playerId, challengeRef.current?.seed);
    if (res?.token) tokenRef.current = { ...res, at: Date.now() };
  }, []);

  const register = useCallback(
    async (p: LocalPlayer) => {
      const res = await registerPlayer(p);
      if (!res) return;
      const next = {
        ...playerRef.current!,
        playerId: res.playerId,
        best: Math.max(playerRef.current!.best, res.best),
      };
      persist(next);
      void primeToken();
    },
    [persist, primeToken],
  );

  // Boot: remember the player, retry anything the wifi ate, count the scan.
  useEffect(() => {
    setMuted(loadMuted());
    track("qr_open");
    const invite = parseChallenge(window.location.search);
    if (invite) {
      setChallenge(invite);
      challengeRef.current = invite;
      track("challenge_open");
    }
    void flushQueue();
    const p = loadPlayer();
    if (p) {
      playerRef.current = p;
      setPlayer(p);
      setPhase("ready");
      void register(p);
    } else {
      setPhase("onboarding");
      track("onboard_start");
    }
  }, [register]);

  const refreshBoard = useCallback(async () => {
    setBoardLoading(true);
    const data = await fetchLeaderboard(playerRef.current?.playerId ?? null);
    setBoard(data);
    setBoardLoading(false);
  }, []);

  function onboard(name: string, email: string, optedIn: boolean) {
    const p = makePlayer(name, email, optedIn);
    persist(p);
    setPhase("ready");
    track("onboard_complete");
    void register(p);
  }

  function play() {
    const p = playerRef.current;
    if (!p) return;
    sfx.tap();
    setSubmitted(null);
    setIsBest(false);
    setQueued(false);
    setRun(null);
    // Claim this run's token and immediately start fetching the next one, so
    // the whole run is available to cover that request. Fetching it at game
    // over instead meant an instant PLAY AGAIN raced the network and the run
    // came out untokenised — which is silently unscoreable.
    runTokenRef.current = tokenRef.current;
    tokenRef.current = null;
    void primeToken();
    gameRef.current?.start(runTokenRef.current?.seed);
    setPhase("playing");
    track(p.runsToday === 0 ? "first_run" : "run_start");
    if (challengeRef.current) track("challenge_accepted");
  }

  const onGameOver = useCallback(
    async (r: RunResult) => {
      const p = playerRef.current;
      setRun(r);
      setPhase("over");
      track("run_end");
      if (!p) return;

      const beat = r.score > p.best;
      setIsBest(beat);
      persist({
        ...p,
        best: Math.max(p.best, r.score),
        runsToday: p.runsToday + 1,
      });

      // Beating the challenge retires it, so the next token comes back with a
      // fresh random course instead of replaying the same one forever.
      const ch = challengeRef.current;
      if (ch && r.score > ch.score) {
        challengeRef.current = null;
        setChallenge(null);
      }

      const tok = runTokenRef.current;
      runTokenRef.current = null;
      if (!tok) {
        setQueued(false);
        return;
      }

      setQueued(true);
      setPending(true);
      const res = await submitRun({
        token: tok.token,
        score: r.score,
        durationMs: r.durationMs,
        fedoras: r.fedoras,
        at: Date.now(),
      });
      setPending(false);
      if (res) {
        setSubmitted(res);
        const cur = playerRef.current!;
        if (res.best > cur.best) persist({ ...cur, best: res.best });
        void refreshBoard();
      }
    },
    [persist, primeToken, refreshBoard],
  );

  useEffect(() => {
    if (phase === "ready" || phase === "over") void primeToken();
  }, [phase, primeToken]);

  // Feed the booth display while a run is in progress. No "run ended" call:
  // letting the row go stale handles a closed tab identically, for free.
  useEffect(() => {
    if (phase !== "playing") return;
    const token = runTokenRef.current?.token;
    if (!token) return;
    const id = setInterval(() => {
      sendLive(token, gameRef.current?.liveScore() ?? 0);
    }, 2500);
    return () => clearInterval(id);
  }, [phase]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setAudioMuted(next);
    if (!next) sfx.tap();
  }

  function openBoard() {
    setBoardOpen(true);
    track("leaderboard_view");
    void refreshBoard();
  }

  const canvasMode: CanvasMode =
    phase === "playing" ? "playing" : phase === "over" ? "dead" : "attract";

  return (
    <div className="stage">
      <GameCanvas
        ref={gameRef}
        mode={canvasMode}
        best={player?.best ?? 0}
        showHint={phase === "playing" && (player?.runsToday ?? 0) === 0}
        dim={phase === "ready" ? 0.32 : 0}
        onGameOver={onGameOver}
      />

      {phase !== "playing" && (
        <button className="mute" onClick={toggleMute}>
          {muted ? "SOUND OFF" : "SOUND ON"}
        </button>
      )}

      {phase === "onboarding" && <Onboarding onDone={onboard} />}

      {phase === "ready" && player && !boardOpen && (
        <div className="overlay">
          <h1>AGENT RUN</h1>
          <div className="sub">
            {player.best > 0 ? `YOUR BEST: ${player.best}` : "DODGE THE -INATORS"}
          </div>
          {challenge && (
            <div className="challenge">
              {challenge.name.toUpperCase()} CHALLENGED YOU
              <b>BEAT {challenge.score}</b>
              <span>same course, same obstacles</span>
            </div>
          )}
          {player.runsToday === 0 && (
            <div className="howto">
              <b>HOW TO PLAY</b>
              <div className="line">
                <span className="key">TAP</span>
                <span>JUMP · HOLD = HIGHER</span>
              </div>
              <div className="line duck">
                <span className="key">HOLD LOW</span>
                <span>DUCK · STAY DOWN</span>
              </div>
              <div className="line duck">
                <span className="key">PURPLE</span>
                <span>NO JUMP — DUCK IT</span>
              </div>
              <div className="line">
                <span className="key">FEDORAS</span>
                <span>POINTS · SHIELD = 1 HIT</span>
              </div>
            </div>
          )}
          <div className="row">
            <button className="primary" onClick={play}>
              PLAY
            </button>
          </div>
          <div className="row">
            <button className="ghost" onClick={openBoard}>
              LEADERBOARD
            </button>
          </div>
          <div className="sub">RUNS TODAY: {player.runsToday}</div>
          <div className="sub">TOP 4 AT THE END OF THE FAIR WIN AN E-CELL GIFT</div>
        </div>
      )}

      {phase === "over" && run && player && !boardOpen && (
        <PostRun
          run={run}
          best={player.best}
          isBest={isBest}
          submitted={submitted}
          pending={pending}
          queued={queued}
          runsToday={player.runsToday}
          name={player.name}
          onPlayAgain={play}
          onLeaderboard={openBoard}
        />
      )}

      {boardOpen && (
        <Leaderboard
          data={board}
          loading={boardLoading}
          myId={player?.playerId ?? null}
          myName={player?.name ?? "You"}
          onClose={() => setBoardOpen(false)}
        />
      )}

      <div className="rotate-note">TURN YOUR PHONE UPRIGHT, AGENT.</div>
    </div>
  );
}
