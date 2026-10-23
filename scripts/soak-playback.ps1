<#
.SYNOPSIS
  Screen-off playback soak: Aulos must keep playing for an hour with the screen off.

.DESCRIPTION
  Starts playback of every song with repeat all (scripts/soak-start.yaml through Maestro), turns
  the screen off and reads the app's media session from `dumpsys media_session` every interval.
  Fails as soon as the session is not PLAYING or its position stopped advancing (neither the
  extrapolated position nor the track changed since the previous sample). Pauses playback and
  wakes the screen at the end.

  Needs adb and maestro on PATH, the release APK installed and music on the device. Take the
  shared-device lock first (see the project CLAUDE.md).

.EXAMPLE
  .\scripts\soak-playback.ps1 -Serial <device-serial>
  .\scripts\soak-playback.ps1 -Minutes 10 -IntervalSeconds 60
#>
param(
  [string]$Serial,
  [int]$Minutes = 60,
  [int]$IntervalSeconds = 300,
  [string]$Package = 'com.anywecon.aulos'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$adbTarget = @()
if ($Serial) { $adbTarget = @('-s', $Serial) }

function Invoke-Adb {
  $ErrorActionPreference = 'Continue'
  $output = & adb @adbTarget @args 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) { throw "adb $($args -join ' ') failed: $output" }
  return $output
}

# PlaybackState of the package's session: state number, position, update time (elapsedRealtime)
# and the metadata description (title, artist, album).
function Get-SessionSample {
  $lines = @(Invoke-Adb shell dumpsys media_session)
  $uptime = [double](((Invoke-Adb shell cat /proc/uptime) | Select-Object -First 1).Split(' ')[0])
  $inPackage = $false
  $sample = $null
  foreach ($line in $lines) {
    if ($line -match '^\s*package=(\S+)') { $inPackage = ($Matches[1] -eq $Package); continue }
    if (-not $inPackage) { continue }
    if ($line -match 'state=PlaybackState \{state=(?:[A-Z_]+\()?(\d+)\)?, position=(-?\d+).*?speed=([\d.]+), updated=(\d+)') {
      $sample = [ordered]@{
        State       = [int]$Matches[1]
        PositionMs  = [long]$Matches[2]
        Speed       = [double]$Matches[3]
        UpdatedMs   = [long]$Matches[4]
        Description = ''
      }
    } elseif ($sample -and $line -match 'metadata:.*description=(.*)$') {
      $sample.Description = $Matches[1].Trim()
      break
    }
  }
  if (-not $sample) { return $null }
  $nowMs = [long]($uptime * 1000)
  $sample.EffectiveMs = if ($sample.State -eq 3) {
    $sample.PositionMs + [long](($nowMs - $sample.UpdatedMs) * $sample.Speed)
  } else { $sample.PositionMs }
  return [pscustomobject]$sample
}

$PLAYING = 3
$root = Split-Path -Parent $PSScriptRoot
$startFlow = Join-Path $root 'scripts\soak-start.yaml'
$maestroTarget = @()
if ($Serial) { $maestroTarget = @('--device', $Serial) }

Write-Host 'Starting playback of all songs with repeat all…'
& maestro @maestroTarget test $startFlow
if ($LASTEXITCODE -ne 0) { throw 'soak-start.yaml failed' }

Invoke-Adb shell input keyevent KEYCODE_SLEEP | Out-Null
Start-Sleep -Seconds 5
$started = Get-Date
$samples = [System.Collections.Generic.List[object]]::new()
$failure = $null
$previous = $null

try {
  while ($true) {
    $sample = Get-SessionSample
    $elapsed = [int]((Get-Date) - $started).TotalMinutes
    if (-not $sample) {
      $failure = "minute $($elapsed): no media session for $Package"
      break
    }
    $samples.Add([pscustomobject]@{
        Minute      = $elapsed
        State       = $sample.State
        PositionS   = [math]::Round($sample.EffectiveMs / 1000, 1)
        Track       = $sample.Description
      })
    Write-Host ("min {0,3}  state={1}  position={2,8:N1}s  {3}" -f $elapsed, $sample.State, ($sample.EffectiveMs / 1000), $sample.Description)
    if ($sample.State -ne $PLAYING) {
      $failure = "minute $($elapsed): state $($sample.State), expected PLAYING ($PLAYING)"
      break
    }
    if ($previous -and $sample.Description -eq $previous.Description -and $sample.EffectiveMs -le $previous.EffectiveMs) {
      $failure = "minute $($elapsed): position stopped advancing at $($sample.EffectiveMs) ms"
      break
    }
    $previous = $sample
    if (((Get-Date) - $started).TotalSeconds -ge $Minutes * 60) { break }
    Start-Sleep -Seconds $IntervalSeconds
  }
} finally {
  Invoke-Adb shell input keyevent KEYCODE_MEDIA_PAUSE | Out-Null
  Invoke-Adb shell input keyevent KEYCODE_WAKEUP | Out-Null
}

$samples | Format-Table -AutoSize | Out-String | Write-Host
if ($failure) {
  Write-Host "SOAK FAILED: $failure" -ForegroundColor Red
  exit 1
}
Write-Host "SOAK PASSED: playing with the screen off for $Minutes min ($($samples.Count) samples)" -ForegroundColor Green
