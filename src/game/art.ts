import { BLUE, GOLD, INK, PAPER, PURPLE, RED, TEAL } from "./palette";

/**
 * Every sprite in the game is drawn with paths — no image assets at all.
 * That keeps the first load tiny (the whole "art pack" is this file) and lets
 * the score card reuse the exact same character at poster resolution.
 *
 * The character is an original secret-agent platypus: teal body, wide bill,
 * paddle tail, fedora. No third-party character art is used anywhere.
 */

export type Pose = "run" | "jump" | "fall" | "slide" | "hit";

function ink(ctx: CanvasRenderingContext2D, lw: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
}

function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  lw = 3,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ink(ctx, lw);
  ctx.stroke();
}

/**
 * Draws the agent with its feet at (0,0), facing right, `h` tall.
 * `phase` drives the run cycle (radians).
 */
export function drawAgent(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  h: number,
  phase: number,
  lw = 3,
) {
  const u = h / 56; // unit scale: the standing character is 56 world px tall
  ctx.save();
  ctx.scale(u, u);
  // `lw` is a FINAL pixel width: undo the sprite scale so the ink outline stays
  // a comic line at any size, instead of swallowing the character on the
  // poster-sized score card.
  lw = lw / u;

  const sliding = pose === "slide";
  if (sliding) {
    ctx.translate(2, 0);
    ctx.rotate(-0.14);
  }

  const bodyY = sliding ? -13 : -30;
  const bodyRx = sliding ? 24 : 19;
  const bodyRy = sliding ? 12 : 17;

  // Tail (paddle), behind the body.
  ctx.save();
  ctx.translate(-bodyRx + 2, bodyY + (sliding ? 2 : 6));
  ctx.rotate(sliding ? 0.5 : 0.25 + Math.sin(phase) * 0.12);
  blob(ctx, -11, 0, 12, 6, "#0F7A70", lw);
  ctx.restore();

  // Legs.
  if (!sliding) {
    const swing = pose === "run" ? Math.sin(phase) : pose === "hit" ? 0.6 : -0.5;
    for (const [i, s] of [
      [0, swing],
      [1, -swing],
    ] as const) {
      ctx.save();
      ctx.translate(-2 + i * 9, bodyY + 13);
      ctx.rotate(s * 0.7);
      ink(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, 12);
      ctx.lineTo(7, 12);
      ctx.strokeStyle = "#E9873A";
      ctx.lineWidth = lw + 1;
      ctx.stroke();
      ctx.restore();
    }
  } else {
    ctx.save();
    ctx.translate(-14, bodyY + 8);
    ink(ctx, lw);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-10, 6);
    ctx.stroke();
    ctx.restore();
  }

  // Body.
  blob(ctx, 0, bodyY, bodyRx, bodyRy, TEAL, lw);

  // Belly patch.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(2, bodyY + 5, bodyRx * 0.6, bodyRy * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#3FC0B0";
  ctx.fill();
  ctx.restore();

  // Head.
  const headX = sliding ? 16 : 8;
  const headY = sliding ? bodyY - 6 : bodyY - 17;
  blob(ctx, headX, headY, 13, 12, TEAL, lw);

  // Bill.
  ctx.save();
  ctx.translate(headX + 9, headY + 3);
  ctx.rotate(sliding ? 0.1 : 0);
  blob(ctx, 7, 0, 10, 5, "#E9873A", lw);
  ctx.restore();

  // Eye.
  const eyeX = headX + 4;
  const eyeY = headY - 3;
  blob(ctx, eyeX, eyeY, 4.4, 4.4, PAPER, lw - 1);
  ctx.beginPath();
  if (pose === "hit") {
    // X eye.
    ink(ctx, lw - 0.5);
    ctx.moveTo(eyeX - 3, eyeY - 3);
    ctx.lineTo(eyeX + 3, eyeY + 3);
    ctx.moveTo(eyeX + 3, eyeY - 3);
    ctx.lineTo(eyeX - 3, eyeY + 3);
    ctx.stroke();
  } else {
    ctx.arc(eyeX + 1.4, eyeY, 2.1, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  }

  // Fedora.
  ctx.save();
  ctx.translate(headX - 1, headY - 9);
  ctx.rotate(sliding ? -0.15 : -0.05);
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 3.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#4A3B2A";
  ctx.fill();
  ink(ctx, lw);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.quadraticCurveTo(-7, -11, 0, -11);
  ctx.quadraticCurveTo(8, -11, 8, 0);
  ctx.closePath();
  ctx.fillStyle = "#6B5540";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8.5, -1.5);
  ctx.lineTo(8.5, -1.5);
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw + 1;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/** A ground "-inator" crate: generic mad-science machine in a box. */
export function drawCrate(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  variant: number,
  lw = 3,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, -h, w, h);
  ctx.fillStyle = variant === 1 ? "#C7532F" : "#D9A441";
  ctx.fill();
  ink(ctx, lw);
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(w * 0.18, -h * 0.78, w * 0.64, h * 0.36);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.stroke();

  // Dial.
  ctx.beginPath();
  ctx.arc(w * 0.5, -h * 0.28, Math.min(w, h) * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = RED;
  ctx.fill();
  ctx.stroke();

  // Bolts.
  ctx.fillStyle = INK;
  for (const [bx, by] of [
    [4, -4],
    [w - 4, -4],
    [4, -h + 4],
    [w - 4, -h + 4],
  ]) {
    ctx.beginPath();
    ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Antenna.
  ctx.beginPath();
  ctx.moveTo(w * 0.7, -h);
  ctx.lineTo(w * 0.85, -h - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w * 0.85, -h - 12, 3, 0, Math.PI * 2);
  ctx.fillStyle = variant === 2 ? "#8CC63F" : RED;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Tall stacked contraption — the held-jump obstacle. */
export function drawTower(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  variant: number,
  lw = 3,
) {
  ctx.save();
  const segs = 3;
  for (let i = 0; i < segs; i++) {
    const sy = -h + (i * h) / segs;
    const sh = h / segs;
    const inset = i === 1 ? 3 : 0;
    ctx.beginPath();
    ctx.rect(inset, sy, w - inset * 2, sh);
    ctx.fillStyle = i % 2 === 0 ? "#7B4BA8" : "#5C3A85";
    ctx.fill();
    ink(ctx, lw);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, sy + sh / 2, w * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = i === variant % segs ? "#8CC63F" : PAPER;
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(w / 2, -h);
  ctx.lineTo(w / 2, -h - 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, -h - 15, 4, 0, Math.PI * 2);
  ctx.fillStyle = RED;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Overhead beam emitter — the slide obstacle. */
export function drawLaser(
  ctx: CanvasRenderingContext2D,
  w: number,
  lo: number,
  hi: number,
  t: number,
  lw = 3,
  color = RED,
) {
  const h = hi - lo;
  ctx.save();
  // Emitter housing above the beam.
  ctx.beginPath();
  ctx.rect(-4, -hi - 26, w + 8, 26);
  ctx.fillStyle = "#4A4E69";
  ctx.fill();
  ink(ctx, lw);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, -hi - 13, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();

  // Beam.
  const pulse = 0.72 + 0.28 * Math.sin(t * 14);
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.rect(0, -hi, w, h);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.rect(0, -hi, w, h);
  ink(ctx, lw);
  ctx.stroke();
  // Zap lines inside the beam.
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const y = -hi + ((i + 0.5) * h) / 3;
    ctx.moveTo(0, y);
    ctx.lineTo(w * 0.35, y + 4 * Math.sin(t * 20 + i));
    ctx.lineTo(w * 0.7, y - 4 * Math.sin(t * 20 + i));
    ctx.lineTo(w, y);
  }
  ctx.strokeStyle = "#FFE9A8";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/**
 * Duck gate. The beam is a laser in another colour; the strip on the ground
 * underneath is what tells a first-timer the gap is a way through.
 */
export function drawGate(
  ctx: CanvasRenderingContext2D,
  w: number,
  lo: number,
  hi: number,
  t: number,
  lw = 3,
) {
  drawLaser(ctx, w, lo, hi, t, lw, PURPLE);
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 8);
  ctx.fillStyle = PURPLE;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.rect(i * (w / 4) + 2, -4, w / 4 - 4, 5);
    ctx.fill();
  }
  ctx.restore();
}

/** Hovering drone with a spinning rotor. */
export function drawDrone(
  ctx: CanvasRenderingContext2D,
  w: number,
  halfH: number,
  t: number,
  lw = 3,
) {
  ctx.save();
  ctx.translate(w / 2, 0);
  blob(ctx, 0, 0, w / 2, halfH, "#4A4E69", lw);
  ctx.beginPath();
  ctx.arc(3, -2, halfH * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = RED;
  ctx.fill();
  ink(ctx, lw - 1);
  ctx.stroke();
  // Rotor.
  const spin = Math.sin(t * 30) * (w / 2);
  ctx.beginPath();
  ctx.moveTo(0, -halfH - 2);
  ctx.lineTo(0, -halfH - 8);
  ink(ctx, lw);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-spin, -halfH - 9);
  ctx.lineTo(spin, -halfH - 9);
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.restore();
}

/** A collectible fedora. */
export function drawFedora(
  ctx: CanvasRenderingContext2D,
  r: number,
  golden: boolean,
  t: number,
  lw = 2.5,
) {
  ctx.save();
  if (golden) {
    ctx.rotate(Math.sin(t * 5) * 0.25);
    ctx.scale(1.15, 1.15);
  }
  const body = golden ? GOLD : "#6B5540";
  const brim = golden ? "#D8A215" : "#4A3B2A";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.35, r, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = brim;
  ctx.fill();
  ink(ctx, lw);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, r * 0.35);
  ctx.quadraticCurveTo(-r * 0.5, -r * 0.75, 0, -r * 0.75);
  ctx.quadraticCurveTo(r * 0.55, -r * 0.75, r * 0.55, r * 0.35);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, r * 0.1);
  ctx.lineTo(r * 0.6, r * 0.1);
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw + 0.5;
  ctx.stroke();
  if (golden) {
    ctx.strokeStyle = "#FFF3C4";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = t * 3 + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4);
      ctx.lineTo(Math.cos(a) * r * 1.9, Math.sin(a) * r * 1.9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Shield pickup: a kite shield, readable at 26px on a phone. */
export function drawShield(
  ctx: CanvasRenderingContext2D,
  r: number,
  t: number,
  lw = 2.5,
) {
  ctx.save();
  ctx.scale(1 + 0.06 * Math.sin(t * 4), 1 + 0.06 * Math.sin(t * 4));
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.85, -r * 0.5);
  ctx.quadraticCurveTo(r * 0.85, r * 0.5, 0, r);
  ctx.quadraticCurveTo(-r * 0.85, r * 0.5, -r * 0.85, -r * 0.5);
  ctx.closePath();
  ctx.fillStyle = BLUE;
  ctx.fill();
  ink(ctx, lw);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.35);
  ctx.lineTo(-r * 0.3, r * 0.25);
  ctx.strokeStyle = "#BFE0F0";
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.restore();
}

