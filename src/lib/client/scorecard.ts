"use client";

import { drawAgent, drawBurst, drawFedora } from "@/game/art";
import { COMIC_FONT, GOLD, INK, PAPER, PAPER_DARK, RED, SKY } from "@/game/palette";
import { challengeUrl, drawQr } from "@/lib/qr";
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
}

/** A different jab for every score band — the caption is what gets screenshotted. */
export function quipFor(score: number): string {
  if (score < 400) return "Tripped over the first -inator. Bold strategy.";
  if (score < 1200) return "Survived. Barely. The lab is unimpressed.";
  if (score < 2500) return "Solid agent work. The fedora suits you.";
  if (score < 5000) return "Certified menace to mad science.";
  return "Someone check this phone for cheat codes.";
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
  ctx.strokeRect(34, 34, W - 68, H - 68);

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
  const ph = 590;
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
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
  ctx.strokeRect(px, py, pw, ph);

  // ---- Score burst, deliberately breaking the panel edge ----
  ctx.save();
  ctx.translate(W / 2, 1065);
  ctx.rotate(-0.04);
  drawBurst(ctx, "", 185, GOLD, COMIC_FONT);
  outlined(ctx, String(data.score), 0, 52, 148, PAPER, 16);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.font = `44px ${COMIC_FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText("POINTS", W / 2, 1300);

  // ---- Name + rank ----
  outlined(ctx, firstName(data.name).toUpperCase(), W / 2, 1390, 88, RED, 12);
  const rankLine =
    data.rank && data.totalPlayers
      ? `#${data.rank} OF ${data.totalPlayers} AGENTS`
      : `${data.fedoras} FEDORAS · ${data.seconds.toFixed(0)}s ON THE RUN`;
  ctx.font = `46px ${COMIC_FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.fillText(rankLine, W / 2, 1455);

  // ---- Quip in a caption box ----
  const quip = quipFor(data.score);
  ctx.save();
  ctx.translate(W / 2, 1540);
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
  ctx.fillStyle = PAPER_DARK;
  ctx.fillRect(-430, -boxH / 2, 860, boxH);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.strokeRect(-430, -boxH / 2, 860, boxH);
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  lines.forEach((l, i) =>
    ctx.fillText(l, 0, -boxH / 2 + 44 + i * 46),
  );
  ctx.restore();

  // ---- Call to action + QR ----
  ctx.textAlign = "left";
  outlined(ctx, "THINK YOU", 96, 1700, 74, INK, 0, "left");
  outlined(ctx, "CAN BEAT IT?", 96, 1772, 74, RED, 10, "left");
  ctx.font = `34px ${COMIC_FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.fillText("SCAN AND FIND OUT", 96, 1822);

  // E-Cell mark, bottom left.
  ctx.fillStyle = INK;
  ctx.fillRect(96, 1842, 150, 46);
  ctx.fillStyle = GOLD;
  ctx.font = `36px ${COMIC_FONT}`;
  ctx.fillText("E-CELL", 110, 1876);

  const qrSize = 232;
  const qx = W - 96 - qrSize;
  const qy = 1630;
  ctx.fillStyle = PAPER;
  ctx.fillRect(qx - 12, qy - 12, qrSize + 24, qrSize + 24);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.strokeRect(qx - 12, qy - 12, qrSize + 24, qrSize + 24);
  // The QR on the card IS the challenge link, so the existing share button
  // invites a friend onto this exact course — and it survives the download
  // fallback, where a plain URL would be lost.
  drawQr(ctx, challengeUrl(data.seed, data.score, data.name), qx, qy, qrSize);

  return c;
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
