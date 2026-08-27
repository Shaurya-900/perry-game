import qrcode from "qrcode-generator";

/**
 * Draws a QR code straight onto a canvas. `qrcode-generator` is ~10 KB and has
 * no dependencies, which matters because this ships to the phone for the score
 * card as well as to the booth display.
 */
export function drawQr(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  dark = "#141110",
  light = "#F6EEDC",
): void {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  ctx.save();
  ctx.fillStyle = light;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(
          x + (c + quiet) * cell,
          y + (r + quiet) * cell,
          Math.ceil(cell),
          Math.ceil(cell),
        );
      }
    }
  }
  ctx.restore();
}

/** Same thing as an <img>-able data URL, for the booth display. */
export function qrDataUrl(text: string, size = 320): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  drawQr(ctx, text, 0, 0, size);
  return canvas.toDataURL("image/png");
}

export interface Challenge {
  seed: number;
  score: number;
  name: string;
}

/**
 * "Play my exact course and beat this." Base36 keeps it short enough to sit in
 * a QR on the score card without crowding the art.
 *
 * Deliberately unsigned: it never touches the leaderboard, so the worst a
 * tampered link can do is show the friend an impossible target.
 */
export function challengeUrl(seed: number, score: number, name: string): string {
  const s = (seed >>> 0).toString(36);
  const sc = Math.max(0, Math.floor(score)).toString(36);
  const n = encodeURIComponent(name.trim().slice(0, 24));
  return `${gameUrl()}?c=${s}.${sc}.${n}`;
}

export function parseChallenge(search: string): Challenge | null {
  const raw = new URLSearchParams(search).get("c");
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length < 3) return null;
  const seed = parseInt(parts[0], 36);
  const score = parseInt(parts[1], 36);
  if (!Number.isFinite(seed) || !Number.isFinite(score) || score < 0) return null;
  // A name may legitimately contain a dot, so everything after the first two
  // fields belongs to it.
  const name = decodeURIComponent(parts.slice(2).join(".")).trim();
  if (!name) return null;
  return { seed: seed >>> 0, score, name: name.slice(0, 24) };
}

export function gameUrl(): string {
  const env = process.env.NEXT_PUBLIC_GAME_URL;
  if (env) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
