# Changelog

All notable changes to Aulos are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Version codes are explained in
[RELEASING.md](RELEASING.md).

## [Unreleased]

## [1.0.0-rc.1] - 2026-10-29

First release candidate, for seven days of daily use before 1.0.0.

### Added

- Local library: scans the phone's music (MP3, FLAC, M4A/AAC, Ogg, Opus) through MediaStore, with
  library folders that can be left out; browse by songs, albums and artists with sorting.
- Offline search that ignores accents in every script, Greek tonos included.
- Player: queue, shuffle, repeat, gapless playback, background playback with notification,
  lock-screen and Bluetooth controls, sleep timer, mini player and Now Playing.
- Playlists with drag-to-reorder and JSON export/import, favourites (tracks, albums, artists),
  listening history and Recent.
- Internet Archive: search, stream and download (MP3, FLAC or Ogg, with MD5 check); downloads
  resume after a restart or a lost connection, respect Wi-Fi only and a storage limit.
- Nuclear pairing: Wi-Fi discovery or manual address (LAN, Tailscale), live remote over Nuclear
  Jam (play/pause, next, previous, seek, volume, shuffle, repeat, favourite), the PC's queue, PC
  search, "Send to PC", and import of Nuclear playlist exports from the file picker or share sheet.
- Settings → About: version, licence, source code link, third-party licences generated from the
  dependency tree, and a privacy statement.
- An error screen with "Copy error details" and "Restart" instead of a crash.
- App icon (adaptive, with a themed-icon layer) and light/dark splash screen.
- Separate APKs for arm64-v8a, armeabi-v7a and x86_64, plus a universal APK, signed with the Aulos
  release key.

### Security

- Plain HTTP is allowed only to private-network hosts (LAN, Tailscale, link-local); every other
  connection must use HTTPS. Nuclear Jam itself has no password: see the pairing guide in the
  README.

[Unreleased]: https://github.com/Fiouri/aulos/compare/v1.0.0-rc.1...HEAD
[1.0.0-rc.1]: https://github.com/Fiouri/aulos/releases/tag/v1.0.0-rc.1
