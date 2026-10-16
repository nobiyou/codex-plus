import assert from "node:assert/strict";
import test from "node:test";
import { createStartupTiming, parseStartupTimingEvent, STARTUP_TIMING_MARKER } from "../source/startup-timing.mjs";

const key = "codex-plus-pro-startup-timing-v1";
const sample = (visibleReadyMs, overrides = {}) => ({
  readyAt: 1792120000000, launcherMs: visibleReadyMs + 2000, rendererMs: visibleReadyMs + 100,
  visibleReadyMs, hiddenMs: 0, introMs: 6400, overlayMs: Math.max(visibleReadyMs, 6400) + 180, ...overrides,
});
const storage = samples => {
  const values = new Map(samples ? [[key, JSON.stringify({ version: 1, samples })]] : []);
  return { values, getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
};

test("the first launch gets a longer intro without inventing startup observations", () => {
  const s = storage();
  const timing = createStartupTiming(s);
  assert.equal(timing.introMs, 6400);
  assert.equal(s.values.size, 0);
});

test("intro pacing follows actual readiness rather than time spent waiting for the animation", () => {
  const timing = createStartupTiming(storage([sample(8000, { overlayMs: 25000 })]));
  assert.equal(timing.introMs, 7250);
  assert.equal(createStartupTiming(storage([sample(1000, { overlayMs: 25000 })])).introMs, 5000);
});

test("recent median and bounds prevent an exceptional stall from slowing every later launch", () => {
  assert.equal(createStartupTiming(storage([sample(7000), sample(8000), sample(90000)])).introMs, 7250);
  assert.equal(createStartupTiming(storage([sample(60000)])).introMs, 12000);
  assert.equal(createStartupTiming(storage([sample(8000, { hiddenMs: 10000 })])).introMs, 6400);
});

test("malformed, oversized, and incompatible timing records cannot break startup", () => {
  for (const value of ["invalid", "x".repeat(20000), JSON.stringify({ version: 2, samples: [sample(8000)] }), JSON.stringify({ version: 1, samples: [sample(-10), sample(Infinity)] })]) {
    const timing = createStartupTiming({ getItem: () => value, setItem() {} });
    assert.equal(timing.introMs, 6400);
  }
});

test("completion records real readiness once, preserves the independent overlay time, and caps history", () => {
  const s = storage(Array.from({ length: 7 }, (_, i) => sample(6000 + i * 100)));
  const timing = createStartupTiming(s);
  const actual = sample(2000, { overlayMs: 7000, introMs: timing.introMs });
  assert.deepEqual(timing.record(actual), actual);
  timing.record(sample(9000));
  const saved = JSON.parse(s.values.get(key));
  assert.equal(saved.samples.length, 7);
  assert.deepEqual(saved.samples.at(-1), actual);
  assert.equal(createStartupTiming(s).introMs, 5750, "the overlay must not contaminate the next readiness estimate");
});

test("read-only or unavailable local storage leaves the startup animation usable", () => {
  const errors = [];
  const timing = createStartupTiming({ getItem() { throw Error("blocked"); }, setItem() { throw Error("full"); } }, message => errors.push(message));
  assert.equal(timing.introMs, 6400);
  assert.deepEqual(timing.record(sample(8000)), sample(8000));
  assert.equal(errors.length, 2);
});

test("host timing logs accept only bounded numeric startup observations", () => {
  const event = value => ({ type: "info", args: [{ value: STARTUP_TIMING_MARKER }, { value: JSON.stringify(value) }] });
  assert.deepEqual(parseStartupTimingEvent(event({ ...sample(8000), untrustedText: "discard" })), sample(8000));
  for (const params of [event({ ...sample(8000), rendererMs: "8000" }), event({ ...sample(8000), launcherMs: -10 }),
    event({ ...sample(8000), introMs: 3200 }), { type: "info", args: [{ value: STARTUP_TIMING_MARKER }, { value: "x".repeat(2000) }] },
    { type: "error", args: event(sample(8000)).args }, { type: "info", args: [{ value: "other" }, { value: "{}" }] }]) {
    assert.equal(parseStartupTimingEvent(params), null);
  }
});
