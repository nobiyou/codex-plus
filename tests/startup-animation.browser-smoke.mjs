// Optional visual verification using an existing Playwright installation.
// Also exports a standalone preview when CODEX_PLUS_UI_ARTIFACT_DIR is set.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { buildStartupSource } from "../source/startup-splash.mjs";

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
<main><header><div><h1>Codex Plus Pro</h1><p>启动动画 · 五个关键帧，3.2 秒完成；加载较慢时停留最终画面。</p></div>
<div class="options"><label>主题 <select id="accent"><option value="aria">Aria 蓝</option><option value="forest">森林绿</option><option value="pokedex">图鉴红</option><option value="lagoon">湖泊青</option><option value="graphite">石墨灰</option></select></label>
<label>外观 <select id="mode"><option value="dark">深色</option><option value="light">浅色</option></select></label></div></header>
<iframe id="stage" title="启动动画预览"></iframe>
<nav aria-label="关键帧"><button data-time="250">深空初始化<small>0.0–0.5s</small></button><button data-time="900">几何成形<small>0.5–1.3s</small></button><button data-time="1650">核心激活<small>1.3–2.0s</small></button><button data-time="2300">文字落地<small>2.0–2.6s</small></button><button data-time="3000">最终定格<small>2.6–3.2s</small></button></nav>
<div class="scrub"><input id="timeline" type="range" min="0" max="3200" step="10" value="0" aria-label="动画时间"><output id="time">0.00s / 3.20s</output></div>
<div class="tools"><button id="replay">重新播放</button><button id="complete">模拟加载完成</button><p>点击关键帧或拖动时间轴，可暂停查看细节。</p></div></main>
<script>
  const runtime=${json(runtime)},packs=${json(packs)},files=${json(files)};
  const stage=document.getElementById('stage'),timeline=document.getElementById('timeline'),output=document.getElementById('time');
  let replayFrame=null,playing=false,started=0;
  function meter(ms){timeline.value=ms;output.textContent=(ms/1000).toFixed(2)+'s / 3.20s';document.querySelectorAll('[data-time]').forEach((b,i)=>b.setAttribute('aria-pressed',String(ms >= [0,500,1300,2000,2600][i] && ms < [500,1300,2000,2600,Infinity][i])))}
  function seek(ms){playing=false;cancelAnimationFrame(replayFrame);stage.contentWindow.__startupPreview?.seek(ms);meter(ms)}
  function tick(now){if(!playing)return;const ms=Math.min(3200,now-started);meter(ms);if(ms<3200)replayFrame=requestAnimationFrame(tick);else playing=false}
  function mount(){
    playing=false;cancelAnimationFrame(replayFrame);meter(0);
    const accent=document.getElementById('accent').value,mode=document.getElementById('mode').value,pack=packs[accent];
    const init='const root=document.documentElement;root.style.setProperty("--codex-pokedex-wallpaper",'+JSON.stringify('url("'+files[pack.wallpaper]+'")')+');root.style.setProperty("--codex-pokedex-ball-logo",'+JSON.stringify('url("'+files[pack.logo]+'")')+');'+
      'new Function("location","localStorage",'+JSON.stringify(runtime)+')(new URL("app://-/index.html"),{getItem:key=>key==="codex-plus-pro-settings-v1"?'+JSON.stringify(JSON.stringify({theme:true,accent}))+':null});'+
      'window.__startupPreview={seek:ms=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=ms}),complete:()=>{document.getElementById("root").innerHTML="<button>工作区已就绪</button>"}};';
    stage.srcdoc='<!doctype html><html lang="zh-CN" data-theme="'+mode+'"><meta charset="utf-8"><style>body{margin:0;background:#101921;color:#e3f0ea;font-family:system-ui}#root{min-height:100vh;display:grid;place-items:center}.startup-loader__logo{font-size:36px}button{padding:12px 20px;border:1px solid #587467;border-radius:8px;background:#192e26;color:#def5e8}</style><body><div id="root"><div class="startup-loader"><div class="startup-loader__logo">原始启动画面</div></div></div><script>'+init+'<'+ '/script>';
  }
  stage.addEventListener('load',()=>{started=performance.now();playing=true;replayFrame=requestAnimationFrame(tick)});
  timeline.addEventListener('input',()=>seek(Number(timeline.value)));
  document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>seek(Number(button.dataset.time))));
  document.getElementById('accent').addEventListener('change',mount);document.getElementById('mode').addEventListener('change',mount);
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
    await frame().waitForFunction(() => window.__startupPreview && document.getAnimations().length > 0);
  };
  const seek = async ms => {
    await page.locator("#timeline").evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event("input")); }, ms);
    return frame().evaluate(() => {
      const el = name => document.querySelector('.codex-plus-pro-startup-' + name);
      const style = name => getComputedStyle(el(name));
      const rect = el('mark').getBoundingClientRect();
      return {
        wallpaper: Number(style('wallpaper').opacity), wordmark: Number(style('wordmark').opacity),
        ring: Number(style('ring').opacity), dash: parseFloat(style('ring').strokeDashoffset),
        core: Number(style('core-logo').opacity), pulse: Number(getComputedStyle(el('mark'), '::after').opacity),
        particles: Math.max(...[...el('particles').children].map(e => Number(getComputedStyle(e).opacity))),
        center: rect.x + rect.width / 2, width: innerWidth, transform: style('mark').transform,
        nativeLogo: getComputedStyle(document.querySelector('.startup-loader__logo')).visibility,
      };
    });
  };
  await ready();
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
  assert.equal(samples[3].wallpaper, 0, "wallpaper belongs to the final keyframe");
  assert.equal(samples[4].wordmark, 1);
  assert.ok(samples[4].wallpaper > .5);
  assert.equal(samples[4].pulse, 0);
  assert.equal(samples[4].particles, 0);
  assert.ok(samples[4].center < samples[1].center - 90, "the core makes room for the right-hand wordmark");
  assert.deepEqual(await seek(3200), await seek(8000), "a slow load must hold the final composition without looping");

  for (const accent of Object.keys(packs)) {
    await page.locator("#accent").selectOption(accent);
    await ready();
    await seek(3200);
    assert.equal(await frame().evaluate(() => document.documentElement.getAttribute('data-codex-plus-accent')), accent);
    const colors = await frame().evaluate(() => { const s = getComputedStyle(document.documentElement); return ['accent','accent-dark','highlight'].map(key => s.getPropertyValue('--codex-plus-'+key).trim()); });
    assert.deepEqual(colors, [accentOptions[accent].color, accentOptions[accent].dark, accentOptions[accent].highlight], "first paint must use the same palette as the settings renderer");
    const asset = await frame().evaluate(() => getComputedStyle(document.querySelector('.codex-plus-pro-startup-wallpaper')).backgroundImage);
    assert.ok(asset.includes(files[packs[accent].wallpaper].slice(0, 70)), "each theme retains its own wallpaper");
  }

  await page.setViewportSize({ width: 344, height: 850 });
  await page.locator("#mode").selectOption("light");
  await ready();
  await seek(3200);
  const bounds = await frame().evaluate(() => ['mark','wordmark'].map(name => { const b = document.querySelector('.codex-plus-pro-startup-'+name).getBoundingClientRect(); return { left:b.left, right:b.right, width:innerWidth }; }));
  assert.ok(bounds.every(b => b.left >= 0 && b.right <= b.width), "brand must fit a 320px startup window");
  if (artifactDir) await page.locator("#stage").screenshot({ path: path.join(artifactDir, "startup-narrow-light.png") });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#replay").click();
  await page.frameLocator("#stage").locator("[data-codex-plus-startup-splash]").waitFor();
  const reduced = await frame().evaluate(() => ({ animations:document.getAnimations().length, title:getComputedStyle(document.querySelector('.codex-plus-pro-startup-wordmark')).opacity, wallpaper:getComputedStyle(document.querySelector('.codex-plus-pro-startup-wallpaper')).opacity }));
  assert.deepEqual(reduced, { animations:0, title:"1", wallpaper:"0.8" });
  await page.locator("#complete").click();
  await page.frameLocator("#stage").locator("[data-codex-plus-startup-splash]").waitFor({ state:"detached" });
  assert.equal(await frame().evaluate(() => document.documentElement.getAttribute('data-codex-plus-startup-state')), "ready");
  assert.deepEqual(errors, []);
  console.log("Startup visual checks passed: five keyframes, five themes, narrow/light layout, stable hold and reduced-motion recovery.");
} finally {
  await browser.close();
}
