import {
  BASE_SPEED,
  DRONE_HALF_H,
  GROUND_Y,
  MAX_MULT,
  PLAYER_H,
  PLAYER_SLIDE_H,
  PLAYER_W,
  PLAYER_X,
  WORLD_H,
  WORLD_W,
} from "./constants";
import {
  drawAgent,
  drawBurst,
  drawCrate,
  drawDrone,
  drawFedora,
  drawGate,
  drawLaser,
  drawMagnet,
  drawShield,
  drawTower,
} from "./art";
import type { GameState } from "./engine";
import { playerHeight, score } from "./engine";
import { obBox } from "./generator";
import { BLUE, COMIC_FONT, GOLD, INK, PAPER, PAPER_DARK, RED, SKY } from "./palette";
import type { Fx } from "./types";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  spin: number;
}

interface Burst {
  x: number;
  y: number;
  life: number;
  text: string;
  color: string;
}

/** Builds a small repeating halftone tile once, then reuses it as a pattern. */
function halftoneTile(size: number, dot: number, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const x = c.getContext("2d")!;
  x.fillStyle = color;
  for (const [px, py] of [
    [size * 0.25, size * 0.25],
    [size * 0.75, size * 0.75],
  ]) {
    x.beginPath();
    x.arc(px, py, dot, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

/** Pre-rendered drifting cloud band, so the sky above the action is not dead space. */
function cloudTile(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  let n = 91;
  const rnd = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const clouds: { cx: number; cy: number; r: number }[] = [];
  for (let i = 0; i < 3; i++) {
    clouds.push({
      cx: 40 + rnd() * (w - 150),
      cy: 26 + rnd() * (h - 54),
      r: 15 + rnd() * 13,
    });
  }
  // Sticker outline: the ink silhouette is drawn slightly larger underneath, so
  // the lobes read as one cloud instead of a pile of stroked ellipses.
  const puff = (cl: { cx: number; cy: number; r: number }, grow: number) => {
    x.beginPath();
    for (let k = 0; k < 4; k++) {
      x.ellipse(
        cl.cx + k * cl.r * 0.78,
        cl.cy - (k === 1 || k === 2 ? cl.r * 0.4 : 0),
        cl.r + grow,
        cl.r * 0.72 + grow,
        0,
        0,
        Math.PI * 2,
      );
    }
    x.fill();
  };
  x.fillStyle = "rgba(20,17,16,0.16)";
  for (const cl of clouds) puff(cl, 4);
  x.fillStyle = "rgba(255,255,255,0.9)";
  for (const cl of clouds) puff(cl, 0);
  return c;
}

/** Pre-rendered parallax strip of generic laboratory skyline. */
function skylineTile(w: number, h: number, fill: string, seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  x.fillStyle = fill;
  let px = 0;
  let n = seed;
  const rnd = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  while (px < w) {
    const bw = 26 + rnd() * 46;
    const bh = h * (0.35 + rnd() * 0.6);
    x.fillRect(px, h - bh, bw, bh);
    // Dome or chimney on top.
    if (rnd() > 0.55) {
      x.beginPath();
      x.arc(px + bw / 2, h - bh, bw * 0.36, Math.PI, 0);
      x.fill();
    } else {
      x.fillRect(px + bw * 0.6, h - bh - 12, 6, 12);
    }
    px += bw + 8 + rnd() * 14;
  }
  return c;
}

/** Highest point the player can ever reach, plus a little air. */
const MIN_HEADROOM = 400;

export interface DrawOpts {
  /** Fades the whole scene towards paper (used behind menus). */
  dim?: number;
  showTapHint?: boolean;
  showHud?: boolean;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private halftone: CanvasPattern | null = null;
  private far: HTMLCanvasElement;
  private mid: HTMLCanvasElement;
  private clouds: HTMLCanvasElement;
  private sky: CanvasGradient | null = null;
  private particles: Particle[] = [];
  private bursts: Burst[] = [];
  private shake = 0;
  private runPhase = 0;
  /** CSS pixels. */
  w = 0;
  h = 0;
  scale = 1;
  worldH = WORLD_H;
  groundY = GROUND_Y;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    const tile = halftoneTile(10, 1.7, "rgba(20,17,16,0.16)");
    this.halftone = this.ctx.createPattern(tile, "repeat");
    this.far = skylineTile(WORLD_W, 150, "#9DC7DC", 7);
    this.mid = skylineTile(WORLD_W, 110, "#6E9EBB", 19);
    this.clouds = cloudTile(WORLD_W, 120);
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The world is always WORLD_W wide; taller screens simply show more sky.
    this.scale = this.w / WORLD_W;
    this.worldH = this.h / this.scale;
    // Sit the ground line at ~70% of the screen so the run happens in the
    // middle of the phone rather than down by the home bar, and so there is
    // always room above for the highest jump plus the tallest obstacle.
    this.groundY = Math.min(
      this.worldH - 90,
      Math.max(MIN_HEADROOM, this.worldH * 0.78),
    );
    this.sky = null;
  }

  addShake(a: number): void {
    this.shake = Math.min(18, this.shake + a);
  }

  private spawnParticles(
    x: number,
    y: number,
    n: number,
    color: string,
    speed: number,
  ) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 90) break;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        life: 0,
        max: 0.4 + Math.random() * 0.4,
        size: 2 + Math.random() * 3.5,
        color,
        spin: Math.random() * 6,
      });
    }
  }

  /** Turn engine events into juice. */
  private consume(s: GameState) {
    if (!s.fx.length) return;
    for (const f of s.fx as Fx[]) {
      const sy = this.groundY - f.y;
      switch (f.kind) {
        case "collect":
          this.spawnParticles(f.x, sy, 7, GOLD, 150);
          break;
        case "golden":
          this.spawnParticles(f.x, sy, 26, GOLD, 260);
          this.bursts.push({ x: f.x, y: sy - 40, life: 0, text: "ZAP!", color: GOLD });
          this.addShake(6);
          break;
        case "plough":
          this.spawnParticles(f.x, sy, 14, RED, 220);
          this.bursts.push({ x: f.x, y: sy - 30, life: 0, text: "POW!", color: RED });
          this.addShake(5);
          break;
        case "death":
          this.spawnParticles(PLAYER_X + PLAYER_W / 2, sy - 20, 34, RED, 300);
          this.addShake(16);
          break;
        case "land":
          this.spawnParticles(PLAYER_X + 6, this.groundY, 4, PAPER_DARK, 90);
          break;
        case "slide":
          // Sliding was the one action with no feedback at all.
          this.spawnParticles(PLAYER_X - 2, this.groundY, 10, PAPER_DARK, 130);
          break;
        case "magnet":
          this.spawnParticles(f.x, sy, 16, RED, 200);
          this.bursts.push({ x: f.x, y: sy - 34, life: 0, text: "MAGNET!", color: RED });
          break;
        case "shield":
          this.spawnParticles(f.x, sy, 16, BLUE, 200);
          this.bursts.push({ x: f.x, y: sy - 34, life: 0, text: "SHIELD!", color: BLUE });
          break;
        case "shield_break":
          this.spawnParticles(PLAYER_X + PLAYER_W / 2, sy - 20, 24, BLUE, 260);
          this.bursts.push({
            x: PLAYER_X + 60,
            y: sy - 40,
            life: 0,
            text: "BLOCKED!",
            color: BLUE,
          });
          this.addShake(11);
          break;
        case "nearmiss":
          this.spawnParticles(PLAYER_X + PLAYER_W, sy - 10, 3, PAPER_DARK, 110);
          break;
        case "best":
          this.bursts.push({
            x: PLAYER_X + 60,
            y: this.groundY - 150,
            life: 0,
            text: "NEW BEST!",
            color: "#2C6FB5",
          });
          break;
      }
    }
    s.fx.length = 0;
  }

  private stepFx(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 620 * dt;
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      this.bursts[i].life += dt;
      if (this.bursts[i].life > 0.8) this.bursts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 46);
  }

  draw(s: GameState, dt: number, opts: DrawOpts = {}): void {
    const ctx = this.ctx;
    const camX = s.camX;
    this.consume(s);
    this.stepFx(dt);
    if (!s.dead) this.runPhase += dt * (8 + (s.speed / BASE_SPEED) * 6);

    ctx.save();
    ctx.scale(this.scale, this.scale);

    const shx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake ? (Math.random() - 0.5) * this.shake : 0;

    // ---- Sky ----
    if (!this.sky) {
      const g = ctx.createLinearGradient(0, 0, 0, this.groundY);
      g.addColorStop(0, "#8EC5E0");
      g.addColorStop(0.62, SKY);
      g.addColorStop(1, "#E8F1F4");
      this.sky = g;
    }
    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, WORLD_W, this.worldH);
    if (this.halftone) {
      ctx.save();
      ctx.fillStyle = this.halftone;
      ctx.fillRect(0, 0, WORLD_W, this.groundY);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(shx, shy);

    // ---- Parallax ----
    this.strip(this.clouds, camX * 0.04, Math.max(6, this.groundY - 560));
    this.strip(this.clouds, camX * 0.07, Math.max(90, this.groundY - 400));
    this.strip(this.far, camX * 0.12, this.groundY - 150);
    this.strip(this.mid, camX * 0.32, this.groundY - 96);

    // ---- Ground ----
    ctx.fillStyle = "#C7B292";
    ctx.fillRect(0, this.groundY, WORLD_W, this.worldH - this.groundY);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(WORLD_W, this.groundY);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(20,17,16,0.35)";
    ctx.beginPath();
    const dash = 34;
    const off = camX % dash;
    for (let x = -off; x < WORLD_W + dash; x += dash) {
      ctx.moveTo(x, this.groundY + 12);
      ctx.lineTo(x + 16, this.groundY + 12);
      ctx.moveTo(x + 8, this.groundY + 28);
      ctx.lineTo(x + 26, this.groundY + 28);
    }
    ctx.stroke();

    // Foreground earth: hatched ink band that doubles as the comic gutter, with
    // a caption strip along the very bottom of the panel.
    const bandTop = this.groundY + 46;
    if (bandTop < this.worldH) {
      ctx.fillStyle = "#8C7457";
      ctx.fillRect(0, bandTop, WORLD_W, this.worldH - bandTop);
      ctx.strokeStyle = "rgba(20,17,16,0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, bandTop);
      ctx.lineTo(WORLD_W, bandTop);
      ctx.stroke();
      ctx.strokeStyle = "rgba(20,17,16,0.22)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      const hatch = 26;
      const hoff = (camX * 1.35) % hatch;
      for (let x = -hoff; x < WORLD_W + hatch; x += hatch) {
        ctx.moveTo(x, this.worldH);
        ctx.lineTo(x + 34, bandTop);
      }
      ctx.stroke();

      const capH = Math.min(46, this.worldH - bandTop);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, this.worldH - capH, WORLD_W, capH);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, this.worldH - capH);
      ctx.lineTo(WORLD_W, this.worldH - capH);
      ctx.stroke();
      ctx.font = `20px ${COMIC_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = INK;
      ctx.fillText(
        "E-CELL · SNU CLUB FAIR · TOP 4 WIN A GIFT",
        WORLD_W / 2,
        this.worldH - capH / 2 + 2,
      );
      ctx.textBaseline = "alphabetic";
    }

    // ---- Speed lines ----
    const mult = s.speed / BASE_SPEED;
    if (mult > 1.25 && !s.dead) {
      const a = Math.min(0.4, (mult - 1.25) / (MAX_MULT - 1.25) * 0.4);
      ctx.strokeStyle = `rgba(20,17,16,${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const y = ((i * 97 + ((camX * 1.6) % 400)) % (this.groundY - 40)) + 20;
        const len = 40 + ((i * 37) % 60);
        const x = WORLD_W - ((camX * 1.9 + i * 130) % (WORLD_W + 200));
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
      }
      ctx.stroke();
    }

    // ---- Obstacles ----
    for (const o of s.obstacles) {
      const x = o.x - camX;
      if (x > WORLD_W + 60 || x + o.w < -60) continue;
      ctx.save();
      ctx.translate(x, this.groundY);
      if (o.kind === "crate") drawCrate(ctx, o.w, o.yHigh, o.variant);
      else if (o.kind === "tower") drawTower(ctx, o.w, o.yHigh, o.variant);
      else if (o.kind === "laser") drawLaser(ctx, o.w, o.yLow, o.yHigh, s.t);
      else if (o.kind === "gate") drawGate(ctx, o.w, o.yLow, o.yHigh, s.t);
      else {
        const box = obBox(o, s.t);
        ctx.translate(0, -(box.lo + DRONE_HALF_H));
        drawDrone(ctx, o.w, DRONE_HALF_H, s.t);
      }
      ctx.restore();
    }

    // First-run coaching. The gate is the one obstacle a jump cannot answer,
    // so it gets labelled at the moment the player can first see it coming —
    // which teaches the mechanic far better than a line of text at the top.
    if (opts.showTapHint) {
      for (const o of s.obstacles) {
        if (o.kind !== "gate") continue;
        const gx = o.x - camX;
        if (gx < -o.w || gx > WORLD_W) continue;
        const cx = gx + o.w / 2;
        const cy = this.groundY - 210;
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = `32px ${COMIC_FONT}`;
        ctx.lineWidth = 7;
        ctx.strokeStyle = INK;
        ctx.fillStyle = PAPER;
        ctx.strokeText("DUCK!", cx, cy);
        ctx.fillText("DUCK!", cx, cy);
        ctx.beginPath();
        ctx.moveTo(cx - 13, cy + 16);
        ctx.lineTo(cx, cy + 30);
        ctx.lineTo(cx + 13, cy + 16);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.strokeStyle = PAPER;
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.restore();
        break;
      }
    }

    // ---- Fedoras ----
    for (const c of s.coins) {
      if (c.taken) continue;
      const x = c.x - camX;
      if (x > WORLD_W + 40 || x < -40) continue;
      ctx.save();
      ctx.translate(x, this.groundY - c.y);
      if (c.power === "magnet") drawMagnet(ctx, 13, s.t);
      else if (c.power === "shield") drawShield(ctx, 13, s.t);
      else drawFedora(ctx, c.power ? 13 : 11, c.power === "golden", s.t);
      ctx.restore();
    }

    // ---- Speed lines ----
    // Drawn directly rather than as particles, to stay clear of the 90-particle
    // cap the frame budget depends on.
    const speedMult = s.speed / BASE_SPEED;
    if (speedMult > 1.7 && !s.dead) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.3, (speedMult - 1.7) * 0.55);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const y = ((i * 97 + ((s.t * 260) % 97)) % this.worldH) * 0.82;
        const len = 40 + ((i * 37) % 60);
        const x = WORLD_W - ((s.t * 900 + i * 130) % (WORLD_W + 120));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- Player ----
    const p = s.player;
    const ph = playerHeight(p);
    const pose = s.dead
      ? "hit"
      : ph === PLAYER_SLIDE_H
        ? "slide"
        : !p.onGround
          ? p.vy > 0
            ? "jump"
            : "fall"
          : "run";
    ctx.save();
    ctx.translate(PLAYER_X + PLAYER_W / 2, this.groundY - p.y);
    if (s.invT > 0) {
      // Golden-fedora aura.
      ctx.save();
      // Flashing out over its last second, so it never seems to stop for no
      // reason.
      ctx.globalAlpha =
        s.invT < 1 && Math.sin(s.t * 30) < 0 ? 0.12 : 0.35 + 0.25 * Math.sin(s.t * 18);
      ctx.beginPath();
      ctx.ellipse(0, -PLAYER_H * 0.55, 40, 44, 0, 0, Math.PI * 2);
      ctx.fillStyle = GOLD;
      ctx.fill();
      ctx.restore();
    }
    if (s.magnetT > 0) {
      // Pulsing ring, flashing out over the last second.
      ctx.save();
      ctx.globalAlpha = s.magnetT < 1 && Math.sin(s.t * 30) < 0 ? 0.15 : 0.55;
      ctx.beginPath();
      ctx.arc(0, -PLAYER_H * 0.55, 34 + 5 * Math.sin(s.t * 9), 0, Math.PI * 2);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    if (s.shield) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(0, -PLAYER_H * 0.5, 36, 42, 0, 0, Math.PI * 2);
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = BLUE;
      ctx.fill();
      ctx.restore();
    }
    if (s.dead) ctx.rotate(0.35);
    drawAgent(ctx, pose, pose === "slide" ? PLAYER_SLIDE_H * 2 : PLAYER_H, this.runPhase);
    ctx.restore();

    // ---- Particles ----
    for (const q of this.particles) {
      const k = 1 - q.life / q.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, k);
      ctx.translate(q.x, q.y);
      ctx.rotate(q.spin * q.life * 4);
      ctx.fillStyle = q.color;
      ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(-q.size / 2, -q.size / 2, q.size, q.size);
      ctx.restore();
    }

    // ---- Burst words ----
    for (const b of this.bursts) {
      const k = b.life / 0.8;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(b.x, b.y - k * 26);
      ctx.rotate(-0.12 + Math.sin(b.life * 12) * 0.05);
      const sc = 0.7 + k * 0.5;
      ctx.scale(sc, sc);
      drawBurst(ctx, b.text, b.text.length > 5 ? 52 : 34, b.color, COMIC_FONT);
      ctx.restore();
    }

    ctx.restore(); // shake

    if (s.dead) this.deathOverlay(ctx);
    if (opts.showHud) this.hud(ctx, s);
    if (opts.showTapHint) this.tapHint(ctx);
    if (opts.dim) {
      ctx.fillStyle = `rgba(246,238,220,${opts.dim})`;
      ctx.fillRect(0, 0, WORLD_W, this.worldH);
    }

    // Comic panel border, always on top.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, WORLD_W - 8, this.worldH - 8);

    ctx.restore();
  }

  private strip(tile: HTMLCanvasElement, offset: number, y: number) {
    const ctx = this.ctx;
    const w = tile.width;
    let x = -(offset % w);
    while (x < WORLD_W) {
      ctx.drawImage(tile, x, y);
      x += w;
    }
  }

  private deathOverlay(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = "rgba(20,17,16,0.12)";
    ctx.fillRect(0, 0, WORLD_W, this.worldH);
    ctx.translate(WORLD_W / 2, this.groundY - 190);
    ctx.rotate(-0.08);
    drawBurst(ctx, "WHAM!", 74, RED, COMIC_FONT);
    ctx.restore();
  }

  private hud(ctx: CanvasRenderingContext2D, s: GameState) {
    const val = score(s);
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.font = `44px ${COMIC_FONT}`;
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    ctx.fillStyle = PAPER;
    const text = String(val);
    ctx.strokeText(text, WORLD_W - 22, 22);
    ctx.fillText(text, WORLD_W - 22, 22);
    ctx.font = `17px ${COMIC_FONT}`;
    ctx.lineWidth = 4;
    ctx.strokeText("SCORE", WORLD_W - 22, 68);
    ctx.fillStyle = GOLD;
    ctx.fillText("SCORE", WORLD_W - 22, 68);

    if (s.invT > 0) {
      ctx.textAlign = "left";
      ctx.font = `26px ${COMIC_FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.strokeText(`INVINCIBLE ${s.invT.toFixed(1)}`, 22, 24);
      ctx.fillStyle = GOLD;
      ctx.fillText(`INVINCIBLE ${s.invT.toFixed(1)}`, 22, 24);
    }
    if (s.magnetT > 0) {
      ctx.textAlign = "left";
      ctx.font = `26px ${COMIC_FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      const y = s.invT > 0 ? 52 : 24;
      ctx.strokeText(`MAGNET ${s.magnetT.toFixed(1)}`, 22, y);
      ctx.fillStyle = RED;
      ctx.fillText(`MAGNET ${s.magnetT.toFixed(1)}`, 22, y);
    }
    ctx.restore();
  }

  private tapHint(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `24px ${COMIC_FONT}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.fillStyle = PAPER;
    const y = this.groundY - 240;
    ctx.strokeText("TAP TO JUMP · HOLD FOR HIGHER", WORLD_W / 2, y);
    ctx.fillText("TAP TO JUMP · HOLD FOR HIGHER", WORLD_W / 2, y);
    ctx.strokeText("HOLD LOW TO DUCK · STAY DOWN", WORLD_W / 2, y + 30);
    ctx.fillText("HOLD LOW TO DUCK · STAY DOWN", WORLD_W / 2, y + 30);
    ctx.restore();
  }
}
