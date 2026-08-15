#Requires -Version 5.1
# Codex Plus Pro — Windows Scope A diagnostics collector
# Run this and paste the output when reporting issues.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$StateRoot = Join-Path $env:LOCALAPPDATA "Codex-Plus-Pro"
$LogDir = Join-Path $StateRoot "logs"
$LogFile = Join-Path $LogDir "Codex-Plus-Pro.log"
$PidFile = Join-Path $StateRoot "injector.pid"
$PortFile = Join-Path $StateRoot "renderer-port.txt"
$ResolverPath = Join-Path $PSScriptRoot "official-codex.psm1"
$TaskboardRuntimePath = Join-Path $PSScriptRoot "taskboard-runtime.psm1"
$TaskboardStateRoot = Join-Path $StateRoot "taskboard"

function Section($title) {
  Write-Host ""
  Write-Host ("=== " + $title + " ===") -ForegroundColor Cyan
}

Section "Environment"
Write-Host ("Date (UTC): " + ([DateTime]::UtcNow.ToString("o")))
try {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
  if ($os) {
    Write-Host ("OS: " + $os.Caption + " " + $os.Version + " Build " + $os.BuildNumber)
    Write-Host ("OS Architecture: " + $os.OSArchitecture)
  }
} catch { Write-Host "OS query failed: $_" }

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $nodeVer = & $node.Source --version 2>$null
  $nodeVerText = "unknown"
  if ($nodeVer) { $nodeVerText = $nodeVer.ToString().Trim() }
  Write-Host ("Node: " + $node.Source + " -> " + $nodeVerText)
} else {
  Write-Host "Node: NOT FOUND on PATH"
}

Section "Official Codex / ChatGPT (Microsoft Store)"
$pkgs = @(Get-AppxPackage -Name "OpenAI.Codex" -ErrorAction SilentlyContinue)
if ($pkgs.Count -gt 0) {
  foreach ($p in $pkgs) {
    Write-Host ("Package: " + $p.PackageFullName)
    Write-Host ("  InstallLocation: " + $p.InstallLocation)
    Write-Host ("  Version: " + $p.Version)
    Write-Host ("  PackageFamilyName: " + $p.PackageFamilyName)
    $exe = Join-Path $p.InstallLocation "app\ChatGPT.exe"
    Write-Host ("  ChatGPT.exe present: " + (Test-Path -LiteralPath $exe))
  }
} else {
  Write-Host "No OpenAI.Codex Appx package found."
}

$localCandidates = @(
  (Join-Path $env:LOCALAPPDATA "Codex\versions\current\ChatGPT.exe"),
  (Join-Path $env:LOCALAPPDATA "Codex\versions\current\Codex.exe")
)
$foundLocal = $false
foreach ($c in $localCandidates) {
  if (Test-Path -LiteralPath $c) {
    Write-Host ("Local fallback exe: " + $c)
    $foundLocal = $true
  }
}
if (-not $foundLocal) { Write-Host "No local fallback exe found." }
Section "Managed Official Versions"
Write-Host ("Managed root: " + (Join-Path $env:LOCALAPPDATA "Codex-Plus-Pro\official"))
if (Test-Path -LiteralPath $ResolverPath) {
  try {
    Import-Module $ResolverPath -Force
    $managed = @(Get-CodexPlusManagedVersions)
    if ($managed.Count -gt 0) {
      Write-Host "Retained managed versions:"
      $managed | Sort-Object Version | ForEach-Object {
        Write-Host ("  " + $_.Version + " | " + $_.AppKind + " | " + $_.Path)
      }
    } else {
      Write-Host "No retained managed versions found."
    }
    $selected = Resolve-CodexPlusOfficialApp -Version latest
    if ($selected) {
      Write-Host ("Default resolver selection: " + $selected.Source + " " + $selected.Version + " " + $selected.AppKind)
      Write-Host ("  Path: " + $selected.Path)
      if ($selected.AppUserModelId) { Write-Host ("  AUMID: " + $selected.AppUserModelId) }
    } else {
      Write-Host "Default resolver selection: none"
    }
  } catch {
    Write-Host ("Managed resolver failed: " + $_.Exception.Message)
  }
} else {
  Write-Host "Resolver module missing: official-codex.psm1"
}

Section "State Directory"
Write-Host ("State root: " + $StateRoot)
Write-Host ("Exists: " + (Test-Path $StateRoot))
if (Test-Path $LogDir) {
  Write-Host "Logs:"
  Get-ChildItem -LiteralPath $LogDir -File -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host ("  " + $_.Name + " (" + $_.Length + " bytes, " + $_.LastWriteTime.ToString("o") + ")")
  }
} else {
  Write-Host "Logs directory does not exist."
}

