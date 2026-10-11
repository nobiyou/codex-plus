// HTML and React both own loading phases. Keep the cover outside their root.
const STARTUP_MARKUP = '<div class="codex-plus-pro-startup-wallpaper" aria-hidden="true"></div><div class="codex-plus-pro-startup-tech" aria-hidden="true"><div class="codex-plus-pro-startup-grid"></div><div class="codex-plus-pro-startup-scan"></div><div class="codex-plus-pro-startup-orbit"></div><div class="codex-plus-pro-startup-nodes"><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="codex-plus-pro-startup-card"><div class="codex-plus-pro-startup-mark" aria-hidden="true"><span></span></div><div class="codex-plus-pro-startup-title">Codex Plus Pro</div><div class="codex-plus-pro-startup-caption">正在准备工作区</div><div class="codex-plus-pro-startup-progress" aria-hidden="true"><span></span></div></div>';
const STARTUP_STYLE = [
        ":root[data-codex-plus-startup-state=loading] .startup-loader__logo{visibility:hidden!important}",
        ":root[data-codex-plus-startup-state=loading] .codex-plus-pro-settings-button{visibility:hidden!important}",
        ".codex-plus-pro-startup-splash{--codex-plus-startup-background:var(--startup-background,#fff8e9);--codex-plus-startup-foreground:var(--color-token-text-primary,#30231e);--codex-plus-startup-accent:var(--codex-plus-accent,#b61f31);--codex-plus-startup-deep:var(--codex-plus-accent-dark,#751522);--codex-plus-startup-highlight:var(--codex-plus-highlight,#d29a18);position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;pointer-events:none;overflow:hidden;font-family:system-ui,'Segoe UI',sans-serif;color:var(--codex-plus-startup-foreground);background:var(--codex-plus-startup-background);opacity:1;animation:codex-plus-startup-in 160ms ease both}",
        ".codex-plus-pro-startup-wallpaper{position:absolute;inset:-2%;z-index:0;background-image:var(--codex-pokedex-wallpaper,none);background-position:center;background-size:cover;background-repeat:no-repeat;transform:scale(1.015);animation:codex-plus-startup-wallpaper 1.8s cubic-bezier(.2,.65,.35,1) both}",
        "@media (max-width:640px){.codex-plus-pro-startup-wallpaper{background-position:68% center}}",
        ".codex-plus-pro-startup-splash::after{content:'';position:absolute;inset:0;z-index:1;background:radial-gradient(ellipse at 50% 42%,color-mix(in srgb,var(--codex-plus-startup-background) 20%,transparent),color-mix(in srgb,var(--codex-plus-startup-background) 46%,transparent)),linear-gradient(0deg,color-mix(in srgb,var(--codex-plus-startup-background) 48%,transparent),transparent 60%)}",
        ":root.electron-dark .codex-plus-pro-startup-splash::after{background:radial-gradient(ellipse at 50% 42%,color-mix(in srgb,var(--codex-plus-startup-background) 42%,transparent),color-mix(in srgb,var(--codex-plus-startup-background) 72%,transparent)),linear-gradient(0deg,color-mix(in srgb,var(--codex-plus-startup-background) 44%,transparent),transparent 60%)}",
        ".codex-plus-pro-startup-splash::before{content:'';position:absolute;inset:-20%;z-index:2;background:radial-gradient(circle at 50% 42%,color-mix(in srgb,var(--codex-plus-startup-accent) 17%,transparent),transparent 34%),radial-gradient(circle at 50% 42%,color-mix(in srgb,var(--codex-plus-startup-highlight) 12%,transparent),transparent 56%);animation:codex-plus-startup-glow 1.8s ease-in-out both}",
        ".codex-plus-pro-startup-tech{position:absolute;inset:0;z-index:3;overflow:hidden;pointer-events:none;opacity:.78}",
        ".codex-plus-pro-startup-grid{position:absolute;inset:-45%;background-image:linear-gradient(color-mix(in srgb,var(--codex-plus-startup-accent) 16%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--codex-plus-startup-accent) 16%,transparent) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse at center,black 12%,transparent 62%);transform-origin:50% 55%;animation:codex-plus-startup-grid 3s linear infinite}",
        ".codex-plus-pro-startup-scan{position:absolute;top:-50%;bottom:-50%;left:-45%;width:35%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--codex-plus-startup-highlight) 9%,transparent) 48%,color-mix(in srgb,var(--codex-plus-startup-accent) 15%,transparent) 50%,transparent 56%);animation:codex-plus-startup-scan 1.4s cubic-bezier(.2,.65,.35,1) both}",
        ".codex-plus-pro-startup-orbit{position:absolute;left:50%;top:50%;width:min(70vw,620px);aspect-ratio:1;border:1px solid color-mix(in srgb,var(--codex-plus-startup-accent) 20%,transparent);border-radius:50%;transform:translate(-50%,-50%)}",
        ".codex-plus-pro-startup-orbit::before{content:'';position:absolute;inset:8%;border:1px dashed color-mix(in srgb,var(--codex-plus-startup-accent) 24%,transparent);border-radius:50%;animation:codex-plus-startup-orbit 7s linear infinite}",
        ".codex-plus-pro-startup-orbit::after{content:'';position:absolute;inset:-2px;border-radius:50%;background:conic-gradient(from 30deg,transparent 0 8%,var(--codex-plus-startup-accent) 12% 15%,transparent 19% 55%,var(--codex-plus-startup-highlight) 60% 65%,transparent 69%);mask-image:radial-gradient(farthest-side,transparent calc(100% - 3px),black calc(100% - 2px));opacity:.6;animation:codex-plus-startup-orbit 4s linear infinite reverse}",
        ".codex-plus-pro-startup-nodes{position:absolute;inset:0}.codex-plus-pro-startup-nodes i{position:absolute;width:4px;height:4px;border-radius:50%;background:var(--codex-plus-startup-accent);box-shadow:0 0 12px color-mix(in srgb,var(--codex-plus-startup-accent) 60%,transparent);animation:codex-plus-startup-node 1.4s ease-in-out infinite alternate}",
        ".codex-plus-pro-startup-nodes i::after{content:'';position:absolute;right:8px;top:2px;width:28px;height:1px;background:linear-gradient(90deg,transparent,var(--codex-plus-startup-accent))}",
        ".codex-plus-pro-startup-nodes i:nth-child(1){left:18%;top:32%;animation-delay:-.4s}.codex-plus-pro-startup-nodes i:nth-child(2){left:28%;top:72%;animation-delay:-.8s}.codex-plus-pro-startup-nodes i:nth-child(3){left:72%;top:24%;animation-delay:-.2s}.codex-plus-pro-startup-nodes i:nth-child(4){left:83%;top:64%;animation-delay:-1s}.codex-plus-pro-startup-nodes i:nth-child(5){left:60%;top:83%;animation-delay:-.6s}.codex-plus-pro-startup-nodes i:nth-child(6){left:39%;top:16%;animation-delay:-1.2s}",
        ".codex-plus-pro-startup-card{position:relative;z-index:4;display:grid;justify-items:center;gap:12px;min-width:248px;padding:34px 38px 29px;border:1px solid color-mix(in srgb,var(--codex-plus-startup-accent) 28%,transparent);border-radius:24px;background:linear-gradient(145deg,color-mix(in srgb,var(--codex-plus-startup-background) 94%,transparent),color-mix(in srgb,var(--codex-plus-startup-background) 78%,transparent));box-shadow:0 24px 80px color-mix(in srgb,var(--codex-plus-startup-deep) 28%,transparent),inset 0 1px 0 color-mix(in srgb,var(--codex-plus-startup-foreground) 8%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);animation:codex-plus-startup-card-in 480ms cubic-bezier(.2,.75,.25,1) both}",
        ".codex-plus-pro-startup-mark{position:relative;width:62px;height:62px;margin-bottom:5px;border:1px solid color-mix(in srgb,var(--codex-plus-startup-highlight) 60%,transparent);border-radius:50%;background:linear-gradient(145deg,var(--codex-plus-startup-accent),var(--codex-plus-startup-deep));box-shadow:0 0 0 7px color-mix(in srgb,var(--codex-plus-startup-accent) 10%,transparent),0 0 32px color-mix(in srgb,var(--codex-plus-startup-accent) 24%,transparent);animation:codex-plus-startup-mark 720ms ease-in-out both}",
        ".codex-plus-pro-startup-mark span{position:absolute;inset:12px;background-image:var(--codex-pokedex-ball-logo);background-position:center;background-repeat:no-repeat;background-size:contain}",
        ".codex-plus-pro-startup-title{font-size:19px;font-weight:700;letter-spacing:.02em}",
        ".codex-plus-pro-startup-caption{font-size:12px;opacity:.66}",
        ".codex-plus-pro-startup-progress{width:112px;height:3px;overflow:hidden;border-radius:99px;background:color-mix(in srgb,var(--codex-plus-startup-accent) 16%,transparent)}",
        ".codex-plus-pro-startup-progress span{display:block;width:42%;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--codex-plus-startup-accent),var(--codex-plus-startup-highlight));animation:codex-plus-startup-progress 1.05s ease-in-out infinite}",
        "@keyframes codex-plus-startup-in{from{opacity:0}to{opacity:1}}",
        "@keyframes codex-plus-startup-wallpaper{from{transform:scale(1.065);opacity:.78}to{transform:scale(1.015);opacity:1}}",
        "@keyframes codex-plus-startup-card-in{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}",
        "@keyframes codex-plus-startup-mark{0%{transform:scale(.82) rotate(-10deg);opacity:.2}55%{transform:scale(1.05) rotate(3deg);opacity:1}100%{transform:scale(1) rotate(0)}}",
        "@keyframes codex-plus-startup-glow{0%{opacity:.2;transform:scale(.84)}55%{opacity:1;transform:scale(1)}100%{opacity:.75;transform:scale(1.04)}}",
        "@keyframes codex-plus-startup-grid{from{transform:perspective(800px) rotateX(48deg) translateY(0)}to{transform:perspective(800px) rotateX(48deg) translateY(48px)}}",
        "@keyframes codex-plus-startup-scan{from{transform:translateX(0) rotate(-18deg);opacity:0}20%{opacity:1}to{transform:translateX(470%) rotate(-18deg);opacity:0}}",
        "@keyframes codex-plus-startup-orbit{to{transform:rotate(360deg)}}",
        "@keyframes codex-plus-startup-node{from{opacity:.3;transform:translateY(3px)}to{opacity:.85;transform:translateY(-3px)}}",
        "@keyframes codex-plus-startup-progress{0%{transform:translateX(-115%)}100%{transform:translateX(270%)}}",
        "@media (prefers-reduced-motion:reduce){.codex-plus-pro-startup-splash,.codex-plus-pro-startup-wallpaper,.codex-plus-pro-startup-card,.codex-plus-pro-startup-mark,.codex-plus-pro-startup-splash::before,.codex-plus-pro-startup-progress span,.codex-plus-pro-startup-tech *,.codex-plus-pro-startup-tech *::before,.codex-plus-pro-startup-tech *::after{animation:none!important}.codex-plus-pro-startup-scan,.codex-plus-pro-startup-nodes{display:none}.codex-plus-pro-startup-card{backdrop-filter:none;-webkit-backdrop-filter:none}}",
        "@media (prefers-reduced-transparency:reduce){.codex-plus-pro-startup-card{background:var(--codex-plus-startup-background);backdrop-filter:none;-webkit-backdrop-filter:none}}",
    ].join("\n");

