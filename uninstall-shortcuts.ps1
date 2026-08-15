#Requires -Version 5.1
# Remove Desktop + Start Menu shortcuts for Codex Plus Pro Windows.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Codex Plus Pro"

$paths = @(
  (Join-Path $desktop "Codex Plus Pro.lnk"),
  (Join-Path $desktop "打开原版 Codex.lnk"),
  (Join-Path $startMenu "Codex Plus Pro.lnk"),
  (Join-Path $startMenu "打开原版 Codex.lnk")
)

foreach ($path in $paths) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force
    Write-Host "Removed $path"
  }
}

if (Test-Path -LiteralPath $startMenu) {
  $remaining = Get-ChildItem -LiteralPath $startMenu -Force -ErrorAction SilentlyContinue
  if (-not $remaining -or $remaining.Count -eq 0) {
    Remove-Item -LiteralPath $startMenu -Force -ErrorAction SilentlyContinue
    Write-Host "Removed empty folder $startMenu"
  }
}

Write-Host "Shortcut uninstall complete."