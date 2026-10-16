export const STARTUP_TIMING_MARKER = "codex-plus-pro-startup-timing-v1";

// Shared by the renderer's bounded history and the host's numeric-only log.
export function normalizeStartupSample(sample) {
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) return null;
  const duration = (value, max = 3600000) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
  if (!duration(sample.readyAt, 1e13) || sample.readyAt === 0
    || (sample.launcherMs !== null && !duration(sample.launcherMs, 300000))
    || !duration(sample.rendererMs) || !duration(sample.visibleReadyMs)
    || !duration(sample.hiddenMs) || !duration(sample.overlayMs)
    || !duration(sample.introMs, 12000) || sample.introMs < 5000) return null;
  return Object.fromEntries(["readyAt", "launcherMs", "rendererMs", "visibleReadyMs", "hiddenMs", "introMs", "overlayMs"].map(key => [key, sample[key]]));
}

export function createStartupTiming(storage, onError = () => {}) {
  const key = "codex-plus-pro-startup-timing-v1";
  let samples = [];
  try {
    const raw = storage?.getItem(key);
    if (raw && raw.length <= 8192) {
      const saved = JSON.parse(raw);
      if (saved?.version === 1 && Array.isArray(saved.samples)) {
        samples = saved.samples.slice(-7).map(normalizeStartupSample).filter(Boolean);
      }
    }
  } catch { onError("Startup timing history could not be read; using default pacing"); }
  // The cover's own hold/fade never trains the estimate. Hidden or exceptional
  // runs remain inspectable, but must not slow later foreground launches.
  const recent = samples.filter(sample => sample.hiddenMs === 0 && sample.visibleReadyMs >= 100 && sample.visibleReadyMs <= 120000)
    .map(sample => sample.visibleReadyMs).sort((a, b) => a - b);
  const middle = Math.floor(recent.length / 2);
  const median = recent.length % 2 ? recent[middle] : (recent[middle - 1] + recent[middle]) / 2;
  const introMs = recent.length ? Math.min(12000, Math.max(5000, Math.round(median * .9 / 250) * 250)) : 6400;
  let recorded = false;
  return {
    introMs,
    record(sample) {
      if (recorded) return null;
      const normalized = normalizeStartupSample(sample);
      if (!normalized) return null;
      recorded = true;
      samples = [...samples, normalized].slice(-7);
      try { storage?.setItem(key, JSON.stringify({ version: 1, samples })); }
      catch { onError("Startup timing history could not be saved"); }
      return normalized;
    },
  };
}

export function parseStartupTimingEvent(params) {
  if (params?.type !== "info" || params.args?.length !== 2 || params.args[0]?.value !== STARTUP_TIMING_MARKER) return null;
  const payload = params.args[1]?.value;
  if (typeof payload !== "string" || payload.length > 1024) return null;
  try { return normalizeStartupSample(JSON.parse(payload)); } catch { return null; }
}
