<#
.SYNOPSIS
  Fails when tracked text holds personal data: Tailscale addresses or values from the local
  deny-list.

.DESCRIPTION
  Two checks over every tracked text file (git grep, so untracked and ignored files are skipped):
  - Tailscale range: any IPv4 address in 100.64.0.0/10 outside src/**/__tests__/ (where the
    network guard tests need the range edges). The documentation examples 100.64.0.0 (the
    range itself), 100.64.0.10 and 100.64.0.11 are allowed.
  - Deny-list: every line of .privacy-denylist at the repository root (gitignored, never
    committed) is a literal value - a real IP, device serial, hostname, or a name from the
    owner's music library - matched as a whole word, ignoring case. Blank lines and lines
    starting with # are skipped. Without the file (CI) this check is skipped with a notice.
  Exits 1 with file:line for every hit, 0 when clean. Works in Windows PowerShell 5.1 and pwsh.

.EXAMPLE
  .\scripts\check-privacy.ps1
#>
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$denyList = Join-Path $root '.privacy-denylist'
$allowedTailscale = @('100.64.0.0', '100.64.0.10', '100.64.0.11')
# 100.64.0.0/10 is 100.64.0.0 - 100.127.255.255; not part of a longer dotted number.
$tailscale = '(?<![\d.])100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}(?!\.?\d)'

function Invoke-GitGrep([string[]]$Arguments) {
  # Exit code 1 means no match; anything above is a real error.
  $output = & git -C $root grep -n -I @Arguments 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -gt 1) { throw "git grep failed: $output" }
  return @($output | Where-Object { $_ })
}

$failures = @()

$candidates = Invoke-GitGrep @('-E', '100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]', '--', '.',
  ':(exclude,glob)src/**/__tests__/**')
foreach ($line in $candidates) {
  $hits = [regex]::Matches($line, $tailscale) | ForEach-Object { $_.Value } |
    Where-Object { $allowedTailscale -notcontains $_ -and -not (($_ -split '\.') | Where-Object { [int]$_ -gt 255 }) }
  if ($hits) { $failures += "Tailscale address: $line" }
}

if (Test-Path $denyList) {
  $values = @(Get-Content -Encoding UTF8 $denyList | ForEach-Object { $_.Trim() } |
      Where-Object { $_ -and -not $_.StartsWith('#') })
  if ($values.Count -gt 0) {
    $patterns = [System.IO.Path]::GetTempFileName()
    try {
      [System.IO.File]::WriteAllLines($patterns, [string[]]$values, (New-Object System.Text.UTF8Encoding $false))
      foreach ($line in (Invoke-GitGrep @('-F', '-w', '-i', '-f', $patterns))) {
        $failures += "Deny-listed value: $line"
      }
    } finally {
      Remove-Item $patterns
    }
  }
  Write-Host "Deny-list: $($values.Count) values checked."
} else {
  Write-Host 'Deny-list: .privacy-denylist not found, check skipped (expected in CI).'
}

if ($failures.Count -gt 0) {
  Write-Host "Personal data found in tracked files ($($failures.Count)):" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  $_" }
  Write-Host 'Replace real values with neutral ones (CLAUDE.md, Privacy).'
  exit 1
}
Write-Host 'Privacy check passed: no Tailscale addresses or deny-listed values in tracked text.'
exit 0
