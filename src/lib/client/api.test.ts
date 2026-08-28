import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "ecell.queue";

/** Minimal localStorage; the module reads and writes it directly. */
function installStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  });
  return map;
}

const run = (token: string) => ({
  token,
  score: 100,
  durationMs: 9000,
  fedoras: 1,
  at: Date.now(),
});

const queued = (map: Map<string, string>) =>
  (JSON.parse(map.get(KEY) || "[]") as { token: string }[]).map((r) => r.token);

describe("offline queue flush", () => {
  let map: Map<string, string>;
  beforeEach(() => {
    vi.resetModules();
    map = installStorage();
  });

  it("clears runs the server accepted", async () => {
    map.set(KEY, JSON.stringify([run("a"), run("b")]));
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
    const { flushQueue } = await import("./api");
    expect(await flushQueue()).toBe(2);
    expect(queued(map)).toEqual([]);
  });

  it("keeps runs when the network is down", async () => {
    map.set(KEY, JSON.stringify([run("a"), run("b")]));
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const { flushQueue } = await import("./api");
    expect(await flushQueue()).toBe(0);
    // The bug: the queue was emptied up front, so a failure lost everything.
    expect(queued(map)).toEqual(["a", "b"]);
  });

  it("drops a run the server will never accept", async () => {
    map.set(KEY, JSON.stringify([run("a")]));
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 422 }));
    const { flushQueue } = await import("./api");
    await flushQueue();
    expect(queued(map)).toEqual([]);
  });

  it("keeps a rate-limited run for the next attempt", async () => {
    map.set(KEY, JSON.stringify([run("a")]));
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 429 }));
    const { flushQueue } = await import("./api");
    await flushQueue();
    expect(queued(map)).toEqual(["a"]);
  });

  it("does not clobber a run queued while the flush is in flight", async () => {
    map.set(KEY, JSON.stringify([run("a")]));
    vi.stubGlobal("fetch", async () => {
      // A run finishing mid-flush appends to the queue behind our back.
      const now = JSON.parse(map.get(KEY) || "[]");
      now.push(run("late"));
      map.set(KEY, JSON.stringify(now));
      return new Response("{}", { status: 200 });
    });
    const { flushQueue } = await import("./api");
    await flushQueue();
    expect(queued(map)).toEqual(["late"]);
  });
});
