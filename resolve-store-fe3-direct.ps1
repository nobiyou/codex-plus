#Requires -Version 5.1
param(
  [string]$ProductId = "9PLM9XGG6VKS",
  [string]$Market = "US",
  [string]$Language = "en-US",
  [string]$Architecture = "x64",
  [string]$DownloadDirectory,
  [int]$KeepVersions = 1,
  [switch]$Download,
  [switch]$Import,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TemplateRoot = Join-Path $ScriptRoot "store-templates"
$DisplayCatalogBase = "https://displaycatalog.mp.microsoft.com/v7.0/products/"
$Fe3Url = "https://fe3.delivery.mp.microsoft.com/ClientWebService/client.asmx"
$Fe3SecuredUrl = "https://fe3.delivery.mp.microsoft.com/ClientWebService/client.asmx/secured"
$UserAgent = "Windows-Update-Agent/10.0.10011.16384 Client-Protocol/1.40"

function Get-TemplateText {
  param([Parameter(Mandatory = $true)][string]$Name)
  $path = Join-Path $TemplateRoot $Name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing FE3 SOAP template: $path"
  }
  return (Get-Content -LiteralPath $path -Raw -Encoding UTF8)
}

function Invoke-Fe3Soap {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$Body
  )
  return Invoke-WebRequest -Uri $Uri -Method Post -UseBasicParsing -TimeoutSec 30 -Headers @{
    "Content-Type" = "application/soap+xml; charset=utf-8"
    "User-Agent" = $UserAgent
  } -Body $Body
}

function ConvertFrom-HtmlEncodedXml {
  param([Parameter(Mandatory = $true)][string]$Text)
  Add-Type -AssemblyName System.Web -ErrorAction SilentlyContinue | Out-Null
  return [System.Web.HttpUtility]::HtmlDecode($Text)
}