function startupTokens(css) {
  const blocks = [];
  for (const match of css.matchAll(/(?:^|\n)(:root[^{}]*)\{([^{}]*)\}/g)) {
    if (!match[1].split(",").every((selector) => /^:root(?:\[[^\]]+\]|\.[\w-]+)*$/.test(selector.trim()))) continue;
    const tokens = match[2].match(/--(?:startup-background|color-token-text-primary|codex-plus-accent(?:-dark)?|codex-plus-highlight)\s*:[^;]+;/g);
    if (tokens?.length) blocks.push(match[1] + "{" + tokens.join("") + "}");
  }
  return blocks.join("\n");
}

export function buildStartupSource({ css, assetSource }) {
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
      window.removeEventListener("pagehide", cleanup);
      document.removeEventListener("DOMContentLoaded", sync);
      splash?.remove();
      style?.remove();
      document.documentElement?.setAttribute("data-codex-plus-startup-state", "ready");
      if (window.__codexPlusProStartupSplashCleanup === cleanup) delete window.__codexPlusProStartupSplashCleanup;
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
      }
      if (document.body && splash.parentNode !== document.body) document.body.appendChild(splash);
      if (!contentReady()) {
        if (readyFrame !== null) window.cancelAnimationFrame(readyFrame);
        readyFrame = null;
        return;
      }
      // Check across a painted frame so a transient empty/loading handoff cannot
      // expose the next React fallback. No fixed startup duration or timeout.
      if (readyFrame === null) readyFrame = window.requestAnimationFrame(() => {
        readyFrame = window.requestAnimationFrame(() => {
          readyFrame = null;
          if (contentReady()) cleanup();
        });
      });
    };
    window.__codexPlusProStartupSplashCleanup = cleanup;
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-theme", "class", "hidden", "aria-hidden"] });
    window.addEventListener("pagehide", cleanup, { once: true });
    document.addEventListener("DOMContentLoaded", sync, { once: true });
    sync();
  })()`;
}
