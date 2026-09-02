#Requires -Version 5.1
Set-StrictMode -Version Latest

function Resolve-CodexPlusTaskboardFullPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return [System.IO.Path]::GetFullPath($Path)
}

function Resolve-CodexPlusTaskboardExistingDirectory {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $null
  }

  $candidate = Resolve-CodexPlusTaskboardFullPath -Path $Path
  if (Test-Path -LiteralPath $candidate -PathType Container) {
    return $candidate
  }

  return $null
}

function Resolve-CodexPlusTaskboardStateRoot {
  param(
    [string]$StateRoot,
    [switch]$Create
  )

  $candidate = $StateRoot
  if ([string]::IsNullOrWhiteSpace($candidate)) {
    $candidate = Join-Path $env:LOCALAPPDATA "Codex-Plus-Pro\taskboard"
  }

  $resolved = Resolve-CodexPlusTaskboardFullPath -Path $candidate
  if ($Create -and -not (Test-Path -LiteralPath $resolved -PathType Container)) {
    New-Item -ItemType Directory -Path $resolved -Force | Out-Null
  }

  return $resolved
}

function Get-CodexPlusTaskboardStateFilePath {
  param(
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$Name
  )

  return (Join-Path $StateRoot $Name)
}

function Read-CodexPlusTaskboardStateValue {
  param(
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $path = Get-CodexPlusTaskboardStateFilePath -StateRoot $StateRoot -Name $Name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    return $null
  }

  $value = Get-Content -LiteralPath $path -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $value) {
    return $null
  }

  $text = ([string]$value).Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    return $null
  }

  return $text
}

function Write-CodexPlusTaskboardStateValue {
  param(
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $path = Get-CodexPlusTaskboardStateFilePath -StateRoot $StateRoot -Name $Name
  Set-Content -LiteralPath $path -Value $Value -Encoding ASCII
}

function Write-CodexPlusTaskboardRuntimeDescriptor {
  param(
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$InstanceToken
  )

  if ([string]::IsNullOrWhiteSpace($InstanceToken)) {
    return
  }

  $descriptorUrl = $Url.TrimEnd('/') + "/" + $InstanceToken.Trim('/')
  $descriptor = [ordered]@{
    version = 1
    url = $descriptorUrl
  }
  $json = $descriptor | ConvertTo-Json -Compress
  $path = Get-CodexPlusTaskboardStateFilePath -StateRoot $StateRoot -Name "launcher-runtime.json"
  $current = Get-Content -LiteralPath $path -Raw -ErrorAction SilentlyContinue
  if ([string]$current -ne ($json + [Environment]::NewLine)) {
    Set-Content -LiteralPath $path -Value $json -Encoding ASCII
  }
}

function Remove-CodexPlusTaskboardStateFiles {
  param([Parameter(Mandatory = $true)][string]$StateRoot)

  foreach ($name in @("pid.txt", "root.txt", "port.txt", "url.txt", "node.txt", "owner.txt", "instance-token.txt", "instance-secret.txt", "launcher-runtime.json", "stdout.log", "stderr.log")) {
    $path = Get-CodexPlusTaskboardStateFilePath -StateRoot $StateRoot -Name $name
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
  }
}

function Resolve-CodexPlusTaskboardRecordedRoot {
  param([Parameter(Mandatory = $true)][string]$StateRoot)

  return (Resolve-CodexPlusTaskboardExistingDirectory -Path (Read-CodexPlusTaskboardStateValue -StateRoot $StateRoot -Name "root.txt"))
}

function Resolve-CodexPlusTaskboardRecordedNodePath {
  param([Parameter(Mandatory = $true)][string]$StateRoot)

  $recorded = Read-CodexPlusTaskboardStateValue -StateRoot $StateRoot -Name "node.txt"
  if ([string]::IsNullOrWhiteSpace($recorded)) {
    return $null
  }

  return (Resolve-CodexPlusTaskboardFullPath -Path $recorded)
}

function Resolve-CodexPlusTaskboardRecordedOwnerMarker {
  param([Parameter(Mandatory = $true)][string]$StateRoot)

  return (Read-CodexPlusTaskboardStateValue -StateRoot $StateRoot -Name "owner.txt")
}

function Resolve-CodexPlusTaskboardRecordedInstanceToken {
  param([Parameter(Mandatory = $true)][string]$StateRoot)

  return (Read-CodexPlusTaskboardStateValue -StateRoot $StateRoot -Name "instance-token.txt")
}

function Resolve-CodexPlusTaskboardRecordedInstanceSecret {
  param([Parameter(Mandatory = $true)][string]$StateRoot)

  return (Read-CodexPlusTaskboardStateValue -StateRoot $StateRoot -Name "instance-secret.txt")
}

function Resolve-CodexPlusTaskboardExpectedRoot {
  param(
    [string]$Root,
    [Parameter(Mandatory = $true)][string]$StateRoot
  )

  if (-not [string]::IsNullOrWhiteSpace($Root)) {
    return (Get-CodexPlusTaskboardRoot -Root $Root)
  }

  $recorded = Resolve-CodexPlusTaskboardRecordedRoot -StateRoot $StateRoot
  if ($recorded) {
    return $recorded
  }

  return (Get-CodexPlusTaskboardRoot -Root $null)
}

function Resolve-CodexPlusTaskboardServerEntrypoint {
  param([string]$Root)

  if ([string]::IsNullOrWhiteSpace($Root)) {
    return $null
  }

  $entry = Join-Path $Root "server\index.mjs"
  if (Test-Path -LiteralPath $entry -PathType Leaf) {
    return $entry
  }

  return $null
}

function Resolve-CodexPlusTaskboardNodePath {
  param([string]$NodePath)

  if (-not [string]::IsNullOrWhiteSpace($NodePath)) {
    $explicit = Resolve-CodexPlusTaskboardFullPath -Path $NodePath
    if (Test-Path -LiteralPath $explicit -PathType Leaf) {
      return $explicit
    }

    return $null
  }

  $command = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $command) {
    return $null
  }

  return $command.Source
}

