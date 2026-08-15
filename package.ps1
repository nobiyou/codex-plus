#Requires -Version 5.1
# Build a distributable zip of Codex Plus Pro Windows (Scope A).
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptRoot
$SourceDir = Join-Path $ScriptRoot "source"
$TaskboardSource = Join-Path $ScriptRoot "taskbord"
$VersionFile = Join-Path $SourceDir "VERSION"
$Version = "1.8.5"
if (Test-Path $VersionFile) {
  $Version = (Get-Content -Path $VersionFile -Raw -ErrorAction SilentlyContinue).Trim()
  if (-not $Version) { $Version = "1.8.5" }
}

$DistRoot = Join-Path $RepoRoot "dist"
$StageName = "Codex-Plus-Pro-Windows-" + $Version
$StageDir = Join-Path $DistRoot $StageName
$ZipPath = Join-Path $DistRoot ($StageName + ".zip")

function Write-Step {
  param([string]$Message)
  Write-Host ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message)
}

Write-Step ("Packaging Codex Plus Pro Windows Scope B2 v" + $Version)

# Preflight: required files
$required = @(
  (Join-Path $ScriptRoot "launch.ps1"),
  (Join-Path $ScriptRoot "restore.ps1"),
  (Join-Path $ScriptRoot "diagnose.ps1"),
  (Join-Path $ScriptRoot "taskboard-runtime.psm1"),
  (Join-Path $ScriptRoot "official-codex.psm1"),
  (Join-Path $ScriptRoot "check-official-version.ps1"),
  (Join-Path $ScriptRoot "cleanup-official-version.ps1"),
  (Join-Path $ScriptRoot "resolve-store-fe3-direct.ps1"),
  (Join-Path $ScriptRoot "import-official-package.ps1"),
  (Join-Path $ScriptRoot "upgrade-official.ps1"),
  (Join-Path $ScriptRoot "store-templates\GetCookie.xml"),
  (Join-Path $ScriptRoot "store-templates\WUIDRequest.xml"),
  (Join-Path $ScriptRoot "store-templates\FE3FileUrl.xml"),
  (Join-Path $ScriptRoot "install-shortcuts.ps1"),
  (Join-Path $ScriptRoot "uninstall-shortcuts.ps1"),
  (Join-Path $ScriptRoot "launch.cmd"),
  (Join-Path $ScriptRoot "restore.cmd"),
  (Join-Path $ScriptRoot "README.md"),
  (Join-Path $SourceDir "injector.mjs"),
  (Join-Path $SourceDir "theme.css"),
  (Join-Path $SourceDir "theme-packs.json"),
  (Join-Path $SourceDir "VERSION")
)
foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw ("Missing required file: " + $path)
  }
}

$taskboardRequired = @(
  (Join-Path $TaskboardSource "server\index.mjs"),
  (Join-Path $TaskboardSource "server\app.mjs"),
  (Join-Path $TaskboardSource "shared"),
  (Join-Path $TaskboardSource "cli\taskctl.mjs"),
  (Join-Path $TaskboardSource "scripts\codex-rate-limits.mjs"),
  (Join-Path $TaskboardSource "dist\web\index.html"),
  (Join-Path $TaskboardSource "skills\manage-taskboard\SKILL.md"),
  (Join-Path $TaskboardSource "package.json")
)
foreach ($path in $taskboardRequired) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw ("Missing Taskboard runtime file: " + $path)
  }
}

# Optional syntax check when Node is available
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node -and $node.Source) {
  Write-Step "Running injector --check"
  & $node.Source (Join-Path $SourceDir "injector.mjs") --check
  if ($LASTEXITCODE -ne 0) {
    throw "injector.mjs --check failed"
  }
} else {
  Write-Step "Node not on PATH; skipping injector --check"
}

