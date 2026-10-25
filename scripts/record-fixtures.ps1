<#
.SYNOPSIS
  Records real Internet Archive responses into test/fixtures/archive/ for the provider tests.

.DESCRIPTION
  Jest never touches the network: src/providers/__tests__ run the Internet Archive provider
  against these files. Run this once when the provider needs new or refreshed responses, review
  the diff and commit the files.

  The search request is built exactly like src/providers/archive/api.ts builds it (same query
  syntax, fields, rows and page), so a recorded search is what the app would have received.

  Recorded:
    search-<query>.json          advancedsearch.php for each query in $Searches
    metadata-<identifier>.json   the metadata API for each identifier in $Items, including one
                                 that does not exist (the API answers with an empty object)

.EXAMPLE
  .\scripts\record-fixtures.ps1
#>
param(
  [string]$OutDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'test\fixtures\archive')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$UserAgent = 'Aulos/0.1.0 (+https://github.com/Fiouri/aulos; fixture recorder)'
$SearchRows = 20
$SearchFields = @('identifier', 'title', 'creator', 'year', 'licenseurl')

# query => fixture slug
$Searches = [ordered]@{
  'tsitsanis' = 'tsitsanis'
  'cosmic voyager exalot' = 'cosmic-voyager-exalot'
}

$Items = @(
  # Great 78 transfer: WAV original with FLAC, VBR MP3 and Ogg derivatives, plus a spectrogram.
  'IGeorgakopoulouBTsitsanisIGerakinaCa1940',
  # Netlabel album: tagged MP3 originals (title, track, album, artist), Ogg derivatives, CC BY-SA.
  'exalot-cosmic-voyager',
  # No playable audio: a RAR archive labelled "Flac", images and metadata only.
  'baltsa-from-greece',
  # The other top results of the "tsitsanis" search (expanded into tracks by the provider).
  'lph333',
  'EKTAKTH1882013TSITSANISXIOTISZAMPETAS',
  # Does not exist.
  'aulos-fixture-missing-item'
)

# Lucene special characters are escaped so a user query is always taken literally.
function ConvertTo-LuceneTerm([string]$Word) {
  return ($Word -replace '([+\-!(){}\[\]^"~*?:\\/&|])', '\$1')
}

function Get-SearchQuery([string]$Text) {
  $words = @($Text.Trim() -split '\s+' | Where-Object { $_ } | ForEach-Object { ConvertTo-LuceneTerm $_ })
  return "($($words -join ' AND ')) AND mediatype:(audio) AND format:(""VBR MP3"" OR ""MP3"")"
}

function Save-Response([string]$Url, [string]$Path) {
  $response = Invoke-WebRequest -Uri $Url -UserAgent $UserAgent -UseBasicParsing
  $stream = $response.RawContentStream
  $bytes = New-Object byte[] $stream.Length
  [void]$stream.Read($bytes, 0, $bytes.Length)
  [System.IO.File]::WriteAllBytes($Path, $bytes)
  Write-Host ("{0,-56} {1,8:N0} bytes" -f (Split-Path -Leaf $Path), $bytes.Length)
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Add-Type -AssemblyName System.Web

foreach ($query in $Searches.Keys) {
  $params = @("q=$([System.Web.HttpUtility]::UrlEncode((Get-SearchQuery $query)))")
  $params += $SearchFields | ForEach-Object { "fl%5B%5D=$_" }
  $params += @("rows=$SearchRows", 'page=1', 'output=json')
  $url = "https://archive.org/advancedsearch.php?$($params -join '&')"
  Save-Response $url (Join-Path $OutDir "search-$($Searches[$query]).json")
}

foreach ($identifier in $Items) {
  $url = "https://archive.org/metadata/$([uri]::EscapeDataString($identifier))"
  Save-Response $url (Join-Path $OutDir "metadata-$identifier.json")
}
