#Requires -Version 5.1
# Codex Plus Pro Windows launcher (Scope B2: theme + model picker + pet)
# Clean restore of the previously working launch path.
param(
  [string]$OfficialVersion = "latest",
  [switch]$UseStoreAppx,
  [switch]$UseLegacyLocalCurrent,
  [string]$TaskboardRoot,
  [int]$TaskboardPort = 0,
  [switch]$DisableTaskboard
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceDir = Join-Path $ScriptRoot "source"
$ResolverPath = Join-Path $ScriptRoot "official-codex.psm1"
$InjectorPath = Join-Path $SourceDir "injector.mjs"
$CssPath = Join-Path $SourceDir "theme.css"
$WallpaperPath = Join-Path $SourceDir "assets\pokemon-onsen.jpg"
$LogoPath = Join-Path $SourceDir "assets\pokeball-logo-white.png"
$TaskboardRuntimePath = Join-Path $ScriptRoot "taskboard-runtime.psm1"
$TaskboardStateRoot = Join-Path $env:LOCALAPPDATA "Codex-Plus-Pro\taskboard"

$StateRoot = Join-Path $env:LOCALAPPDATA "Codex-Plus-Pro"
$LogDir = Join-Path $StateRoot "logs"
$LogFile = Join-Path $LogDir "Codex-Plus-Pro.log"
$PidFile = Join-Path $StateRoot "injector.pid"
$PortFile = Join-Path $StateRoot "renderer-port.txt"
$PreferredDebugPort = 9229

function Write-AppLog {
  param([string]$Message)
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
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

function Find-NodeExecutable {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command -and $command.Source) { return $command.Source }
  $fallback = "C:\Program Files\nodejs\node.exe"
  if (Test-Path $fallback) { return $fallback }
  return $null
}

function Test-PortInUse {
  param([int]$Port)
  try {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    $listener.Stop()
    return $false
  } catch {
    return $true
  }
}

function Select-DebugPort {
  param([int]$Preferred)
  if (-not (Test-PortInUse -Port $Preferred)) { return $Preferred }
  for ($port = $Preferred + 1; $port -le ($Preferred + 50); $port++) {
    if (-not (Test-PortInUse -Port $port)) { return $port }
  }
  return $null
}

function Stop-CodexProcesses {
  foreach ($name in @("ChatGPT", "Codex")) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
      Write-AppLog ("Stopping process " + $_.ProcessName + " PID " + $_.Id)
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -match 'ChatGPT\.exe|Codex\.exe' -and
      $_.ExecutablePath -and
      ($_.ExecutablePath -like '*OpenAI.Codex*' -or $_.ExecutablePath -like '*\Codex\versions\*' -or $_.ExecutablePath -like '*\Codex-Plus-Pro\official\versions\*')
    } |
    ForEach-Object {
      Write-AppLog ("Stopping CIM process " + $_.Name + " PID " + $_.ProcessId)
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  for ($i = 0; $i -lt 40; $i++) {
    if (-not (Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
  }
}

function Wait-ForDevTools {
  param([int]$Port, [int]$TimeoutSeconds = 45)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $Port + "/json/version") -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -eq 200) { return $true }
    } catch {}
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Ensure-PackagedActivationType {
  if ("CodexPlusPro.PackagedActivation" -as [type]) { return }
  Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace CodexPlusPro {
  [ComImport]
  [Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IApplicationActivationManager {
    IntPtr ActivateApplication(
      [In, MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
      [In, MarshalAs(UnmanagedType.LPWStr)] string arguments,
      [In] int options,
      [Out] out uint processId);
  }
  [ComImport]
  [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
  public class ApplicationActivationManager {}
  public static class PackagedActivation {
    public static uint Activate(string appUserModelId, string arguments) {
      var manager = (IApplicationActivationManager)new ApplicationActivationManager();
      uint processId;
      manager.ActivateApplication(appUserModelId, arguments ?? string.Empty, 0, out processId);
      return processId;
    }
  }
}
"@
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Write-AppLog "=== Codex Plus Pro for Windows (Scope B2) ==="
$version = "unknown"
$versionFile = Join-Path $SourceDir "VERSION"
if (Test-Path $versionFile) {
  $version = (Get-Content -Path $versionFile -Raw -ErrorAction SilentlyContinue).Trim()
}
Write-AppLog ("Version: " + $version + " | Theme + model picker + pet")
Write-AppLog ("State dir: " + $StateRoot)

try {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
  if ($os) {
    Write-AppLog ("OS: " + $os.Caption + " " + $os.Version + " (Build " + $os.BuildNumber + ")")
  }
} catch {}

if (-not (Test-Path $InjectorPath)) { Show-ErrorDialog "Missing injector.mjs"; exit 1 }
if (-not (Test-Path $CssPath)) { Show-ErrorDialog "Missing theme.css"; exit 1 }
if (-not (Test-Path $WallpaperPath)) { Show-ErrorDialog "Missing wallpaper asset"; exit 1 }
if (-not (Test-Path $LogoPath)) { Show-ErrorDialog "Missing logo asset"; exit 1 }
if (-not (Test-Path $ResolverPath)) { Show-ErrorDialog "Missing official-codex.psm1"; exit 1 }
Import-Module $ResolverPath -Force
if (-not (Test-Path $TaskboardRuntimePath)) { Show-ErrorDialog "Missing taskboard-runtime.psm1"; exit 1 }
Import-Module $TaskboardRuntimePath -Force

$nodePath = Find-NodeExecutable
if (-not $nodePath) {
  Show-ErrorDialog "Node.js not found. Install Node 22.5+ and ensure node is on PATH."
  exit 1
}
$nodeVersion = & $nodePath --version 2>$null
if ($nodeVersion) { Write-AppLog ("Node version: " + $nodeVersion.Trim()) }

$codex = Resolve-CodexPlusOfficialApp -Version $OfficialVersion -UseStoreAppx:$UseStoreAppx -UseLegacyLocalCurrent:$UseLegacyLocalCurrent
if (-not $codex) {
  Show-ErrorDialog "Official ChatGPT/Codex not found. Install ChatGPT (OpenAI.Codex) from Microsoft Store."
  exit 1
}

Write-AppLog ("Official app: " + $codex.Path + " (" + $codex.Source + " " + $codex.Version + " " + $codex.AppKind + ")")
if ($codex.AppUserModelId) { Write-AppLog ("AUMID: " + $codex.AppUserModelId) }

$storeAppx = $null
try {
  $storeAppx = Resolve-CodexPlusOfficialApp -Version "store"
  if ($storeAppx) {
    Write-AppLog ("Store Appx retained: " + $storeAppx.Version + " " + $storeAppx.AppKind + " at " + $storeAppx.Path)
  }
} catch {
  Write-AppLog ("Store Appx lookup failed: " + $_.Exception.Message)
}

$managedVersions = @(Get-CodexPlusManagedVersions)
$managedLatest = $null
if ($managedVersions.Count -gt 0) {
  $managedLatest = Resolve-CodexPlusManagedVersion
}
if ($managedLatest) {
  Write-AppLog ("Managed versions: " + $managedVersions.Count + " latest " + $managedLatest.Version + " " + $managedLatest.AppKind)
} else {
  Write-AppLog ("Managed versions: " + $managedVersions.Count)
}

$latestStoreVersion = $null
$updateState = "check-failed"
try {
  $latestStoreVersion = Get-CodexPlusStoreLatestVersion -TimeoutSeconds 8
  if ($latestStoreVersion) {
    $comparison = Compare-CodexPlusVersion -Left $codex.Version -Right $latestStoreVersion.Version
    if ($comparison -lt 0) {
      $updateState = "outdated"
    } else {
      $updateState = "current"
    }
    Write-AppLog ("Store latest: " + $latestStoreVersion.Version + " (" + $latestStoreVersion.PackageFullName + ")")
  } else {
    $updateState = "unavailable"
  }
} catch {
  $updateState = "check-failed"
  Write-AppLog ("Store latest check failed: " + $_.Exception.Message)
}

$rendererPort = Select-DebugPort -Preferred $PreferredDebugPort
if (-not $rendererPort) {
  Show-ErrorDialog "No free debug port near 9229."
  exit 1
}

Write-AppLog "Starting Codex Plus Pro Windows B2 (theme + model picker + pet)"
Write-AppLog ("Node: " + $nodePath)
Write-AppLog ("Renderer port: " + $rendererPort)

Write-AppLog "Phase: cleanup of stray injectors and debug Codex"

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match 'node\.exe' -and
    (
      ($_.CommandLine -like '*injector.mjs*') -or
      ($_.CommandLine -like '*Codex-Plus-Pro*')
    )
  } |
  ForEach-Object {
    Write-AppLog ("  Killing stray injector node PID " + $_.ProcessId)
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    ($_.Name -match 'ChatGPT\.exe|Codex\.exe') -and
    $_.CommandLine -and ($_.CommandLine -like '*remote-debugging-port*')
  } |
  ForEach-Object {
    Write-AppLog ("  Killing debug-flagged Codex PID " + $_.ProcessId)
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Stop-CodexProcesses

if (Test-Path $PidFile) {
  $oldPidText = Get-Content -Path $PidFile -Raw -ErrorAction SilentlyContinue
  if ($null -ne $oldPidText) { $oldPidText = $oldPidText.Trim() }
  if ($oldPidText -match '^\d+$') {
    $oldPid = [int]$oldPidText
    if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
      Write-AppLog ("  Killing injector from pid file PID " + $oldPid)
      Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}

if (Test-Path $PortFile) { Remove-Item -Path $PortFile -Force -ErrorAction SilentlyContinue }

Start-Sleep -Milliseconds 600

Write-AppLog ("Selected debug port: " + $rendererPort)
if (Test-PortInUse -Port $rendererPort) {
  Write-AppLog "WARNING: Selected port now reports in-use."
} else {
  Write-AppLog "Port appears free before activation."
}

Write-AppLog "Cleanup complete. Proceeding to activation."

$taskboardStatus = $null
$taskboardEnabled = $false
if (-not $DisableTaskboard) {
  try {
    $taskboardStatus = Start-CodexPlusTaskboard -Root $TaskboardRoot -Port $TaskboardPort -NodePath $nodePath -StateRoot $TaskboardStateRoot
    if ($taskboardStatus.Healthy) {
      $taskboardEnabled = $true
      Write-AppLog ("Taskboard ready on " + $taskboardStatus.EmbedUrl + " (PID " + $taskboardStatus.ProcessId + ")")
    } else {
      Write-AppLog ("Taskboard unavailable; continuing without sidebar entry: " + $taskboardStatus.Reason)
    }
  } catch {
    Write-AppLog ("Taskboard startup failed; continuing without sidebar entry: " + $_.Exception.Message)
  }
} else {
  Write-AppLog "Taskboard integration disabled by launch switch."
}

# Codex++ style: inspect = debug_port + 100
$inspectorPort = [Math]::Min(65535, $rendererPort + 100)
$argumentLine = "--remote-debugging-port=$rendererPort --remote-allow-origins=http://127.0.0.1:$rendererPort --inspect=127.0.0.1:$inspectorPort"
Write-AppLog ("Inspector port: " + $inspectorPort)
Write-AppLog ("CDP args: " + $argumentLine)

try {
  if ($codex.AppUserModelId) {
    Write-AppLog ("Activating packaged app " + $codex.AppUserModelId)
    Ensure-PackagedActivationType
    $processId = [CodexPlusPro.PackagedActivation]::Activate($codex.AppUserModelId, $argumentLine)
    Write-AppLog ("Packaged activation process id " + $processId)
  } else {
    $argumentList = @(
      ("--remote-debugging-port=" + $rendererPort),
      ("--remote-allow-origins=http://127.0.0.1:" + $rendererPort),
      ("--inspect=127.0.0.1:" + $inspectorPort)
    )
    $appProcess = Start-Process -FilePath $codex.Path -ArgumentList $argumentList -PassThru -WindowStyle Normal
    Write-AppLog ("Started process PID " + $appProcess.Id)
  }
} catch {
  Show-ErrorDialog ("Failed to start official Codex: " + $_.Exception.Message)
  Write-AppLog ("Launch failed: " + $_.Exception.ToString())
  exit 1
}

if (-not (Wait-ForDevTools -Port $rendererPort -TimeoutSeconds 45)) {
  Show-ErrorDialog "DevTools port not ready. Official app may reject remote-debugging flags. See log."
  Write-AppLog ("DevTools not ready on port " + $rendererPort)
  exit 1
}
Write-AppLog "DevTools is ready"
Write-AppLog "DevTools is responding on /json/version. Proceeding to stabilization sampling..."

# Best-effort target listing (non-fatal)
try {
  $targetsJson = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $rendererPort + "/json/list") -UseBasicParsing -TimeoutSec 2
  if ($targetsJson.Content) {
    $targets = $targetsJson.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
    $pageCount = @($targets | Where-Object { $_.type -in @('page','webview') }).Count
    $devtoolsCount = @($targets | Where-Object { $_.url -like 'devtools://*' }).Count
    Write-AppLog ("Initial targets: page/webview=" + $pageCount + ", devtools=" + $devtoolsCount)
  }
} catch {
  Write-AppLog ("Could not enumerate targets for diagnostics: " + $_.Exception.Message)
}

# Short stabilization; injector has its own retry loop for page targets
$stableSeconds = 0
for ($i = 0; $i -lt 5; $i++) {
  Start-Sleep -Milliseconds 600
  try {
    $null = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $rendererPort + "/json/version") -UseBasicParsing -TimeoutSec 1
    $stableSeconds++
  } catch {
    Write-AppLog ("DevTools blip during pre-inject wait at t=" + $i)
  }
}
Write-AppLog ("Pre-inject DevTools ready samples: " + $stableSeconds)
if ($stableSeconds -lt 1) {
  Start-Sleep -Seconds 2
  try {
    $null = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $rendererPort + "/json/version") -UseBasicParsing -TimeoutSec 2
    $stableSeconds = 1
    Write-AppLog "DevTools recovered after extra wait"
  } catch {
    Show-ErrorDialog "Codex exited too quickly with debug flags. Launch path still unstable."
    Write-AppLog "Aborting inject due to unstable DevTools"
    exit 1
  }
}

$stdoutLog = Join-Path $LogDir "injector-stdout.log"
$stderrLog = Join-Path $LogDir "injector-stderr.log"
Set-Content -Path $stdoutLog -Value "" -Encoding UTF8
Set-Content -Path $stderrLog -Value "" -Encoding UTF8

$codexPathEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($codex.Path))
$storeAppxPathEncoded = ""
if ($storeAppx) {
  $storeAppxPathEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($storeAppx.Path))
}
$latestStoreVersionText = ""
if ($latestStoreVersion) { $latestStoreVersionText = $latestStoreVersion.Version }
$managedLatestVersionText = ""
$managedLatestKindText = ""
$managedLatestPathEncoded = ""
if ($managedLatest) {
  $managedLatestVersionText = $managedLatest.Version
  $managedLatestKindText = $managedLatest.AppKind
  $managedLatestPathEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($managedLatest.Path))
}
$managedVersionRecords = @($managedVersions | ForEach-Object {
    [ordered]@{
      Version = $_.Version
      Path = $_.Path
      AppKind = $_.AppKind
    }
  })
