# Codex Plus Pro for Windows (Scope B2) 1.8.6

Theme-oriented Windows launcher for official Microsoft Store ChatGPT / Codex (`OpenAI.Codex`) with Codex Plus Pro UI enhancements and local official MSIX version management.

**Status: Scope B2 1.8.6** — theme + accent + wallpaper/logo + light/dark + flat model picker + official pet show/hide control + compatibility checklist + button contrast polish + official MSIX local-version upgrade.
Picture-in-picture has been removed.

## Requirements

- Windows 10/11
- Microsoft Store ChatGPT / Codex (`OpenAI.Codex`)
- Node.js 22.5+ on PATH (required by the embedded Taskboard server)

## Quick start

Install desktop / Start Menu shortcuts once:

```powershell
cd windows
powershell -ExecutionPolicy Bypass -File .\install-shortcuts.ps1
```

Then double-click:

- **Codex Plus Pro** — themed launch
- **打开原版 Codex** — stop injection and open official app

Or run without shortcuts:

```powershell
.\launch.cmd
.\restore.cmd
```

Remove shortcuts:

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall-shortcuts.ps1
```

## What works (A)

- Stable Store launch (Codex++-aligned: port 9229 + allow-origins + inspect 9329)
- Settings panel: theme on/off, **5 accents** (图鉴红 / 海湾青 / 常青绿 / 石墨黑 / 清风蓝)
- Wallpaper mode (default/custom), custom wallpaper upload, wallpaper strength (0–100)
- Logo mode (default/custom), custom logo upload
- Accent-linked default wallpaper/logo packs via `theme-packs.json`
- Light mode + dark mode (`electron-dark`) glass skins for shell, sidebar, composer, banners, chat bubbles
- Theme CSS injection over CDP
- "恢复默认" resets theme + accent + wallpaper + logo to Scope A defaults
- **Flat model picker** on the composer (model / effort / Fast), toggle + density in settings
- **Desktop pet**: avatar-overlay visibility control + dismiss persistence (`pet-notifications.js`)
- **Official MSIX upgrade path**: FE3 Direct resolves the official Microsoft CDN package, imports it as a local managed version, and keeps only the newest managed version by default

## Notes on B2

- All major mac-aligned UI features now ship on Windows except any future extras.
- Pet requires Codex's native avatar-overlay window to exist.

## Official MSIX local upgrade

Codex Plus Pro can fetch the latest official `OpenAI.Codex` MSIX through Microsoft Store FE3 metadata and unpack the app into:

```text
%LOCALAPPDATA%\Codex-Plus-Pro\official\versions\<version>\
```

This does **not** replace or uninstall the Microsoft Store Appx under `C:\Program Files\WindowsApps`. The Store package remains a system-managed fallback, while Codex Plus Pro starts the newest valid managed version by default.

Resolve latest official package metadata:

```powershell
.\resolve-store-fe3-direct.ps1
```

Download and import the latest official package:

```powershell
.\resolve-store-fe3-direct.ps1 -Import -Force
```

Manual import from an already downloaded official MSIX:

```powershell
.\import-official-package.ps1 -PackagePath <OpenAI.Codex_...x64...msix> -Force
```

By default only the newest managed version is retained. Older managed versions under the Codex Plus Pro `official\versions` directory are removed after a successful import. Store Appx, login data, projects, and user settings are not touched.

## Package for distribution

```powershell
cd windows
powershell -ExecutionPolicy Bypass -File .\package.ps1
```

Creates `dist\Codex-Plus-Pro-Windows-<version>.zip` with launchers, source, assets, docs, and the embedded Taskboard runtime.
Recipients still need Node.js 22.5+ and Microsoft Store Codex installed.

## Launch recipe

```text
ChatGPT.exe
  --remote-debugging-port=9229
  --remote-allow-origins=http://127.0.0.1:9229
  --inspect=127.0.0.1:9329
```

Store installs are activated via AUMID / `IApplicationActivationManager` (same approach as Codex++).

## Troubleshooting

1. Open a PowerShell in `windows/` and run:

   ```powershell
   .\diagnose.ps1
   ```

   This prints: OS/Node, Codex install info, state dir, PID/port files, port availability, and recent log tail.

2. Common issues:
   - **Node not found**: Install Node 18+ and ensure `node` is on PATH. Re-open terminal after install.
   - **Official app not found**: Install "ChatGPT" (package `OpenAI.Codex`) from Microsoft Store.
   - **Port conflict (9229 in use)**: Close Codex++ themed sessions or other debug-enabled launches. `diagnose.ps1` shows free/busy near 9229.
   - **Theme not applying**: Run `.\restore.cmd`, wait a few seconds, then `.\launch.cmd` again. Check logs.
   - **Injector won't start**: Look at `logs\injector-stderr.log` and the tail from `diagnose.ps1`.

3. Logs live under:
   - `%LOCALAPPDATA%\Codex-Plus-Pro\logs\Codex-Plus-Pro.log`
   - `%LOCALAPPDATA%\Codex-Plus-Pro\logs\injector-stdout.log`
   - `%LOCALAPPDATA%\Codex-Plus-Pro\logs\injector-stderr.log`

4. To stop injection and open the clean official app:
   - Double-click **打开原版 Codex**, or run `.\restore.cmd`.

## Logs / state

- Logs: `%LOCALAPPDATA%\Codex-Plus-Pro\logs\`
- Asset cache: `%LOCALAPPDATA%\Codex-Plus-Pro\asset-cache\`
- Injector pid/port: `%LOCALAPPDATA%\Codex-Plus-Pro\`

## Optional theme packs (`theme-packs.json`)

When wallpaper/logo are on **default** mode, switching accent color can swap default wallpaper + logo.
Paths are configured in JSON (no rebuild required for mapping changes):

1. **Primary (preferred):** `windows/source/theme-packs.json`
2. **Optional user overlay:** `%LOCALAPPDATA%\Codex-Plus-Pro\theme-packs.json` (only fills/overwrites fields you set)
3. **Built-in fallback:** only used for accents/fields not present in any JSON, or when no JSON exists

Load order: **read `theme-packs.json` first** → apply user overlay → fill remaining gaps from built-in map.

Relative paths resolve under `windows/source/assets/`. Absolute paths are also allowed.
Missing files fall back to the built-in default wallpaper/logo. Custom uploads are never overwritten.

Example user override:

```json
{
  "version": 1,
  "accents": {
    "aria": {
      "wallpaper": "alternate-trainer-camp.jpg",
      "logo": "pokeball-logo-user.png"
    },
    "pokedex": {
      "wallpaper": "C:\\Users\\you\\Pictures\\my-wallpaper.jpg",
      "logo": "pokeball-logo-white.png"
    }
  }
}
```

Restart the themed launch after editing JSON so the injector reloads packs.

## Notes

- Do not run Codex++ themed launch and this launcher on the same debug port at once.
- Official app updates may break CSS selectors; use restore shortcut if needed.

## Version

Scope B1 — **1.7.6** (Windows). Pet forced alse at normalize/apply/CDP/main controller.
Model picker defaults **on** and is toggleable in settings. PiP is removed.

## Manual verification

After you launch, use the checklist in `QUICKTEST.md` (in the repo root) to confirm:
- Theme/accent/wallpaper/logo + model picker + pet controls work (no PiP).
- Pet hide/show affects avatar-overlay visibility when main controller is connected.
- "恢复默认" works and restore.ps1 gives a clean official Codex.


