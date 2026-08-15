# Codex Plus Pro Windows — Release Notes

## 1.8.5 (official pet show/hide control)

**Status:** Aligns the settings panel pet switch with the official avatar-overlay control path.

### Fixed

- Settings → **宠物** now sends official `avatar-overlay-close` when hiding the pet.
- Settings → **宠物** sends official `avatar-overlay-open` once when showing the pet, avoiding double-toggle behavior.
- Window hide/show remains as a fallback so the pet stays controlled even if the official bridge is temporarily unavailable.

## 1.8.0 (official MSIX local upgrade)

**Status:** Adds an official Microsoft Store MSIX path for keeping Codex Plus Pro on the latest available ChatGPT/Codex build without replacing the Store Appx package.

### New

- FE3 Direct resolver: `resolve-store-fe3-direct.ps1`
- Official SOAP templates under `store-templates/`
- MSIX importer: `import-official-package.ps1`
- Managed local versions under `%LOCALAPPDATA%\Codex-Plus-Pro\official\versions\`
- Default retention policy keeps only the newest managed version
- Version panel distinguishes current launch source from the retained Microsoft Store Appx installation

### Notes

- This is a local managed-version upgrade, not a Microsoft Store Appx replacement.
- Store Appx, login data, projects, and user settings are left untouched.
- Default launch prefers the newest valid managed version, then falls back to Store Appx.

## 1.7.7 (Scope B2 pet)

**Status:** Enables desktop pet support on Windows.

### New

- Settings → **宠物**: show/hide + full/reduced motion
- Injects `pet-notifications.js` for dismiss persistence on avatar-overlay
- Main-process controller can hide/show `/avatar-overlay` windows from the pet flag
- Default **on** (existing installs get pet via normalize unless explicitly false)

### Notes

- Pet depends on Codex native avatar-overlay windows.
- Full hide/show requires main-process inspect (`--main-port`).

## 1.7.5 (Scope A+ model picker)

**Status:** Adds the flat model / effort / Fast bar from macOS Codex Plus Pro to Windows.

### New

- Flat model picker on the composer surface (model, thinking effort, Fast)
- Settings → **模型栏**: show/hide + compact/comfortable density
- Default **on** (existing installs that only stored theme settings will get `modelPicker: true` via normalize)
- Dark-mode styles for the flat picker

### Still disabled

- Desktop pet
- Picture-in-picture / always-on-top

### Requirements

Same as 1.7.4: Windows 10/11, Node 18+, Store `OpenAI.Codex`.

### Notes

- The bar drives Codex's native intelligence/model trigger (`data-codex-intelligence-trigger`).
- Official DOM changes may break option discovery; use settings to hide the bar if needed.

## 1.7.4 (Scope A complete)

**Status:** Theme-focused Windows port is feature-complete for Scope A and ready to distribute as a zip of scripts + assets (not an MSI installer).

### Included

- Stable Microsoft Store Codex / ChatGPT launch with loopback CDP injection
- Theme on/off
- Five accents: 图鉴红, 海湾青, 常青绿, 石墨黑, **清风蓝**
- Wallpaper default / custom upload + strength (0–100)
- Logo default / custom upload
- Accent-linked default wallpaper + logo packs (`theme-packs.json`)
- Light + dark mode adaptation (shell, sidebar, composer, quota banner, chat bubbles)
- Settings popover limited to Scope A controls
- `launch` / `restore` / `diagnose` / shortcut installers
- Pet, PiP, flat model picker hard-disabled

### Requirements

- Windows 10/11
- Node.js 18+ on PATH
- Microsoft Store package `OpenAI.Codex` (ChatGPT.exe)

### Ship checklist (maintainer)

1. `node windows/source/injector.mjs --check`
2. `powershell -ExecutionPolicy Bypass -File windows/package.ps1`
3. Manual smoke with `QUICKTEST.md` on a clean machine (or VM)
4. Confirm logs under `%LOCALAPPDATA%\Codex-Plus-Pro\logs\`
5. Confirm `restore.cmd` stops injector and opens clean official app

### Not included (Scope B+)

- Desktop pet
- Picture-in-picture / always-on-top multi-window

### Install (end user)

1. Unzip the release package
2. Optionally run `install-shortcuts.ps1`
3. Run `launch.cmd` for themed Codex
4. Run `restore.cmd` to return to official Codex without injection

See `README.md` and `INSTALL.txt` inside the package.

