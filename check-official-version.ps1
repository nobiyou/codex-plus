#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$CurrentVersion,
  [int]$TimeoutSeconds = 12
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ResolverPath = Join-Path $ScriptRoot "official-codex.psm1"
Import-Module $ResolverPath -Force

$scanTimeUtc = [DateTime]::UtcNow.ToString("o")
$result = [ordered]@{
  CurrentVersion = $CurrentVersion
  LatestVersion = $null
  UpdateState = "check-failed"
  ScanTimeUtc = $scanTimeUtc
  Error = $null
}

try {
  $latest = Get-CodexPlusStoreLatestVersion -TimeoutSeconds $TimeoutSeconds
  if (-not $latest) {
    $result.UpdateState = "unavailable"
  } else {
    $result.LatestVersion = [string]$latest.Version
    $comparison = Compare-CodexPlusVersion -Left $CurrentVersion -Right $latest.Version
    $result.UpdateState = if ($comparison -lt 0) { "outdated" } else { "current" }
  }
} catch {
  $result.Error = $_.Exception.Message
}

$result | ConvertTo-Json -Compress -Depth 3