# Stage clean tree
if (Test-Path $StageDir) {
  Remove-Item -LiteralPath $StageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

$copyItems = @(
  "launch.ps1",
  "restore.ps1",
  "diagnose.ps1",
  "taskboard-runtime.psm1",
  "official-codex.psm1",
  "check-official-version.ps1",
  "cleanup-official-version.ps1",
  "resolve-store-fe3-direct.ps1",
  "import-official-package.ps1",
  "upgrade-official.ps1",
  "install-shortcuts.ps1",
  "uninstall-shortcuts.ps1",
  "launch.cmd",
  "restore.cmd",
  "package.ps1",
  "README.md",
  "RELEASE.md"
)
foreach ($name in $copyItems) {
  $from = Join-Path $ScriptRoot $name
  if (Test-Path -LiteralPath $from) {
    Copy-Item -LiteralPath $from -Destination (Join-Path $StageDir $name) -Force
  }
}

$templatesFrom = Join-Path $ScriptRoot "store-templates"
if (Test-Path -LiteralPath $templatesFrom) {
  Copy-Item -LiteralPath $templatesFrom -Destination (Join-Path $StageDir "store-templates") -Recurse -Force
}

# source/ (code + assets + packs)
$stageSource = Join-Path $StageDir "source"
Copy-Item -LiteralPath $SourceDir -Destination $stageSource -Recurse -Force

# Include the standalone Taskboard runtime without its development-only
# node_modules, source tree, tests, or repository metadata.
$stageTaskboard = Join-Path $StageDir "taskbord"
New-Item -ItemType Directory -Force -Path $stageTaskboard | Out-Null
foreach ($relativePath in @(
  "server",
  "shared",
  "cli",
  "scripts\codex-rate-limits.mjs",
  "dist\web",
  "skills\manage-taskboard",
  "package.json"
)) {
  $from = Join-Path $TaskboardSource $relativePath
  $to = Join-Path $stageTaskboard $relativePath
  if ((Get-Item -LiteralPath $from).PSIsContainer) {
    $toParent = Split-Path -Parent $to
    New-Item -ItemType Directory -Force -Path $toParent | Out-Null
    Copy-Item -LiteralPath $from -Destination $to -Recurse -Force
  } else {
    $toParent = Split-Path -Parent $to
    New-Item -ItemType Directory -Force -Path $toParent | Out-Null
    Copy-Item -LiteralPath $from -Destination $to -Force
  }
}

# Include quick verification checklist at package root
$quickTest = Join-Path $RepoRoot "QUICKTEST.md"
if (Test-Path $quickTest) {
  Copy-Item -LiteralPath $quickTest -Destination (Join-Path $StageDir "QUICKTEST.md") -Force
}

# Write a short INSTALL note
$installNote = @"
Codex Plus Pro for Windows (Scope B2) $Version

1. Install Node.js 22.5+ and Microsoft Store ChatGPT / Codex (OpenAI.Codex).
2. Unzip this folder anywhere (path without special permission issues preferred).
3. Optional: run install-shortcuts.ps1 once to create Desktop / Start Menu shortcuts.
4. Double-click launch.cmd (or Codex Plus Pro shortcut) for themed launch.
5. Double-click restore.cmd (or 打开原版 Codex) to stop injection and open clean app.
6. See README.md and QUICKTEST.md for details and verification.

Logs: %LOCALAPPDATA%\Codex-Plus-Pro\logs\
"@
[System.IO.File]::WriteAllText((Join-Path $StageDir "INSTALL.txt"), $installNote, [System.Text.UTF8Encoding]::new($false))

# Zip
New-Item -ItemType Directory -Force -Path $DistRoot | Out-Null
if (Test-Path $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}
Write-Step ("Creating zip: " + $ZipPath)
Compress-Archive -Path $StageDir -DestinationPath $ZipPath -CompressionLevel Optimal

$zipItem = Get-Item -LiteralPath $ZipPath
Write-Step ("Done. Stage: " + $StageDir)
Write-Step ("Zip: " + $ZipPath + " (" + [Math]::Round($zipItem.Length / 1MB, 2) + " MB)")
Write-Host ""
Write-Host "Recipients need: Windows 10/11 + Node 22.5+ + Store OpenAI.Codex"

