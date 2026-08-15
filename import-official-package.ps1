#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$PackagePath,
  [string]$Root,
  [int]$KeepVersions = 1,
  [switch]$Force
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

function Get-PackageMoniker {
  param([Parameter(Mandatory = $true)][string]$Path)
  $name = [System.IO.Path]::GetFileNameWithoutExtension($Path)
  if ($name -notmatch '^OpenAI\.Codex_(\d+(?:\.\d+)*)_([^_]+)__2p2nqsd0c76g0$') {
    throw "Package filename is not an OpenAI.Codex Store moniker: $name"
  }
  return [pscustomobject]@{
    Moniker = $name
    Version = $Matches[1]
    Architecture = $Matches[2]
  }
}

function ConvertTo-ExtendedPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  if ($Path.StartsWith('\\?\')) { return $Path }
  if ($Path.StartsWith('\\')) { return ('\\?\UNC\' + $Path.Substring(2)) }
  return ('\\?\' + $Path)
}

function Remove-DirectoryTree {
  param([Parameter(Mandatory = $true)][string]$Path)
  if ([System.IO.Directory]::Exists($Path)) {
    [System.IO.Directory]::Delete((ConvertTo-ExtendedPath -Path $Path), $true)
  }
}

function Join-SafeZipPath {
  param(
    [Parameter(Mandatory = $true)][string]$Base,
    [Parameter(Mandatory = $true)][string]$Relative
  )
  $relativePath = $Relative -replace '/', [System.IO.Path]::DirectorySeparatorChar
  if ([System.IO.Path]::IsPathRooted($relativePath)) {
    throw "Zip entry has rooted path: $Relative"
  }
  foreach ($part in ($relativePath -split '[\\/]')) {
    if ($part -eq '..') { throw "Zip entry escapes target: $Relative" }
  }
  $fullBase = [System.IO.Path]::GetFullPath($Base).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $fullPath = [System.IO.Path]::GetFullPath((Join-Path $Base $relativePath))
  if (-not ($fullPath.Equals($fullBase, [System.StringComparison]::OrdinalIgnoreCase) -or $fullPath.StartsWith($fullBase + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "Zip entry escapes target: $Relative"
  }
  if ($fullPath.Length -ge 240) {
    return (ConvertTo-ExtendedPath -Path $fullPath)
  }
  return $fullPath
}

function Write-UpgradeProgress {
  param(
    [Parameter(Mandatory = $true)][string]$Phase,
    [Parameter(Mandatory = $true)][int64]$Current,
    [Parameter(Mandatory = $true)][int64]$Total,
    [Parameter(Mandatory = $true)][string]$Status
  )
  $percent = $null
  if ($Total -gt 0) {
    $percent = [Math]::Min(100, [Math]::Round(($Current * 100.0) / $Total, 1))
  }
  $detail = if ($Total -gt 0) {
    "${Status}: $Current / $Total ($percent%)"
  } else {
    "${Status}: processed $Current"
  }
  $payload = [ordered]@{
    type = "codex-plus-pro-progress"
    state = "running"
    phase = $Phase
    current = $Current
    total = $Total
    percent = $percent
    status = $Status
    detail = $detail
  }
  [Console]::Error.WriteLine(($payload | ConvertTo-Json -Compress -Depth 3))
}

$package = Resolve-Path -LiteralPath $PackagePath -ErrorAction Stop
$packageFile = Get-Item -LiteralPath $package.Path
if ($packageFile.Extension -notin @(".msix", ".appx")) {
  throw "Only .msix/.appx packages are supported in this importer for now: $($packageFile.Name)"
}

$moniker = Get-PackageMoniker -Path $packageFile.FullName
if ($moniker.Architecture -ne "x64") {
  throw "Only x64 OpenAI.Codex packages are supported: $($moniker.Architecture)"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$versionsRoot = Join-Path $Root "versions"
$finalDir = Join-Path $versionsRoot $moniker.Version
$partialDir = Join-Path $versionsRoot ($moniker.Version + ".partial")

if ((Test-Path -LiteralPath $finalDir) -and -not $Force) {
  throw "Version already exists: $finalDir. Pass -Force to replace it."
}

New-Item -ItemType Directory -Force -Path $versionsRoot | Out-Null
if (Test-Path -LiteralPath $partialDir) { Remove-DirectoryTree -Path $partialDir }
New-Item -ItemType Directory -Force -Path $partialDir | Out-Null

$archive = [System.IO.Compression.ZipFile]::OpenRead($packageFile.FullName)
try {
  $appEntries = @($archive.Entries | Where-Object { $_.FullName -like 'app/*' -and -not [string]::IsNullOrEmpty($_.Name) })
  if ($appEntries.Count -eq 0) {
    throw "Package contains no app/ entries: $($packageFile.FullName)"
  }
  $done = 0
  Write-UpgradeProgress -Phase "importing" -Current 0 -Total $appEntries.Count -Status "Importing official package"
  foreach ($entry in $appEntries) {
    $relative = $entry.FullName.Substring(4)
    $target = Join-SafeZipPath -Base $partialDir -Relative $relative
    $parent = Split-Path -Parent $target
    if ($parent) { [System.IO.Directory]::CreateDirectory($parent) | Out-Null }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
    $done++
    if (($done % 100) -eq 0) {
      Write-UpgradeProgress -Phase "importing" -Current $done -Total $appEntries.Count -Status "Importing official package"
    }
  }
  Write-UpgradeProgress -Phase "importing" -Current $done -Total $appEntries.Count -Status "Official package import complete"
} finally {
  $archive.Dispose()
}

$entrypoint = Get-CodexPlusEntrypoint -Directory $partialDir
if (-not $entrypoint) {
  Remove-DirectoryTree -Path $partialDir
  throw "Extracted package has no ChatGPT.exe or Codex.exe under app/."
}

if (Test-Path -LiteralPath $finalDir) { Remove-DirectoryTree -Path $finalDir }
[System.IO.Directory]::Move($partialDir, $finalDir)

$finalEntrypoint = Get-CodexPlusEntrypoint -Directory $finalDir
$cleanupResults = @(Remove-CodexPlusOldManagedVersions -Root $Root -Keep $KeepVersions)
$removedVersions = @($cleanupResults | Where-Object { $_.State -eq "Removed" } | Select-Object Version, Path, DownloadCleanup)
$deferredCleanup = @($cleanupResults | Where-Object { $_.State -in @("Deferred", "Protected") } | Select-Object State, Version, Path, Error)
[pscustomobject]@{
  Version = $moniker.Version
  Moniker = $moniker.Moniker
  Path = $finalEntrypoint.Path
  AppKind = $finalEntrypoint.AppKind
  SourcePackage = $packageFile.FullName
  InstalledDirectory = $finalDir
  KeepVersions = $KeepVersions
  RemovedVersions = $removedVersions
  DeferredCleanup = $deferredCleanup
} | ConvertTo-Json -Depth 3
