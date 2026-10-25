<#
.SYNOPSIS
  Generates Aulos test music with ffmpeg, pushes it to a device and rescans MediaStore.

.DESCRIPTION
  standard  Greek album (Μάνος Χατζιδάκις, titles with tonos, cover art), a 3-track gapless FLAC
            album cut from one continuous tone at sample boundaries, a two-disc album with
            accented Latin tags and a year, a 4-track album with featured artists and no
            album artist tag, a 4-track album whose featured artists are in per-track album
            artist tags, and two 2-track "Greatest Hits" albums in one folder (22 tracks).
  bulk      standard plus 2,000 short tracks (200 albums of 10) for the performance run.
  clean     Removes /sdcard/Music/AulosTest (and the Nuclear playlist fixture) from the device
            and rescans.

  Files are generated under $env:TEMP\Aulos\test-media and pushed to /sdcard/Music/AulosTest.
  test/fixtures/nuclear/nuclear-mix.nuclear-playlist.json goes to /sdcard/Download/ for the
  Nuclear import flow.
  Needs ffmpeg and adb on PATH; installs nothing.

.EXAMPLE
  .\scripts\test-media.ps1 -Mode standard
  .\scripts\test-media.ps1 -Mode bulk -Serial <device-serial>
  .\scripts\test-media.ps1 -Mode clean
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('standard', 'bulk', 'clean')]
  [string]$Mode,
  [string]$Serial,
  [string]$OutDir = (Join-Path $env:TEMP 'Aulos\test-media')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$DeviceDir = '/sdcard/Music/AulosTest'
$SampleRate = 44100
$BulkAlbums = 200
$BulkTracksPerAlbum = 10

function Assert-Tool([string]$Name, [string]$Install) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Host "$Name was not found on PATH." -ForegroundColor Red
    Write-Host $Install
    exit 1
  }
}

$adbTarget = @()
if ($Serial) { $adbTarget = @('-s', $Serial) }

function Invoke-Adb {
  # adb reports progress on stderr; Windows PowerShell would turn that into a terminating error.
  $ErrorActionPreference = 'Continue'
  $output = & adb @adbTarget @args 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) { throw "adb $($args -join ' ') failed: $output" }
  return $output
}

# adb shell hands its arguments to the device shell as one line, so an argument with spaces or
# quotes must arrive backslash-escaped to stay one word there.
function ConvertTo-DeviceWord([string]$Text) {
  return $Text -replace '([\\ ''"()&;<>|*?$`])', '\$1'
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding $false))
}

# Options with a colon (-c:a) must be passed quoted: PowerShell reads '-name:value' as a parameter.
function Invoke-Ffmpeg {
  & ffmpeg -hide_banner -loglevel error -y @args
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg $($args -join ' ') failed" }
}

# FFMETADATA files keep non-ASCII tags out of the command line (Windows code pages).
function New-MetadataFile([string]$Path, [hashtable]$Tags) {
  $lines = @(';FFMETADATA1')
  foreach ($key in $Tags.Keys) {
    $value = ([string]$Tags[$key]) -replace '([=;#\\])', '\$1'
    $lines += "$key=$value"
  }
  Write-Utf8NoBom $Path (($lines -join "`n") + "`n")
}

function New-Cover([string]$Path, [string]$Color) {
  Invoke-Ffmpeg -f lavfi -i "color=c=$($Color):s=600x600" '-frames:v' 1 $Path
}