if (Test-Path $PidFile) {
  $pidText = (Get-Content -Path $PidFile -Raw -ErrorAction SilentlyContinue).Trim()
  Write-Host ("Injector PID file: " + $pidText)
  if ($pidText -match '^\d+$') {
    $p = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
    if ($p) { Write-Host ("  Process running: " + $p.ProcessName + " (PID " + $p.Id + ")") }
    else { Write-Host "  Process not running (stale pid file)." }
  }
} else {
  Write-Host "No injector.pid file."
}

if (Test-Path $PortFile) {
  Write-Host ("Port file: " + ((Get-Content -Path $PortFile -Raw -ErrorAction SilentlyContinue).Trim()))
} else {
  Write-Host "No renderer-port.txt file."
}

Section "Taskboard Sidebar Integration"
if (Test-Path -LiteralPath $TaskboardRuntimePath) {
  try {
    Import-Module $TaskboardRuntimePath -Force
    $taskboard = Get-CodexPlusTaskboardStatus -StateRoot $TaskboardStateRoot
    Write-Host ("Root: " + $taskboard.Root)
    Write-Host ("Port: " + $taskboard.Port)
    Write-Host ("Healthy: " + $taskboard.Healthy)
    Write-Host ("Embed URL: " + $taskboard.EmbedUrl)
    Write-Host ("Process ID: " + $taskboard.ProcessId)
    Write-Host ("Reason: " + $taskboard.Reason)
  } catch {
    Write-Host ("Taskboard status failed: " + $_.Exception.Message)
  }
} else {
  Write-Host "taskboard-runtime.psm1 is missing."
}

Section "Port Availability (near 9229)"
function Test-PortFree([int]$port) {
  try {
    $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
    $l.Start(); $l.Stop(); return $true
  } catch { return $false }
}
for ($p=9229; $p -le 9229+5; $p++) {
  $free = Test-PortFree -port $p
  Write-Host ("  127.0.0.1:" + $p + " free: " + $free)
}

Write-Host ""
Write-Host "Listening sockets near 9229-9239 (if any):"
try {
  $conns = Get-NetTCPConnection -LocalPort @(9229..9239) -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
  if ($conns) {
    $conns | Select-Object LocalAddress, LocalPort, OwningProcess, @{Name='Process';Expression={ (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName }} | Format-Table -Auto
  } else {
    Write-Host "  (none listening in that range)"
  }
} catch {
  Write-Host "  (Get-NetTCPConnection unavailable or access denied; skipping)"
}

if (Test-Path $PortFile) {
  $p = (Get-Content -Path $PortFile -Raw -ErrorAction SilentlyContinue).Trim()
  if ($p -match '^\d+$') {
    $portNum = [int]$p
    Write-Host ""
    Write-Host ("Active debug port from previous launch: " + $portNum)
    try {
      $ver = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $portNum + "/json/version") -UseBasicParsing -TimeoutSec 2
      if ($ver.StatusCode -eq 200) {
        Write-Host "  -> DevTools is STILL answering on this port (stale or running session)."
        try {
          $list = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $portNum + "/json/list") -UseBasicParsing -TimeoutSec 2
          $targets = $list.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
          $pages = @($targets | Where-Object { $_.type -in @('page','webview') } | Select-Object -First 3)
          if ($pages.Count -gt 0) {
            Write-Host "  Live targets (first few):"
            $pages | ForEach-Object { Write-Host ("    - " + $_.title + " (" + $_.url + ")") }
          }
        } catch {}
      }
    } catch {
      Write-Host "  -> Port not responding (stale port file is harmless)."
    }
  }
}

Section "Recent Log Tail (last 60 lines if present)"
if (Test-Path $LogFile) {
  Get-Content -Path $LogFile -Tail 60 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "(no log file)"
}

Section "Summary"
Write-Host "Collect the above and include when asking for help."
Write-Host "Common fixes:"
Write-Host "  - Install Node 18+ and ensure 'node' is on PATH."
Write-Host "  - Install 'ChatGPT' (OpenAI.Codex) from Microsoft Store."
Write-Host "  - Close Codex++ themed sessions before using this launcher (port conflict)."
Write-Host "  - Use '.\restore.cmd' (or the '打开原版 Codex' shortcut) to stop injection."


