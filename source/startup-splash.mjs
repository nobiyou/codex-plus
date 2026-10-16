import { createStartupTiming, normalizeStartupSample, STARTUP_TIMING_MARKER } from "./startup-timing.mjs";

// HTML and React both own loading phases. Keep the cover outside their root.
const STARTUP_HOLD_MS = 400;
const STARTUP_EXIT_MS = 180;
const STARTUP_MARKUP = `
  <div class="codex-plus-pro-startup-wallpaper" aria-hidden="true"></div>
  <div class="codex-plus-pro-startup-tech" aria-hidden="true">
    <div class="codex-plus-pro-startup-grid"></div>
    <div class="codex-plus-pro-startup-particles">
      <span style="--x:-32vw;--y:-24vh">{ }</span><span style="--x:28vw;--y:19vh;--delay:80ms">&lt;/&gt;</span>
      <span style="--x:-18vw;--y:31vh;--delay:40ms">[ ]</span><span style="--x:35vw;--y:-18vh;--delay:120ms">=&gt;</span>
      <span style="--x:12vw;--y:-34vh;--delay:30ms">01</span><span style="--x:-38vw;--y:9vh;--delay:100ms">::</span>
      <span style="--x:26vw;--y:32vh;--delay:50ms">fn</span><span style="--x:-10vw;--y:-30vh;--delay:70ms">;</span>
      <span style="--x:39vw;--y:3vh;--delay:20ms">( )</span><span style="--x:-29vw;--y:26vh;--delay:110ms">++</span>
      <span style="--x:21vw;--y:-28vh;--delay:60ms">*</span><span style="--x:-35vw;--y:-12vh;--delay:90ms">/</span>
    </div>
  </div>
  <div class="codex-plus-pro-startup-brand">
    <div class="codex-plus-pro-startup-mark" aria-hidden="true">
      <svg class="codex-plus-pro-startup-geometry" viewBox="0 0 128 128" fill="none">
        <defs>
          <linearGradient id="codex-plus-startup-outer-light" x1="118" y1="64" x2="10" y2="64" gradientUnits="userSpaceOnUse">
            <stop class="codex-plus-pro-startup-gradient-head"/>
            <stop class="codex-plus-pro-startup-gradient-primary" offset=".35"/>
            <stop class="codex-plus-pro-startup-gradient-primary" offset="1" stop-opacity=".05"/>
          </linearGradient>
          <linearGradient id="codex-plus-startup-inner-light" x1="107" y1="64" x2="21" y2="64" gradientUnits="userSpaceOnUse">
            <stop class="codex-plus-pro-startup-gradient-head"/>
            <stop class="codex-plus-pro-startup-gradient-secondary" offset=".4"/>
            <stop class="codex-plus-pro-startup-gradient-secondary" offset="1" stop-opacity=".06"/>
          </linearGradient>
        </defs>
        <circle class="codex-plus-pro-startup-ring" cx="64" cy="64" r="54" pathLength="1"/>
        <circle class="codex-plus-pro-startup-inner-ring" cx="64" cy="64" r="43" pathLength="1"/>
        <g class="codex-plus-pro-startup-orbit-reveal">
          <g class="codex-plus-pro-startup-orbit-outer">
            <circle class="codex-plus-pro-startup-sweep-outer" cx="64" cy="64" r="54" pathLength="1"/>
            <circle class="codex-plus-pro-startup-orbit-head" cx="118" cy="64" r="1.5"/>
          </g>
          <g class="codex-plus-pro-startup-orbit-inner">
            <circle class="codex-plus-pro-startup-sweep-inner" cx="64" cy="64" r="43" pathLength="1"/>
            <circle class="codex-plus-pro-startup-orbit-head" cx="107" cy="64" r="1.15"/>
          </g>
        </g>
      </svg>
      <span class="codex-plus-pro-startup-core-logo"></span>
    </div>
    <div class="codex-plus-pro-startup-wordmark" aria-label="Codex Plus Pro">
      <div class="codex-plus-pro-startup-title">Codex</div>
      <div class="codex-plus-pro-startup-edition">Plus Pro</div>
    </div>
  </div>
  <div class="codex-plus-pro-startup-caption">正在加载工作区</div>`;