function ConvertTo-CodexPlusTaskboardInt {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $null
  }

  $parsed = 0
  if ([int]::TryParse($Value, [ref]$parsed)) {
    return $parsed
  }

  return $null
}

function Test-CodexPlusTaskboardPortValue {
  param([int]$Port)

  return ($Port -ge 1024 -and $Port -le 65535)
}

function Get-CodexPlusTaskboardUrlForPort {
  param([Parameter(Mandatory = $true)][int]$Port)

  return "http://127.0.0.1:$Port"
}

function Get-CodexPlusTaskboardEmbedUrl {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [string]$InstanceToken
  )

  $baseUrl = $Url.TrimEnd('/')
  if ([string]::IsNullOrWhiteSpace($InstanceToken)) {
    return ($baseUrl + "/?host=codex")
  }

  return ($baseUrl + "/" + $InstanceToken + "/?host=codex")
}

function Test-CodexPlusTaskboardPathEquality {
  param(
    [string]$LeftPath,
    [string]$RightPath
  )

  if ([string]::IsNullOrWhiteSpace($LeftPath) -or [string]::IsNullOrWhiteSpace($RightPath)) {
    return $false
  }

  $normalizedLeftPath = (Resolve-CodexPlusTaskboardFullPath -Path $LeftPath).TrimEnd('\').ToLowerInvariant()
  $normalizedRightPath = (Resolve-CodexPlusTaskboardFullPath -Path $RightPath).TrimEnd('\').ToLowerInvariant()
  return ($normalizedLeftPath -eq $normalizedRightPath)
}

function Test-CodexPlusTaskboardCommandLineToken {
  param(
    [string]$CommandLine,
    [string]$Token
  )

  if ([string]::IsNullOrWhiteSpace($CommandLine) -or [string]::IsNullOrWhiteSpace($Token)) {
    return $false
  }

  $normalizedCommandLine = $CommandLine.Replace('/', '\').ToLowerInvariant()
  $normalizedToken = $Token.Replace('/', '\').ToLowerInvariant()
  $pattern = '(^|[\s''"])' + [regex]::Escape($normalizedToken) + '($|[\s''"])'
  return [regex]::IsMatch($normalizedCommandLine, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
}

function Get-CodexPlusTaskboardProcessInfo {
  param([Nullable[int]]$ProcessId)

  if ($null -eq $ProcessId) {
    return $null
  }

  try {
    return Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ProcessId) -ErrorAction Stop
  } catch {
    return $null
  }
}

function Get-CodexPlusTaskboardListeningProcessIds {
  param([int]$Port)

  if (-not (Test-CodexPlusTaskboardPortValue -Port $Port)) {
    return @()
  }

  try {
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop)
  } catch {
    return @()
  }

  $processIds = @()
  foreach ($connection in $connections) {
    $processId = ConvertTo-CodexPlusTaskboardInt -Value ([string]$connection.OwningProcess)
    if ($null -ne $processId -and $processId -gt 0) {
      $processIds += $processId
    }
  }

  return @($processIds | Select-Object -Unique)
}

function Test-CodexPlusTaskboardProcessIdentity {
  param(
    $Process,
    [string]$Root,
    [string]$NodePath,
    [string]$OwnerMarker
  )

  if ($null -eq $Process) {
    return $false
  }

  if ($null -eq $Process.PSObject.Properties["ExecutablePath"] -or $null -eq $Process.PSObject.Properties["CommandLine"]) {
    return $false
  }

  $commandLine = [string]$Process.CommandLine
  if ([string]::IsNullOrWhiteSpace($commandLine) -or [string]::IsNullOrWhiteSpace($Root) -or [string]::IsNullOrWhiteSpace($NodePath) -or [string]::IsNullOrWhiteSpace($OwnerMarker)) {
    return $false
  }

  $entrypoint = Resolve-CodexPlusTaskboardServerEntrypoint -Root $Root
  if (-not $entrypoint) {
    return $false
  }

  if (-not (Test-CodexPlusTaskboardPathEquality -LeftPath $Process.ExecutablePath -RightPath $NodePath)) {
    return $false
  }

  $resolvedEntrypoint = Resolve-CodexPlusTaskboardFullPath -Path $entrypoint
  if (-not (Test-CodexPlusTaskboardCommandLineToken -CommandLine $commandLine -Token $resolvedEntrypoint)) {
    return $false
  }

  return (Test-CodexPlusTaskboardCommandLineToken -CommandLine $commandLine -Token ("--codex-plus-taskboard-owner-marker={0}" -f $OwnerMarker))
}

function Get-CodexPlusTaskboardOwnedListeningProcess {
  param(
    [int]$Port,
    [string]$Root,
    [string]$NodePath,
    [string]$OwnerMarker
  )

  foreach ($processId in @(Get-CodexPlusTaskboardListeningProcessIds -Port $Port)) {
    $process = Get-CodexPlusTaskboardProcessInfo -ProcessId ([int]$processId)
    if (Test-CodexPlusTaskboardProcessIdentity -Process $process -Root $Root -NodePath $NodePath -OwnerMarker $OwnerMarker) {
      return $process
    }
  }

  return $null
}

function Get-CodexPlusTaskboardHealthUrl {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [string]$InstanceToken
  )

  $baseUrl = $Url.TrimEnd('/')
  if ([string]::IsNullOrWhiteSpace($InstanceToken)) {
    return ($baseUrl + "/health")
  }

  return ($baseUrl + "/" + $InstanceToken.Trim('/') + "/health")
}

function Get-CodexPlusTaskboardRecordedProcessStatus {
  param([Parameter(Mandatory = $true)][string]$StateRoot)

  $recordedRoot = Resolve-CodexPlusTaskboardRecordedRoot -StateRoot $StateRoot
  $recordedNodePath = Resolve-CodexPlusTaskboardRecordedNodePath -StateRoot $StateRoot
  $recordedOwnerMarker = Resolve-CodexPlusTaskboardRecordedOwnerMarker -StateRoot $StateRoot
  $recordedProcessId = ConvertTo-CodexPlusTaskboardInt -Value (Read-CodexPlusTaskboardStateValue -StateRoot $StateRoot -Name "pid.txt")
  $recordedPort = ConvertTo-CodexPlusTaskboardInt -Value (Read-CodexPlusTaskboardStateValue -StateRoot $StateRoot -Name "port.txt")
  if ($null -eq $recordedPort -or -not (Test-CodexPlusTaskboardPortValue -Port $recordedPort)) {
    $recordedPort = Get-CodexPlusTaskboardPort
  }

  $process = Get-CodexPlusTaskboardProcessInfo -ProcessId $recordedProcessId
  if (-not (Test-CodexPlusTaskboardProcessIdentity -Process $process -Root $recordedRoot -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker)) {
    $process = Get-CodexPlusTaskboardOwnedListeningProcess -Port $recordedPort -Root $recordedRoot -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker
    if ($null -eq $process) {
      return $null
    }

    $recordedProcessId = [int]$process.ProcessId
    try {
      Write-CodexPlusTaskboardStateValue -StateRoot $StateRoot -Name "pid.txt" -Value ([string]$recordedProcessId)
    } catch {
      # Status remains usable even if a read-only state directory prevents repair.
    }
  }

  $recordedUrl = Get-CodexPlusTaskboardUrlForPort -Port $recordedPort
  $recordedInstanceToken = Resolve-CodexPlusTaskboardRecordedInstanceToken -StateRoot $StateRoot
  $recordedInstanceSecret = Resolve-CodexPlusTaskboardRecordedInstanceSecret -StateRoot $StateRoot
  try {
    Write-CodexPlusTaskboardRuntimeDescriptor -StateRoot $StateRoot -Url $recordedUrl -InstanceToken $recordedInstanceToken
  } catch {
    # Status remains usable when the state directory cannot be repaired.
  }
  $healthy = Test-CodexPlusTaskboardHealth -Url $recordedUrl -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret
  $reason = "Taskboard server process exists but health check failed."
  if ($healthy) {
    $reason = "Taskboard server is healthy."
  }

  return (New-CodexPlusTaskboardStatus -Available ($null -ne $recordedRoot) -Root $recordedRoot -Port $recordedPort -Url $recordedUrl -ProcessId $recordedProcessId -Process $process -Healthy $healthy -Reason $reason -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret)
}

function Test-CodexPlusTaskboardHealth {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TotalTimeoutMs = 2000,
    [Nullable[datetime]]$DeadlineUtc,
    [string]$InstanceToken,
    [string]$InstanceSecret
  )

  $requestTimeoutSec = [Math]::Max(1, [int][Math]::Ceiling($TotalTimeoutMs / 1000.0))
  if ($DeadlineUtc) {
    $deadlineValue = [datetime]$DeadlineUtc
    $remainingMs = [int][Math]::Floor(($deadlineValue - [datetime]::UtcNow).TotalMilliseconds)
    if ($remainingMs -le 0) {
      return $false
    }

    $requestTimeoutSec = [Math]::Min($requestTimeoutSec, [Math]::Max(1, [int][Math]::Ceiling($remainingMs / 1000.0)))
  }

  try {
    $headers = @{}
    $challenge = $null
    if (-not [string]::IsNullOrWhiteSpace($InstanceSecret)) {
      $challenge = ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))
      $headers["x-codex-taskboard-challenge"] = $challenge
    }
    $healthUrl = Get-CodexPlusTaskboardHealthUrl -Url $Url -InstanceToken $InstanceToken
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -Method Get -Headers $headers -TimeoutSec $requestTimeoutSec -ErrorAction Stop
    if ($response.StatusCode -ne 200) {
      return $false
    }
    if ([string]::IsNullOrWhiteSpace($InstanceSecret)) {
      return $true
    }
    $body = $response.Content | ConvertFrom-Json -ErrorAction Stop
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    try {
      $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($InstanceSecret)
      $digest = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($challenge))
      $expectedProof = ([System.BitConverter]::ToString($digest)).Replace("-", "").ToLowerInvariant()
    } finally {
      $hmac.Dispose()
    }
    return ($body.status -eq "ok" -and $body.product -eq "codex-taskboard" -and $body.proof -eq $expectedProof)
  } catch {
    return $false
  }
}

