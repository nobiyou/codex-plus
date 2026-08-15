#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Root,
  [string]$CurrentPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ResolverPath = Join-Path $ScriptRoot "official-codex.psm1"
if (-not (Test-Path -LiteralPath $ResolverPath -PathType Leaf)) {
  throw "Missing official-codex.psm1: $ResolverPath"
}
Import-Module $ResolverPath -Force

if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Get-CodexPlusOfficialRoot
}

$result = Remove-CodexPlusManagedVersion -Root $Root -Version $Version -CurrentPath $CurrentPath
$result | ConvertTo-Json -Depth 5
