"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { FIXED_DT } from "@/game/constants";
import { createGame, score, step, type GameState } from "@/game/engine";
import { botInput, newBotMemory } from "@/game/bot";
import { Renderer } from "@/game/render";
import { InputController } from "@/game/input";
import { sfx } from "@/game/audio";
import { newSeed } from "@/game/rng";
import type { Input } from "@/game/types";

export type CanvasMode = "attract" | "playing" | "dead";

export interface RunResult {
  score: number;
  fedoras: number;
  durationMs: number;
  seed: number;
}

export interface GameHandle {
  /** Begins a run. Returns immediately; the result arrives via onGameOver. */
  start(seed?: number): void;
  toAttract(): void;
  /** Score as of this frame, for the booth display heartbeat. */
  liveScore(): number;
}

interface Props {
  mode: CanvasMode;
  best: number;
  showHint: boolean;
  dim: number;
  onGameOver: (r: RunResult) => void;
}

const NOTHING: Input = {
  jumpPressed: false,
  jumpHeld: false,
  slidePressed: false,
  slideHeld: false,
};

const GameCanvas = forwardRef<GameHandle, Props>(function GameCanvas(
  { mode, best, showHint, dim, onGameOver },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const modeRef = useRef<CanvasMode>(mode);
  const botRef = useRef(newBotMemory());
  const startedAtRef = useRef(0);
  const reportedRef = useRef(false);
  const propsRef = useRef({ best, showHint, dim, onGameOver });
  propsRef.current = { best, showHint, dim, onGameOver };

  useImperativeHandle(ref, () => ({
    start(seed?: number) {
      const s = createGame({ seed: seed ?? newSeed(), best: propsRef.current.best });
      stateRef.current = s;
      inputRef.current?.reset();
      startedAtRef.current = performance.now();
      reportedRef.current = false;
      modeRef.current = "playing";
    },
    toAttract() {
      stateRef.current = createGame({ seed: newSeed() });
      botRef.current = newBotMemory();
      modeRef.current = "attract";
    },
    liveScore() {
      const s = stateRef.current;
      return s ? score(s) : 0;
    },
  }));

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;
    const input = new InputController();
    input.attach(canvas);
    inputRef.current = input;
    if (!stateRef.current) stateRef.current = createGame({ seed: newSeed() });

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      // A backgrounded tab or a hitch must not fast-forward the world.
      if (dt > 0.25) dt = FIXED_DT;
      acc = Math.min(acc + dt, 0.25);

      const s = stateRef.current!;
      const m = modeRef.current;

      while (acc >= FIXED_DT) {
        acc -= FIXED_DT;
        if (m === "playing") {
          step(s, input.consume());
        } else if (m === "attract") {
          step(s, botInput(s, botRef.current));
          if (s.dead) {
            stateRef.current = createGame({ seed: newSeed() });
            botRef.current = newBotMemory();
            break;
          }
        } else {
          step(s, NOTHING);
        }
      }

      const cur = stateRef.current!;
      for (const f of cur.fx) {
        if (f.kind === "collect") sfx.collect();
        else if (f.kind === "golden") sfx.golden();
        else if (f.kind === "plough") sfx.plough();
        else if (f.kind === "magnet") sfx.magnet();
        else if (f.kind === "shield") sfx.shield();
        else if (f.kind === "shield_break") sfx.shieldBreak();
        else if (f.kind === "slide") sfx.slide();
        else if (f.kind === "jump") sfx.jump();
        else if (f.kind === "best") sfx.best();
        else if (f.kind === "death") sfx.death();
      }

      renderer.draw(cur, dt, {
        dim: propsRef.current.dim,
        showTapHint: propsRef.current.showHint,
        showHud: m !== "attract",
      });

      if (m === "playing" && cur.dead && !reportedRef.current) {
        reportedRef.current = true;
        modeRef.current = "dead";
        propsRef.current.onGameOver({
          score: score(cur),
          fedoras: cur.fedoras,
          durationMs: Math.round(cur.t * 1000),
          seed: cur.seed,
        });
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      input.detach();
    };
  }, []);

  return <canvas ref={canvasRef} className="game" />;
});

export default GameCanvas;