function Stop-CodexPlusTaskboardOwnedProcess {
  param(
    [Nullable[int]]$ProcessId,
    [string]$Root,
    [string]$NodePath,
    [string]$OwnerMarker
  )

  $firstProcess = Get-CodexPlusTaskboardProcessInfo -ProcessId $ProcessId
  if ($null -eq $firstProcess) {
    return [pscustomobject]@{ Outcome = "Exited"; Process = $null }
  }

  if (-not (Test-CodexPlusTaskboardProcessIdentity -Process $firstProcess -Root $Root -NodePath $NodePath -OwnerMarker $OwnerMarker)) {
    return [pscustomobject]@{ Outcome = "NotOwned"; Process = $firstProcess }
  }

  # Re-read immediately before Stop-Process. A PID alone is not an ownership proof.
  $secondProcess = Get-CodexPlusTaskboardProcessInfo -ProcessId $ProcessId
  if ($null -eq $secondProcess) {
    return [pscustomobject]@{ Outcome = "Exited"; Process = $null }
  }

  if (-not (Test-CodexPlusTaskboardProcessIdentity -Process $secondProcess -Root $Root -NodePath $NodePath -OwnerMarker $OwnerMarker)) {
    return [pscustomobject]@{ Outcome = "IdentityChanged"; Process = $secondProcess }
  }

  try {
    Stop-Process -Id $ProcessId -ErrorAction Stop
  } catch {
    return [pscustomobject]@{ Outcome = "StopFailed"; Process = $secondProcess; Error = $_.Exception.Message }
  }

  $deadline = [datetime]::UtcNow.AddSeconds(5)
  while ([datetime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $remainingProcess = Get-CodexPlusTaskboardProcessInfo -ProcessId $ProcessId
    if ($null -eq $remainingProcess) {
      return [pscustomobject]@{ Outcome = "Stopped"; Process = $null }
    }

    if (-not (Test-CodexPlusTaskboardProcessIdentity -Process $remainingProcess -Root $Root -NodePath $NodePath -OwnerMarker $OwnerMarker)) {
      return [pscustomobject]@{ Outcome = "IdentityChangedAfterStop"; Process = $remainingProcess }
    }
  }

  return [pscustomobject]@{ Outcome = "StillOwned"; Process = (Get-CodexPlusTaskboardProcessInfo -ProcessId $ProcessId) }
}

function New-CodexPlusTaskboardStatus {
  param(
    [bool]$Available,
    [string]$Root,
    [int]$Port,
    [string]$Url,
    [Nullable[int]]$ProcessId,
    $Process,
    [bool]$Healthy,
    [string]$Reason,
    [string]$NodePath,
    [string]$OwnerMarker,
    [bool]$StatePreserved = $false,
    [string]$InstanceToken,
    [string]$InstanceSecret
  )

  $embedUrl = Get-CodexPlusTaskboardEmbedUrl -Url $Url -InstanceToken $InstanceToken

  return [pscustomobject]@{
    Available = $Available
    Root = $Root
    Port = $Port
    Url = $Url
    EmbedUrl = $embedUrl
    ProcessId = $ProcessId
    Process = $Process
    Healthy = $Healthy
    Reason = $Reason
    NodePath = $NodePath
    OwnerMarker = $OwnerMarker
    InstanceToken = $InstanceToken
    InstanceSecret = $InstanceSecret
    StatePreserved = $StatePreserved
  }
}

function Resolve-CodexPlusTaskboardStateSelection {
  param(
    [string]$Root,
    [int]$Port = 0,
    [string]$StateRoot
  )

  $resolvedStateRoot = Resolve-CodexPlusTaskboardStateRoot -StateRoot $StateRoot
  $recordedRoot = Resolve-CodexPlusTaskboardRecordedRoot -StateRoot $resolvedStateRoot
  $recordedPort = ConvertTo-CodexPlusTaskboardInt -Value (Read-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "port.txt")
  $recordedProcessId = ConvertTo-CodexPlusTaskboardInt -Value (Read-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "pid.txt")

  if (-not [string]::IsNullOrWhiteSpace($Root)) {
    $effectiveRoot = Get-CodexPlusTaskboardRoot -Root $Root
  } elseif ($recordedRoot) {
    $effectiveRoot = $recordedRoot
  } else {
    $effectiveRoot = Get-CodexPlusTaskboardRoot -Root $null
  }

  $canReuseRecordedPort = $false
  if ($Port -eq 0 -and $null -ne $recordedPort -and (Test-CodexPlusTaskboardPortValue -Port $recordedPort)) {
    if ([string]::IsNullOrWhiteSpace($Root)) {
      $canReuseRecordedPort = ($null -ne $recordedRoot)
    } else {
      $canReuseRecordedPort = Test-CodexPlusTaskboardPathEquality -LeftPath $effectiveRoot -RightPath $recordedRoot
    }
  }

  if ($Port -ne 0) {
    $effectivePort = Get-CodexPlusTaskboardPort -Port $Port
  } elseif ($canReuseRecordedPort) {
    $effectivePort = $recordedPort
  } else {
    $effectivePort = Get-CodexPlusTaskboardPort
  }

  return [pscustomobject]@{
    StateRoot = $resolvedStateRoot
    RecordedRoot = $recordedRoot
    RecordedPort = $recordedPort
    RecordedProcessId = $recordedProcessId
    EffectiveRoot = $effectiveRoot
    EffectivePort = $effectivePort
    EffectiveUrl = Get-CodexPlusTaskboardUrlForPort -Port $effectivePort
  }
}

function Get-CodexPlusTaskboardRoot {
  [CmdletBinding()]
  param([string]$Root)

  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($Root)) {
    $candidates += $Root
  } else {
    $pointer = Join-Path $env:LOCALAPPDATA "Codex-Plus-Pro\taskboard-root.txt"
    if (Test-Path -LiteralPath $pointer -PathType Leaf) {
      $stored = Get-Content -LiteralPath $pointer -ErrorAction SilentlyContinue | Select-Object -First 1
      if (-not [string]::IsNullOrWhiteSpace([string]$stored)) {
        $candidates += ([string]$stored).Trim()
      }
    }

    # Keep the development checkout beside the Windows launcher. Packaged
    # builds use the same sibling layout under their staging root.
    $candidates += (Join-Path $PSScriptRoot "taskbord")
  }

  foreach ($candidate in $candidates) {
    $resolved = Resolve-CodexPlusTaskboardExistingDirectory -Path $candidate
    if ($resolved) {
      return $resolved
    }
  }

  return $null
}

