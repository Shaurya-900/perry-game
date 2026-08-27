/**
 * All sound is synthesised with WebAudio oscillators — no audio files, so the
 * bundle stays tiny and nothing has to download at the booth. Muted by
 * default because the hall is loud and nobody wants a phone shrieking.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = true;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  if (!m) ac();
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("ecell.muted", m ? "1" : "0");
    } catch {
      /* private mode */
    }
  }
}

export function loadMuted(): boolean {
  try {
    muted = localStorage.getItem("ecell.muted") !== "0";
  } catch {
    muted = true;
  }
  return muted;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain = 1,
  slideTo?: number,
) {
  if (muted) return;
  const a = ac();
  if (!a || !master) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g);
  g.connect(master);
  o.start();
  o.stop(a.currentTime + dur + 0.02);
}

function noise(dur: number, gain = 0.6) {
  if (muted) return;
  const a = ac();
  if (!a || !master) return;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(master);
  src.start();
}

export const sfx = {
  jump: () => tone(300, 0.12, "square", 0.5, 620),
  collect: () => {
    tone(880, 0.07, "square", 0.4);
    setTimeout(() => tone(1320, 0.08, "square", 0.35), 55);
  },
  golden: () => {
    [660, 880, 1100, 1320].forEach((f, i) =>
      setTimeout(() => tone(f, 0.12, "triangle", 0.5), i * 70),
    );
  },
  plough: () => tone(160, 0.1, "sawtooth", 0.5, 60),
  best: () => {
    [880, 1174].forEach((f, i) => setTimeout(() => tone(f, 0.16, "triangle", 0.4), i * 90));
  },
  death: () => {
    tone(240, 0.4, "sawtooth", 0.6, 60);
    noise(0.3, 0.5);
  },
  tap: () => tone(520, 0.05, "square", 0.25),
};