function New-Mp3([string]$Path, [double]$Frequency, [double]$Seconds, [hashtable]$Tags, [string]$Cover) {
  $meta = "$Path.meta.txt"
  New-MetadataFile $meta $Tags
  $tone = "sine=frequency=$($Frequency):sample_rate=$($SampleRate):duration=$Seconds"
  if ($Cover) {
    Invoke-Ffmpeg -f lavfi -i $tone -i $meta -i $Cover -map 0:a -map 2:v -map_metadata 1 `
      '-c:a' libmp3lame '-b:a' 96k '-c:v' copy '-disposition:v' attached_pic `
      '-metadata:s:v' 'comment=Cover (front)' -id3v2_version 3 $Path
  } else {
    Invoke-Ffmpeg -f lavfi -i $tone -i $meta -map 0:a -map_metadata 1 `
      '-c:a' libmp3lame '-b:a' 96k -id3v2_version 3 $Path
  }
  Remove-Item $meta
}

function New-StandardSet([string]$Root) {
  $greek = Join-Path $Root 'Hadjidakis'
  $gapless = Join-Path $Root 'Gapless'
  $latin = Join-Path $Root 'Accents'
  $featuring = Join-Path $Root 'Featuring'
  $guests = Join-Path $Root 'Guests'
  $flat = Join-Path $Root 'Flat'
  New-Item -ItemType Directory -Force -Path $greek, $gapless, $latin, $featuring, $guests, $flat | Out-Null

  # Greek album: tonos, dialytika and final sigma in the tags; cover art for the artwork path.
  $cover = Join-Path $Root 'cover-greek.png'
  New-Cover $cover '0x1F6FEB'
  $greekTitles = @('Τα Παιδιά του Πειραιά', 'Χάρτινο το Φεγγαράκι', 'Ο Ταχυδρόμος Πέθανε', 'Κάποτε θα ''ρθουν')
  for ($i = 0; $i -lt $greekTitles.Count; $i++) {
    New-Mp3 (Join-Path $greek ('{0:D2}.mp3' -f ($i + 1))) (330 + 55 * $i) (2 + $i) @{
      title        = $greekTitles[$i]
      artist       = 'Μάνος Χατζιδάκις'
      album_artist = 'Μάνος Χατζιδάκις'
      album        = 'Ο Μεγάλος Ερωτικός'
      track        = "$($i + 1)/$($greekTitles.Count)"
      date         = '1972'
    } $cover
  }

  # Gapless album: one continuous 9 s tone cut into three FLAC files at exact sample boundaries.
  # A gap or click between tracks is audible as a break in the tone.
  $wave = Join-Path $Root 'gapless.wav'
  Invoke-Ffmpeg -f lavfi -i "sine=frequency=330:sample_rate=$($SampleRate):duration=9" '-c:a' pcm_s16le $wave
  $part = 3 * $SampleRate
  for ($i = 0; $i -lt 3; $i++) {
    $file = Join-Path $gapless ('{0:D2}.flac' -f ($i + 1))
    $meta = "$file.meta.txt"
    New-MetadataFile $meta @{
      title        = "Gapless part $($i + 1)"
      artist       = 'Aulos Test'
      album_artist = 'Aulos Test'
      album        = 'Gapless Test'
      track        = "$($i + 1)/3"
      date         = '2026'
    }
    Invoke-Ffmpeg -i $wave -i $meta -map 0:a -map_metadata 1 `
      -af "atrim=start_sample=$($i * $part):end_sample=$(($i + 1) * $part),asetpts=N/SR/TB" `
      '-c:a' flac $file
    Remove-Item $meta
  }
  Remove-Item $wave

  # Two-disc album with accented Latin tags: disc/track order and accent-insensitive search.
  $latinCover = Join-Path $Root 'cover-latin.png'
  New-Cover $latinCover '0xC62828'
  $discTracks = @(
    @{ disc = 1; track = 1; title = 'Café del Mar' },
    @{ disc = 1; track = 2; title = 'Señorita' },
    @{ disc = 2; track = 1; title = 'Über Alles' }
  )
  $n = 0
  foreach ($t in $discTracks) {
    $n++
    New-Mp3 (Join-Path $latin ('{0}-{1:D2}.mp3' -f $t.disc, $t.track)) (440 + 40 * $n) (2 + $n) @{
      title        = $t.title
      artist       = 'Mötley Beyoncé'
      album_artist = 'Mötley Beyoncé'
      album        = 'Dïsc Çollection'
      track        = "$($t.track)"
      disc         = "$($t.disc)/2"
      date         = '1999'
    } $latinCover
  }
  Remove-Item $cover, $latinCover

  # Album with featured artists and no album artist tag: must stay one album in the library,
  # shown under the artist of half of its tracks.
  $featured = @('Aulos Crew', 'Aulos Crew feat. Δέλτα', 'Aulos Crew', 'Aulos Crew feat. Echo')
  for ($i = 0; $i -lt $featured.Count; $i++) {
    New-Mp3 (Join-Path $featuring ('{0:D2}.mp3' -f ($i + 1))) (523 + 20 * $i) 2 @{
      title  = "Feature Track $($i + 1)"
      artist = $featured[$i]
      album  = 'Featuring Tape'
      track  = "$($i + 1)/$($featured.Count)"
      date   = '2026'
    }
  }

  # Featured artists written into a per-track album artist tag, as some downloaders do: one
  # folder, track numbers 1-4 without repeats, so it must still show as one album.
  $guestArtists = @('Aulos Host', 'Aulos Host, Δέλτα', 'Aulos Host', 'Aulos Host, Echo')
  for ($i = 0; $i -lt $guestArtists.Count; $i++) {
    New-Mp3 (Join-Path $guests ('{0:D2}.mp3' -f ($i + 1))) (587 + 20 * $i) 2 @{
      title        = "Guest Track $($i + 1)"
      artist       = $guestArtists[$i]
      album_artist = $guestArtists[$i]
      album        = 'Guest List'
      track        = "$($i + 1)/$($guestArtists.Count)"
      date         = '2026'
    }
  }

  # Two different albums named "Greatest Hits" side by side in one flat folder: both have a
  # track 1 and a track 2, so they must stay two albums.
  foreach ($hitsArtist in @('Aulos Red', 'Aulos Blue')) {
    for ($t = 1; $t -le 2; $t++) {
      New-Mp3 (Join-Path $flat ('{0}-{1:D2}.mp3' -f $hitsArtist.Split(' ')[1].ToLower(), $t)) (659 + 20 * $t) 2 @{
        title        = "$hitsArtist Hit $t"
        artist       = $hitsArtist
        album_artist = $hitsArtist
        album        = 'Greatest Hits'
        track        = "$t/2"
        date         = '2026'
      }
    }
  }
}

function New-BulkSet([string]$Root) {
  $bulk = Join-Path $Root 'Bulk'
  New-Item -ItemType Directory -Force -Path $bulk | Out-Null
  # Ten 1 s base tones; each bulk track is a tag-only copy of one of them (fast, no re-encode).
  $bases = @()
  for ($b = 0; $b -lt 10; $b++) {
    $base = Join-Path $Root "base-$b.mp3"
    Invoke-Ffmpeg -f lavfi -i "sine=frequency=$(300 + 30 * $b):sample_rate=$($SampleRate):duration=1" `
      '-c:a' libmp3lame '-b:a' 64k $base
    $bases += $base
  }
  $total = $BulkAlbums * $BulkTracksPerAlbum
  $done = 0
  for ($a = 1; $a -le $BulkAlbums; $a++) {
    $dir = Join-Path $bulk ('Album{0:D3}' -f $a)
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    for ($t = 1; $t -le $BulkTracksPerAlbum; $t++) {
      $file = Join-Path $dir ('{0:D2}.mp3' -f $t)
      $meta = "$file.meta.txt"
      New-MetadataFile $meta @{
        title  = 'Bulk Track {0:D4}' -f $done
        artist = 'Bulk Artist {0:D2}' -f ($a % 50)
        album  = 'Bulk Album {0:D3}' -f $a
        track  = "$t/$BulkTracksPerAlbum"
        date   = "$(1970 + $a % 50)"
      }
      Invoke-Ffmpeg -i $bases[$done % 10] -i $meta -map 0:a -map_metadata 1 -c copy -id3v2_version 3 $file
      Remove-Item $meta
      $done++
      if ($done % 200 -eq 0) { Write-Host "  bulk: $done / $total" }
    }
  }
  Remove-Item $bases
}