function Get-CodexPlusTaskboardStateRoot {
  [CmdletBinding()]
  param([string]$StateRoot)

  return (Resolve-CodexPlusTaskboardStateRoot -StateRoot $StateRoot)
}

function Get-CodexPlusTaskboardPort {
  [CmdletBinding()]
  param([int]$Port = 0)

  if ($Port -ne 0) {
    if (-not (Test-CodexPlusTaskboardPortValue -Port $Port)) {
      throw "Taskboard port must be between 1024 and 65535: $Port"
    }

    return $Port
  }

  $envPort = ConvertTo-CodexPlusTaskboardInt -Value $env:CODEX_TASKBOARD_PORT
  if ($null -ne $envPort -and (Test-CodexPlusTaskboardPortValue -Port $envPort)) {
    return $envPort
  }

  return 47823
}

function Test-CodexPlusTaskboardPortAvailable {
  param([Parameter(Mandatory = $true)][int]$Port)

  if (-not (Test-CodexPlusTaskboardPortValue -Port $Port)) {
    return $false
  }

  # TcpListener can still bind a loopback socket when an unowned process is
  # listening on 0.0.0.0. Treat any real listening endpoint as occupied so a
  # launcher restart cannot create two Taskboard servers on one port.
  try {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) {
      return $false
    }
  } catch {
    # Fall through to the socket probe on systems without NetTCPIP cmdlets.
  }

  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

