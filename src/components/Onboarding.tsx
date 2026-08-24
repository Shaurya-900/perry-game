"use client";

import { useState } from "react";
import { isSnuDomain, looksLikeSnuId, validName } from "@/lib/validate";

interface Props {
  onDone: (name: string, email: string, optedIn: boolean) => void;
}

/**
 * The only form in the whole app: two fields and a button. Everything about it
 * is tuned for a queue of strangers — no password, no verification email, no
 * confirm step. Bad domain? A nudge, never a block.
 */
export default function Onboarding({ onDone }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [optedIn, setOptedIn] = useState(false);
  const [error, setError] = useState("");

  const nudge =
    email.length > 4 && looksLikeSnuId(email) && !isSnuDomain(email)
      ? "Not an @snu.edu.in address — that's fine, just checking."
      : "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validName(name)) return setError("We need a name for the leaderboard.");
    if (!looksLikeSnuId(email)) return setError("University email or roll number, please.");
    setError("");
    onDone(name, email, optedIn);
  }

  return (
    <div className="overlay sheet">
      <h1>AGENT RUN</h1>
      <div className="sub">DODGE THE -INATORS · TOP 4 WIN AN E-CELL GIFT</div>
      <form className="panel" onSubmit={submit}>
        <label htmlFor="nm">YOUR NAME</label>
        <input
          id="nm"
          type="text"
          autoComplete="name"
          enterKeyHint="next"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Riya S."
        />
        <label htmlFor="em">SNU EMAIL OR ROLL NUMBER</label>
        <input
          id="em"
          type="email"
          inputMode="email"
          autoComplete="email"
          enterKeyHint="go"
          maxLength={120}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="rs123@snu.edu.in"
        />
        <label className="check" htmlFor="opt">
          <input
            id="opt"
            type="checkbox"
            checked={optedIn}
            onChange={(e) => setOptedIn(e.target.checked)}
          />
          <span>Send me E-Cell updates about events and startup stuff.</span>
        </label>
        <div className="error">{error || nudge}</div>
        <button className="primary" type="submit">
          START RUNNING
        </button>
      </form>
      <div className="sub">Your score goes on the screen at the stall.</div>
    </div>
  );
}
