// Optional visual verification using an existing Playwright installation.
// Also exports a standalone preview when CODEX_PLUS_UI_ARTIFACT_DIR is set.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { buildStartupSource } from "../source/startup-splash.mjs";
import { createStartupTiming } from "../source/startup-timing.mjs";

const { chromium } = process.env.CODEX_PLUS_PLAYWRIGHT_PATH
  ? createRequire(path.resolve(process.env.CODEX_PLUS_PLAYWRIGHT_PATH))("playwright")
  : await import("playwright");
const css = await fs.readFile(new URL("../source/theme.css", import.meta.url), "utf8");
const injector = await fs.readFile(new URL("../source/injector.mjs", import.meta.url), "utf8");
const accentOptions = vm.runInNewContext("(" + injector.match(/const ACCENT_OPTIONS = (\{[\s\S]*?\n\});/)[1] + ")");
const packs = JSON.parse(await fs.readFile(new URL("../source/theme-packs.json", import.meta.url), "utf8")).accents;
const files = {};
for (const name of new Set(Object.values(packs).flatMap(pack => [pack.wallpaper, pack.logo]))) {
  const bytes = await fs.readFile(new URL("../source/assets/" + name, import.meta.url));
  files[name] = `data:image/${name.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
}
const json = value => JSON.stringify(value).replaceAll("<", "\\u003c");
const runtime = buildStartupSource({ css, assetSource: "", accentOptions });
const timingKey = "codex-plus-pro-startup-timing-v1";
const profiles = Object.fromEntries([0, 8000, 14000].map(ms => {
  const history = ms ? { version: 1, samples: [{ readyAt: 1792120000000, launcherMs: ms + 2000, rendererMs: ms, visibleReadyMs: ms, hiddenMs: 0, introMs: 6400, overlayMs: ms + 180 }] } : null;
  return [ms, { history, introMs: createStartupTiming({ getItem: () => JSON.stringify(history) }).introMs }];
}));
const introMs = profiles[0].introMs;
const nominalToActual = ms => ms <= 2800 ? ms * (introMs - 400) / 2800 : introMs - 400 + ms - 2800;
const preview = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Codex Plus Pro · 启动动画预览</title>
<style>
  *{box-sizing:border-box}body{margin:0;background:#0d141c;color:#e6f0ed;font:14px/1.5 'Segoe UI',system-ui,sans-serif}
  main{max-width:1120px;margin:32px auto;padding:0 24px}header{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:20px}
  h1{font-size:22px;font-weight:600;margin:0 0 5px;letter-spacing:-.03em}p{margin:0;color:#97aaa5;font-size:12px}
  .options,.tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap}label{font-size:12px;color:#b9cbc5}
  select,button{font:inherit;color:inherit;background:#19232c;border:1px solid #304049;border-radius:7px;padding:7px 11px;cursor:pointer}
  button:hover,button[aria-pressed=true]{border-color:#8cdeba;background:#203930}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #8cdeba;outline-offset:3px}
  iframe{display:block;width:100%;aspect-ratio:16/9;border:1px solid #2c3c44;border-radius:10px;background:#08121a}
  nav{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:16px 0}nav button{font-size:12px;text-align:left}nav small{display:block;color:#8fa59c;font-size:11px;margin-top:2px}
  .scrub{display:flex;gap:16px;align-items:center;margin:20px 0}input[type=range]{flex:1;accent-color:#8cdeba}output{font:12px Consolas,monospace;white-space:nowrap;color:#a4bcb1}
  @media(max-width:640px){main{margin:16px auto;padding:0 12px}header{align-items:start;flex-direction:column}iframe{aspect-ratio:4/5}nav{grid-template-columns:repeat(2,1fr)}nav button:last-child{grid-column:1/-1}}
</style>
<main><header><div><h1>Codex Plus Pro</h1><p>首次开场 6.4 秒；后续按实际启动耗时调整，等待期间保持动效。</p></div>
<div class="options"><label>主题 <select id="accent"><option value="aria">Aria 蓝</option><option value="forest">森林绿</option><option value="pokedex">图鉴红</option><option value="lagoon">湖泊青</option><option value="graphite">石墨灰</option></select></label>
<label>外观 <select id="mode"><option value="dark">深色</option><option value="light">浅色</option></select></label></div></header>
<iframe id="stage" title="启动动画预览"></iframe>
<nav aria-label="关键帧"><button data-time="250">深空初始化<small></small></button><button data-time="900">几何成形<small></small></button><button data-time="1650">核心激活<small></small></button><button data-time="2300">文字落地<small></small></button><button data-time="3000">最终定格<small></small></button></nav>
<div class="scrub"><input id="timeline" type="range" min="0" max="6400" step="10" value="0" aria-label="动画时间"><output id="time">0.00s / 6.40s</output></div>
<div class="tools"><button id="replay">重新播放</button><button id="complete">模拟加载完成</button><label>启动参考 <select id="pace"><option value="0">首次启动（6.4 秒）</option><option value="8000">最近耗时 8 秒</option><option value="14000">最近耗时 14 秒</option></select></label><label>加载 <select id="load"><option value="manual">保持加载（持续动效）</option><option value="fast">快速就绪</option><option value="normal">正常就绪</option></select></label><p>点击关键帧或拖动时间轴，可暂停查看细节。</p></div></main>
<script>
  const runtime=${json(runtime)},packs=${json(packs)},files=${json(files)},profiles=${json(profiles)},timingKey=${json(timingKey)};
  const stage=document.getElementById('stage'),timeline=document.getElementById('timeline'),output=document.getElementById('time');
  let replayFrame=null,playing=false,started=0,introMs=6400;
  const fromNominal=ms=>ms<=2800?ms*(introMs-400)/2800:introMs-400+ms-2800;
  function meter(ms){timeline.value=ms;output.textContent=(ms/1000).toFixed(2)+'s / '+(introMs/1000).toFixed(2)+'s';document.querySelectorAll('[data-time]').forEach((b,i)=>b.setAttribute('aria-pressed',String(ms >= fromNominal([0,500,1300,2000,2600][i]) && ms < fromNominal([500,1300,2000,2600,Infinity][i]))))}
  function seek(ms){playing=false;cancelAnimationFrame(replayFrame);stage.contentWindow.__startupPreview?.seek(ms);meter(ms)}
  function tick(now){if(!playing)return;const ms=Math.min(introMs,now-started);meter(ms);if(ms<introMs)replayFrame=requestAnimationFrame(tick);else playing=false}
  function mount(){
    const profile=profiles[document.getElementById('pace').value];introMs=profile.introMs;timeline.max=introMs;
    document.querySelectorAll('[data-time] small').forEach((small,i)=>{small.textContent=(fromNominal([0,500,1300,2000,2600][i])/1000).toFixed(1)+'–'+(fromNominal([500,1300,2000,2600,3200][i])/1000).toFixed(1)+'s'});
    playing=false;cancelAnimationFrame(replayFrame);meter(0);
    const accent=document.getElementById('accent').value,mode=document.getElementById('mode').value,pack=packs[accent];
    const init=(stage.dataset.startHidden?'Object.defineProperty(document,"hidden",{configurable:true,value:true});':'')+
      'const startedAt=performance.now(),root=document.documentElement;root.style.setProperty("--codex-pokedex-wallpaper",'+JSON.stringify('url("'+files[pack.wallpaper]+'")')+');root.style.setProperty("--codex-pokedex-ball-logo",'+JSON.stringify('url("'+files[pack.logo]+'")')+');'+
      'document.addEventListener("animationend",event=>{if(window.__startupPreview?.scrubbing)event.stopImmediatePropagation()},true);'+
      'window.__startupPreviewStorage=new Map([["codex-plus-pro-settings-v1",'+JSON.stringify(JSON.stringify({theme:true,accent}))+'],['+JSON.stringify(timingKey)+','+JSON.stringify(JSON.stringify(profile.history))+']]);'+
      'new Function("location","localStorage",'+JSON.stringify(runtime)+')(new URL("app://-/index.html"),{getItem:key=>window.__startupPreviewStorage.get(key),setItem:(key,value)=>window.__startupPreviewStorage.set(key,value)});'+
      'window.__startupPreview={introMs:'+introMs+',events:[],compositionAt:null,scrubbing:false,seek:ms=>{window.__startupPreview.scrubbing=true;document.querySelector("[data-codex-plus-startup-splash]")?.removeAttribute("data-waiting");document.getAnimations().forEach(a=>{a.pause();a.currentTime=ms})},complete:()=>{const state=window.__startupPreview;if(state.scrubbing){state.seek(state.introMs);state.scrubbing=false;document.getAnimations().forEach(a=>{a.currentTime=a.effect.getComputedTiming().endTime-1;a.play()})}document.getElementById("root").innerHTML="<button>工作区已就绪</button>"},loading:()=>{document.getElementById("root").innerHTML="<div class=startup-loader><div class=startup-loader__logo>原始启动画面</div></div>"}};'+
      'const splash=document.querySelector("[data-codex-plus-startup-splash]"),state=window.__startupPreview;'+
      'Promise.all(splash.getAnimations({subtree:true}).map(a=>a.finished)).then(()=>{state.compositionAt=performance.now()-startedAt}).catch(()=>{});'+
      'new MutationObserver(()=>{const phase=splash.isConnected?splash.getAttribute("data-phase")||"loading":"ready";if(state.events.at(-1)?.phase===phase)return;const animations=splash.getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation);state.events.push({phase,at:performance.now()-startedAt,wallpaper:getComputedStyle(splash.querySelector(".codex-plus-pro-startup-wallpaper")).opacity,wordmark:getComputedStyle(splash.querySelector(".codex-plus-pro-startup-wordmark")).opacity,moving:animations.some(a=>a.playState==="running"),rates:[...new Set(animations.map(a=>a.playbackRate))]})}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["data-phase"]});'+
      (document.getElementById('load').value==='manual'?'':'setTimeout(state.complete,'+(document.getElementById('load').value==='fast'?100:1000)+');');
    stage.srcdoc='<!doctype html><html lang="zh-CN" data-theme="'+mode+'"><meta charset="utf-8"><style>body{margin:0;background:#101921;color:#e3f0ea;font-family:system-ui}html[data-theme=light] body{background:#f4f8fd;color:#1f3a5f}#root{min-height:100vh;display:grid;place-items:center}.startup-loader__logo{font-size:36px}button{padding:12px 20px;border:1px solid #587467;border-radius:8px;background:#192e26;color:#def5e8}html[data-theme=light] button{background:#eaf2fb;border-color:#b4cbe0;color:#1f3a5f}</style><body><div id="root"><div class="startup-loader"><div class="startup-loader__logo">原始启动画面</div></div></div><script>'+init+'<'+ '/script>';
  }
  stage.addEventListener('load',()=>{started=performance.now();playing=true;replayFrame=requestAnimationFrame(tick)});
  timeline.addEventListener('input',()=>seek(Number(timeline.value)));
  document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>seek(fromNominal(Number(button.dataset.time)))));
  document.getElementById('accent').addEventListener('change',mount);
  document.getElementById('mode').addEventListener('change',()=>stage.contentDocument?.documentElement.setAttribute('data-theme',document.getElementById('mode').value));
  document.getElementById('load').addEventListener('change',mount);
  document.getElementById('pace').addEventListener('change',mount);
  document.getElementById('replay').addEventListener('click',mount);document.getElementById('complete').addEventListener('click',()=>{stage.contentWindow.__startupPreview?.complete()});
  mount();
</script></html>`;

const artifactDir = process.env.CODEX_PLUS_UI_ARTIFACT_DIR;
if (artifactDir) {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, "startup-animation-preview.html"), preview);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, reducedMotion: "no-preference" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://codex-plus-startup.test/", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: preview }));
  await page.goto("http://codex-plus-startup.test/");
  const frame = () => page.frames().find(f => f.parentFrame() === page.mainFrame());
  const ready = async () => {
    await page.frameLocator("#stage").locator("[data-codex-plus-startup-splash]").waitFor();
    await frame().waitForFunction(() => window.__startupPreview && document.querySelector('[data-playback=running]') && document.getAnimations().length > 0);
  };
  const seek = async ms => {
    await page.locator("#timeline").evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event("input")); }, nominalToActual(ms));
    return frame().evaluate(() => {
      const el = name => document.querySelector('.codex-plus-pro-startup-' + name);
      const style = name => getComputedStyle(el(name));
      const rect = el('mark').getBoundingClientRect();
      const orbit = name => {
        const matrix = new DOMMatrixReadOnly(style(name).transform);
        const bounds = el(name).getBoundingClientRect();
        return { angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI, scale:Math.hypot(matrix.a,matrix.b), centerX:bounds.x+bounds.width/2, centerY:bounds.y+bounds.height/2 };
      };
      return {
        wallpaper: Number(style('wallpaper').opacity), wordmark: Number(style('wordmark').opacity),
        ring: Number(style('ring').opacity), dash: parseFloat(style('ring').strokeDashoffset),
        innerRing: Number(style('inner-ring').opacity), innerDash: parseFloat(style('inner-ring').strokeDashoffset),
        outerOrbit: orbit('ring'), innerOrbit: orbit('inner-ring'),
        ticks: document.querySelectorAll('.codex-plus-pro-startup-ticks').length,
        core: Number(style('core-logo').opacity), pulse: Number(getComputedStyle(el('mark'), '::after').opacity),
        particles: Math.max(...[...el('particles').children].map(e => Number(getComputedStyle(e).opacity))),
        center: rect.x + rect.width / 2, width: innerWidth, transform: style('mark').transform,
        nativeLogo: getComputedStyle(document.querySelector('.startup-loader__logo')).visibility,
      };
    });
  };
  const appearance = () => frame().evaluate(() => {
    const splash = document.querySelector('[data-codex-plus-startup-splash]');
    const styles = getComputedStyle(splash);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const rgb = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const luminance = color => rgb(color).map(c => { const v = c / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const background = styles.backgroundColor;
    const text = getComputedStyle(splash.querySelector('.codex-plus-pro-startup-wordmark')).color;
    const backgroundLight = luminance(background);
    return {
      background: rgb(background), text: rgb(text), backgroundLight, textLight: luminance(text),
      textContrast: ['title', 'edition', 'caption'].map(name => {
        const foreground = luminance(getComputedStyle(splash.querySelector('.codex-plus-pro-startup-' + name)).color);
        return (Math.max(backgroundLight, foreground) + .05) / (Math.min(backgroundLight, foreground) + .05);
      }),
      overlay: getComputedStyle(splash, '::after').backgroundImage,
      wallpaper: getComputedStyle(splash.querySelector('.codex-plus-pro-startup-wallpaper')).backgroundImage,
      motion: splash.getAnimations({subtree:true}).filter(a => a instanceof CSSAnimation && a.animationName !== 'codex-plus-startup-wait').map(a => ({name:a.animationName, delay:a.effect.getTiming().delay, duration:a.effect.getTiming().duration})),
    };
  });
  await ready();
  assert.equal((await seek(0)).ticks, 0, "the geometry must have no dial ticks");
  const orbitStart = await seek(700), orbitEnd = await seek(1000);
  assert.ok(orbitEnd.outerOrbit.angle > orbitStart.outerOrbit.angle + 5, "the outer arc makes a short clockwise turn while drawing");
  assert.ok(orbitEnd.innerOrbit.angle < orbitStart.innerOrbit.angle - 5, "the inner arc turns in the opposite direction");
  assert.ok(orbitStart.dash > 0 && orbitStart.innerDash < 0, "the arcs close in opposing directions");
  for (const sample of [orbitStart, orbitEnd]) {
    assert.ok(Math.abs(sample.outerOrbit.centerX - sample.innerOrbit.centerX) < .5 && Math.abs(sample.outerOrbit.centerY - sample.innerOrbit.centerY) < .5, "the moving rings remain concentric");
  }
  const formed = await seek(1300);
  assert.ok(Math.abs(formed.dash) < .002 && Math.abs(formed.innerDash) < .002, "both arcs close before core activation");
  const beforePulse = await seek(1580), activated = await seek(1690);
  assert.ok(beforePulse.core > .9 && beforePulse.pulse === 0, "the logo becomes clear before its activation pulse");
  assert.ok(activated.core === 1 && activated.pulse > .3, "the clear logo triggers a single visible pulse");
  const samples = [];
  for (const [i, ms] of [250, 900, 1650, 2300, 3000].entries()) {
    const sample = await seek(ms);
    assert.equal(sample.nativeLogo, "hidden", "the original logo must remain covered throughout startup");
    samples.push(sample);
    if (artifactDir) await page.locator("#stage").screenshot({ path: path.join(artifactDir, `startup-keyframe-${i + 1}.png`) });
  }
  assert.equal(samples[0].wallpaper, 0);
  assert.equal(samples[0].wordmark, 0);
  assert.equal(samples[0].ring, 0);
  assert.ok(samples[0].particles > .1);
  assert.ok(samples[1].dash > 0 && samples[1].dash < 1, "the ring must draw progressively");
  assert.ok(Math.abs(samples[1].center - samples[1].width / 2) < 1, "geometry forms at the center");
  assert.ok(samples[2].core > .25 && samples[2].pulse > .1, "core activation includes one visible pulse");
  assert.ok(samples[3].wordmark > 0 && samples[3].wordmark < 1);
  assert.equal(samples[3].wallpaper, 0, "the background stays quiet until the wordmark has appeared");
  assert.equal(samples[4].wordmark, 1);
  assert.equal(samples[4].wallpaper, .62, "the final composition must settle before the intro deadline");
  assert.equal(samples[4].pulse, 0);
  assert.equal(samples[4].particles, 0);
  assert.ok(samples[4].ring <= .7 && samples[4].innerRing < samples[4].ring, "the rings recede behind the logo and wordmark at rest");
  assert.ok(samples[4].center < samples[1].center - 90, "the core makes room for the right-hand wordmark");
  assert.deepEqual(await seek(3200), await seek(8000), "the brand entrance must not replay after its final keyframe");

  for (const accent of Object.keys(packs)) {
    await page.locator("#accent").selectOption(accent);
    await ready();
    await seek(3200);
    assert.equal(await frame().evaluate(() => document.documentElement.getAttribute('data-codex-plus-accent')), accent);
    const colors = await frame().evaluate(() => { const s = getComputedStyle(document.documentElement); return ['accent','accent-dark','highlight'].map(key => s.getPropertyValue('--codex-plus-'+key).trim()); });
    assert.deepEqual(colors, [accentOptions[accent].color, accentOptions[accent].dark, accentOptions[accent].highlight], "first paint must use the same palette as the settings renderer");
    const asset = await frame().evaluate(() => getComputedStyle(document.querySelector('.codex-plus-pro-startup-wallpaper')).backgroundImage);
    assert.ok(asset.includes(files[packs[accent].wallpaper].slice(0, 70)), "each theme retains its own wallpaper");
    const dark = await appearance();
    if (artifactDir) await page.locator("#stage").screenshot({ path: path.join(artifactDir, `startup-${accent}-dark.png`) });
    await page.locator("#mode").selectOption("light");
    await ready();
    await seek(3200);
    const light = await appearance();
    assert.notDeepEqual(light.background, dark.background, `${accent}: light and dark startup backgrounds must visibly differ`);
    assert.ok(light.backgroundLight > .8 && dark.backgroundLight < .05, `${accent}: each mode must follow the workspace brightness`);
    assert.ok(light.textLight < .15 && dark.textLight > .6, `${accent}: light mode uses dark lettering and dark mode uses light lettering`);
    assert.ok([...light.textContrast, ...dark.textContrast].every(value => value >= 4.5), `${accent}: title and supporting text must contrast with their base surface`);
    assert.notEqual(light.overlay, dark.overlay, `${accent}: the wallpaper wash must also follow the mode`);
    assert.equal(light.wallpaper, dark.wallpaper, "appearance changes retain the selected theme artwork");
    assert.deepEqual(light.motion, dark.motion, "appearance changes share one motion sequence");
    if (artifactDir) await page.locator("#stage").screenshot({ path: path.join(artifactDir, `startup-${accent}-light.png`) });
    await page.locator("#mode").selectOption("dark");
    await ready();
  }

  await page.locator("#mode").selectOption("light");
  await ready();
  await seek(3200);
  const bounds = await frame().evaluate(() => ['mark','wordmark'].map(name => { const b = document.querySelector('.codex-plus-pro-startup-'+name).getBoundingClientRect(); return { left:b.left, right:b.right, width:innerWidth }; }));
  assert.ok(bounds.every(b => b.left >= 0 && b.right <= b.width), "brand must fit the desktop startup window");
  if (artifactDir) await page.locator("#stage").screenshot({ path: path.join(artifactDir, "startup-desktop-light.png") });

  const timings = [];
  for (const load of ["fast", "normal"]) {
    await page.locator("#load").selectOption(load);
    await page.frameLocator("#stage").locator("[data-codex-plus-startup-splash]").waitFor({ state: "detached" });
    const state = await frame().evaluate(() => window.__startupPreview);
    const leaving = state.events.find(event => event.phase === "leaving");
    assert.ok(leaving, "ready content must trigger a fade");
    assert.equal(leaving.wallpaper, "0.8");
    assert.equal(leaving.wordmark, "1");
    assert.equal(leaving.moving, false, "the five-stage composition must finish before fading");
    assert.ok(leaving.at - state.compositionAt >= 360, "both readiness paths must hold their stable composition for 0.4s: " + JSON.stringify({ load, leaving, compositionAt: state.compositionAt }));
    assert.ok(leaving.at >= introMs, "a fast workspace must still show all five stages");
    assert.deepEqual(leaving.rates, [1], "readiness must not accelerate the animation");
    const measured = await frame().evaluate(key => ({ sample:window.__codexPlusProStartupTiming, saved:JSON.parse(window.__startupPreviewStorage.get(key)) }), timingKey);
    assert.equal(measured.sample.introMs, introMs);
    assert.equal(measured.sample.launcherMs, null, "a preview must not invent a native launcher measurement");
    assert.ok(measured.sample.visibleReadyMs < measured.sample.overlayMs - 1000, "true readiness must be captured before the longer entrance completes");
    assert.deepEqual(measured.saved.samples.at(-1), measured.sample);
    timings.push({ load, leaving: Math.round(leaving.at), hold: Math.round(leaving.at - state.compositionAt), ready:measured.sample.visibleReadyMs });
  }

  await page.locator('#load').selectOption('manual');
  for (const profile of ['8000', '14000']) {
    await page.locator('#pace').selectOption(profile); await ready();
    const expected = profiles[profile].introMs;
    const pacing = await frame().evaluate(() => {
      const splash = document.querySelector('[data-codex-plus-startup-splash]');
      return { introMs:Number(splash.getAttribute('data-intro-ms')), motionEnd:Math.max(...splash.getAnimations({subtree:true}).map(a=>a.effect.getComputedTiming().endTime)) };
    });
    assert.equal(pacing.introMs, expected);
    assert.ok(Math.abs(pacing.motionEnd - (expected - 400)) < 1, 'every finite stage must follow the learned startup budget');
  }
  await page.locator('#pace').selectOption('0'); await ready();

  // Simulate the Electron visibility signal while exercising real CSS motion.
  // Headless Chromium keeps every tab visible, so hiding an iframe is not a
  // Page Visibility transition and cannot represent a hidden native window.
  await page.locator("#stage").evaluate(stage => { stage.dataset.startHidden = 'true'; });
  await page.locator("#load").selectOption("manual");
  await page.frameLocator("#stage").locator("[data-codex-plus-startup-splash]").waitFor({ state:'attached' });
  await frame().waitForFunction(() => window.__startupPreview, null, { polling:50 });
  const waitingFrame = await frame().evaluate(() => {
    const splash = document.querySelector('[data-codex-plus-startup-splash]');
    return { playback:splash.getAttribute('data-playback'), opacity:getComputedStyle(splash.querySelector('.codex-plus-pro-startup-wordmark')).opacity };
  });
  await page.waitForTimeout(3500);
  assert.equal(waitingFrame.playback, "paused");
  assert.equal(waitingFrame.opacity, "0");
  const unpresented = await frame().evaluate(() => ({
    times:document.getAnimations().map(animation => animation.currentTime),
    wordmark:getComputedStyle(document.querySelector('.codex-plus-pro-startup-wordmark')).opacity,
    wallpaper:getComputedStyle(document.querySelector('.codex-plus-pro-startup-wallpaper')).opacity,
  }));
  assert.ok(unpresented.times.every(time => time === 0), "waiting for presentation must not consume animation time");
  assert.equal(unpresented.wordmark, "0");
  assert.equal(unpresented.wallpaper, "0");
  await frame().evaluate(() => window.__startupPreview.complete());
  await frame().evaluate(() => {
    // Observe live rendering inside rAF, rather than sampling 900ms after a
    // remote command whose delivery can be delayed by desktop machine load.
    window.__startupPreview.formation = new Promise(resolve => {
      const sample = () => {
        const ring = document.querySelector('.codex-plus-pro-startup-ring');
        const orbit = ring.getAnimations()[0];
        const scale = (window.__startupPreview.introMs - 400) / 2800;
        if (!orbit || orbit.currentTime < 850 * scale) { requestAnimationFrame(sample); return; }
        const forming = { dash:parseFloat(getComputedStyle(ring).strokeDashoffset), wordmark:getComputedStyle(document.querySelector('.codex-plus-pro-startup-wordmark')).opacity };
        Object.defineProperty(document, 'hidden', { configurable:true, value:true });
        document.dispatchEvent(new Event('visibilitychange'));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve({ forming, pausedTimes:document.getAnimations().map(animation => animation.currentTime) })));
      };
      requestAnimationFrame(sample);
    });
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator("#stage").evaluate(stage => { delete stage.dataset.startHidden; });
  const { forming, pausedTimes } = await frame().evaluate(() => window.__startupPreview.formation);
  assert.ok(forming.dash > 0 && forming.dash < 1, "the first visible sequence must include ring formation: " + JSON.stringify(forming));
  assert.equal(forming.wordmark, "0", "delayed presentation must not open on the final composition");
  if (artifactDir) await page.locator("#stage").screenshot({ path:path.join(artifactDir, 'startup-visible-playback.png') });
  await page.waitForTimeout(1100);
  assert.deepEqual(await frame().evaluate(() => document.getAnimations().map(animation => animation.currentTime)), pausedTimes, "hidden playback must freeze every animation including pseudo-elements");
  assert.equal(await page.frameLocator("#stage").locator("[data-codex-plus-startup-splash]").count(), 1);
  await frame().evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.frameLocator("#stage").locator("[data-codex-plus-startup-splash]").waitFor({ state:'detached' });
  const resumed = await frame().evaluate(() => window.__startupPreview);
  const resumedLeaving = resumed.events.find(event => event.phase === 'leaving');
  // The preview event clock begins before its initial 3.5s without presentation.
  assert.ok(resumedLeaving.at - resumed.compositionAt >= 360, "resumed playback retains the real final hold");
  assert.ok(resumedLeaving.at >= 3500 + introMs + 1100, "neither pre-presentation nor hidden time may shorten the visible sequence");
  assert.ok((await frame().evaluate(() => window.__codexPlusProStartupTiming)).hiddenMs >= 3500, 'hidden startup is recorded separately from visible readiness');

  await page.locator("#load").selectOption("manual");
  await ready();
  await frame().waitForFunction(() => document.querySelector('[data-waiting=true]'));
  const waitingSample = () => frame().evaluate(() => {
    const el = name => document.querySelector('.codex-plus-pro-startup-' + name);
    const style = name => getComputedStyle(el(name));
    const orbit = el('waiting-orbit').getAnimations()[0];
    const geometry = name => { const r = el(name).getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; };
    return {
      at:orbit.currentTime, orbit:style('waiting-orbit').transform, inner:Number(style('inner-ring').opacity), wallpaper:style('wallpaper').transform,
      mark:geometry('mark'), wordmark:geometry('wordmark'), title:style('wordmark').opacity, core:style('core-logo').opacity,
      wallpaperOpacity:style('wallpaper').opacity, pulse:getComputedStyle(el('mark'),'::after').opacity,
      caption:el('caption').textContent, nativeLogo:getComputedStyle(document.querySelector('.startup-loader__logo')).visibility,
      loops:document.getAnimations().filter(a=>a.effect.getTiming().iterations===Infinity).map(a=>({name:a.animationName,state:a.playState,duration:a.effect.getTiming().duration})),
    };
  });
  const firstWait = await waitingSample();
  await frame().waitForFunction(time => document.querySelector('.codex-plus-pro-startup-waiting-orbit').getAnimations()[0].currentTime >= time + 900, firstWait.at);
  const laterWait = await waitingSample();
  for (const sample of [firstWait,laterWait]) {
    assert.deepEqual(sample.loops.map(a=>a.name).sort(), ['codex-plus-startup-wait','codex-plus-startup-wait-orbit','codex-plus-startup-wait-ring','codex-plus-startup-wait-wallpaper'].sort());
    assert.ok(sample.loops.every(a=>a.state==='running'));
    assert.equal(sample.loops.find(a=>a.name==='codex-plus-startup-wait-orbit').duration,4800, 'learning a longer entrance must not slow the continuous waiting orbit');
    assert.equal(sample.title,'1');
    assert.equal(sample.core,'1');
    assert.equal(sample.pulse,'0');
    assert.equal(sample.wallpaperOpacity,'0.8');
    assert.equal(sample.caption,'正在加载工作区');
    assert.equal(sample.nativeLogo,'hidden');
  }
  assert.notEqual(firstWait.orbit,laterWait.orbit,'a visible arc must keep rotating throughout loading');
  assert.notEqual(firstWait.wallpaper,laterWait.wallpaper,'the theme wallpaper must keep moving gently');
  assert.deepEqual(firstWait.mark,laterWait.mark,'the logo remains settled while loading');
  assert.deepEqual(firstWait.wordmark,laterWait.wordmark,'the wordmark remains settled while loading');
  if (artifactDir) await page.locator('#stage').screenshot({path:path.join(artifactDir,'startup-continuous-loading-light.png')});
  await page.locator('#mode').selectOption('dark');
  if (artifactDir) await page.locator('#stage').screenshot({path:path.join(artifactDir,'startup-continuous-loading-dark.png')});
  await page.locator('#mode').selectOption('light');
  const pausedWait = await frame().evaluate(async () => {
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return document.getAnimations().map(a=>a.currentTime);
  });
  await page.waitForTimeout(300);
  assert.deepEqual(await frame().evaluate(()=>document.getAnimations().map(a=>a.currentTime)),pausedWait,'continuous loading also pauses when hidden');
  await frame().evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
  await page.locator("#complete").click();
  await frame().waitForFunction(() => document.querySelector('[data-phase=leaving]'));
  const fading = await frame().evaluate(() => {
    const splash = document.querySelector('[data-codex-plus-startup-splash]');
    window.__startupPreview.loading();
    return getComputedStyle(splash).transitionDuration;
  });
  assert.equal(fading, "0.18s");
  await frame().waitForFunction(() => !document.querySelector('[data-phase=leaving]'));
  assert.equal(await frame().evaluate(() => getComputedStyle(document.querySelector('[data-codex-plus-startup-splash]')).opacity), "1", "a returning loader immediately restores an opaque cover");
  await page.waitForTimeout(250);
  assert.equal(await page.frameLocator("#stage").locator("[data-codex-plus-startup-splash]").count(), 1);
  assert.equal(await frame().evaluate(()=>document.querySelector('[data-waiting=true]')!==null),true,'a returning loader keeps continuous feedback');
  await page.emulateMedia({ reducedMotion:'reduce' });
  assert.equal(await frame().evaluate(()=>document.getAnimations().length),0,'enabling reduced motion also stops continuous loading');
  await page.locator("#complete").click();
  await page.frameLocator("#stage").locator("[data-codex-plus-startup-splash]").waitFor({ state:"detached" });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#replay").click();
  await page.frameLocator("#stage").locator("[data-codex-plus-startup-splash]").waitFor();
  const reduced = await frame().evaluate(() => ({ animations:document.getAnimations().length, title:getComputedStyle(document.querySelector('.codex-plus-pro-startup-wordmark')).opacity, wallpaper:getComputedStyle(document.querySelector('.codex-plus-pro-startup-wallpaper')).opacity }));
  assert.deepEqual(reduced, { animations:0, title:"1", wallpaper:"0.8" });
  await page.locator("#complete").click();
  await page.frameLocator("#stage").locator("[data-codex-plus-startup-splash]").waitFor({ state:"detached" });
  assert.equal(await frame().evaluate(() => document.documentElement.getAttribute('data-codex-plus-startup-state')), "ready");
  assert.deepEqual(errors, []);
  console.log("Startup visual checks passed: five keyframes, five light/dark themes, learned pacing, actual readiness records, full fast/normal playback, delayed presentation, continuous loading with stable branding, hidden/resumed motion, final hold, fade recovery and reduced motion.");
  console.log(JSON.stringify(timings));
} finally {
  await browser.close();
}