function Get-DeviceSdk {
  return [int]((Invoke-Adb shell getprop ro.build.version.sdk) | Select-Object -First 1).Trim()
}

# API 30+ rescans the whole external volume (adds new files, drops deleted ones) in one call.
# Older releases get a scan broadcast per file and a direct delete of rows under AulosTest.
function Invoke-MediaRescan([string[]]$PushedFiles) {
  if ((Get-DeviceSdk) -ge 30) {
    Invoke-Adb shell content call --uri content://media --method scan_volume --arg external_primary | Out-Null
    return
  }
  Invoke-Adb shell content delete --uri content://media/external/audio/media `
    --where (ConvertTo-DeviceWord "_data LIKE '/storage/emulated/0/Music/AulosTest/%'") | Out-Null
  foreach ($file in $PushedFiles) {
    Invoke-Adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://$file" | Out-Null
  }
}

function Get-TestTrackCount {
  $rows = Invoke-Adb shell content query --uri content://media/external/audio/media --projection _id `
    --where (ConvertTo-DeviceWord "is_music!=0 AND _data LIKE '%/Music/AulosTest/%'")
  return @($rows | Where-Object { $_ -match '^Row:' }).Count
}

function Get-MusicCount {
  $rows = Invoke-Adb shell content query --uri content://media/external/audio/media --projection _id `
    --where 'is_music!=0'
  return @($rows | Where-Object { $_ -match '^Row:' }).Count
}