const STARTUP_STYLE = `
  :root[data-codex-plus-startup-state=loading] .startup-loader__logo,
  :root[data-codex-plus-startup-state=loading] .codex-plus-pro-settings-button { visibility:hidden!important }
  .codex-plus-pro-startup-splash {
    --codex-plus-startup-accent:var(--codex-plus-accent,#b61f31);
    --codex-plus-startup-deep:var(--codex-plus-accent-dark,#751522);
    --codex-plus-startup-highlight:var(--codex-plus-highlight,#d29a18);
    --codex-plus-startup-background:var(--startup-background,#f4f8fd);
    --codex-plus-startup-foreground:var(--color-token-text-primary,#1f3a5f);
    --codex-plus-startup-wash:var(--codex-plus-startup-background);
    --codex-plus-startup-orbit-primary:color-mix(in srgb,var(--codex-plus-startup-accent) 88%,var(--codex-plus-startup-deep));
    --codex-plus-startup-orbit-secondary:color-mix(in srgb,var(--codex-plus-startup-highlight) 70%,var(--codex-plus-startup-deep));
    --codex-plus-startup-orbit-head:color-mix(in srgb,var(--codex-plus-startup-accent) 12%,#fff);
    --codex-plus-startup-signal:var(--codex-plus-startup-orbit-primary);
    --codex-plus-startup-orbit-glow:.35;
    --codex-plus-startup-wallpaper-opacity:.8;
    --codex-plus-startup-core-size:clamp(88px,12vw,116px);
    --codex-plus-startup-core-offset:clamp(96px,13vw,126px);
    position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;
    overflow:hidden;pointer-events:auto;font-family:'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif;
    color:var(--codex-plus-startup-foreground);background:var(--codex-plus-startup-background);isolation:isolate;opacity:1;color-scheme:light;
  }
  :root.electron-dark .codex-plus-pro-startup-splash {
    --codex-plus-startup-wash:#050d14;
    --codex-plus-startup-orbit-primary:color-mix(in srgb,var(--codex-plus-startup-accent) 76%,#fff);
    --codex-plus-startup-orbit-secondary:color-mix(in srgb,var(--codex-plus-startup-highlight) 82%,#fff);
    --codex-plus-startup-orbit-head:color-mix(in srgb,var(--codex-plus-startup-accent) 18%,#fff);
    --codex-plus-startup-orbit-glow:.6;
    --codex-plus-startup-wallpaper-opacity:.62;
    color-scheme:dark;
  }
  .codex-plus-pro-startup-splash[data-phase=leaving] { opacity:0;transition:opacity ${STARTUP_EXIT_MS}ms ease-out }
  .codex-plus-pro-startup-splash[data-playback=paused] *,
  .codex-plus-pro-startup-splash[data-playback=paused] *::before,
  .codex-plus-pro-startup-splash[data-playback=paused] *::after { animation-play-state:paused!important }
  .codex-plus-pro-startup-splash::before {
    content:'';position:absolute;inset:0;z-index:0;
    background:radial-gradient(ellipse at 50% 48%,color-mix(in srgb,var(--codex-plus-startup-accent) 12%,transparent),transparent 55%);
  }
  .codex-plus-pro-startup-wallpaper {
    position:absolute;inset:-2%;z-index:0;
    background:var(--codex-pokedex-wallpaper,none) center/cover no-repeat;
    opacity:var(--codex-plus-startup-wallpaper-opacity);transform:scale(1);
    animation:codex-plus-startup-wallpaper 400ms 2400ms cubic-bezier(.2,.65,.35,1) both;
  }
  .codex-plus-pro-startup-splash::after {
    content:'';position:absolute;inset:0;z-index:1;
    background:radial-gradient(ellipse 340px 220px at 50% calc(50% - 12px),color-mix(in srgb,var(--codex-plus-startup-wash) 76%,transparent),color-mix(in srgb,var(--codex-plus-startup-wash) 34%,transparent) 65%,transparent),linear-gradient(0deg,color-mix(in srgb,var(--codex-plus-startup-wash) 44%,transparent),color-mix(in srgb,var(--codex-plus-startup-wash) 8%,transparent) 35%,color-mix(in srgb,var(--codex-plus-startup-wash) 12%,transparent));
  }
  .codex-plus-pro-startup-tech { position:absolute;inset:0;z-index:2;pointer-events:none }
  .codex-plus-pro-startup-grid {
    position:absolute;inset:0;opacity:.13;
    background:radial-gradient(circle,color-mix(in srgb,var(--codex-plus-startup-orbit-primary) 60%,var(--codex-plus-startup-foreground)) .65px,transparent .85px) center/36px 36px;
    mask-image:radial-gradient(ellipse at center,transparent 10%,black 45%,transparent 73%);
    animation:codex-plus-startup-grid 2600ms ease both;
  }
  .codex-plus-pro-startup-particles span {
    position:absolute;left:50%;top:50%;font:10px/1.2 Consolas,'Cascadia Code',monospace;
    color:color-mix(in srgb,var(--codex-plus-startup-orbit-primary) 55%,var(--codex-plus-startup-foreground));opacity:0;white-space:nowrap;
    animation:codex-plus-startup-particle 1300ms var(--delay,0ms) cubic-bezier(.3,.05,.4,1) both;
  }
  .codex-plus-pro-startup-brand { position:relative;z-index:3;width:min(440px,calc(100vw - 44px));height:164px;transform:translateY(-12px) }
  .codex-plus-pro-startup-mark {
    position:absolute;left:50%;top:50%;width:var(--codex-plus-startup-core-size);height:var(--codex-plus-startup-core-size);
    transform:translate(calc(-50% - var(--codex-plus-startup-core-offset)),-50%);
    animation:codex-plus-startup-shift 600ms 2000ms cubic-bezier(.22,.7,.25,1) both;
  }
  .codex-plus-pro-startup-mark::before {
    content:'';position:absolute;inset:24%;border-radius:50%;
    background:radial-gradient(circle at 35% 25%,color-mix(in srgb,var(--codex-plus-startup-orbit-primary) 34%,var(--codex-plus-startup-deep)),var(--codex-plus-startup-deep) 75%);
    box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--codex-plus-startup-orbit-primary) 48%,transparent),0 0 18px color-mix(in srgb,var(--codex-plus-startup-orbit-primary) 18%,transparent),0 0 40px color-mix(in srgb,var(--codex-plus-startup-orbit-secondary) 12%,transparent);
    animation:codex-plus-startup-core 300ms 1300ms ease both;
  }
  .codex-plus-pro-startup-mark::after {
    content:'';position:absolute;inset:5%;border:1px solid var(--codex-plus-startup-orbit-primary);border-radius:50%;opacity:0;
    animation:codex-plus-startup-pulse 400ms 1600ms cubic-bezier(.2,.65,.35,1) both;
  }
  .codex-plus-pro-startup-geometry { position:absolute;inset:0;width:100%;height:100%;overflow:visible;stroke-width:1;stroke-linecap:round;stroke-linejoin:round }
  .codex-plus-pro-startup-ring {
    stroke:var(--codex-plus-startup-orbit-primary);stroke-width:.9;stroke-dasharray:1;opacity:.3;
    transform:rotate(-90deg);transform-box:fill-box;transform-origin:center;
    animation:codex-plus-startup-outer-orbit 1500ms 500ms cubic-bezier(.3,.1,.25,1) both;
  }
  .codex-plus-pro-startup-inner-ring {
    stroke:var(--codex-plus-startup-orbit-secondary);stroke-width:.8;stroke-dasharray:1;opacity:.24;
    transform:rotate(90deg);transform-box:fill-box;transform-origin:center;
    animation:codex-plus-startup-inner-orbit 1350ms 650ms cubic-bezier(.3,.1,.25,1) both;
  }
  .codex-plus-pro-startup-gradient-head { stop-color:var(--codex-plus-startup-orbit-head) }
  .codex-plus-pro-startup-gradient-primary { stop-color:var(--codex-plus-startup-orbit-primary) }
  .codex-plus-pro-startup-gradient-secondary { stop-color:var(--codex-plus-startup-orbit-secondary) }
  .codex-plus-pro-startup-orbit-reveal { opacity:1;animation:codex-plus-startup-detail 500ms 1500ms ease-out both }
  .codex-plus-pro-startup-orbit-outer, .codex-plus-pro-startup-orbit-inner { transform-box:view-box;transform-origin:50% 50% }
  .codex-plus-pro-startup-orbit-outer { --codex-plus-startup-orbit-color:var(--codex-plus-startup-orbit-primary);transform:rotate(-90deg);animation:codex-plus-startup-scan-outer 4800ms linear infinite }
  .codex-plus-pro-startup-orbit-inner { --codex-plus-startup-orbit-color:var(--codex-plus-startup-orbit-secondary);transform:rotate(90deg);animation:codex-plus-startup-scan-inner 3600ms linear infinite }
  .codex-plus-pro-startup-sweep-outer {
    stroke:url(#codex-plus-startup-outer-light);stroke-width:2.2;stroke-dasharray:.25 .07 .055 .625;
    filter:drop-shadow(0 0 3px color-mix(in srgb,var(--codex-plus-startup-orbit-primary) calc(var(--codex-plus-startup-orbit-glow) * 100%),transparent));
  }
  .codex-plus-pro-startup-sweep-inner {
    stroke:url(#codex-plus-startup-inner-light);stroke-width:1.7;stroke-dasharray:.2 .06 .045 .695;
    filter:drop-shadow(0 0 2px color-mix(in srgb,var(--codex-plus-startup-orbit-secondary) calc(var(--codex-plus-startup-orbit-glow) * 100%),transparent));
  }
  .codex-plus-pro-startup-orbit-head { fill:var(--codex-plus-startup-orbit-head);filter:drop-shadow(0 0 3px var(--codex-plus-startup-orbit-color)) }
  .codex-plus-pro-startup-core-logo {
    position:absolute;inset:31%;background:var(--codex-pokedex-ball-logo,none) center/contain no-repeat;
    animation:codex-plus-startup-core 300ms 1300ms ease both;
  }
  .codex-plus-pro-startup-wordmark {
    position:absolute;left:calc(50% - 28px);top:50%;transform:translateY(-50%);
    text-shadow:0 0 22px color-mix(in srgb,var(--codex-plus-startup-signal) 17%,transparent);
    animation:codex-plus-startup-wordmark 600ms 2000ms cubic-bezier(.22,.7,.25,1) both;
  }
  .codex-plus-pro-startup-title { font-size:clamp(36px,5vw,50px);font-weight:600;line-height:1.08;letter-spacing:-.055em }
  .codex-plus-pro-startup-edition { margin-top:10px;padding-left:3px;font-size:12px;font-weight:600;line-height:1.4;letter-spacing:.32em;text-transform:uppercase;color:color-mix(in srgb,var(--codex-plus-startup-foreground) 86%,var(--codex-plus-startup-signal)) }
  .codex-plus-pro-startup-caption {
    position:absolute;z-index:3;bottom:max(32px,10vh);font-size:11px;letter-spacing:.12em;color:var(--codex-plus-startup-foreground);text-shadow:0 1px 6px color-mix(in srgb,var(--codex-plus-startup-wash) 90%,transparent);
    animation:codex-plus-startup-detail 600ms 2000ms ease both;
  }
  .codex-plus-pro-startup-caption::before { content:'';display:inline-block;width:4px;height:4px;margin:0 10px 2px 0;border-radius:50%;background:var(--codex-plus-startup-signal);opacity:.65 }
  .codex-plus-pro-startup-splash[data-waiting=true] .codex-plus-pro-startup-caption::before { animation:codex-plus-startup-wait 1600ms ease-in-out infinite }
  .codex-plus-pro-startup-splash[data-waiting=true] .codex-plus-pro-startup-inner-ring { animation:codex-plus-startup-wait-ring 3200ms ease-in-out infinite }
  .codex-plus-pro-startup-splash[data-waiting=true] .codex-plus-pro-startup-wallpaper { animation:codex-plus-startup-wait-wallpaper 8000ms ease-in-out infinite }
  @keyframes codex-plus-startup-particle {
    0% { opacity:0;transform:translate(var(--x),var(--y)) }
    18% { opacity:.5 }
    78% { opacity:.18 }
    100% { opacity:0;transform:translate(0,-12px) scale(.4) }
  }
  /* Both arcs close at 1.3s, then recede as the core activates through 2.0s. */
  @keyframes codex-plus-startup-outer-orbit {
    0% { opacity:0;stroke-dashoffset:1;transform:rotate(-165deg) scale(.94) }
    8% { opacity:1 }
    53.333% { opacity:1;stroke-dashoffset:0;transform:rotate(-90deg) scale(1) }
    80% { opacity:1 }
    100% { opacity:.3;stroke-dashoffset:0;transform:rotate(-90deg) scale(1) }
  }
  @keyframes codex-plus-startup-inner-orbit {
    0% { opacity:0;stroke-dashoffset:-1;transform:rotate(165deg) scale(1.06) }
    10% { opacity:.7 }
    48.148% { opacity:.7;stroke-dashoffset:0;transform:rotate(90deg) scale(1) }
    77.778% { opacity:.7 }
    100% { opacity:.24;stroke-dashoffset:0;transform:rotate(90deg) scale(1) }
  }
  @keyframes codex-plus-startup-detail { from { opacity:0 } to { opacity:1 } }
  @keyframes codex-plus-startup-core { from { opacity:0;transform:scale(.9) } to { opacity:1;transform:scale(1) } }
  @keyframes codex-plus-startup-pulse { 0% { opacity:0;transform:scale(.95) } 22% { opacity:.65 } 100% { opacity:0;transform:scale(1.65) } }
  @keyframes codex-plus-startup-shift { from { transform:translate(-50%,-50%) } to { transform:translate(calc(-50% - var(--codex-plus-startup-core-offset)),-50%) } }
  @keyframes codex-plus-startup-wordmark { from { opacity:0;transform:translate(10px,-50%) } to { opacity:1;transform:translate(0,-50%) } }
  @keyframes codex-plus-startup-wallpaper { from { opacity:0;transform:scale(1.045) } to { opacity:var(--codex-plus-startup-wallpaper-opacity);transform:scale(1) } }
  @keyframes codex-plus-startup-grid { from { opacity:.25 } to { opacity:.13 } }
  @keyframes codex-plus-startup-wait { 0%,100% { opacity:.35 } 50% { opacity:.85 } }
  @keyframes codex-plus-startup-scan-outer { from { transform:rotate(-90deg) } to { transform:rotate(270deg) } }
  @keyframes codex-plus-startup-scan-inner { from { transform:rotate(90deg) } to { transform:rotate(-270deg) } }
  @keyframes codex-plus-startup-wait-ring { 0%,100% { opacity:.24 } 50% { opacity:.38 } }
  @keyframes codex-plus-startup-wait-wallpaper { 0%,100% { transform:scale(1) } 50% { transform:scale(1.025) } }
  @media (max-width:640px) { .codex-plus-pro-startup-wallpaper { background-position:68% center } }
  @media (prefers-reduced-motion:reduce) {
    .codex-plus-pro-startup-splash { transition:none!important }
    .codex-plus-pro-startup-splash *, .codex-plus-pro-startup-splash *::before, .codex-plus-pro-startup-splash *::after { animation:none!important }
    .codex-plus-pro-startup-particles, .codex-plus-pro-startup-mark::after { display:none }
  }
  @media (prefers-reduced-transparency:reduce) {
    .codex-plus-pro-startup-splash::after { background:color-mix(in srgb,var(--codex-plus-startup-wash) 95%,transparent) }
  }
`;