function Get-CodexPlusTaskboardAvailablePort {
  param(
    [Parameter(Mandatory = $true)][int]$PreferredPort,
    [int]$SearchRadius = 32
  )

  if (Test-CodexPlusTaskboardPortAvailable -Port $PreferredPort) {
    return $PreferredPort
  }

  for ($offset = 1; $offset -le $SearchRadius; $offset++) {
    foreach ($candidate in @(($PreferredPort + $offset), ($PreferredPort - $offset))) {
      if ((Test-CodexPlusTaskboardPortValue -Port $candidate) -and (Test-CodexPlusTaskboardPortAvailable -Port $candidate)) {
        return $candidate
      }
    }
  }

  return $null
}

function Get-CodexPlusTaskboardStatus {
  [CmdletBinding()]
  param(
    [string]$Root,
    [int]$Port = 0,
    [string]$NodePath,
    [string]$StateRoot
  )

  $stateSelection = Resolve-CodexPlusTaskboardStateSelection -Root $Root -Port $Port -StateRoot $StateRoot
  $resolvedStateRoot = $stateSelection.StateRoot
  $effectiveRoot = $stateSelection.EffectiveRoot
  $effectivePort = $stateSelection.EffectivePort
  $url = $stateSelection.EffectiveUrl
  $recordedProcessId = $stateSelection.RecordedProcessId
  $recordedNodePath = Resolve-CodexPlusTaskboardRecordedNodePath -StateRoot $resolvedStateRoot
  $recordedOwnerMarker = Resolve-CodexPlusTaskboardRecordedOwnerMarker -StateRoot $resolvedStateRoot
  $recordedInstanceToken = Resolve-CodexPlusTaskboardRecordedInstanceToken -StateRoot $resolvedStateRoot
  $recordedInstanceSecret = Resolve-CodexPlusTaskboardRecordedInstanceSecret -StateRoot $resolvedStateRoot

  $process = Get-CodexPlusTaskboardProcessInfo -ProcessId $recordedProcessId
  $launcherOwned = Test-CodexPlusTaskboardProcessIdentity -Process $process -Root $effectiveRoot -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker
  if (-not $launcherOwned) {
    $process = Get-CodexPlusTaskboardOwnedListeningProcess -Port $effectivePort -Root $effectiveRoot -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker
    if ($null -ne $process) {
      $launcherOwned = $true
      $recordedProcessId = [int]$process.ProcessId
      try {
        Write-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "pid.txt" -Value ([string]$recordedProcessId)
      } catch {
        # Keep reporting the live process when state repair is not writable.
      }
    } else {
      $process = $null
      $recordedProcessId = $null
    }
  }

  if ($launcherOwned) {
    try {
      Write-CodexPlusTaskboardRuntimeDescriptor -StateRoot $resolvedStateRoot -Url $url -InstanceToken $recordedInstanceToken
    } catch {
      # Status remains usable when the state directory cannot be repaired.
    }
  }

  $healthy = $false
  if ($launcherOwned) {
    $healthy = Test-CodexPlusTaskboardHealth -Url $url -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret
  }

  if (-not $effectiveRoot) {
    return (New-CodexPlusTaskboardStatus -Available $false -Root $null -Port $effectivePort -Url $url -ProcessId $recordedProcessId -Process $process -Healthy $false -Reason "Taskboard root was not found." -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret)
  }

  $entrypoint = Resolve-CodexPlusTaskboardServerEntrypoint -Root $effectiveRoot
  if (-not $entrypoint) {
    return (New-CodexPlusTaskboardStatus -Available $false -Root $effectiveRoot -Port $effectivePort -Url $url -ProcessId $recordedProcessId -Process $process -Healthy $false -Reason "Taskboard server entrypoint was not found under '$effectiveRoot'." -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret)
  }

  if ($launcherOwned -and $healthy) {
    return (New-CodexPlusTaskboardStatus -Available $true -Root $effectiveRoot -Port $effectivePort -Url $url -ProcessId $recordedProcessId -Process $process -Healthy $true -Reason "Taskboard server is healthy." -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret)
  }

  if ($launcherOwned) {
    return (New-CodexPlusTaskboardStatus -Available $true -Root $effectiveRoot -Port $effectivePort -Url $url -ProcessId $recordedProcessId -Process $process -Healthy $false -Reason "Taskboard server process exists but health check failed." -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret)
  }

  $nodeResolved = Resolve-CodexPlusTaskboardNodePath -NodePath $NodePath
  if (-not $nodeResolved) {
    return (New-CodexPlusTaskboardStatus -Available $false -Root $effectiveRoot -Port $effectivePort -Url $url -ProcessId $null -Process $null -Healthy $false -Reason "Node.js was not found." -NodePath $nodeResolved -OwnerMarker $recordedOwnerMarker -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret)
  }

  return (New-CodexPlusTaskboardStatus -Available $true -Root $effectiveRoot -Port $effectivePort -Url $url -ProcessId $null -Process $null -Healthy $false -Reason "Taskboard server is not running." -NodePath $nodeResolved -OwnerMarker $recordedOwnerMarker -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret)
}