$managedVersionsJson = ConvertTo-Json -InputObject ([object[]]$managedVersionRecords) -Compress -Depth 3
$managedVersionsEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($managedVersionsJson))
$scanTimeUtc = [DateTime]::UtcNow.ToString("o")

function Add-InjectorArg {
  param(
    [Parameter(Mandatory = $true)][System.Collections.Generic.List[string]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowNull()][string]$Value
  )
  if ([string]::IsNullOrWhiteSpace($Value)) { return }
  $Arguments.Add($Name) | Out-Null
  $Arguments.Add($Value) | Out-Null
}

$injectorArgsList = [System.Collections.Generic.List[string]]::new()
$injectorArgsList.Add($InjectorPath) | Out-Null
Add-InjectorArg -Arguments $injectorArgsList -Name "--port" -Value ("{0}" -f $rendererPort)
Add-InjectorArg -Arguments $injectorArgsList -Name "--main-port" -Value ("{0}" -f $inspectorPort)
Add-InjectorArg -Arguments $injectorArgsList -Name "--css" -Value $CssPath
Add-InjectorArg -Arguments $injectorArgsList -Name "--wallpaper" -Value $WallpaperPath
Add-InjectorArg -Arguments $injectorArgsList -Name "--logo" -Value $LogoPath
Add-InjectorArg -Arguments $injectorArgsList -Name "--plus-version" -Value $version
Add-InjectorArg -Arguments $injectorArgsList -Name "--app-source" -Value $codex.Source
Add-InjectorArg -Arguments $injectorArgsList -Name "--app-version" -Value $codex.Version
Add-InjectorArg -Arguments $injectorArgsList -Name "--app-kind" -Value $codex.AppKind
Add-InjectorArg -Arguments $injectorArgsList -Name "--app-path-b64" -Value $codexPathEncoded
Add-InjectorArg -Arguments $injectorArgsList -Name "--store-appx-version" -Value ($(if ($storeAppx) { $storeAppx.Version } else { "" }))
Add-InjectorArg -Arguments $injectorArgsList -Name "--store-appx-kind" -Value ($(if ($storeAppx) { $storeAppx.AppKind } else { "" }))
Add-InjectorArg -Arguments $injectorArgsList -Name "--store-appx-path-b64" -Value $storeAppxPathEncoded
Add-InjectorArg -Arguments $injectorArgsList -Name "--latest-version" -Value $latestStoreVersionText
Add-InjectorArg -Arguments $injectorArgsList -Name "--update-state" -Value $updateState
Add-InjectorArg -Arguments $injectorArgsList -Name "--managed-count" -Value ([string]$managedVersions.Count)
Add-InjectorArg -Arguments $injectorArgsList -Name "--managed-latest-version" -Value $managedLatestVersionText
Add-InjectorArg -Arguments $injectorArgsList -Name "--managed-latest-kind" -Value $managedLatestKindText
Add-InjectorArg -Arguments $injectorArgsList -Name "--managed-latest-path-b64" -Value $managedLatestPathEncoded
Add-InjectorArg -Arguments $injectorArgsList -Name "--managed-versions-json-b64" -Value $managedVersionsEncoded
Add-InjectorArg -Arguments $injectorArgsList -Name "--scan-time-utc" -Value $scanTimeUtc
Add-InjectorArg -Arguments $injectorArgsList -Name "--taskboard-enabled" -Value ($(if ($taskboardEnabled) { "true" } else { "false" }))
if ($taskboardEnabled) {
  Add-InjectorArg -Arguments $injectorArgsList -Name "--taskboard-url" -Value $taskboardStatus.EmbedUrl
  Add-InjectorArg -Arguments $injectorArgsList -Name "--taskboard-launch-instance" -Value $taskboardStatus.InstanceToken
}
$injectorArgs = $injectorArgsList.ToArray()
Write-AppLog ("Starting injector with " + $injectorArgs.Count + " arguments")
$previousTaskboardTokenExists = Test-Path env:CODEX_TASKBOARD_INSTANCE_TOKEN
$previousTaskboardSecretExists = Test-Path env:CODEX_TASKBOARD_INSTANCE_SECRET
$previousTaskboardToken = $env:CODEX_TASKBOARD_INSTANCE_TOKEN
$previousTaskboardSecret = $env:CODEX_TASKBOARD_INSTANCE_SECRET
try {
  if ($taskboardEnabled) {
    $env:CODEX_TASKBOARD_INSTANCE_TOKEN = $taskboardStatus.InstanceToken
    $env:CODEX_TASKBOARD_INSTANCE_SECRET = $taskboardStatus.InstanceSecret
  } else {
    Remove-Item env:CODEX_TASKBOARD_INSTANCE_TOKEN -ErrorAction SilentlyContinue
    Remove-Item env:CODEX_TASKBOARD_INSTANCE_SECRET -ErrorAction SilentlyContinue
  }
  $injectorProcess = Start-Process -FilePath $nodePath -ArgumentList $injectorArgs -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
} catch {
  Write-AppLog ("Injector start failed: " + $_.Exception.ToString())
  Show-ErrorDialog ("Failed to start Codex Plus Pro injector: " + $_.Exception.Message)
  exit 1
} finally {
  if ($previousTaskboardTokenExists) {
    $env:CODEX_TASKBOARD_INSTANCE_TOKEN = $previousTaskboardToken
  } else {
    Remove-Item env:CODEX_TASKBOARD_INSTANCE_TOKEN -ErrorAction SilentlyContinue
  }
  if ($previousTaskboardSecretExists) {
    $env:CODEX_TASKBOARD_INSTANCE_SECRET = $previousTaskboardSecret
  } else {
    Remove-Item env:CODEX_TASKBOARD_INSTANCE_SECRET -ErrorAction SilentlyContinue
  }
}
Set-Content -Path $PidFile -Value ([string]$injectorProcess.Id) -Encoding ASCII
Set-Content -Path $PortFile -Value ([string]$rendererPort) -Encoding ASCII
Write-AppLog ("Injector PID " + $injectorProcess.Id)
Write-AppLog "Launch complete. Theme injection is running."
Write-AppLog "=== Scope B2 active: theme + model picker + pet ==="
Write-AppLog ("Injector ports: renderer=" + $rendererPort + " main-inspect=" + $inspectorPort)
Write-AppLog "Next: open Codex window. Settings near Search: theme / model bar / pet."
Write-AppLog "PiP: hover saved threads. Pet: Codex avatar-overlay window + settings toggle."
exit 0


