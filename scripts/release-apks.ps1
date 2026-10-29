<#
.SYNOPSIS
  Verifies the signed release APKs and collects them with SHA256SUMS.txt for a GitHub release.

.DESCRIPTION
  Run after `gradlew assembleRelease` with the release key (RELEASING.md). For every APK in
  android/app/build/outputs/apk/release it checks, with the SDK's apksigner and aapt2:
    - APK Signature Scheme v2 and v3 verify;
    - exactly one signer whose certificate SHA-256 is the published Aulos fingerprint;
    - versionName and versionCode match app.config.ts (base + ABI digit, universal = base).
  Then it copies them to dist/<version>/aulos-<version>-<abi>.apk and writes SHA256SUMS.txt in
  the format `sha256sum -c` reads. Prints no secrets; needs no keystore password.

.EXAMPLE
  .\scripts\release-apks.ps1
#>
param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Public SHA-256 fingerprint of the Aulos release certificate (RELEASING.md).
$ExpectedCertificate = 'e4126faaacf8c7a8db989e0d7e87c45050408a99dcf6c15e1094b2581c4edca1'
$AbiDigits = @{ 'armeabi-v7a' = 1; 'arm64-v8a' = 2; 'x86_64' = 3; 'universal' = 0 }

function Get-BuildTool([string]$Name) {
  $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { $env:ANDROID_SDK_ROOT }
  if (-not $sdk) { throw 'Set ANDROID_HOME to the Android SDK.' }
  $dir = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory |
    Sort-Object { [version]($_.Name -replace '[^\d.].*$', '') } -Descending |
    Select-Object -First 1
  $tool = Get-ChildItem $dir.FullName -Filter "$Name*" | Where-Object { $_.Extension -in '.bat', '.exe', '' } |
    Select-Object -First 1
  if (-not $tool) { throw "$Name not found in $($dir.FullName)" }
  return $tool.FullName
}

function Read-ConfigValue([string]$Pattern) {
  $match = Select-String -Path (Join-Path $Root 'app.config.ts') -Pattern $Pattern | Select-Object -First 1
  if (-not $match) { throw "app.config.ts: no match for $Pattern" }
  return $match.Matches[0].Groups[1].Value
}

$version = Read-ConfigValue "^const VERSION = '([^']+)'"
$base = [int](Read-ConfigValue '^const VERSION_CODE_BASE = (\d+)')
$apksigner = Get-BuildTool 'apksigner'
$aapt2 = Get-BuildTool 'aapt2'
$outputs = Join-Path $Root 'android\app\build\outputs\apk\release'
$dist = Join-Path $Root "dist\$version"

$apks = Get-ChildItem $outputs -Filter 'app-*-release.apk'
if ($apks.Count -ne $AbiDigits.Count) {
  throw "Expected $($AbiDigits.Count) signed APKs in $outputs, found $($apks.Count). Build with the release key first."
}

New-Item -ItemType Directory -Force $dist | Out-Null
Get-ChildItem $dist -File | Remove-Item
$sums = @()
foreach ($apk in $apks | Sort-Object Name) {
  $abi = $apk.Name -replace '^app-(.+)-release\.apk$', '$1'
  if (-not $AbiDigits.ContainsKey($abi)) { throw "Unexpected APK $($apk.Name)" }

  $verify = & $apksigner verify --verbose --print-certs $apk.FullName 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) { throw "apksigner rejected $($apk.Name): $verify" }
  foreach ($scheme in 'v2', 'v3') {
    if (-not ($verify -match "Verified using $scheme scheme .*: true")) { throw "$($apk.Name): not signed with $scheme" }
  }
  if (-not ($verify -match '^Number of signers: 1$')) { throw "$($apk.Name): expected exactly one signer" }
  $digests = @($verify -match 'certificate SHA-256 digest:' | ForEach-Object { ($_ -split ':\s*')[-1].Trim() } |
    Sort-Object -Unique)
  if ($digests.Count -ne 1) { throw "$($apk.Name): signing schemes disagree on the certificate" }
  $digest = $digests[0]
  if ($digest -ne $ExpectedCertificate) { throw "$($apk.Name): certificate $digest is not the Aulos release certificate" }

  $badging = (& $aapt2 dump badging $apk.FullName 2>&1 | Select-Object -First 1) -join ''
  $expectedCode = $base + $AbiDigits[$abi]
  if ($badging -notmatch "versionCode='$expectedCode'" -or $badging -notmatch "versionName='$([regex]::Escape($version))'") {
    throw "$($apk.Name): expected versionCode $expectedCode and versionName $version, got: $badging"
  }

  $name = "aulos-$version-$abi.apk"
  Copy-Item $apk.FullName (Join-Path $dist $name)
  $hash = (Get-FileHash (Join-Path $dist $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  $sums += "$hash  $name"
  Write-Host ('{0,-36} {1,12:N0} bytes  versionCode {2}  v2+v3 OK' -f $name, $apk.Length, $expectedCode)
}

# LF line endings, as sha256sum writes them.
[IO.File]::WriteAllText((Join-Path $dist 'SHA256SUMS.txt'), (($sums -join "`n") + "`n"))
Write-Host "Wrote $dist\SHA256SUMS.txt"
