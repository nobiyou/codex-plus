#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProductId = "9PLM9XGG6VKS"
$ProductName = "ChatGPT"

Write-Host "Codex Plus Pro official upgrade" -ForegroundColor Cyan
Write-Host "Source: Microsoft Store / winget msstore"
Write-Host ("Product: " + $ProductName + " [" + $ProductId + "]")
Write-Host ""
Write-Host "This uses the official Microsoft Store package. It does not download historical packages or third-party mirrors."
Write-Host "If the running ChatGPT/Codex app blocks the update, close it and run this again."
Write-Host ""

$winget = Get-Command winget.exe -ErrorAction SilentlyContinue
if (-not $winget -or -not $winget.Source) {
  throw "winget.exe not found. Install App Installer from Microsoft Store first."
}

Write-Host "Checking Store package metadata..." -ForegroundColor Cyan
& $winget.Source show --id $ProductId --source msstore
Write-Host ""
Write-Host "Starting official Store upgrade..." -ForegroundColor Cyan
& $winget.Source upgrade --id $ProductId --source msstore --accept-source-agreements --accept-package-agreements
$code = $LASTEXITCODE
Write-Host ""
if ($code -eq 0) {
  Write-Host "Upgrade command finished successfully." -ForegroundColor Green
} else {
  Write-Host ("Upgrade command exited with code " + $code) -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Press Enter to close this window."
[void][Console]::ReadLine()
exit $code
