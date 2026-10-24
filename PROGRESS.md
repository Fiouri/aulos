**Current:** M2 Sources and downloads — closed; gate green on the S23 and the API 31 emulator
**Next step:** Owner: try Wi-Fi only on real mobile data and a longer stream on a weak connection; confirm the GitHub repository URL for the User-Agent; then M3 (Nuclear pairing)
**Last session:** 2026-10-25 — M2: Internet Archive search/stream/download, DownloadManager with resume, Wi-Fi-only gate and storage limit; typecheck, lint, 232 tests, R8 release build, Maestro 10/10 S23 and 9/9 API 31; fixed a media3 crash with short repeat-all queues

## M2 Sources and downloads (closed 2026-10-25)

- **Done:** HTTP client with timeout, retries and zod validation; response cache; provider layer (local + Internet Archive); IA search, albums, MP3 streaming and MP3/FLAC/Ogg downloads with MD5 check; DownloadManager (persisted, 2 at a time, resume after restart or reconnect, Wi-Fi only, storage limit, delete one/all); offline skip of streamed tracks; Search source switcher, remote album screen, track info with licence, Downloads and Settings → Sources. INTERNET is the only new permission; cleartext stays off.
- **Verified:** typecheck, lint, 232 unit tests (provider tests on recorded archive.org fixtures), `gradlew lint assembleRelease` with R8, Maestro 10/10 on the S23 and 9/9 on API 31 (incl. `m2-archive-stream`, `m2-download-offline` in airplane mode). S23: resume after force-stop, MD5, storage-limit refusal. Wi-Fi only checked on the emulator (S23 has mobile data off). Details in `SESSIONS.md`.
- **Open risks:** downloads pause in the background unless the process keeps network access (no download foreground service); VPN may count as metered for Wi-Fi only; no artwork for remote items; User-Agent repository URL assumed; Expo CLI audit advisories unchanged.
- **Device testing (owner):** Wi-Fi only on real mobile data; streaming on a weak connection; licence link from Track info; M1 hardware items (gapless, Bluetooth/wired buttons, unplugging).

## M1 Offline player (closed 2026-10-24)

- **Done:** accent-insensitive search (Greek included), Songs/Albums/Artists browse with sorting and detail screens, artwork cache, library folders, player with queue/shuffle/repeat, persistence, background and lock-screen playback, sleep timer, mini player, Now Playing, queue sheet, playlists with drag reorder and JSON export/import, favorites, history and Recent, Search tab, R8 + resource shrinking. Albums group by an album key (album artist, else MediaStore album id, else album + folder); one folder's tracks with differing per-track album artist tags merge into one album unless their track numbers collide.
- **Verified:** typecheck, lint, 169 unit tests, `gradlew lint assembleRelease`, 8/8 Maestro flows on the S23 (API 36) and an API 31 emulator. S23: scan of 2,028 tracks 1.4 s, cold start 282 ms (median of 5), Songs scroll 0.41 % janky frames, sleep timer pauses with the screen off, "Street Tape 3" shows as one album; 60 min soak keeps playing with the screen off for the whole hour (checked every 5 min), media notification without `POST_NOTIFICATIONS`, lock-screen and media-key controls. Details in `SESSIONS.md`.
- **Open risks:** two same-named albums in one folder whose track numbers never collide would merge; the notification's previous button skips the 3 s restart rule; `node-forge`/`zod` advisories in Expo CLI tooling; APK 94 MiB until ABI splits (M4).
- **Device testing (owner):** gapless listening on "Gapless Test", physical Bluetooth and wired headset buttons, unplugging headphones pauses. Test media: `scripts/test-media.ps1 -Mode standard` (removed from the S23 after the run).

## M0 Foundation (closed 2026-10-23)

- **Done:** Expo SDK 58 app (TS strict), SQLite schema + forward migrations with FTS5, Kotlin MediaStore module, local library scan, Zustand stores, i18n (English), Library and Settings tabs, CI workflow, GPL-3.0 licence.
- **Verified:** full gate on the Windows dev machine and a Samsung S23 (Android API 36): 14 MediaStore tracks scanned and shown, count persisted across restart. Details in `SESSIONS.md`.
- **Open risks:** Greek accent-insensitive search needs normalisation (M1); 98 MB unminified APK; `node-forge` advisories in Expo CLI tooling; M0 APK signed with the debug keystore.
- **Device testing:** denied/blocked permission states, light theme and an Android 12- device not yet checked by hand (see SESSIONS.md checklist).
