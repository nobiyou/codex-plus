#Requires -Version 5.1

Set-StrictMode -Version Latest

Describe "Codex portable process launch" {
  BeforeAll {
    $modulePath = Join-Path $PSScriptRoot "..\official-codex.psm1"
    Import-Module $modulePath -Force
  }

  It "uses the bundled CLI without leaking the registered-core override" {
    $root = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-portable-test-" + [guid]::NewGuid().ToString("N"))
    $appPath = Join-Path $root "ChatGPT.exe"
    $cliPath = Join-Path $root "resources\codex.exe"
    $reportPath = Join-Path $root "environment.txt"
    $previousRegisteredCore = $env:CODEX_WINDOWS_REGISTERED_CORE
    $previousCli = $env:CODEX_CLI_PATH

    try {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $cliPath) | Out-Null
      Copy-Item -LiteralPath $env:ComSpec -Destination $appPath
      Set-Content -LiteralPath $cliPath -Value "fixture" -NoNewline
      $env:CODEX_WINDOWS_REGISTERED_CORE = "1"
      Remove-Item Env:CODEX_CLI_PATH -ErrorAction SilentlyContinue

      $start = Start-CodexPlusOfficialProcess -Path $appPath -ArgumentLine ("/d /c echo %CODEX_CLI_PATH% > `"{0}`"" -f $reportPath)
      $start.Process.WaitForExit()

      $start.CliPath | Should Be $cliPath
      $start.WorkingDirectory | Should Be $root
      (Get-Content -LiteralPath $reportPath -Raw).Trim() | Should Be $cliPath

      $registeredReportPath = Join-Path $root "registered-core.txt"
      $registeredStart = Start-CodexPlusOfficialProcess -Path $appPath -ArgumentLine ("/d /c if defined CODEX_WINDOWS_REGISTERED_CORE (echo registered) else (echo unregistered) > `"{0}`"" -f $registeredReportPath)
      $registeredStart.Process.WaitForExit()
      (Get-Content -LiteralPath $registeredReportPath -Raw).Trim() | Should Be "unregistered"
    } finally {
      if ($null -eq $previousRegisteredCore) {
        Remove-Item Env:CODEX_WINDOWS_REGISTERED_CORE -ErrorAction SilentlyContinue
      } else {
        $env:CODEX_WINDOWS_REGISTERED_CORE = $previousRegisteredCore
      }
      if ($null -eq $previousCli) {
        Remove-Item Env:CODEX_CLI_PATH -ErrorAction SilentlyContinue
      } else {
        $env:CODEX_CLI_PATH = $previousCli
      }
      if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force
      }
    }
  }

  It "keeps an explicit user CLI override" {
    $root = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-portable-test-" + [guid]::NewGuid().ToString("N"))
    $appPath = Join-Path $root "ChatGPT.exe"
    $cliPath = Join-Path $root "resources\codex.exe"
    $reportPath = Join-Path $root "environment.txt"
    $previousCli = $env:CODEX_CLI_PATH

    try {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $cliPath) | Out-Null
      Copy-Item -LiteralPath $env:ComSpec -Destination $appPath
      Set-Content -LiteralPath $cliPath -Value "fixture" -NoNewline
      $env:CODEX_CLI_PATH = "explicit-cli"

      $start = Start-CodexPlusOfficialProcess -Path $appPath -ArgumentLine ("/d /c set CODEX_CLI_PATH > `"{0}`"" -f $reportPath)
      $start.Process.WaitForExit()

      $start.CliPath | Should Be $null
      (Get-Content -LiteralPath $reportPath -Raw).Trim() | Should Be "CODEX_CLI_PATH=explicit-cli"
    } finally {
      if ($null -eq $previousCli) {
        Remove-Item Env:CODEX_CLI_PATH -ErrorAction SilentlyContinue
      } else {
        $env:CODEX_CLI_PATH = $previousCli
      }
      if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force
      }
    }
  }
}
