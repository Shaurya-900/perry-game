"use client";

import { useState } from "react";
import { isSnuDomain, looksLikeEmail, validName } from "@/lib/validate";

interface Props {
  /** `joinInterest` is stored in the players.opted_in column — see below. */
  onDone: (name: string, email: string, joinInterest: boolean) => void;
}

/**
 * The only form in the whole app: two fields and a button. Everything about it
 * is tuned for a queue of strangers — no password, no verification email, no
 * confirm step. Bad domain? A nudge, never a block.
 */
export default function Onboarding({ onDone }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [joinInterest, setJoinInterest] = useState(false);
  const [error, setError] = useState("");

  const nudge =
    email.length > 4 && looksLikeEmail(email) && !isSnuDomain(email)
      ? "Not an @snu.edu.in address — that's fine, just checking."
      : "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validName(name)) return setError("We need a name for the leaderboard.");
    if (!looksLikeEmail(email)) return setError("We need your email address.");
    setError("");
    onDone(name, email, joinInterest);
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
        <label htmlFor="em">SNU EMAIL</label>
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
        {/*
          * The club already has every student's email, so asking to mail them
          * collects nothing. What it does not have is who actually wants in —
          * that is the recruiting list this box builds.
          */}
        <label className="check" htmlFor="opt">
          <input
            id="opt"
            type="checkbox"
            checked={joinInterest}
            onChange={(e) => setJoinInterest(e.target.checked)}
          />
          <span>I want to join E-Cell. Tell me how.</span>
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