function Start-CodexPlusTaskboard {
  [CmdletBinding()]
  param(
    [string]$Root,
    [int]$Port = 0,
    [string]$NodePath,
    [switch]$Force,
    [string]$StateRoot
  )

  $currentStatus = Get-CodexPlusTaskboardStatus -Root $Root -Port $Port -NodePath $NodePath -StateRoot $StateRoot
  $resolvedStateRoot = Resolve-CodexPlusTaskboardStateRoot -StateRoot $StateRoot -Create
  $recordedStatus = Get-CodexPlusTaskboardRecordedProcessStatus -StateRoot $resolvedStateRoot
  $restartPort = 0
  if ($Port -ne 0) {
    $restartPort = $Port
  } elseif ($recordedStatus -and [int]$recordedStatus.Port -gt 0) {
    $restartPort = [int]$recordedStatus.Port
  } elseif ($currentStatus -and [int]$currentStatus.Port -gt 0) {
    $restartPort = [int]$currentStatus.Port
  }
  if ($currentStatus.Healthy -and -not $Force) {
    return $currentStatus
  }

  if ($recordedStatus) {
    if (-not $Force) {
      if ($Port -ne 0 -and $Port -ne $recordedStatus.Port) {
        return (New-CodexPlusTaskboardStatus -Available $true -Root $recordedStatus.Root -Port $recordedStatus.Port -Url $recordedStatus.Url -ProcessId $recordedStatus.ProcessId -Process $recordedStatus.Process -Healthy $recordedStatus.Healthy -Reason ("Taskboard server is already running on port {0}; use -Force to replace it with port {1}." -f $recordedStatus.Port, $Port))
      }

      return (New-CodexPlusTaskboardStatus -Available $true -Root $recordedStatus.Root -Port $recordedStatus.Port -Url $recordedStatus.Url -ProcessId $recordedStatus.ProcessId -Process $recordedStatus.Process -Healthy $recordedStatus.Healthy -Reason ("Taskboard server is already running but not healthy on port {0}; use -Force to restart it." -f $recordedStatus.Port))
    }

    $stopStatus = Stop-CodexPlusTaskboard -Root $recordedStatus.Root -StateRoot $StateRoot
    if (Test-Path -LiteralPath (Get-CodexPlusTaskboardStateFilePath -StateRoot $resolvedStateRoot -Name "pid.txt") -PathType Leaf) {
      return $stopStatus
    }
  } elseif ($Force) {
    $stopStatus = Stop-CodexPlusTaskboard -Root $currentStatus.Root -StateRoot $StateRoot
    if (Test-Path -LiteralPath (Get-CodexPlusTaskboardStateFilePath -StateRoot $resolvedStateRoot -Name "pid.txt") -PathType Leaf) {
      return $stopStatus
    }
  } elseif (-not [string]::IsNullOrWhiteSpace((Read-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "pid.txt"))) {
    $staleStateStatus = Stop-CodexPlusTaskboard -Root $Root -StateRoot $StateRoot
    if (Test-Path -LiteralPath (Get-CodexPlusTaskboardStateFilePath -StateRoot $resolvedStateRoot -Name "pid.txt") -PathType Leaf) {
      return $staleStateStatus
    }
  }

  $stateSelection = Resolve-CodexPlusTaskboardStateSelection -Root $Root -Port $Port -StateRoot $StateRoot
  $resolvedRoot = $stateSelection.EffectiveRoot
  $effectivePort = $stateSelection.EffectivePort
  $url = $stateSelection.EffectiveUrl

  if ($Port -eq 0 -and $restartPort -gt 0) {
    $effectivePort = $restartPort
    $url = Get-CodexPlusTaskboardUrlForPort -Port $effectivePort
  }

  if ($Port -eq 0) {
    $availablePort = Get-CodexPlusTaskboardAvailablePort -PreferredPort $effectivePort
    if ($null -eq $availablePort) {
      return (New-CodexPlusTaskboardStatus -Available $true -Root $resolvedRoot -Port $effectivePort -Url $url -ProcessId $null -Process $null -Healthy $false -Reason ("Taskboard default port {0} is occupied and no nearby free port was found." -f $effectivePort))
    }

    if ($availablePort -ne $effectivePort) {
      $effectivePort = $availablePort
      $url = Get-CodexPlusTaskboardUrlForPort -Port $effectivePort
    }
  }

  if (-not $resolvedRoot) {
    return (New-CodexPlusTaskboardStatus -Available $false -Root $null -Port $effectivePort -Url $url -ProcessId $null -Process $null -Healthy $false -Reason "Taskboard root was not found.")
  }

  $entrypoint = Resolve-CodexPlusTaskboardServerEntrypoint -Root $resolvedRoot
  if (-not $entrypoint) {
    return (New-CodexPlusTaskboardStatus -Available $false -Root $resolvedRoot -Port $effectivePort -Url $url -ProcessId $null -Process $null -Healthy $false -Reason "Taskboard server entrypoint was not found under '$resolvedRoot'.")
  }

  $nodeResolved = Resolve-CodexPlusTaskboardNodePath -NodePath $NodePath
  if (-not $nodeResolved) {
    return (New-CodexPlusTaskboardStatus -Available $false -Root $resolvedRoot -Port $effectivePort -Url $url -ProcessId $null -Process $null -Healthy $false -Reason "Node.js was not found.")
  }

  Remove-CodexPlusTaskboardStateFiles -StateRoot $resolvedStateRoot

  $ownerMarker = [guid]::NewGuid().ToString("N")
  $instanceToken = ([guid]::NewGuid().ToString("N"))
  $instanceSecret = ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))
  $stdoutPath = Get-CodexPlusTaskboardStateFilePath -StateRoot $resolvedStateRoot -Name "stdout.log"
  $stderrPath = Get-CodexPlusTaskboardStateFilePath -StateRoot $resolvedStateRoot -Name "stderr.log"

  $previousHostExists = Test-Path env:CODEX_TASKBOARD_HOST
  $previousPortExists = Test-Path env:CODEX_TASKBOARD_PORT
  $previousStateRootExists = Test-Path env:CODEX_TASKBOARD_STATE_ROOT
  $previousInstanceTokenExists = Test-Path env:CODEX_TASKBOARD_INSTANCE_TOKEN
  $previousInstanceSecretExists = Test-Path env:CODEX_TASKBOARD_INSTANCE_SECRET
  $previousHost = $env:CODEX_TASKBOARD_HOST
  $previousPort = $env:CODEX_TASKBOARD_PORT
  $previousStateRoot = $env:CODEX_TASKBOARD_STATE_ROOT
  $previousInstanceToken = $env:CODEX_TASKBOARD_INSTANCE_TOKEN
  $previousInstanceSecret = $env:CODEX_TASKBOARD_INSTANCE_SECRET

  try {
    Write-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "root.txt" -Value $resolvedRoot
    Write-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "port.txt" -Value ([string]$effectivePort)
    Write-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "url.txt" -Value $url
    Write-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "node.txt" -Value $nodeResolved
    Write-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "owner.txt" -Value $ownerMarker
    Write-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "instance-token.txt" -Value $instanceToken
    Write-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "instance-secret.txt" -Value $instanceSecret
    Write-CodexPlusTaskboardRuntimeDescriptor -StateRoot $resolvedStateRoot -Url $url -InstanceToken $instanceToken
  } catch {
    Remove-CodexPlusTaskboardStateFiles -StateRoot $resolvedStateRoot
    throw "Taskboard state could not be prepared before launch: $($_.Exception.Message)"
  }

  try {
    $env:CODEX_TASKBOARD_HOST = "127.0.0.1"
    $env:CODEX_TASKBOARD_PORT = [string]$effectivePort
    $env:CODEX_TASKBOARD_STATE_ROOT = $resolvedStateRoot
    $env:CODEX_TASKBOARD_INSTANCE_TOKEN = $instanceToken
    $env:CODEX_TASKBOARD_INSTANCE_SECRET = $instanceSecret

    $process = Start-Process -FilePath $nodeResolved `
      -ArgumentList @($entrypoint, ("--codex-plus-taskboard-owner-marker={0}" -f $ownerMarker)) `
      -WorkingDirectory $resolvedRoot `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -WindowStyle Hidden `
      -PassThru
  } catch {
    Remove-CodexPlusTaskboardStateFiles -StateRoot $resolvedStateRoot
    throw "Taskboard server launch failed: $($_.Exception.Message)"
  } finally {
    if ($previousHostExists) {
      $env:CODEX_TASKBOARD_HOST = $previousHost
    } else {
      Remove-Item env:CODEX_TASKBOARD_HOST -ErrorAction SilentlyContinue
    }

    if ($previousPortExists) {
      $env:CODEX_TASKBOARD_PORT = $previousPort
    } else {
      Remove-Item env:CODEX_TASKBOARD_PORT -ErrorAction SilentlyContinue
    }

    if ($previousStateRootExists) {
      $env:CODEX_TASKBOARD_STATE_ROOT = $previousStateRoot
    } else {
      Remove-Item env:CODEX_TASKBOARD_STATE_ROOT -ErrorAction SilentlyContinue
    }
    if ($previousInstanceTokenExists) {
      $env:CODEX_TASKBOARD_INSTANCE_TOKEN = $previousInstanceToken
    } else {
      Remove-Item env:CODEX_TASKBOARD_INSTANCE_TOKEN -ErrorAction SilentlyContinue
    }
    if ($previousInstanceSecretExists) {
      $env:CODEX_TASKBOARD_INSTANCE_SECRET = $previousInstanceSecret
    } else {
      Remove-Item env:CODEX_TASKBOARD_INSTANCE_SECRET -ErrorAction SilentlyContinue
    }
  }

  try {
    Write-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "pid.txt" -Value ([string]$process.Id)
  } catch {
    $cleanup = Stop-CodexPlusTaskboardOwnedProcess -ProcessId $process.Id -Root $resolvedRoot -NodePath $nodeResolved -OwnerMarker $ownerMarker
    if ($cleanup.Outcome -in @("Exited", "Stopped", "IdentityChangedAfterStop")) {
      Remove-CodexPlusTaskboardStateFiles -StateRoot $resolvedStateRoot
    }

    throw "Taskboard process started but PID state could not be written; cleanup outcome: $($cleanup.Outcome). $($_.Exception.Message)"
  }

  $healthy = $false
  $startupDeadline = [datetime]::UtcNow.AddSeconds(15)
  while ([datetime]::UtcNow -lt $startupDeadline) {
    Start-Sleep -Milliseconds 250

    $runningProcess = Get-CodexPlusTaskboardProcessInfo -ProcessId $process.Id
    if ($null -eq $runningProcess) {
      break
    }

    if (Test-CodexPlusTaskboardHealth -Url $url -TotalTimeoutMs 1000 -DeadlineUtc $startupDeadline -InstanceToken $instanceToken -InstanceSecret $instanceSecret) {
      $healthy = $true
      break
    }
  }

  if ($healthy) {
    $finalStatus = Get-CodexPlusTaskboardStatus -Root $resolvedRoot -Port $effectivePort -NodePath $nodeResolved -StateRoot $resolvedStateRoot
    if ($finalStatus.Healthy) {
      return $finalStatus
    }
  }

  $cleanup = Stop-CodexPlusTaskboardOwnedProcess -ProcessId $process.Id -Root $resolvedRoot -NodePath $nodeResolved -OwnerMarker $ownerMarker
  if ($cleanup.Outcome -in @("Exited", "Stopped", "IdentityChangedAfterStop")) {
    Remove-CodexPlusTaskboardStateFiles -StateRoot $resolvedStateRoot
    return (New-CodexPlusTaskboardStatus -Available $true -Root $resolvedRoot -Port $effectivePort -Url $url -ProcessId $null -Process $null -Healthy $false -Reason "Taskboard server did not become healthy before the startup deadline and was stopped." -NodePath $nodeResolved -OwnerMarker $ownerMarker -InstanceToken $instanceToken -InstanceSecret $instanceSecret)
  }

  $remainingProcess = Get-CodexPlusTaskboardProcessInfo -ProcessId $process.Id
  return (New-CodexPlusTaskboardStatus -Available $true -Root $resolvedRoot -Port $effectivePort -Url $url -ProcessId $process.Id -Process $remainingProcess -Healthy $false -Reason ("Taskboard server did not become healthy before the startup deadline; cleanup outcome: {0}. State was preserved." -f $cleanup.Outcome) -NodePath $nodeResolved -OwnerMarker $ownerMarker -StatePreserved $true -InstanceToken $instanceToken -InstanceSecret $instanceSecret)
}

