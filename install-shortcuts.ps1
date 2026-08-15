#Requires -Version 5.1
# Create Desktop + Start Menu shortcuts for Codex Plus Pro Windows.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LaunchPs1 = Join-Path $ScriptRoot "launch.ps1"
$RestorePs1 = Join-Path $ScriptRoot "restore.ps1"
$LaunchCmd = Join-Path $ScriptRoot "launch.cmd"
$RestoreCmd = Join-Path $ScriptRoot "restore.cmd"

if (-not (Test-Path $LaunchPs1)) { throw "Missing launch.ps1" }
if (-not (Test-Path $RestorePs1)) { throw "Missing restore.ps1" }

# Ensure cmd wrappers exist (created by this install script if absent)
$launchCmdBody = @"
@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
"@
$restoreCmdBody = @"
@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore.ps1" %*
"@
[System.IO.File]::WriteAllText($LaunchCmd, $launchCmdBody, [System.Text.Encoding]::ASCII)
[System.IO.File]::WriteAllText($RestoreCmd, $restoreCmdBody, [System.Text.Encoding]::ASCII)

function New-Shortcut {
  param(
    [string]$ShortcutPath,
    [string]$TargetPath,
    [string]$WorkingDirectory,
    [string]$Description,
    [string]$IconLocation
  )
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $TargetPath
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.WindowStyle = 1
  $shortcut.Description = $Description
  if ($IconLocation -and (Test-Path $IconLocation)) {
    $shortcut.IconLocation = $IconLocation
  }
  $shortcut.Save()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
}

# Prefer official Codex icon when available
$iconPath = $null
$packages = @(Get-AppxPackage -Name "OpenAI.Codex" -ErrorAction SilentlyContinue)
foreach ($package in $packages) {
  $candidate = Join-Path $package.InstallLocation "assets\Square44x44Logo.png"
  if (Test-Path $candidate) { $iconPath = $candidate; break }
  $candidate2 = Join-Path $package.InstallLocation "app\ChatGPT.exe"
  if (Test-Path $candidate2) { $iconPath = $candidate2; break }
}

$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Codex Plus Pro"
New-Item -ItemType Directory -Force -Path $startMenu | Out-Null

$launchDesktop = Join-Path $desktop "Codex Plus Pro.lnk"
$restoreDesktop = Join-Path $desktop "打开原版 Codex.lnk"
$launchStart = Join-Path $startMenu "Codex Plus Pro.lnk"
$restoreStart = Join-Path $startMenu "打开原版 Codex.lnk"

New-Shortcut -ShortcutPath $launchDesktop -TargetPath $LaunchCmd -WorkingDirectory $ScriptRoot -Description "Launch Codex with Plus Pro theme" -IconLocation $iconPath
New-Shortcut -ShortcutPath $restoreDesktop -TargetPath $RestoreCmd -WorkingDirectory $ScriptRoot -Description "Restore original Codex without injection" -IconLocation $iconPath
New-Shortcut -ShortcutPath $launchStart -TargetPath $LaunchCmd -WorkingDirectory $ScriptRoot -Description "Launch Codex with Plus Pro theme" -IconLocation $iconPath
New-Shortcut -ShortcutPath $restoreStart -TargetPath $RestoreCmd -WorkingDirectory $ScriptRoot -Description "Restore original Codex without injection" -IconLocation $iconPath

Write-Host "Shortcuts created:"
Write-Host "  $launchDesktop"
Write-Host "  $restoreDesktop"
Write-Host "  $launchStart"
Write-Host "  $restoreStart"
Write-Host "Wrappers:"
Write-Host "  $LaunchCmd"
Write-Host "  $RestoreCmd"