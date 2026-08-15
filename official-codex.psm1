#Requires -Version 5.1
Set-StrictMode -Version Latest

function Get-CodexPlusOfficialRoot {
  [CmdletBinding()]
  param()
  return (Join-Path $env:LOCALAPPDATA "Codex-Plus-Pro\official")
}

function Get-CodexPlusStoreProductId {
  [CmdletBinding()]
  param()
  return "9PLM9XGG6VKS"
}

function ConvertTo-CodexPlusVersionParts {
  param([Parameter(Mandatory = $true)][string]$Version)

  if ($Version -notmatch '^\d+(\.\d+)*$') { return $null }
  $parts = @()
  foreach ($part in ($Version -split '\.')) {
    $parts += [int64]$part
  }
  return ,$parts
}

function Compare-CodexPlusVersion {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Left,
    [Parameter(Mandatory = $true)][string]$Right
  )

  $leftParts = ConvertTo-CodexPlusVersionParts -Version $Left
  $rightParts = ConvertTo-CodexPlusVersionParts -Version $Right
  if ($null -eq $leftParts -or $null -eq $rightParts) {
    throw "Cannot compare invalid Codex version values: '$Left' and '$Right'."
  }

  $max = [Math]::Max($leftParts.Count, $rightParts.Count)
  for ($i = 0; $i -lt $max; $i++) {
    $leftValue = 0
    $rightValue = 0
    if ($i -lt $leftParts.Count) { $leftValue = $leftParts[$i] }
    if ($i -lt $rightParts.Count) { $rightValue = $rightParts[$i] }
    if ($leftValue -lt $rightValue) { return -1 }
    if ($leftValue -gt $rightValue) { return 1 }
  }
  return 0
}

function Test-CodexPlusPathInsideRoot {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Path
  )

  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $pathFull = [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  return ($pathFull.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or
    $pathFull.StartsWith($rootFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
    $pathFull.StartsWith($rootFull + [System.IO.Path]::AltDirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase))
}

function New-CodexPlusAppObject {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$PackageFamilyName,
    [string]$AppUserModelId,
    [Parameter(Mandatory = $true)][string]$AppKind
  )

  return [pscustomobject]@{
    Path = $Path
    Version = $Version
    Source = $Source
    PackageFamilyName = $PackageFamilyName
    AppUserModelId = $AppUserModelId
    AppKind = $AppKind
  }
}

function Get-CodexPlusEntrypoint {
  param([Parameter(Mandatory = $true)][string]$Directory)

  foreach ($entry in @(
    @{ Name = "ChatGPT.exe"; Kind = "ChatGPT" },
    @{ Name = "Codex.exe"; Kind = "Codex" }
  )) {
    $candidate = Join-Path $Directory $entry.Name
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return [pscustomobject]@{ Path = $candidate; AppKind = $entry.Kind }
    }
  }
  return $null
}

function Get-CodexPlusManagedVersions {
  [CmdletBinding()]
  param([string]$Root = (Get-CodexPlusOfficialRoot))

  $versionsRoot = Join-Path $Root "versions"
  if (-not (Test-Path -LiteralPath $versionsRoot -PathType Container)) { return @() }

  $items = @(Get-ChildItem -LiteralPath $versionsRoot -Directory -ErrorAction SilentlyContinue)
  $versions = @()
  foreach ($item in $items) {
    if ($item.Name -eq "current") { continue }
    if ($item.Name -like "*.partial") { continue }
    if (-not (ConvertTo-CodexPlusVersionParts -Version $item.Name)) { continue }

    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    if (-not (Test-CodexPlusPathInsideRoot -Root $Root -Path $item.FullName)) { continue }

    $entrypoint = Get-CodexPlusEntrypoint -Directory $item.FullName
    if (-not $entrypoint) { continue }

    $versions += (New-CodexPlusAppObject -Path $entrypoint.Path -Version $item.Name -Source "Managed" -PackageFamilyName $null -AppUserModelId $null -AppKind $entrypoint.AppKind)
  }

  return @($versions)
}

