#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "..\taskboard-runtime.psm1") -Force

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Assert-Equal {
  param(
    $Actual,
    $Expected,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if ($Actual -ne $Expected) {
    throw "$Message`nExpected: $Expected`nActual: $Actual"
  }
}

function Assert-Match {
  param(
    [string]$Actual,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if ($Actual -notlike $Pattern) {
    throw "$Message`nPattern: $Pattern`nActual: $Actual"
  }
}

function Assert-ThrowsLike {
  param(
    [scriptblock]$ScriptBlock,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Message
  )

  try {
    & $ScriptBlock
  } catch {
    if ($_.Exception.Message -like $Pattern) {
      return
    }

    throw "$Message`nPattern: $Pattern`nActual: $($_.Exception.Message)"
  }

  throw "$Message`nExpected an exception matching: $Pattern"
}

function Get-FreeTcpPort {
  for ($attempt = 0; $attempt -lt 8; $attempt++) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try {
      $listener.Start()
      return $listener.LocalEndpoint.Port
    } catch {
      if ($attempt -eq 7) {
        throw
      }
    } finally {
      if ($listener) {
        $listener.Stop()
      }
    }
  }
}

function Test-TestProcessIdentity {
  param(
    [int]$ProcessId,
    [string]$ExecutablePath,
    [string]$Entrypoint,
    [string]$OwnerToken
  )

  $process = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ProcessId) -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    return $false
  }

  $commandLine = ([string]$process.CommandLine).Replace('/', '\').ToLowerInvariant()
  $executableMatches = ([string]$process.ExecutablePath).TrimEnd('\').ToLowerInvariant() -eq $ExecutablePath.TrimEnd('\').ToLowerInvariant()
  return ($executableMatches -and $commandLine.Contains($Entrypoint.Replace('/', '\').ToLowerInvariant()) -and $commandLine.Contains($OwnerToken.ToLowerInvariant()))
}

function Stop-TestOwnedProcess {
  param(
    $Process,
    [string]$ExecutablePath,
    [string]$Entrypoint,
    [string]$OwnerToken
  )

  if (-not $Process) {
    return
  }

  if (-not (Test-TestProcessIdentity -ProcessId $Process.Id -ExecutablePath $ExecutablePath -Entrypoint $Entrypoint -OwnerToken $OwnerToken)) {
    return
  }

  # Re-read immediately before stopping so a reused PID cannot be killed.
  if (Test-TestProcessIdentity -ProcessId $Process.Id -ExecutablePath $ExecutablePath -Entrypoint $Entrypoint -OwnerToken $OwnerToken) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  }
}

$tempRoot = Join-Path $env:TEMP ("codex-plus-taskboard-test-" + [guid]::NewGuid().ToString("N"))
$taskboardRoot = Join-Path $tempRoot "taskboard-custom"
$pointerRoot = Join-Path $tempRoot "taskboard-pointer"
$recordedRoot = Join-Path $tempRoot "taskboard-recorded"
$brokenRoot = Join-Path $tempRoot "taskboard-broken"
$decoyRoot = Join-Path $tempRoot "taskboard-decoy"
$serverRoot = Join-Path $taskboardRoot "server"
$pointerServerRoot = Join-Path $pointerRoot "server"
$recordedServerRoot = Join-Path $recordedRoot "server"
$decoyServerRoot = Join-Path $decoyRoot "server"
$stateRoot = Join-Path $tempRoot "state"
$fallbackStateRoot = Join-Path $tempRoot "state-fallback-port"
$customReuseStateRoot = Join-Path $tempRoot "state-reuse"
$localAppDataRoot = Join-Path $tempRoot "localappdata"
$taskboardPointerDir = Join-Path $localAppDataRoot "Codex-Plus-Pro"
$wrongProcess = $null
$wrongProcessToken = $null
$fakeNodeProcess = $null
$fullPathDecoyProcess = $null
$startedProcessIds = @()
$startedOwnerMarkers = @{}
$originalLocalAppData = $env:LOCALAPPDATA

try {
  New-Item -ItemType Directory -Path $serverRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $pointerServerRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $recordedServerRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $decoyServerRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $brokenRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $fallbackStateRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $customReuseStateRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $taskboardPointerDir -Force | Out-Null
  $env:LOCALAPPDATA = $localAppDataRoot

  $serverScript = @'
import { createHmac } from "node:crypto";
import http from "node:http";

const host = process.env.CODEX_TASKBOARD_HOST || "127.0.0.1";
const port = Number(process.env.CODEX_TASKBOARD_PORT || "47823");
const instanceSecret = process.env.CODEX_TASKBOARD_INSTANCE_SECRET || "";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    const challenge = req.headers["x-codex-taskboard-challenge"];
    if (instanceSecret && typeof challenge !== "string") {
      res.statusCode = 401;
      res.end("challenge required");
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    const body = { status: "ok", product: "codex-taskboard" };
    if (instanceSecret) {
      body.proof = createHmac("sha256", instanceSecret).update(challenge).digest("hex");
    }
    res.end(JSON.stringify(body));
    return;
  }

  if (req.url === "/binding") {
    const binding = server.address();
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(binding));
    return;
  }

  res.statusCode = 404;
  res.end("missing");
});

server.listen(port, host, () => {
  console.log(`listening ${host}:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
'@
  Set-Content -LiteralPath (Join-Path $serverRoot "index.mjs") -Value $serverScript -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $pointerServerRoot "index.mjs") -Value $serverScript -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $recordedServerRoot "index.mjs") -Value $serverScript -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $decoyServerRoot "index.mjs") -Value 'setInterval(function () {}, 1000);' -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $taskboardPointerDir "taskboard-root.txt") -Value $pointerRoot -Encoding ASCII

  $missing = Start-CodexPlusTaskboard -Root (Join-Path $tempRoot "missing-root") -Port (Get-FreeTcpPort) -StateRoot $stateRoot
  Assert-Equal $missing.Available $false "Missing root should not be available."

  $missingEntrypointStatus = Get-CodexPlusTaskboardStatus -Root $brokenRoot -StateRoot $stateRoot
  Assert-Equal $missingEntrypointStatus.Available $false "Missing entrypoint status should not be available."
  Assert-Match $missingEntrypointStatus.Reason "*entrypoint was not found*" "Missing entrypoint status should explain the missing server entrypoint."

  $missingEntrypointStart = Start-CodexPlusTaskboard -Root $brokenRoot -Port (Get-FreeTcpPort) -StateRoot $stateRoot
  Assert-Equal $missingEntrypointStart.Available $false "Missing entrypoint start should not be available."
  Assert-Match $missingEntrypointStart.Reason "*entrypoint was not found*" "Missing entrypoint start should explain the missing server entrypoint."

  $missingNode = Start-CodexPlusTaskboard -Root $taskboardRoot -Port (Get-FreeTcpPort) -NodePath (Join-Path $tempRoot "missing-node.exe") -StateRoot $stateRoot
  Assert-Equal $missingNode.Available $false "Missing NodePath start should not be available."
  Assert-Match $missingNode.Reason "*Node.js was not found*" "Missing NodePath start should explain that Node.js was not found."

  Assert-ThrowsLike -ScriptBlock { Get-CodexPlusTaskboardStatus -Root $taskboardRoot -Port 80 -StateRoot $stateRoot | Out-Null } -Pattern "*Taskboard port must be between 1024 and 65535: 80*" -Message "Invalid taskboard port should be rejected."

  $previousTaskboardPort = $env:CODEX_TASKBOARD_PORT
  $fallbackCollisionPort = Get-FreeTcpPort
  $fallbackListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $fallbackCollisionPort)
  $fallbackListener.Start()
  try {
    $env:CODEX_TASKBOARD_PORT = [string]$fallbackCollisionPort
    $fallbackStart = Start-CodexPlusTaskboard -Root $taskboardRoot -StateRoot $fallbackStateRoot
    $startedProcessIds += $fallbackStart.ProcessId
    $startedOwnerMarkers[[int]$fallbackStart.ProcessId] = $fallbackStart.OwnerMarker
    Assert-Equal $fallbackStart.Healthy $true "Implicit-port start should use a nearby free port when the configured default is occupied."
    Assert-True ($fallbackStart.Port -ne $fallbackCollisionPort) "Implicit-port start should not reuse an occupied default port."
    $fallbackStop = Stop-CodexPlusTaskboard -StateRoot $fallbackStateRoot
    Assert-Match $fallbackStop.Reason "*was stopped*" "Fallback-port taskboard should stop cleanly."
  } finally {
    if ($fallbackListener) {
      $fallbackListener.Stop()
    }
    if ($null -eq $previousTaskboardPort) {
      Remove-Item Env:CODEX_TASKBOARD_PORT -ErrorAction SilentlyContinue
    } else {
      $env:CODEX_TASKBOARD_PORT = $previousTaskboardPort
    }
  }

  $port = Get-FreeTcpPort
  $started = Start-CodexPlusTaskboard -Root $taskboardRoot -Port $port -StateRoot $stateRoot
  $startedProcessIds += $started.ProcessId
  $startedOwnerMarkers[[int]$started.ProcessId] = $started.OwnerMarker

  Assert-Equal $started.Available $true "Started taskboard should be available."
  Assert-Equal $started.Healthy $true "Started taskboard should be healthy."
  Assert-True ($null -ne $started.ProcessId -and $started.ProcessId -gt 0) "Started taskboard should record a process ID."
  Assert-Equal $started.Port $port "Started taskboard should use the requested port."

  foreach ($name in @("pid.txt", "root.txt", "port.txt", "url.txt", "node.txt", "owner.txt", "instance-token.txt", "instance-secret.txt")) {
    Assert-True (Test-Path -LiteralPath (Join-Path $stateRoot $name) -PathType Leaf) "Expected state file $name to exist after start."
  }
  Assert-Equal (Get-Content -LiteralPath (Join-Path $stateRoot "node.txt") | Select-Object -First 1) $started.NodePath "State should record the complete Node executable path."
  Assert-Equal (Get-Content -LiteralPath (Join-Path $stateRoot "owner.txt") | Select-Object -First 1) $started.OwnerMarker "State should record the unique owner marker."
  Assert-Equal (Get-Content -LiteralPath (Join-Path $stateRoot "instance-token.txt") | Select-Object -First 1) $started.InstanceToken "State should record the taskboard instance token."
  Assert-Equal (Get-Content -LiteralPath (Join-Path $stateRoot "instance-secret.txt") | Select-Object -First 1) $started.InstanceSecret "State should record the taskboard instance secret."
  Assert-Match $started.EmbedUrl ("*{0}*host=codex*" -f $started.InstanceToken) "Started taskboard should expose a token-scoped embed URL."

  $status = Get-CodexPlusTaskboardStatus -Root $taskboardRoot -Port $port -StateRoot $stateRoot
  Assert-Equal $status.Healthy $true "Status should report a healthy started server."
  Assert-Equal $status.ProcessId $started.ProcessId "Status should report the started process ID."

  Set-Content -LiteralPath (Join-Path $stateRoot "url.txt") -Value "http://127.0.0.1:49999" -Encoding ASCII
  $explicitPortStatus = Get-CodexPlusTaskboardStatus -Root $taskboardRoot -Port $port -StateRoot $stateRoot
  Assert-Equal $explicitPortStatus.Url ("http://127.0.0.1:{0}" -f $port) "Explicit-port status should derive URL from the explicit port."
  Assert-Equal $explicitPortStatus.Healthy $true "Explicit-port status should stay healthy even when url.txt is stale."

  $reused = Start-CodexPlusTaskboard -Root $taskboardRoot -Port $port -StateRoot $stateRoot
  Assert-Equal $reused.ProcessId $started.ProcessId "Second start without Force should reuse the same process."

  $alternatePort = Get-FreeTcpPort
  $differentPortStart = Start-CodexPlusTaskboard -Root $taskboardRoot -Port $alternatePort -StateRoot $stateRoot
  Assert-Equal $differentPortStart.ProcessId $started.ProcessId "Start without Force should not create a second launcher-owned server on another port."
  Assert-Equal $differentPortStart.Port $port "Start without Force should preserve the original recorded port."
  Assert-Match $differentPortStart.Reason ("*already running on port {0}*" -f $port) "Start without Force should explain that another launcher-owned server already exists."
  Assert-True ($null -ne (Get-Process -Id $started.ProcessId -ErrorAction SilentlyContinue)) "Original launcher-owned server should remain alive after a different-port start without Force."
  Assert-Equal (Get-Content -LiteralPath (Join-Path $stateRoot "port.txt") | Select-Object -First 1) ([string]$port) "Different-port start without Force should preserve the existing port state."

  $forcedRestart = Start-CodexPlusTaskboard -Root $taskboardRoot -Port $alternatePort -Force -StateRoot $stateRoot
  $startedProcessIds += $forcedRestart.ProcessId
  $startedOwnerMarkers[[int]$forcedRestart.ProcessId] = $forcedRestart.OwnerMarker
  Assert-True ($null -eq (Get-Process -Id $started.ProcessId -ErrorAction SilentlyContinue)) "Force restart should stop the previous launcher-owned process."
  Assert-Equal $forcedRestart.Port $alternatePort "Force restart should start the requested port."
  Assert-Equal $forcedRestart.Healthy $true "Force restart should produce a healthy launcher-owned server."
  $started = $forcedRestart

  $recordedPort = Get-FreeTcpPort
  Set-Content -LiteralPath (Join-Path $customReuseStateRoot "root.txt") -Value $recordedRoot -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $customReuseStateRoot "port.txt") -Value ([string]$recordedPort) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $customReuseStateRoot "url.txt") -Value "http://127.0.0.1:49999" -Encoding ASCII
  $recordedStart = Start-CodexPlusTaskboard -StateRoot $customReuseStateRoot
  $startedProcessIds += $recordedStart.ProcessId

  Assert-Equal $recordedStart.Root $recordedRoot "Recorded root.txt should win over pointer/default discovery when Root is omitted."
  Assert-Equal $recordedStart.Port $recordedPort "Recorded port.txt should win over default port when Port is omitted."
  Assert-Equal $recordedStart.Url ("http://127.0.0.1:{0}" -f $recordedPort) "Recorded-start URL should stay consistent with the reused port."
  $bindingResponse = Invoke-WebRequest -Uri ($recordedStart.Url.TrimEnd('/') + "/binding") -UseBasicParsing -Method Get -TimeoutSec 2 -ErrorAction Stop
  $binding = $bindingResponse.Content | ConvertFrom-Json
  Assert-Equal $binding.address "127.0.0.1" "Recorded-start server should bind to loopback."
  Assert-Equal ([int]$binding.port) $recordedPort "Recorded-start server should bind to the reused recorded port."
  $recordedStop = Stop-CodexPlusTaskboard -StateRoot $customReuseStateRoot
  Assert-Match $recordedStop.Reason "*was stopped*" "Recorded-start server should stop cleanly from the custom state root."

  $wrongProcessToken = "wrong-process-" + [guid]::NewGuid().ToString("N")
  $wrongProcess = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-Command", ("Start-Sleep -Seconds 60; Write-Output '{0}'" -f $wrongProcessToken)) -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath (Join-Path $stateRoot "pid.txt") -Value ([string]$wrongProcess.Id) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "root.txt") -Value $taskboardRoot -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "port.txt") -Value ([string]$port) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "url.txt") -Value ("http://127.0.0.1:{0}" -f $port) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "node.txt") -Value $started.NodePath -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "owner.txt") -Value $started.OwnerMarker -Encoding ASCII

  $wrongStatus = Get-CodexPlusTaskboardStatus -Root $taskboardRoot -StateRoot $stateRoot
  Assert-True ($null -ne (Get-Process -Id $wrongProcess.Id -ErrorAction SilentlyContinue)) "Status should not terminate a process for a wrong recorded PID."
  Assert-Equal $wrongStatus.ProcessId $null "Status should clear the reported process ID when the recorded process is not launcher-owned."
  Assert-True (Test-Path -LiteralPath (Join-Path $stateRoot "pid.txt") -PathType Leaf) "Status should not delete state files for a wrong recorded PID."

  Stop-TestOwnedProcess -Process $wrongProcess -ExecutablePath ((Get-Command powershell -ErrorAction Stop | Select-Object -First 1).Source) -Entrypoint "Start-Sleep" -OwnerToken $wrongProcessToken
  $wrongProcess = $null

  $nodeCommand = Get-Command node -ErrorAction Stop | Select-Object -First 1
  $fakeNodeToken = "fake-node-" + [guid]::NewGuid().ToString("N")
  $fakeNodeProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @((Join-Path $decoyServerRoot "index.mjs"), ("--codex-plus-taskboard-owner-marker={0}" -f $fakeNodeToken)) -WorkingDirectory $decoyRoot -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath (Join-Path $stateRoot "pid.txt") -Value ([string]$fakeNodeProcess.Id) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "root.txt") -Value $taskboardRoot -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "port.txt") -Value ([string]$started.Port) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "url.txt") -Value ("http://127.0.0.1:{0}" -f $started.Port) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "node.txt") -Value $started.NodePath -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "owner.txt") -Value $started.OwnerMarker -Encoding ASCII

  $fakeNodeStatus = Get-CodexPlusTaskboardStatus -Root $taskboardRoot -StateRoot $stateRoot
  Assert-True ($null -ne (Get-Process -Id $fakeNodeProcess.Id -ErrorAction SilentlyContinue)) "Status should not terminate a fake node process that only mentions server/index.mjs."
  Assert-Equal $fakeNodeStatus.ProcessId $null "Status should not treat a fake node process with only a literal server/index.mjs argument as launcher-owned."

  $fakeNodeStop = Stop-CodexPlusTaskboard -Root $taskboardRoot -StateRoot $stateRoot
  Assert-True ($null -ne (Get-Process -Id $fakeNodeProcess.Id -ErrorAction SilentlyContinue)) "Stop should not terminate a fake node process that only mentions server/index.mjs."
  Assert-True ($fakeNodeStop.Reason -like "*not a launcher-owned taskboard server*") "Stop should reject a fake node process whose command line only contains the text server/index.mjs."
  Stop-TestOwnedProcess -Process $fakeNodeProcess -ExecutablePath $nodeCommand.Source -Entrypoint (Join-Path $decoyServerRoot "index.mjs") -OwnerToken ("--codex-plus-taskboard-owner-marker={0}" -f $fakeNodeToken)
  $fakeNodeProcess = $null

  $fullPathDecoyToken = "full-path-decoy-" + [guid]::NewGuid().ToString("N")
  $previousTaskboardPort = $env:CODEX_TASKBOARD_PORT
  $env:CODEX_TASKBOARD_PORT = [string](Get-FreeTcpPort)
  try {
    $fullPathDecoyProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @((Join-Path $serverRoot "index.mjs"), ("--codex-plus-taskboard-owner-marker={0}" -f $fullPathDecoyToken)) -WorkingDirectory $taskboardRoot -WindowStyle Hidden -PassThru
  } finally {
    if ($null -eq $previousTaskboardPort) {
      Remove-Item Env:CODEX_TASKBOARD_PORT -ErrorAction SilentlyContinue
    } else {
      $env:CODEX_TASKBOARD_PORT = $previousTaskboardPort
    }
  }
  Set-Content -LiteralPath (Join-Path $stateRoot "pid.txt") -Value ([string]$fullPathDecoyProcess.Id) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "root.txt") -Value $taskboardRoot -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "port.txt") -Value ([string]$started.Port) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "url.txt") -Value ("http://127.0.0.1:{0}" -f $started.Port) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "node.txt") -Value $nodeCommand.Source -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "owner.txt") -Value $started.OwnerMarker -Encoding ASCII

  $fullPathDecoyStatus = Get-CodexPlusTaskboardStatus -Root $taskboardRoot -StateRoot $stateRoot
  Assert-True (Test-TestProcessIdentity -ProcessId $fullPathDecoyProcess.Id -ExecutablePath $nodeCommand.Source -Entrypoint (Join-Path $serverRoot "index.mjs") -OwnerToken $fullPathDecoyToken) "Full-path decoy should be a real Node process with the expected entrypoint and its own token."
  Assert-Equal $fullPathDecoyStatus.ProcessId $null "A process with the right Node path and entrypoint but the wrong owner marker must not be owned."
  $fullPathDecoyStop = Stop-CodexPlusTaskboard -Root $taskboardRoot -StateRoot $stateRoot
  Assert-True ($null -ne (Get-Process -Id $fullPathDecoyProcess.Id -ErrorAction SilentlyContinue)) "Stop must not terminate a full-path decoy with a different owner marker."
  Assert-Equal $fullPathDecoyStop.StatePreserved $true "Full-path decoy state must be preserved."
  Stop-TestOwnedProcess -Process $fullPathDecoyProcess -ExecutablePath $nodeCommand.Source -Entrypoint (Join-Path $serverRoot "index.mjs") -OwnerToken ("--codex-plus-taskboard-owner-marker={0}" -f $fullPathDecoyToken)
  $fullPathDecoyProcess = $null

  Set-Content -LiteralPath (Join-Path $stateRoot "pid.txt") -Value ([string]$started.ProcessId) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "root.txt") -Value $taskboardRoot -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "port.txt") -Value ([string]$started.Port) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "url.txt") -Value ("http://127.0.0.1:{0}" -f $started.Port) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "node.txt") -Value $started.NodePath -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "owner.txt") -Value $started.OwnerMarker -Encoding ASCII

  $wrongRoot = Join-Path $tempRoot "taskboard-other-root"
  New-Item -ItemType Directory -Path $wrongRoot -Force | Out-Null
  $wrongRootStop = Stop-CodexPlusTaskboard -Root $wrongRoot -StateRoot $stateRoot
  Assert-Equal $wrongRootStop.StatePreserved $true "Stop with a different root must preserve the live taskboard state."
  Assert-True ($null -ne (Get-Process -Id $started.ProcessId -ErrorAction SilentlyContinue)) "Stop with a different root must not stop the live taskboard process."
  Assert-True (Test-Path -LiteralPath (Join-Path $stateRoot "pid.txt") -PathType Leaf) "Stop with a different root must preserve pid state."

  $stopped = Stop-CodexPlusTaskboard -StateRoot $stateRoot
  Assert-Equal $stopped.Healthy $false "Stopped taskboard should not be healthy."
  Assert-Match $stopped.Reason "*was stopped*" "Stop without Root should stop the recorded custom-root taskboard."
  Assert-True ($null -eq (Get-Process -Id $started.ProcessId -ErrorAction SilentlyContinue)) "Taskboard process should no longer be running after stop."
  foreach ($name in @("pid.txt", "root.txt", "port.txt", "url.txt", "node.txt", "owner.txt", "instance-token.txt", "instance-secret.txt")) {
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stateRoot $name))) "Expected state file $name to be removed after stop."
  }

  $wrongProcessToken = "wrong-stop-process-" + [guid]::NewGuid().ToString("N")
  $wrongProcess = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-Command", ("Start-Sleep -Seconds 60; Write-Output '{0}'" -f $wrongProcessToken)) -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath (Join-Path $stateRoot "pid.txt") -Value ([string]$wrongProcess.Id) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "root.txt") -Value $taskboardRoot -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "port.txt") -Value ([string](Get-FreeTcpPort)) -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $stateRoot "url.txt") -Value "http://127.0.0.1:49999" -Encoding ASCII

  $wrongStop = Stop-CodexPlusTaskboard -Root $taskboardRoot -StateRoot $stateRoot
  Assert-True ($null -ne (Get-Process -Id $wrongProcess.Id -ErrorAction SilentlyContinue)) "Stop should not terminate a process for a wrong recorded PID."
  Assert-True ($wrongStop.Reason -like "*not a launcher-owned taskboard server*") "Wrong PID stop should explain why no stop happened."
  foreach ($name in @("pid.txt", "root.txt", "port.txt", "url.txt")) {
    Assert-True (Test-Path -LiteralPath (Join-Path $stateRoot $name) -PathType Leaf) "Expected state file $name to be preserved after wrong PID stop."
  }

  Write-Host "taskboard-runtime tests passed"
} finally {
  $env:LOCALAPPDATA = $originalLocalAppData

  if ($wrongProcess -and -not $wrongProcess.HasExited) {
    Stop-TestOwnedProcess -Process $wrongProcess -ExecutablePath ((Get-Command powershell -ErrorAction SilentlyContinue | Select-Object -First 1).Source) -Entrypoint "Start-Sleep" -OwnerToken $wrongProcessToken
  }

  if ($fakeNodeProcess -and -not $fakeNodeProcess.HasExited) {
    Stop-TestOwnedProcess -Process $fakeNodeProcess -ExecutablePath ((Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1).Source) -Entrypoint (Join-Path $decoyServerRoot "index.mjs") -OwnerToken ("--codex-plus-taskboard-owner-marker={0}" -f $fakeNodeToken)
  }

  foreach ($startedProcessId in ($startedProcessIds | Where-Object { $_ } | Select-Object -Unique)) {
    $ownerMarker = [string]$startedOwnerMarkers[[int]$startedProcessId]
    $startedProcess = Get-Process -Id $startedProcessId -ErrorAction SilentlyContinue
    if ($startedProcess -and -not [string]::IsNullOrWhiteSpace($ownerMarker)) {
      Stop-TestOwnedProcess -Process $startedProcess -ExecutablePath ((Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1).Source) -Entrypoint (Join-Path $serverRoot "index.mjs") -OwnerToken ("--codex-plus-taskboard-owner-marker={0}" -f $ownerMarker)
    }
  }

  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
