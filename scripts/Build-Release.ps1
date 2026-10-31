#Requires -Version 5.1
<#
.SYNOPSIS
  Builds, signs, verifies and collects an Aulos release. Owner-only: run it yourself in a
  PowerShell window.

.DESCRIPTION
  1. Gate: npm ci, typecheck, lint, unit tests and scripts/check-privacy.ps1.
  2. npm run android:prebuild (regenerates android/).
  3. Prompts for the keystore and key passwords (Tools/Signing.psm1) and runs
     `gradlew --no-daemon lint assembleRelease` with them as the process-scoped environment
     variables AULOS_STORE_PASSWORD and AULOS_KEY_PASSWORD. They are removed when Gradle exits;
     nothing is written to disk. Press Enter at the key prompt to reuse the keystore password
     (PKCS12).
  4. scripts/release-apks.ps1: signature, certificate and versionCode checks, then
     dist/<version>/ with SHA256SUMS.txt.

  The keystore path and key alias are not secret. Gradle reads AULOS_STORE_FILE and
  AULOS_KEY_ALIAS from a Gradle property or the environment; when neither environment variable
  is set, this script sets them for the run to the keystore location of RELEASING.md.

  Agents and CI cannot run it: the signing prompts refuse non-interactive sessions.

.PARAMETER TlsProxy
  Behind a TLS-intercepting proxy: sets NODE_TLS_REJECT_UNAUTHORIZED=0 for the Expo CLI and
  GRADLE_OPTS=-Djavax.net.ssl.trustStoreType=Windows-ROOT for Gradle, for this run only.

.EXAMPLE
  .\scripts\Build-Release.ps1

.EXAMPLE
  .\scripts\Build-Release.ps1 -TlsProxy
#>
param(
  [switch]$TlsProxy
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DefaultStoreFile = Join-Path $env:USERPROFILE '.keystores\aulos\aulos-release.jks'
$DefaultKeyAlias = 'aulos'

# Fail before the long gate, not at the password prompt; Use-SigningSecrets checks again.
if (-not [Environment]::UserInteractive -or [Console]::IsInputRedirected -or $env:CLAUDECODE -or $env:CI) {
  throw 'Release signing is owner-only: run this script yourself in a PowerShell window.'
}

Import-Module (Join-Path $root 'Tools\Signing.psm1') -Force

function Invoke-Step([string]$Name, [scriptblock]$Command) {
  Write-Host "==> $Name" -ForegroundColor Cyan
  $global:LASTEXITCODE = 0
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}

# Non-secret variables this run sets, restored to their previous values at the end.
$runEnv = [ordered]@{}
if (-not $env:AULOS_STORE_FILE -and (Test-Path -LiteralPath $DefaultStoreFile)) {
  $runEnv['AULOS_STORE_FILE'] = $DefaultStoreFile
}
if (-not $env:AULOS_KEY_ALIAS) { $runEnv['AULOS_KEY_ALIAS'] = $DefaultKeyAlias }
if ($TlsProxy) {
  $runEnv['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
  $runEnv['GRADLE_OPTS'] = '-Djavax.net.ssl.trustStoreType=Windows-ROOT'
}
$previousEnv = @{}
foreach ($name in $runEnv.Keys) {
  $previousEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  [Environment]::SetEnvironmentVariable($name, $runEnv[$name], 'Process')
}

Push-Location $root
try {
  Invoke-Step 'npm ci' { npm.cmd ci }
  Invoke-Step 'typecheck' { npm.cmd run typecheck }
  Invoke-Step 'lint' { npm.cmd run lint }
  Invoke-Step 'unit tests' { npm.cmd test -- --ci }
  Invoke-Step 'privacy check' { & (Join-Path $root 'scripts\check-privacy.ps1') }
  Invoke-Step 'prebuild' { npm.cmd run android:prebuild }

  Push-Location (Join-Path $root 'android')
  try {
    Use-SigningSecrets -Map ([ordered]@{
        AULOS_STORE_PASSWORD = 'Aulos keystore password'
        AULOS_KEY_PASSWORD   = 'Aulos key password (Enter = same as keystore)'
      }) -ScriptBlock {
      # No process may outlive the build with the passwords in its environment: --no-daemon
      # for Gradle, and one short-lived compiler process per Kotlin compilation instead of a
      # Kotlin daemon (in-process compilation runs out of Metaspace). Without the configuration
      # cache the signing values are never serialized to disk.
      Invoke-Step 'gradlew lint assembleRelease' {
        .\gradlew.bat --no-daemon --no-configuration-cache '-Pkotlin.compiler.execution.strategy=out-of-process' lint assembleRelease
      }
    }
  }
  finally {
    Pop-Location
  }

  Invoke-Step 'verify and collect APKs' { & (Join-Path $root 'scripts\release-apks.ps1') -Root $root }
}
finally {
  Pop-Location
  foreach ($name in $previousEnv.Keys) {
    # [NullString]::Value removes the variable; $null would be passed as "" (see Signing.psm1).
    if ($null -eq $previousEnv[$name]) {
      [Environment]::SetEnvironmentVariable($name, [NullString]::Value, 'Process')
    }
    else {
      [Environment]::SetEnvironmentVariable($name, $previousEnv[$name], 'Process')
    }
  }
}