function Resolve-CodexPlusManagedVersion {
  [CmdletBinding()]
  param(
    [string]$Root = (Get-CodexPlusOfficialRoot),
    [string]$Version = "latest"
  )

  $versions = @(Get-CodexPlusManagedVersions -Root $Root)
  if ($versions.Count -eq 0) { return $null }

  $latest = $versions[0]
  foreach ($candidate in $versions) {
    if ((Compare-CodexPlusVersion -Left $candidate.Version -Right $latest.Version) -gt 0) {
      $latest = $candidate
    }
  }

  if ([string]::IsNullOrWhiteSpace($Version) -or $Version -eq "latest" -or $Version -eq "local") {
    return $latest
  }

  foreach ($candidate in $versions) {
    if ($candidate.Version -eq $Version) { return $candidate }
  }
  return $null
}

function Get-CodexPlusRunningManagedVersionPaths {
  [CmdletBinding()]
  param([string]$Root = (Get-CodexPlusOfficialRoot))

  $versions = @(Get-CodexPlusManagedVersions -Root $Root)
  if ($versions.Count -eq 0) { return @() }

  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $runningPaths = @()
  $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      $_.Name -match '^(ChatGPT|Codex)\.exe$' -and -not [string]::IsNullOrWhiteSpace([string]$_.ExecutablePath)
    })
  foreach ($process in $processes) {
    $executablePath = [string]$process.ExecutablePath
    foreach ($version in $versions) {
      $versionDir = Split-Path -Parent $version.Path
      if (-not (Test-CodexPlusPathInsideRoot -Root $versionDir -Path $executablePath)) { continue }
      if ($seen.Add($versionDir)) { $runningPaths += $versionDir }
      break
    }
  }
  return @($runningPaths)
}

function Remove-CodexPlusDirectory {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return }

  $commandProcessor = Join-Path $env:SystemRoot "System32\cmd.exe"
  if (-not (Test-Path -LiteralPath $commandProcessor -PathType Leaf)) {
    throw "Windows command processor was not found: $commandProcessor"
  }

  $process = Start-Process -FilePath $commandProcessor -ArgumentList @(
    "/d",
    "/c",
    "rmdir",
    "/s",
    "/q",
    $Path
  ) -WindowStyle Hidden -Wait -PassThru

  if (Test-Path -LiteralPath $Path -PathType Container) {
    throw "Directory removal was incomplete (rmdir exit code $($process.ExitCode)): $Path"
  }
}

function Remove-CodexPlusDownloadsForVersion {
  [CmdletBinding()]
  param(
    [string]$Root = (Get-CodexPlusOfficialRoot),
    [Parameter(Mandatory = $true)][string]$Version
  )

  $downloadRoot = Join-Path $Root "downloads"
  if (-not (Test-Path -LiteralPath $downloadRoot -PathType Container)) { return @() }

  $pattern = '^OpenAI\.Codex_' + [regex]::Escape($Version) + '_[^_]+__2p2nqsd0c76g0\.(?:msix|msixbundle)(?:\.partial)?$'
  $cleanup = @()
  foreach ($file in @(Get-ChildItem -LiteralPath $downloadRoot -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $pattern })) {
    try {
      Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
      $cleanup += [pscustomobject]@{
        State = "Removed"
        Name = $file.Name
        Path = $file.FullName
      }
    } catch {
      $cleanup += [pscustomobject]@{
        State = "Deferred"
        Name = $file.Name
        Path = $file.FullName
        Error = $_.Exception.Message
      }
    }
  }
  return @($cleanup)
}