function startupTokens(css) {
  const blocks = [];
  for (const match of css.matchAll(/(?:^|\n)(:root[^{}]*)\{([^{}]*)\}/g)) {
    if (!match[1].split(",").every((selector) => /^:root(?:\[[^\]]+\]|\.[\w-]+)*$/.test(selector.trim()))) continue;
    const tokens = match[2].match(/--(?:startup-background|color-token-text-primary|codex-plus-accent(?:-dark)?|codex-plus-highlight)\s*:[^;]+;/g);
    if (tokens?.length) blocks.push(match[1] + "{" + tokens.join("") + "}");
  }
  return blocks.join("\n");
}

export function buildStartupSource({ css, assetSource, accentOptions, launcherStartedAt = null }) {
  // Scale only the entrance. Continuous loading motion keeps a calm fixed pace.
  const scaledStyle = STARTUP_STYLE.replace(/animation:([^;{}]+);/g, (declaration, animation) => {
    if (animation.includes("infinite")) return declaration;
    const scaled = animation.replace("var(--delay,0ms)", "PARTICLE_DELAY")
      .replace(/(\d+)ms/g, "calc($1ms * var(--codex-plus-startup-time-scale,1))")
      .replace("PARTICLE_DELAY", "calc(var(--delay,0ms) * var(--codex-plus-startup-time-scale,1))");
    return "animation:" + scaled + ";";
  });
  const style = startupTokens(css) + "\n" + scaledStyle;
  const launchEpoch = Number.isFinite(launcherStartedAt) && launcherStartedAt > 0 ? launcherStartedAt : null;
  return `(() => {
    if (location.protocol !== "app:" || location.pathname !== "/index.html" || new URL(location.href).searchParams.has("initialRoute")) return;
    if (window.__codexPlusProStartupShown) return;
    window.__codexPlusProStartupShown = true;
    let settings = {};
    try { settings = JSON.parse(localStorage.getItem("codex-plus-pro-settings-v1") || "{}") || {}; } catch {}
    if (settings.theme === false) return;

    const normalizeStartupSample = ${normalizeStartupSample.toString()};
    let timingStorage = null;
    try { timingStorage = localStorage; } catch { console.warn("Startup timing storage is unavailable"); }
    const timing = (${createStartupTiming.toString()})(timingStorage, message => console.warn(message));
    const navigationType = performance.getEntriesByType?.("navigation")[0]?.type;
    const recordLaunch = !navigationType || navigationType === "navigate";
    const launchEpoch = ${JSON.stringify(launchEpoch)};
    const timeOrigin = performance.timeOrigin || Date.now() - performance.now();
    let overlayStartedAt = null;
    let visibleSince = null;
    let visibleElapsed = 0;
    let hiddenSince = document.hidden ? performance.now() : null;
    let hiddenElapsed = 0;
    let readySample = null;
    const trackVisibility = () => {
      const now = performance.now();
      if (document.hidden) {
        if (hiddenSince === null) hiddenSince = now;
        if (visibleSince !== null) { visibleElapsed += now - visibleSince; visibleSince = null; }
      } else if (hiddenSince !== null) {
        hiddenElapsed += now - hiddenSince;
        hiddenSince = null;
      }
    };
    const startPresentation = () => { if (visibleSince === null) visibleSince = performance.now(); };
    const captureReadiness = () => {
      if (readySample) return;
      const now = performance.now();
      const launcherMs = launchEpoch !== null && timeOrigin >= launchEpoch && timeOrigin - launchEpoch <= 120000 && timeOrigin + now - launchEpoch <= 300000
        ? Math.round(timeOrigin + now - launchEpoch) : null;
      readySample = {
        readyAt: Math.round(timeOrigin + now), launcherMs, rendererMs: Math.round(now),
        visibleReadyMs: Math.round(visibleElapsed + (visibleSince === null ? 0 : now - visibleSince)),
        hiddenMs: Math.round(hiddenElapsed),
      };
    };

    let splash = null;
    let style = null;
    let finished = false;
    let readyFrame = null;
    let playbackFrame = null;
    let introTimer = null;
    let exitTimer = null;
    let motionEnded = false;
    let holdRemaining = ${STARTUP_HOLD_MS};
    let holdStartedAt = 0;
    const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let introComplete = Boolean(motionPreference?.matches);
    // CSS-module prefixes survive hashed builds; these are the official React
    // bootstrap/route indicators, including the undelayed page variant.
    const loadingSelector = '#root > .startup-loader, #root [class*="_delayedBlossom_"], #root [class*="_delayedIndicator_"], #root [role="presentation"] > .flex.flex-col.items-center.gap-2';
    const contentReady = () => {
      if (document.readyState === "loading" || document.querySelector(loadingSelector)) return false;
      const appRoot = document.getElementById("root");
      // The fallback drag region and hidden host bridges are mounted before the
      // workspace. Only painted content can finish startup (also login/errors).
      return appRoot && Array.from(appRoot.querySelectorAll('button, a[href], input:not([type="hidden"]), textarea, [contenteditable="true"], [role="alert"]')).some((node) =>
        !node.closest('[hidden], [aria-hidden="true"], [inert]') && node.getClientRects().length > 0
      );
    };
    const observer = new MutationObserver(() => sync());
    const cleanup = () => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      if (readyFrame !== null) window.cancelAnimationFrame(readyFrame);
      readyFrame = null;
      if (playbackFrame !== null) window.cancelAnimationFrame(playbackFrame);
      playbackFrame = null;
      if (introTimer !== null) window.clearTimeout(introTimer);
      introTimer = null;
      if (exitTimer !== null) window.clearTimeout(exitTimer);
      exitTimer = null;
      motionPreference?.removeEventListener?.("change", reduceMotion);
      window.removeEventListener("pagehide", cleanup);
      document.removeEventListener("DOMContentLoaded", sync);
      document.removeEventListener("visibilitychange", sync);
      splash?.removeEventListener("animationend", introMotionEnded);
      splash?.remove();
      style?.remove();
      document.documentElement?.setAttribute("data-codex-plus-startup-state", "ready");
      if (window.__codexPlusProStartupSplashCleanup === cleanup) delete window.__codexPlusProStartupSplashCleanup;
    };
    const finishStartup = () => {
      if (recordLaunch && readySample && overlayStartedAt !== null) {
        const sample = timing.record({ ...readySample, introMs: timing.introMs, overlayMs: Math.round(performance.now() - overlayStartedAt) });
        if (sample) {
          window.__codexPlusProStartupTiming = sample;
          console.info(${JSON.stringify(STARTUP_TIMING_MARKER)}, JSON.stringify(sample));
        }
      }
      cleanup();
    };
    const reduceMotion = () => {
      if (!motionPreference.matches) return;
      introComplete = true;
      if (introTimer !== null) window.clearTimeout(introTimer);
      introTimer = null;
      if (exitTimer !== null && contentReady()) { finishStartup(); return; }
      sync();
    };
    const cancelReveal = (resetReadiness = true) => {
      if (resetReadiness) readySample = null;
      if (readyFrame !== null) window.cancelAnimationFrame(readyFrame);
      readyFrame = null;
      if (exitTimer !== null) window.clearTimeout(exitTimer);
      exitTimer = null;
      // No reverse transition: immediately cover a returning React loader.
      splash?.removeAttribute("data-phase");
    };
    const finishIntro = () => {
      introTimer = null;
      introComplete = true;
      sync();
    };
    const holdFinalFrame = () => {
      if (!motionEnded || introComplete || introTimer !== null || document.hidden) return;
      holdStartedAt = performance.now();
      introTimer = window.setTimeout(finishIntro, holdRemaining);
    };
    const introMotionEnded = (event) => {
      if (event.animationName !== "codex-plus-startup-wallpaper" || finished || introComplete || motionEnded) return;
      // Start the hold from the actual final paint, including any asset/style
      // delays. A wall-clock deadline alone can consume the entire hold.
      motionEnded = true;
      holdFinalFrame();
    };
    const syncPlayback = () => {
      if (document.hidden) {
        if (playbackFrame !== null) window.cancelAnimationFrame(playbackFrame);
        playbackFrame = null;
        splash.setAttribute("data-playback", "paused");
        if (introTimer !== null) {
          holdRemaining = Math.max(0, holdRemaining - (performance.now() - holdStartedAt));
          window.clearTimeout(introTimer);
          introTimer = null;
        }
        return false;
      }
      if (motionPreference?.matches) {
        if (playbackFrame !== null) window.cancelAnimationFrame(playbackFrame);
        playbackFrame = null;
        splash.setAttribute("data-playback", "running");
        startPresentation();
        return true;
      }
      if (splash.getAttribute("data-playback") === "running") return true;
      // Mount the paused first frame, then begin after a visible paint. Renderer
      // initialization must not spend the user's animation time off screen.
      if (playbackFrame === null) playbackFrame = window.requestAnimationFrame(() => {
        playbackFrame = window.requestAnimationFrame(() => {
          playbackFrame = null;
          if (finished || document.hidden) return;
          splash.setAttribute("data-playback", "running");
          startPresentation();
          holdFinalFrame();
          sync();
        });
      });
      return false;
    };
    const reveal = () => {
      if (motionPreference?.matches) { finishStartup(); return; }
      splash.setAttribute("data-phase", "leaving");
      exitTimer = window.setTimeout(() => {
        exitTimer = null;
        if (!document.hidden && contentReady()) finishStartup();
        else cancelReveal();
      }, ${STARTUP_EXIT_MS});
    };
    const applyAssets = () => { ${assetSource} };
    const sync = () => {
      if (finished) return;
      trackVisibility();
      const root = document.documentElement;
      if (!root) return;
      if (!splash && document.readyState !== "loading" && !document.querySelector(loadingSelector)) { cleanup(); return; }
      if (!style) {
        root.setAttribute("data-codex-pokedex-theme", "on");
        root.setAttribute("data-codex-plus-accent", settings.accent || "pokedex");
        const accents = ${JSON.stringify(accentOptions)};
        const accent = accents[settings.accent] || accents.pokedex;
        root.style.setProperty("--codex-plus-accent", accent.color);
        root.style.setProperty("--codex-plus-accent-dark", accent.dark);
        root.style.setProperty("--codex-plus-highlight", accent.highlight);
        applyAssets();
        if (settings.accent === "adaptive") {
          try {
            const palette = JSON.parse(localStorage.getItem("codex-plus-pro-adaptive-theme-v1") || "null");
            if ([palette?.color, palette?.dark, palette?.highlight].every((value) => /^#[0-9a-f]{6}$/i.test(value || ""))) {
              root.style.setProperty("--codex-plus-accent", palette.color);
              root.style.setProperty("--codex-plus-accent-dark", palette.dark);
              root.style.setProperty("--codex-plus-highlight", palette.highlight);
            }
          } catch {}
        }
        style = document.createElement("style");
        style.id = "codex-plus-pro-startup-style";
        style.textContent = ${JSON.stringify(style)};
        (document.head || root).appendChild(style);
      }
      const dark = root.getAttribute("data-theme") === "dark" || (!root.hasAttribute("data-theme") && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
      root.classList.toggle("electron-dark", Boolean(dark));
      if (!splash) {
        splash = document.createElement("div");
        splash.className = "codex-plus-pro-startup-splash";
        splash.setAttribute("data-codex-plus-startup-splash", "true");
        splash.setAttribute("role", "status");
        splash.setAttribute("aria-live", "polite");
        splash.setAttribute("aria-label", "正在加载 Codex Plus Pro");
        splash.setAttribute("data-playback", "paused");
        splash.setAttribute("data-intro-ms", String(timing.introMs));
        splash.style.setProperty("--codex-plus-startup-time-scale", String((timing.introMs - ${STARTUP_HOLD_MS}) / 2800));
        splash.innerHTML = ${JSON.stringify(STARTUP_MARKUP)};
        splash.addEventListener("animationend", introMotionEnded);
        (document.body || root).appendChild(splash);
        overlayStartedAt = performance.now();
        root.setAttribute("data-codex-plus-startup-state", "loading");
      }
      if (document.body && splash.parentNode !== document.body) document.body.appendChild(splash);
      if (!syncPlayback()) { cancelReveal(!contentReady()); return; }
      if (!contentReady()) {
        if (introComplete) splash.setAttribute("data-waiting", "true");
        cancelReveal();
        return;
      }
      if (exitTimer !== null) return;
      // Check across a painted frame so a transient empty/loading handoff cannot
      // expose the next React fallback. The intro deadline never ends a slow load.
      if (readyFrame === null) readyFrame = window.requestAnimationFrame(() => {
        readyFrame = window.requestAnimationFrame(() => {
          readyFrame = null;
          if (document.hidden || !contentReady()) { cancelReveal(); return; }
          captureReadiness();
          if (!introComplete) return;
          reveal();
        });
      });
    };
    window.__codexPlusProStartupSplashCleanup = cleanup;
    motionPreference?.addEventListener?.("change", reduceMotion);
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-theme", "class", "hidden", "aria-hidden"] });
    window.addEventListener("pagehide", cleanup, { once: true });
    document.addEventListener("DOMContentLoaded", sync, { once: true });
    document.addEventListener("visibilitychange", sync);
    sync();
  })()`;
}