function Stop-CodexPlusTaskboard {
  [CmdletBinding()]
  param(
    [string]$Root,
    [string]$StateRoot
  )

  $resolvedStateRoot = Resolve-CodexPlusTaskboardStateRoot -StateRoot $StateRoot
  $recordedRootText = Read-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "root.txt"
  $recordedRoot = Resolve-CodexPlusTaskboardRecordedRoot -StateRoot $resolvedStateRoot
  $recordedTaskboardPort = ConvertTo-CodexPlusTaskboardInt -Value (Read-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "port.txt")
  if ($null -eq $recordedTaskboardPort) {
    $recordedTaskboardPort = Get-CodexPlusTaskboardPort
  }
  $recordedUrl = Get-CodexPlusTaskboardUrlForPort -Port $recordedTaskboardPort
  $recordedProcessId = ConvertTo-CodexPlusTaskboardInt -Value (Read-CodexPlusTaskboardStateValue -StateRoot $resolvedStateRoot -Name "pid.txt")
  $recordedNodePath = Resolve-CodexPlusTaskboardRecordedNodePath -StateRoot $resolvedStateRoot
  $recordedOwnerMarker = Resolve-CodexPlusTaskboardRecordedOwnerMarker -StateRoot $resolvedStateRoot
  $recordedInstanceToken = Resolve-CodexPlusTaskboardRecordedInstanceToken -StateRoot $resolvedStateRoot
  $recordedInstanceSecret = Resolve-CodexPlusTaskboardRecordedInstanceSecret -StateRoot $resolvedStateRoot

  if (-not [string]::IsNullOrWhiteSpace($Root)) {
    $requestedRoot = Get-CodexPlusTaskboardRoot -Root $Root
    if ([string]::IsNullOrWhiteSpace($recordedRootText) -or -not (Test-CodexPlusTaskboardPathEquality -LeftPath $requestedRoot -RightPath $recordedRootText)) {
      return (New-CodexPlusTaskboardStatus -Available ($null -ne $recordedRoot) -Root $recordedRoot -Port $recordedTaskboardPort -Url $recordedUrl -ProcessId $recordedProcessId -Process $null -Healthy $false -Reason "The supplied root does not match the recorded taskboard root; state was preserved." -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker -StatePreserved $true -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret)
    }
  }

  if ($null -eq $recordedProcessId) {
    Remove-CodexPlusTaskboardStateFiles -StateRoot $resolvedStateRoot
    return (New-CodexPlusTaskboardStatus -Available ($null -ne $recordedRoot) -Root $recordedRoot -Port $recordedTaskboardPort -Url $recordedUrl -ProcessId $null -Process $null -Healthy $false -Reason "No recorded taskboard process was found." -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret)
  }

  $cleanup = Stop-CodexPlusTaskboardOwnedProcess -ProcessId $recordedProcessId -Root $recordedRoot -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker
  if ($cleanup.Outcome -in @("Exited", "Stopped", "IdentityChangedAfterStop")) {
    Remove-CodexPlusTaskboardStateFiles -StateRoot $resolvedStateRoot
    $reason = "Taskboard server was stopped."
    if ($cleanup.Outcome -eq "Exited") {
      $reason = "Recorded taskboard process had already exited; state was cleared."
    } elseif ($cleanup.Outcome -eq "IdentityChangedAfterStop") {
      $reason = "The recorded launcher exited and the PID is now owned by a different process; state was cleared without stopping it."
    }

    return (New-CodexPlusTaskboardStatus -Available ($null -ne $recordedRoot) -Root $recordedRoot -Port $recordedTaskboardPort -Url $recordedUrl -ProcessId $null -Process $null -Healthy $false -Reason $reason -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret)
  }

  $preservedProcess = $cleanup.Process
  $reason = "Recorded process was not a launcher-owned taskboard server; state was preserved."
  if ($cleanup.Outcome -eq "IdentityChanged") {
    $reason = "Process identity changed before stop; state was preserved to avoid a PID reuse kill."
  } elseif ($cleanup.Outcome -eq "StopFailed") {
    $reason = "Stopping the launcher-owned taskboard process failed; state was preserved."
  } elseif ($cleanup.Outcome -eq "StillOwned") {
    $reason = "The launcher-owned taskboard process is still running after stop; state was preserved."
  }

  return (New-CodexPlusTaskboardStatus -Available ($null -ne $recordedRoot) -Root $recordedRoot -Port $recordedTaskboardPort -Url $recordedUrl -ProcessId $recordedProcessId -Process $preservedProcess -Healthy $false -Reason $reason -NodePath $recordedNodePath -OwnerMarker $recordedOwnerMarker -StatePreserved $true -InstanceToken $recordedInstanceToken -InstanceSecret $recordedInstanceSecret)
}

Export-ModuleMember -Function @(
  "Get-CodexPlusTaskboardRoot",
  "Get-CodexPlusTaskboardStateRoot",
  "Get-CodexPlusTaskboardPort",
  "Get-CodexPlusTaskboardStatus",
  "Start-CodexPlusTaskboard",
  "Stop-CodexPlusTaskboard"
)