function Remove-CodexPlusManagedVersion {
  [CmdletBinding()]
  param(
    [string]$Root = (Get-CodexPlusOfficialRoot),
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$CurrentPath
  )

  if (-not (ConvertTo-CodexPlusVersionParts -Version $Version)) {
    throw "Cannot clean invalid Codex version: '$Version'."
  }

  $target = @(Get-CodexPlusManagedVersions -Root $Root | Where-Object { $_.Version -eq $Version }) | Select-Object -First 1
  if (-not $target) {
    throw "Managed Codex version was not found: $Version"
  }

  $targetDir = Split-Path -Parent $target.Path
  if (-not (Test-CodexPlusPathInsideRoot -Root $Root -Path $targetDir)) {
    throw "Managed version path is outside the official root: $targetDir"
  }

  $isCurrentPath = $false
  if (-not [string]::IsNullOrWhiteSpace($CurrentPath)) {
    $isCurrentPath = Test-CodexPlusPathInsideRoot -Root $targetDir -Path $CurrentPath
  }
  $runningPaths = @(Get-CodexPlusRunningManagedVersionPaths -Root $Root)
  $isRunning = @($runningPaths | Where-Object { $_.Equals($targetDir, [System.StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
  if ($isCurrentPath -or $isRunning) {
    return [pscustomobject]@{
      State = "Protected"
      Version = $Version
      Path = $targetDir
      Error = "Cannot clean the currently running version."
      DownloadCleanup = @()
    }
  }

  try {
    Remove-CodexPlusDirectory -Path $targetDir
  } catch {
    return [pscustomobject]@{
      State = "Deferred"
      Version = $Version
      Path = $targetDir
      Error = $_.Exception.Message
      DownloadCleanup = @()
    }
  }

  $downloadCleanup = @(Remove-CodexPlusDownloadsForVersion -Root $Root -Version $Version)
  return [pscustomobject]@{
    State = "Removed"
    Version = $Version
    Path = $targetDir
    DownloadCleanup = $downloadCleanup
  }
}

function Remove-CodexPlusOldManagedVersions {
  [CmdletBinding()]
  param(
    [string]$Root = (Get-CodexPlusOfficialRoot),
    [int]$Keep = 1
  )

  if ($Keep -lt 1) { $Keep = 1 }
  $versionsRoot = Join-Path $Root "versions"
  if (-not (Test-Path -LiteralPath $versionsRoot -PathType Container)) { return @() }

  $versions = @(Get-CodexPlusManagedVersions -Root $Root)
  $ordered = @($versions | Sort-Object -Property @{ Expression = { ConvertTo-CodexPlusVersionParts -Version $_.Version }; Descending = $true })
  $keepSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($item in @($ordered | Select-Object -First $Keep)) {
    [void]$keepSet.Add($item.Version)
  }

  $cleanup = @()
  foreach ($item in @($ordered | Select-Object -Skip $Keep)) {
    if ($keepSet.Contains($item.Version)) { continue }
    $cleanup += (Remove-CodexPlusManagedVersion -Root $Root -Version $item.Version)
  }

  foreach ($partial in @(Get-ChildItem -LiteralPath $versionsRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*.partial" })) {
    if (-not (Test-CodexPlusPathInsideRoot -Root $Root -Path $partial.FullName)) { continue }
    try {
      Remove-CodexPlusDirectory -Path $partial.FullName
      $cleanup += [pscustomobject]@{
        State = "Removed"
        Version = $partial.Name
        Path = $partial.FullName
      }
    } catch {
      $cleanup += [pscustomobject]@{
        State = "Deferred"
        Version = $partial.Name
        Path = $partial.FullName
        Error = $_.Exception.Message
      }
    }
  }

  return @($cleanup)
}

function Resolve-CodexPlusStoreAppx {
  [CmdletBinding()]
  param()

  $packages = @(Get-AppxPackage -Name "OpenAI.Codex" -ErrorAction SilentlyContinue)
  foreach ($package in $packages) {
    if (-not $package.InstallLocation) { continue }
    $entrypoint = Get-CodexPlusEntrypoint -Directory (Join-Path $package.InstallLocation "app")
    if (-not $entrypoint) { continue }
    return (New-CodexPlusAppObject -Path $entrypoint.Path -Version ([string]$package.Version) -Source "Appx" -PackageFamilyName $package.PackageFamilyName -AppUserModelId ($package.PackageFamilyName + "!App") -AppKind $entrypoint.AppKind)
  }
  return $null
}

function Resolve-CodexPlusLegacyLocalCurrent {
  [CmdletBinding()]
  param()

  $directory = Join-Path $env:LOCALAPPDATA "Codex\versions\current"
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) { return $null }
  $entrypoint = Get-CodexPlusEntrypoint -Directory $directory
  if (-not $entrypoint) { return $null }
  return (New-CodexPlusAppObject -Path $entrypoint.Path -Version "local-current" -Source "LegacyLocalCurrent" -PackageFamilyName $null -AppUserModelId $null -AppKind $entrypoint.AppKind)
}

function Get-CodexPlusStoreLatestVersion {
  [CmdletBinding()]
  param(
    [string]$ProductId = (Get-CodexPlusStoreProductId),
    [int]$TimeoutSeconds = 8
  )

  if ([string]::IsNullOrWhiteSpace($ProductId)) { return $null }
  $uri = "https://displaycatalog.mp.microsoft.com/v7.0/products/${ProductId}?market=US&languages=en-US"
  $product = Invoke-RestMethod -Uri $uri -UseBasicParsing -TimeoutSec $TimeoutSeconds -ErrorAction Stop
  $packages = @()
  foreach ($skuAvailability in @($product.Product.DisplaySkuAvailabilities)) {
    foreach ($package in @($skuAvailability.Sku.Properties.Packages)) {
      if (-not $package.PackageFullName) { continue }
      if (@($package.Architectures) -notcontains "x64") { continue }
      if ($package.PackageFullName -notmatch '^OpenAI\.Codex_(\d+(?:\.\d+)*)_x64__') { continue }
      $packages += [pscustomobject]@{
        Version = $Matches[1]
        PackageFullName = [string]$package.PackageFullName
        ProductId = $ProductId
        Source = "DisplayCatalog"
      }
    }
  }

  if ($packages.Count -eq 0) { return $null }
  $latest = $packages[0]
  foreach ($candidate in $packages) {
    if ((Compare-CodexPlusVersion -Left $candidate.Version -Right $latest.Version) -gt 0) {
      $latest = $candidate
    }
  }
  return $latest
}

function Resolve-CodexPlusOfficialApp {
  [CmdletBinding()]
  param(
    [string]$Version = "latest",
    [string]$Root = (Get-CodexPlusOfficialRoot),
    [switch]$UseStoreAppx,
    [switch]$UseLegacyLocalCurrent
  )

  if ($Version -eq "store" -or $UseStoreAppx) {
    return (Resolve-CodexPlusStoreAppx)
  }

  if ($Version -eq "legacy" -or $UseLegacyLocalCurrent) {
    return (Resolve-CodexPlusLegacyLocalCurrent)
  }

  $managed = Resolve-CodexPlusManagedVersion -Root $Root -Version $Version
  if ($managed) { return $managed }

  if ($Version -and $Version -ne "latest" -and $Version -ne "local") { return $null }

  $store = Resolve-CodexPlusStoreAppx
  if ($store) { return $store }

  return (Resolve-CodexPlusLegacyLocalCurrent)
}

Export-ModuleMember -Function @(
  "Get-CodexPlusOfficialRoot",
  "Get-CodexPlusStoreProductId",
  "Get-CodexPlusStoreLatestVersion",
  "Get-CodexPlusEntrypoint",
  "Get-CodexPlusManagedVersions",
  "Remove-CodexPlusManagedVersion",
  "Remove-CodexPlusOldManagedVersions",
  "Resolve-CodexPlusManagedVersion",
  "Resolve-CodexPlusOfficialApp",
  "Compare-CodexPlusVersion",
  "Test-CodexPlusPathInsideRoot"
)
