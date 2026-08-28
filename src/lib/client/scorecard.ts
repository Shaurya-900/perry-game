"use client";

import { drawAgent, drawBurst, drawFedora } from "@/game/art";
import { COMIC_FONT, GOLD, INK, PAPER, PAPER_DARK, RED, SKY } from "@/game/palette";
import { challengeUrl, drawQr, gameUrl } from "@/lib/qr";
import { firstName } from "./player";

export interface CardData {
  name: string;
  score: number;
  rank: number | null;
  totalPlayers: number | null;
  fedoras: number;
  seconds: number;
  /** The course this run was played on, so the card's QR is a challenge. */
  seed: number;
  /** Earns the ribbon across the hero panel. */
  isBest?: boolean;
}

/** A different jab for every score band — the caption is what gets screenshotted. */
export function quipFor(score: number): string {
  if (score < 400) return "Tripped over the first -inator. Bold strategy.";
  if (score < 1200) return "Survived. Barely. The lab is unimpressed.";
  if (score < 2500) return "Solid agent work. The fedora suits you.";
  if (score < 5000) return "Certified menace to mad science.";
  return "Someone check this phone for cheat codes.";
}

/** Rounded rect with a fallback: an image that fails to draw is worse than square. */
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Four-point sparkle. Cheap, and it sells the moment around the score. */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.18, -r * 0.18, r, 0);
  ctx.quadraticCurveTo(r * 0.18, r * 0.18, 0, r);
  ctx.quadraticCurveTo(-r * 0.18, r * 0.18, -r, 0);
  ctx.quadraticCurveTo(-r * 0.18, -r * 0.18, 0, -r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

/** A pill with a big value and a small caption under it. */
function chip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  value: string,
  label: string,
  bg: string,
) {
  const h = 104;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = INK;
  rrect(ctx, -w / 2 + 6, -h / 2 + 8, w, h, 26);
  ctx.fill();
  ctx.fillStyle = bg;
  rrect(ctx, -w / 2, -h / 2, w, h, 26);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `52px ${COMIC_FONT}`;
  ctx.fillText(value, 0, 4);
  ctx.font = `26px ${COMIC_FONT}`;
  ctx.fillText(label, 0, 38);
  ctx.restore();
}