Assert-Tool 'adb' 'Install the Android SDK platform-tools and add them to PATH.'
if ($Mode -ne 'clean') {
  Assert-Tool 'ffmpeg' @'
Install ffmpeg for the current user (no admin rights needed), then open a new shell:
  winget install --id Gyan.FFmpeg -e --scope user
or download a static build from https://www.gyan.dev/ffmpeg/builds/ and add its bin folder to PATH.
'@
}

# Nuclear playlist export for m3-import-nuclear: its items match the standard set.
$NuclearFixture = Join-Path (Split-Path -Parent $PSScriptRoot) 'test\fixtures\nuclear\nuclear-mix.nuclear-playlist.json'
$NuclearFixtureOnDevice = '/sdcard/Download/nuclear-mix.nuclear-playlist.json'

if ($Mode -eq 'clean') {
  Invoke-Adb shell rm -rf $DeviceDir | Out-Null
  Invoke-Adb shell rm -f $NuclearFixtureOnDevice | Out-Null
  Invoke-MediaRescan @()
  Write-Host "Removed $DeviceDir; AulosTest tracks left in MediaStore: $(Get-TestTrackCount)"
  Write-Host "Music tracks on the device: $(Get-MusicCount)"
  exit 0
}

$root = Join-Path $OutDir 'AulosTest'
if (Test-Path $root) { Remove-Item -Recurse -Force $root }
New-Item -ItemType Directory -Force -Path $root | Out-Null

Write-Host 'Generating the standard set…'
New-StandardSet $root
if ($Mode -eq 'bulk') {
  Write-Host "Generating $($BulkAlbums * $BulkTracksPerAlbum) bulk tracks…"
  New-BulkSet $root
}

$files = Get-ChildItem -Recurse -File $root
Write-Host "Pushing $($files.Count) files to $DeviceDir…"
Invoke-Adb shell rm -rf $DeviceDir | Out-Null
Invoke-Adb shell mkdir -p '/sdcard/Music' | Out-Null
Invoke-Adb push $root '/sdcard/Music/' | Out-Null

$deviceFiles = $files | ForEach-Object {
  '/sdcard/Music/AulosTest/' + $_.FullName.Substring($root.Length + 1).Replace('\', '/')
}
Invoke-Adb push $NuclearFixture $NuclearFixtureOnDevice | Out-Null
Invoke-MediaRescan ($deviceFiles + $NuclearFixtureOnDevice)
Write-Host "AulosTest tracks in MediaStore: $(Get-TestTrackCount) (generated $($files.Count))"
Write-Host "Music tracks on the device: $(Get-MusicCount)"