function Get-ElementText {
  param(
    [Parameter(Mandatory = $true)][string]$Xml,
    [Parameter(Mandatory = $true)][string]$LocalName
  )
  $match = [regex]::Match($Xml, "<[^>]*$([regex]::Escape($LocalName))[^>]*>(.*?)</[^>]*$([regex]::Escape($LocalName))>", [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $match.Success) { return $null }
  return $match.Groups[1].Value
}

function Get-VersionParts {
  param([string]$Version)
  if ($Version -notmatch '^\d+(\.\d+)*$') { return @(0) }
  return @($Version -split '\.' | ForEach-Object { [int64]$_ })
}

function Compare-VersionText {
  param([string]$Left, [string]$Right)
  $a = @(Get-VersionParts -Version $Left)
  $b = @(Get-VersionParts -Version $Right)
  $max = [Math]::Max($a.Count, $b.Count)
  for ($i = 0; $i -lt $max; $i++) {
    $av = if ($i -lt $a.Count) { $a[$i] } else { 0 }
    $bv = if ($i -lt $b.Count) { $b[$i] } else { 0 }
    if ($av -lt $bv) { return -1 }
    if ($av -gt $bv) { return 1 }
  }
  return 0
}

function Get-MonikerVersion {
  param([string]$Moniker)
  $parts = $Moniker -split '_'
  if ($parts.Count -lt 2) { return $null }
  return $parts[1]
}

function Get-MonikerArchitecture {
  param([string]$Moniker)
  $parts = $Moniker -split '_'
  if ($parts.Count -lt 3) { return $null }
  return $parts[2]
}

function Get-WuCategoryId {
  param([Parameter(Mandatory = $true)]$Product)
  foreach ($sku in @($Product.Product.DisplaySkuAvailabilities)) {
    $fulfillment = $sku.Sku.Properties.FulfillmentData
    if ($fulfillment -is [string]) {
      $fulfillment = $fulfillment | ConvertFrom-Json
    }
    if ($fulfillment -and $fulfillment.WuCategoryId) {
      return [string]$fulfillment.WuCategoryId
    }
  }
  throw "No WuCategoryId found in DisplayCatalog response."
}

function Get-PackageCandidates {
  param([Parameter(Mandatory = $true)][string]$SyncXml)
  $decoded = ConvertFrom-HtmlEncodedXml -Text $SyncXml
  $blocks = [regex]::Matches($decoded, '<UpdateInfo\b.*?</UpdateInfo>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $candidates = @()
  foreach ($block in $blocks) {
    $text = $block.Value
    if ($text -notmatch '<SecuredFragment>\s*FileUrl\s*</SecuredFragment>') { continue }
    $identity = [regex]::Match($text, '<UpdateIdentity\b[^>]*UpdateID="([^"]+)"[^>]*RevisionNumber="([^"]+)"', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $appx = [regex]::Match($text, '<AppxMetadata\b[^>]*PackageMoniker="([^"]+)"', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $identity.Success -or -not $appx.Success) { continue }
    $moniker = $appx.Groups[1].Value
    $arch = Get-MonikerArchitecture -Moniker $moniker
    $version = Get-MonikerVersion -Moniker $moniker
    $candidates += [pscustomobject]@{
      Moniker = $moniker
      Version = $version
      Architecture = $arch
      UpdateId = $identity.Groups[1].Value
      RevisionId = $identity.Groups[2].Value
    }
  }
  return @($candidates)
}

function Select-BestCandidate {
  param(
    [Parameter(Mandatory = $true)]$Candidates,
    [Parameter(Mandatory = $true)][string]$Architecture
  )
  $filtered = @($Candidates | Where-Object { $_.Moniker -like 'OpenAI.Codex_*' -and $_.Architecture -ieq $Architecture })
  if ($filtered.Count -eq 0) { throw "No OpenAI.Codex $Architecture candidate in FE3 SyncUpdates response." }
  $best = $filtered[0]
  foreach ($candidate in $filtered) {
    if ((Compare-VersionText -Left $candidate.Version -Right $best.Version) -gt 0) {
      $best = $candidate
    }
  }
  return $best
}

function Get-FileUrls {
  param([Parameter(Mandatory = $true)][string]$Xml)
  $urls = @()
  foreach ($match in [regex]::Matches($Xml, '<Url>(.*?)</Url>', [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
    $url = ConvertFrom-HtmlEncodedXml -Text $match.Groups[1].Value
    if ($url -like 'http*') { $urls += $url }
  }
  return @($urls)
}

function Select-MsixUrl {
  param([Parameter(Mandatory = $true)]$Urls)
  $usable = @($Urls | Where-Object { $_ -like 'http*' -and $_.Length -ne 99 })
  if ($usable.Count -eq 0) { throw "No usable MSIX URL in FE3 GetExtendedUpdateInfo2 response." }
  return ($usable | Sort-Object Length -Descending | Select-Object -First 1)
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

function Invoke-DownloadFileWithProgress {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$Target,
    [Parameter(Mandatory = $true)][string]$UserAgent
  )
  $partialTarget = $Target + ".partial"
  if (Test-Path -LiteralPath $partialTarget) {
    Remove-Item -LiteralPath $partialTarget -Force
  }
  if (Test-Path -LiteralPath $Target) {
    $existing = Get-Item -LiteralPath $Target
    if ($existing.Length -eq 0) {
      Remove-Item -LiteralPath $Target -Force
    } else {
      $archive = $null
      try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
        $archive = [System.IO.Compression.ZipFile]::OpenRead($Target)
        $archive.Dispose()
        $archive = $null
        Write-UpgradeProgress -Phase "downloading" -Current $existing.Length -Total $existing.Length -Status "Using existing official package"
        return
      } catch {
        if ($archive) { $archive.Dispose() }
        Remove-Item -LiteralPath $Target -Force
      }
    }
  }

  $request = [System.Net.HttpWebRequest]::Create($Uri)
  $request.Method = "GET"
  $request.UserAgent = $UserAgent
  $request.Timeout = 30000
  $request.ReadWriteTimeout = 60000
  $request.AllowAutoRedirect = $true
  $response = $null
  $source = $null
  $destination = $null
  try {
    Write-UpgradeProgress -Phase "downloading" -Current 0 -Total 0 -Status "Connecting to official CDN"
    $response = $request.GetResponse()
    $total = [int64]$response.ContentLength
    $source = $response.GetResponseStream()
    $destination = [System.IO.FileStream]::new(
      $partialTarget,
      [System.IO.FileMode]::Create,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::Read
    )
    $buffer = New-Object byte[] (1024 * 1024)
    $downloaded = [int64]0
    $lastReport = Get-Date
    while (($read = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $destination.Write($buffer, 0, $read)
      $downloaded += $read
      $now = Get-Date
      if ((($now - $lastReport).TotalMilliseconds -ge 500) -or ($total -gt 0 -and $downloaded -ge $total)) {
        Write-UpgradeProgress -Phase "downloading" -Current $downloaded -Total $total -Status "Downloading official package"
        $lastReport = $now
      }
    }
    $destination.Flush()
    if ($downloaded -le 0) {
      throw "Official MSIX download returned empty content."
    }
    if ($total -gt 0 -and $downloaded -ne $total) {
      throw "Official MSIX download incomplete: received $downloaded / $total bytes."
    }
    $destination.Dispose()
    $destination = $null
    $source.Dispose()
    $source = $null
    $response.Dispose()
    $response = $null
    if (Test-Path -LiteralPath $Target) {
      Remove-Item -LiteralPath $Target -Force
    }
    Move-Item -LiteralPath $partialTarget -Destination $Target -Force
    Write-UpgradeProgress -Phase "downloading" -Current $downloaded -Total $total -Status "Official package download complete"
  } finally {
    if ($destination) { $destination.Dispose() }
    if ($source) { $source.Dispose() }
    if ($response) { $response.Dispose() }
  }
}

$catalogUri = "${DisplayCatalogBase}${ProductId}?market=${Market}&languages=${Language}"
$product = Invoke-RestMethod -Uri $catalogUri -UseBasicParsing -TimeoutSec 20 -Headers @{ "User-Agent" = $UserAgent }
$title = [string]$product.Product.LocalizedProperties[0].ProductTitle
if ([string]::IsNullOrWhiteSpace($title)) { $title = "Codex" }
$categoryId = Get-WuCategoryId -Product $product

$getCookieTemplate = Get-TemplateText -Name "GetCookie.xml"
$syncTemplate = Get-TemplateText -Name "WUIDRequest.xml"
$fileUrlTemplate = Get-TemplateText -Name "FE3FileUrl.xml"

$cookieResponse = Invoke-Fe3Soap -Uri $Fe3Url -Body $getCookieTemplate
$encryptedData = Get-ElementText -Xml $cookieResponse.Content -LocalName "EncryptedData"
if ([string]::IsNullOrWhiteSpace($encryptedData)) { throw "FE3 GetCookie response did not contain EncryptedData." }

# The StoreLib-derived template has a token placeholder. For this product the FE3
# SyncUpdates and secured FileUrl calls accept an empty ticket body on this host.
$syncBody = $syncTemplate.Replace("{0}", $encryptedData).Replace("{1}", $categoryId).Replace("{2}", "")
$syncResponse = Invoke-Fe3Soap -Uri $Fe3Url -Body $syncBody
$candidates = Get-PackageCandidates -SyncXml $syncResponse.Content
$best = Select-BestCandidate -Candidates $candidates -Architecture $Architecture

$fileUrlBody = $fileUrlTemplate.Replace("{0}", $best.UpdateId).Replace("{1}", $best.RevisionId).Replace("{2}", "")
$fileUrlResponse = Invoke-Fe3Soap -Uri $Fe3SecuredUrl -Body $fileUrlBody
$urls = Get-FileUrls -Xml $fileUrlResponse.Content
$downloadUrl = Select-MsixUrl -Urls $urls

$result = [pscustomobject]@{
  ProductId = $ProductId
  Title = $title
  CategoryId = $categoryId
  Version = $best.Version
  Moniker = $best.Moniker
  Architecture = $best.Architecture
  UpdateId = $best.UpdateId
  RevisionId = $best.RevisionId
  Url = $downloadUrl
  DownloadedPath = $null
}

if ($Import) { $Download = $true }

if ($Download) {
  if ([string]::IsNullOrWhiteSpace($DownloadDirectory)) {
    $DownloadDirectory = Join-Path $env:LOCALAPPDATA "Codex-Plus-Pro\official\downloads"
  }
  New-Item -ItemType Directory -Force -Path $DownloadDirectory | Out-Null
  $extension = if ($downloadUrl -match '\.msixbundle(\?|$)') { ".msixbundle" } else { ".msix" }
  $target = Join-Path $DownloadDirectory ($best.Moniker + $extension)
  Invoke-DownloadFileWithProgress -Uri $downloadUrl -Target $target -UserAgent $UserAgent
  $result.DownloadedPath = $target
  if ($Import) {
    $importScript = Join-Path $ScriptRoot "import-official-package.ps1"
    if (-not (Test-Path -LiteralPath $importScript -PathType Leaf)) {
      throw "Missing import-official-package.ps1: $importScript"
    }
    $importArgs = @{
      PackagePath = $target
      KeepVersions = $KeepVersions
    }
    if ($Force) { $importArgs.Force = $true }
    $importJson = & $importScript @importArgs
    $result | Add-Member -MemberType NoteProperty -Name Imported -Value ($importJson | ConvertFrom-Json)
  }
}

$result | ConvertTo-Json -Depth 4
