#Requires -Version 5.1
param(
  [string]$OfficialVersion = "latest",
  [switch]$UseStoreAppx,
  [switch]$UseLegacyLocalCurrent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$StateRoot = Join-Path $env:LOCALAPPDATA "Codex-Plus-Pro"
$LogDir = Join-Path $StateRoot "logs"
$LogFile = Join-Path $LogDir "Codex-Plus-Pro.log"
$PidFile = Join-Path $StateRoot "injector.pid"
$PortFile = Join-Path $StateRoot "renderer-port.txt"
$ResolverPath = Join-Path $PSScriptRoot "official-codex.psm1"
$TaskboardRuntimePath = Join-Path $PSScriptRoot "taskboard-runtime.psm1"
$TaskboardStateRoot = Join-Path $StateRoot "taskboard"

$null = New-Item -ItemType Directory -Force -Path $LogDir

function Write-AppLog {
  param([string]$Message)
  $line = "[{0}] {1}" -f ([DateTime]::UtcNow.ToString("o")), $Message
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  Write-Host $line
}

function Show-ErrorDialog {
  param([string]$Message)
  try {
    Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue | Out-Null
    [System.Windows.MessageBox]::Show($Message, "Codex Plus Pro", "OK", "Error") | Out-Null
  } catch {
    Write-Host ("ERROR: " + $Message) -ForegroundColor Red
  }
}

Write-AppLog "=== Codex Plus Pro — Restore original Codex (Scope A) ==="
$versionFile = Join-Path $PSScriptRoot "source\VERSION"
$version = "unknown"
if (Test-Path $versionFile) {
  $version = (Get-Content -Path $versionFile -Raw -ErrorAction SilentlyContinue).Trim()
}
Write-AppLog ("Version: " + $version + " | Stopping injection and launching clean official app")
if (-not (Test-Path $ResolverPath)) { Show-ErrorDialog "Missing official-codex.psm1"; exit 1 }
Import-Module $ResolverPath -Force
if (-not (Test-Path $TaskboardRuntimePath)) { Show-ErrorDialog "Missing taskboard-runtime.psm1"; exit 1 }
Import-Module $TaskboardRuntimePath -Force

Write-AppLog "Restore original Codex launch"

try {
  $taskboardStop = Stop-CodexPlusTaskboard -StateRoot $TaskboardStateRoot
  Write-AppLog ("Taskboard restore: " + $taskboardStop.Reason)
  if ($taskboardStop.StatePreserved) {
    Write-AppLog "WARNING: Taskboard state was preserved because process ownership could not be proven."
  }
} catch {
  Write-AppLog ("Taskboard stop failed; continuing clean restore: " + $_.Exception.Message)
}

if (Test-Path $PidFile) {
  $oldPidText = (Get-Content -Path $PidFile -Raw -ErrorAction SilentlyContinue)
  if ($null -ne $oldPidText) { $oldPidText = $oldPidText.Trim() }
  if ($oldPidText -match '^\d+$') {
    $oldPid = [int]$oldPidText
    if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
      Write-AppLog ("Stopping injector PID " + $oldPid)
      Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}

Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | ForEach-Object {
  Write-AppLog ("Stopping " + $_.ProcessName + " PID " + $_.Id)
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

for ($i = 0; $i -lt 40; $i++) {
  if (-not (Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 250
}

if (Test-Path $PortFile) { Remove-Item -Path $PortFile -Force -ErrorAction SilentlyContinue }

$codex = Resolve-CodexPlusOfficialApp -Version $OfficialVersion -UseStoreAppx:$UseStoreAppx -UseLegacyLocalCurrent:$UseLegacyLocalCurrent
if (-not $codex) {
  Show-ErrorDialog "Official ChatGPT/Codex not found."
  exit 1
}

if ($codex.AppUserModelId) {
  Write-AppLog ("Starting shell:AppsFolder\" + $codex.AppUserModelId + " (" + $codex.Source + " " + $codex.Version + " " + $codex.AppKind + ")")
  try {
    Start-Process ("shell:AppsFolder\" + $codex.AppUserModelId)
    Write-AppLog "Restore complete via AppsFolder"
    exit 0
  } catch {
    Write-AppLog ("AppsFolder start failed: " + $_.Exception.Message + "; falling back to exe")
  }
}

Write-AppLog ("Starting " + $codex.Path + " without debug flags (" + $codex.Source + " " + $codex.Version + " " + $codex.AppKind + ")")
Start-Process -FilePath $codex.Path
Write-AppLog "Restore complete"
exit 0