/** Magnet pickup: a horseshoe magnet with grey poles. */
export function drawMagnet(
  ctx: CanvasRenderingContext2D,
  r: number,
  t: number,
  lw = 2.5,
) {
  ctx.save();
  ctx.rotate(Math.sin(t * 4) * 0.2);
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.arc(0, r * 0.15, r * 0.62, Math.PI, 0);
  ctx.lineTo(r * 0.62, r * 0.7);
  ctx.lineTo(r * 0.24, r * 0.7);
  ctx.lineTo(r * 0.24, r * 0.15);
  ctx.arc(0, r * 0.15, r * 0.24, 0, Math.PI, true);
  ctx.lineTo(-r * 0.62, r * 0.7);
  ctx.closePath();
  ctx.fillStyle = RED;
  ctx.fill();
  ink(ctx, lw);
  ctx.stroke();
  ctx.fillStyle = "#D8D2C4";
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.rect(sx * r * 0.62 - (sx > 0 ? r * 0.38 : 0), r * 0.42, r * 0.38, r * 0.28);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Hand-lettered burst word: POW! / WHAM! */
export function drawBurst(
  ctx: CanvasRenderingContext2D,
  text: string,
  r: number,
  fill: string,
  font: string,
) {
  ctx.save();
  ctx.beginPath();
  const spikes = 11;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.68;
    const x = Math.cos(a) * rr * 1.25;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ink(ctx, 4);
  ctx.stroke();

  ctx.font = `${Math.round(r * 0.72)}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