function halftone(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) {
  ctx.save();
  ctx.fillStyle = `rgba(20,17,16,${alpha})`;
  for (let y = 0; y < h; y += 18) {
    for (let x = ((y / 18) % 2) * 9; x < w; x += 18) {
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function outlined(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  lw = 12,
  align: CanvasTextAlign = "center",
) {
  ctx.font = `${size}px ${COMIC_FONT}`;
  ctx.textAlign = align;
  ctx.lineJoin = "round";
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/**
 * Renders the 1080x1920 story-sized comic panel. Everything is drawn from
 * paths, so this runs in a few milliseconds and needs no assets to load.
 */
export function renderScoreCard(data: CardData): HTMLCanvasElement {
  const W = 1080;
  const H = 1920;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  halftone(ctx, W, H, 0.07);

  // Outer panel.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 18;
  rrect(ctx, 34, 34, W - 68, H - 68, 46);
  ctx.stroke();

  // ---- Masthead ----
  ctx.save();
  ctx.translate(W / 2, 175);
  ctx.rotate(-0.02);
  ctx.fillStyle = RED;
  ctx.fillRect(-430, -66, 860, 116);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.strokeRect(-430, -66, 860, 116);
  outlined(ctx, "E-CELL AGENT REPORT", 0, 26, 78, PAPER, 10);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.font = `34px ${COMIC_FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText("SHIV NADAR UNIVERSITY · CLUB FAIR", W / 2, 268);

  // ---- Hero panel ----
  const px = 90;
  const py = 310;
  const pw = W - 180;
  const ph = 520;
  ctx.save();
  rrect(ctx, px, py, pw, ph, 34);
  ctx.clip();
  ctx.fillStyle = SKY;
  ctx.fillRect(px, py, pw, ph);
  halftone(ctx, W, H, 0.05);

  // Ground line inside the panel.
  ctx.fillStyle = "#C7B292";
  ctx.fillRect(px, py + ph - 110, pw, 110);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(px, py + ph - 110);
  ctx.lineTo(px + pw, py + ph - 110);
  ctx.stroke();

  // Speed lines behind the hero.
  ctx.strokeStyle = "rgba(20,17,16,0.22)";
  ctx.lineWidth = 6;
  for (let i = 0; i < 8; i++) {
    const y = py + 70 + i * 54;
    ctx.beginPath();
    ctx.moveTo(px + 18, y);
    ctx.lineTo(px + 110 + (i % 3) * 80, y);
    ctx.stroke();
  }

  // A fedora arc the agent is jumping through.
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(px + pw * 0.58 + i * 82, py + 200 + Math.abs(i - 1.4) * 52);
    drawFedora(ctx, 30, i === 3, 0.6, 4);
    ctx.restore();
  }

  // The agent, mid-jump.
  ctx.save();
  ctx.translate(px + pw * 0.3, py + ph - 190);
  ctx.rotate(-0.1);
  drawAgent(ctx, "jump", 300, 1.1, 8);
  ctx.restore();

  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10;
  rrect(ctx, px, py, pw, ph, 34);
  ctx.stroke();

  // Personal-best ribbon, pinned across the panel's top-left corner.
  if (data.isBest) {
    ctx.save();
    ctx.translate(px + pw - 380, py + 88);
    ctx.rotate(0.1);
    ctx.fillStyle = INK;
    ctx.fillRect(-14, 8, 392, 68);
    ctx.fillStyle = GOLD;
    ctx.fillRect(-20, 0, 392, 68);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.strokeRect(-20, 0, 392, 68);
    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    ctx.font = `46px ${COMIC_FONT}`;
    ctx.fillText("NEW PERSONAL BEST", 176, 50);
    ctx.restore();
  }

  // ---- Score burst, deliberately breaking the panel edge ----
  ctx.save();
  ctx.translate(W / 2, 960);
  ctx.rotate(-0.04);
  drawBurst(ctx, "", 185, GOLD, COMIC_FONT);
  outlined(ctx, String(data.score), 0, 52, 148, PAPER, 16);
  ctx.restore();
  sparkle(ctx, W / 2 - 268, 888, 26, PAPER);
  sparkle(ctx, W / 2 + 258, 930, 34, GOLD);
  sparkle(ctx, W / 2 + 206, 1060, 20, PAPER);
  ctx.textAlign = "center";
  ctx.font = `44px ${COMIC_FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText("POINTS", W / 2, 1198);

  // ---- Name + rank ----
  outlined(ctx, firstName(data.name).toUpperCase(), W / 2, 1278, 88, RED, 12);
  if (data.rank && data.totalPlayers) {
    ctx.font = `46px ${COMIC_FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.fillText(`#${data.rank} OF ${data.totalPlayers} AGENTS`, W / 2, 1334);
  }

  // ---- Stat chips: the run at a glance, instead of rank OR fedoras ----
  const chipW = 268;
  const chipGap = 22;
  chip(ctx, W / 2 - chipW - chipGap, 1404, chipW, String(data.fedoras), "FEDORAS", GOLD);
  chip(ctx, W / 2, 1404, chipW, `${data.seconds.toFixed(0)}s`, "ON THE RUN", PAPER_DARK);
  chip(
    ctx,
    W / 2 + chipW + chipGap,
    1404,
    chipW,
    data.rank ? `#${data.rank}` : "—",
    "RANK",
    SKY,
  );

  // ---- Quip in a caption box ----
  const quip = quipFor(data.score);
  ctx.save();
  ctx.translate(W / 2, 1520);
  ctx.rotate(0.01);
  ctx.font = `40px ${COMIC_FONT}`;
  const lines: string[] = [];
  let line = "";
  for (const w of quip.split(" ")) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > 780) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  lines.push(line);
  const boxH = 34 + lines.length * 46;
  ctx.fillStyle = INK;
  rrect(ctx, -424, -boxH / 2 + 8, 860, boxH, 24);
  ctx.fill();
  ctx.fillStyle = PAPER;
  rrect(ctx, -430, -boxH / 2, 860, boxH, 24);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  lines.forEach((l, i) =>
    ctx.fillText(l, 0, -boxH / 2 + 44 + i * 46),
  );
  ctx.restore();

  // ---- Call to action + QR ----
  ctx.textAlign = "left";
  // Plain fill, not `outlined`: canvas ignores lineWidth 0, so an ink outline
  // over an ink fill inherited the previous width and came out a solid blob.
  ctx.font = `74px ${COMIC_FONT}`;
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.fillText("THINK YOU", 96, 1675);
  outlined(ctx, "CAN BEAT IT?", 96, 1747, 74, RED, 10, "left");
  ctx.font = `34px ${COMIC_FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.fillText("SCAN AND FIND OUT", 96, 1797);

  // E-Cell mark, bottom left.
  ctx.fillStyle = INK;
  rrect(ctx, 96, 1816, 158, 48, 12);
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.font = `36px ${COMIC_FONT}`;
  ctx.fillText("E-CELL", 112, 1850);

  const qrSize = 232;
  const qx = W - 96 - qrSize;
  const qy = 1618;
  ctx.fillStyle = PAPER;
  rrect(ctx, qx - 14, qy - 14, qrSize + 28, qrSize + 28, 22);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.stroke();
  // The QR on the card IS the challenge link, so the existing share button
  // invites a friend onto this exact course — and it survives the download
  // fallback, where a plain URL would be lost.
  drawQr(ctx, challengeUrl(data.seed, data.score, data.name), qx, qy, qrSize);

  return c;
}

export type ShareResult = "shared" | "copied" | "failed";

/**
 * Share the board itself. Text plus the game link, because the useful thing to
 * pass a friend is a way in, and a link survives every channel a card image
 * does not.
 */
export async function shareLeaderboard(top: { name: string; score: number }[], opts: {
  myRank: number | null;
  totalPlayers: number | null;
}): Promise<ShareResult> {
  const podium = top
    .slice(0, 3)
    .map((r, i) => `${i + 1}. ${r.name} — ${r.score}`)
    .join("\n");
  const mine =
    opts.myRank && opts.totalPlayers
      ? `\n\nI'm #${opts.myRank} of ${opts.totalPlayers}.`
      : "";
  const text = `E-Cell Agent Run — top of the board right now:\n${podium}${mine}\n\nBeat us:`;
  const url = gameUrl();

  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title: "E-Cell Agent Run", text, url });
      return "shared";
    } catch (err) {
      // A cancelled share sheet is not a failure worth reporting.
      if ((err as Error)?.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}

export async function shareScoreCard(
  data: CardData,
): Promise<"shared" | "downloaded" | "failed"> {
  const canvas = renderScoreCard(data);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png", 0.92),
  );
  if (!blob) return "failed";
  const file = new File([blob], `ecell-score-${data.score}.png`, { type: "image/png" });

  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: "E-Cell Club Fair",
        text: `I scored ${data.score} dodging -inators at the E-Cell stall. Beat it.`,
        url: challengeUrl(data.seed, data.score, data.name),
      });
      return "shared";
    } catch (err) {
      // A user cancelling the share sheet is not a failure worth reporting.
      if ((err as Error)?.name === "AbortError") return "shared";
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
