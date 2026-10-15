// HTML and React both own loading phases. Keep the cover outside their root.
const STARTUP_INTRO_MS = 3200;
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
        <circle class="codex-plus-pro-startup-ring" cx="64" cy="64" r="54" pathLength="1"/>
        <circle class="codex-plus-pro-startup-inner-ring" cx="64" cy="64" r="43" pathLength="1"/>
        <path class="codex-plus-pro-startup-ticks" d="M64 2v7M64 119v7M2 64h7M119 64h7M20 20l5 5M103 103l5 5M20 108l5-5M103 25l5-5"/>
      </svg>
      <span class="codex-plus-pro-startup-core-logo"></span>
    </div>
    <div class="codex-plus-pro-startup-wordmark" aria-label="Codex Plus Pro">
      <div class="codex-plus-pro-startup-title">Codex</div>
      <div class="codex-plus-pro-startup-edition">Plus Pro</div>
    </div>
  </div>
  <div class="codex-plus-pro-startup-caption">正在准备工作区</div>`;
const STARTUP_STYLE = `
  :root[data-codex-plus-startup-state=loading] .startup-loader__logo,
  :root[data-codex-plus-startup-state=loading] .codex-plus-pro-settings-button { visibility:hidden!important }
  .codex-plus-pro-startup-splash {
    --codex-plus-startup-accent:var(--codex-plus-accent,#b61f31);
    --codex-plus-startup-deep:var(--codex-plus-accent-dark,#751522);
    --codex-plus-startup-highlight:var(--codex-plus-highlight,#d29a18);
    --codex-plus-startup-background:color-mix(in srgb,var(--codex-plus-startup-deep) 18%,#080f18);
    --codex-plus-startup-signal:#8cdeba;
    --codex-plus-startup-core-size:clamp(88px,12vw,116px);
    --codex-plus-startup-core-offset:clamp(96px,13vw,126px);
    position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;
    overflow:hidden;pointer-events:auto;font-family:'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif;
    color:#edf6f4;background:var(--codex-plus-startup-background);isolation:isolate;
  }
  .codex-plus-pro-startup-splash::before {
    content:'';position:absolute;inset:0;z-index:0;
    background:radial-gradient(ellipse at 50% 48%,color-mix(in srgb,var(--codex-plus-startup-accent) 12%,transparent),transparent 55%);
  }
  .codex-plus-pro-startup-wallpaper {
    position:absolute;inset:-2%;z-index:0;
    background:var(--codex-pokedex-wallpaper,none) center/cover no-repeat;
    opacity:.8;transform:scale(1);
    animation:codex-plus-startup-wallpaper 600ms 2600ms cubic-bezier(.2,.65,.35,1) both;
  }
  .codex-plus-pro-startup-splash::after {
    content:'';position:absolute;inset:0;z-index:1;
    background:radial-gradient(ellipse at 50% 48%,rgba(5,13,20,.32),rgba(5,13,20,.72)),linear-gradient(0deg,rgba(5,13,20,.3),transparent 65%);
  }
  .codex-plus-pro-startup-tech { position:absolute;inset:0;z-index:2;pointer-events:none }
  .codex-plus-pro-startup-grid {
    position:absolute;inset:0;opacity:.13;
    background:radial-gradient(circle,color-mix(in srgb,var(--codex-plus-startup-highlight) 60%,#d8f5eb) .65px,transparent .85px) center/36px 36px;
    mask-image:radial-gradient(ellipse at center,transparent 10%,black 45%,transparent 73%);
    animation:codex-plus-startup-grid 2600ms ease both;
  }
  .codex-plus-pro-startup-particles span {
    position:absolute;left:50%;top:50%;font:10px/1.2 Consolas,'Cascadia Code',monospace;
    color:color-mix(in srgb,var(--codex-plus-startup-highlight) 45%,#c6ece0);opacity:0;white-space:nowrap;
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
    background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--codex-plus-startup-accent) 65%,#152126),var(--codex-plus-startup-deep));
    box-shadow:0 0 30px color-mix(in srgb,var(--codex-plus-startup-accent) 16%,transparent);
    animation:codex-plus-startup-core 700ms 1300ms ease both;
  }
  .codex-plus-pro-startup-mark::after {
    content:'';position:absolute;inset:5%;border:1px solid color-mix(in srgb,var(--codex-plus-startup-highlight) 60%,#d0fff0);border-radius:50%;opacity:0;
    animation:codex-plus-startup-pulse 700ms 1300ms cubic-bezier(.2,.65,.35,1) both;
  }
  .codex-plus-pro-startup-geometry { position:absolute;inset:0;width:100%;height:100%;stroke-width:1;stroke-linecap:round;stroke-linejoin:round }
  .codex-plus-pro-startup-ring {
    stroke:color-mix(in srgb,var(--codex-plus-startup-highlight) 40%,#d7f8ec);stroke-dasharray:1;
    transform:rotate(-90deg);transform-origin:64px 64px;
    animation:codex-plus-startup-draw 800ms 500ms cubic-bezier(.3,.1,.25,1) both;
  }
  .codex-plus-pro-startup-inner-ring {
    stroke:color-mix(in srgb,var(--codex-plus-startup-accent) 60%,#a9cabe);stroke-width:.65;stroke-dasharray:1;opacity:.65;
    transform:rotate(90deg);transform-origin:64px 64px;
    animation:codex-plus-startup-draw 650ms 650ms cubic-bezier(.3,.1,.25,1) both;
  }
  .codex-plus-pro-startup-ticks { stroke:var(--codex-plus-startup-highlight);opacity:.65;animation:codex-plus-startup-detail 450ms 850ms ease both }
  .codex-plus-pro-startup-core-logo {
    position:absolute;inset:31%;background:var(--codex-pokedex-ball-logo,none) center/contain no-repeat;
    animation:codex-plus-startup-core 700ms 1300ms ease both;
  }
  .codex-plus-pro-startup-wordmark {
    position:absolute;left:calc(50% - 28px);top:50%;transform:translateY(-50%);
    text-shadow:0 0 22px color-mix(in srgb,var(--codex-plus-startup-signal) 17%,transparent);
    animation:codex-plus-startup-wordmark 600ms 2000ms cubic-bezier(.22,.7,.25,1) both;
  }
  .codex-plus-pro-startup-title { font-size:clamp(36px,5vw,50px);font-weight:600;line-height:1.08;letter-spacing:-.055em }
  .codex-plus-pro-startup-edition { margin-top:10px;padding-left:3px;font-size:11px;font-weight:500;line-height:1.4;letter-spacing:.38em;text-transform:uppercase;color:#b6dbc9 }
  .codex-plus-pro-startup-caption {
    position:absolute;z-index:3;bottom:max(32px,10vh);font-size:11px;letter-spacing:.12em;color:#c0d0cb;
    animation:codex-plus-startup-detail 600ms 2000ms ease both;
  }
  @keyframes codex-plus-startup-particle {
    0% { opacity:0;transform:translate(var(--x),var(--y)) }
    18% { opacity:.5 }
    78% { opacity:.18 }
    100% { opacity:0;transform:translate(0,-12px) scale(.4) }
  }
  @keyframes codex-plus-startup-draw { from { opacity:0;stroke-dashoffset:1 } 8% { opacity:1 } to { opacity:1;stroke-dashoffset:0 } }
  @keyframes codex-plus-startup-detail { from { opacity:0 } to { opacity:1 } }
  @keyframes codex-plus-startup-core { from { opacity:0;transform:scale(.9) } to { opacity:1;transform:scale(1) } }
  @keyframes codex-plus-startup-pulse { 0% { opacity:0;transform:scale(.95) } 22% { opacity:.65 } 100% { opacity:0;transform:scale(1.65) } }
  @keyframes codex-plus-startup-shift { from { transform:translate(-50%,-50%) } to { transform:translate(calc(-50% - var(--codex-plus-startup-core-offset)),-50%) } }
  @keyframes codex-plus-startup-wordmark { from { opacity:0;transform:translate(10px,-50%) } to { opacity:1;transform:translate(0,-50%) } }
  @keyframes codex-plus-startup-wallpaper { from { opacity:0;transform:scale(1.045) } to { opacity:.8;transform:scale(1) } }
  @keyframes codex-plus-startup-grid { from { opacity:.25 } to { opacity:.13 } }
  @media (max-width:640px) { .codex-plus-pro-startup-wallpaper { background-position:68% center } }
  @media (prefers-reduced-motion:reduce) {
    .codex-plus-pro-startup-splash *, .codex-plus-pro-startup-splash *::before, .codex-plus-pro-startup-splash *::after { animation:none!important }
    .codex-plus-pro-startup-particles, .codex-plus-pro-startup-mark::after { display:none }
  }
  @media (prefers-reduced-transparency:reduce) {
    .codex-plus-pro-startup-splash::after { background:rgba(5,13,20,.8) }
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

export function buildStartupSource({ css, assetSource, accentOptions }) {
  const style = startupTokens(css) + "\n" + STARTUP_STYLE;
  return `(() => {
    if (location.protocol !== "app:" || location.pathname !== "/index.html" || new URL(location.href).searchParams.has("initialRoute")) return;
    if (window.__codexPlusProStartupShown) return;
    window.__codexPlusProStartupShown = true;
    let settings = {};
    try { settings = JSON.parse(localStorage.getItem("codex-plus-pro-settings-v1") || "{}") || {}; } catch {}
    if (settings.theme === false) return;

    let splash = null;
    let style = null;
    let finished = false;
    let readyFrame = null;
    let introTimer = null;
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
      if (introTimer !== null) window.clearTimeout(introTimer);
      introTimer = null;
      motionPreference?.removeEventListener?.("change", reduceMotion);
      window.removeEventListener("pagehide", cleanup);
      document.removeEventListener("DOMContentLoaded", sync);
      splash?.remove();
      style?.remove();
      document.documentElement?.setAttribute("data-codex-plus-startup-state", "ready");
      if (window.__codexPlusProStartupSplashCleanup === cleanup) delete window.__codexPlusProStartupSplashCleanup;
    };
    const reduceMotion = () => {
      if (!motionPreference.matches) return;
      introComplete = true;
      if (introTimer !== null) window.clearTimeout(introTimer);
      introTimer = null;
      sync();
    };
    const applyAssets = () => { ${assetSource} };
    const sync = () => {
      if (finished) return;
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
        splash.innerHTML = ${JSON.stringify(STARTUP_MARKUP)};
        (document.body || root).appendChild(splash);
        root.setAttribute("data-codex-plus-startup-state", "loading");
        if (!introComplete) introTimer = window.setTimeout(() => {
          introTimer = null;
          introComplete = true;
          sync();
        }, ${STARTUP_INTRO_MS});
      }
      if (document.body && splash.parentNode !== document.body) document.body.appendChild(splash);
      if (!introComplete || !contentReady()) {
        if (readyFrame !== null) window.cancelAnimationFrame(readyFrame);
        readyFrame = null;
        return;
      }
      // Check across a painted frame so a transient empty/loading handoff cannot
      // expose the next React fallback. The intro deadline never ends a slow load.
      if (readyFrame === null) readyFrame = window.requestAnimationFrame(() => {
        readyFrame = window.requestAnimationFrame(() => {
          readyFrame = null;
          if (contentReady()) cleanup();
        });
      });
    };
    window.__codexPlusProStartupSplashCleanup = cleanup;
    motionPreference?.addEventListener?.("change", reduceMotion);
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-theme", "class", "hidden", "aria-hidden"] });
    window.addEventListener("pagehide", cleanup, { once: true });
    document.addEventListener("DOMContentLoaded", sync, { once: true });
    sync();
  })()`;
}
