**Current:** M4a Release candidate 1.0.0-rc.1 — done; privacy scrub of the public repo done (current version); S23 dogfood running since 2026-10-29
**Next step:** Owner: decide whether to rewrite the git history (removes the old screenshots and values from earlier commits; changes every commit id). Keep dogfooding until 2026-11-05, then M4b (prompts/M4.md)
**Last session:** 2026-10-29 — Privacy scrub: new emulator-only screenshots with fictional media, real addresses/serial/library names replaced, `check-privacy.ps1` + CI step; typecheck, lint, 360 tests, privacy check, Maestro screenshots + m3 3/3 on API 36 pass

## Privacy scrub (2026-10-29)

- **Done:** README and F-Droid screenshots regenerated on the API 36 emulator with fictional media (`test-media.ps1 -Mode screenshots`) and mock-jam's screenshots fixture at 10.0.2.2:4120; real LAN/Tailscale addresses, the phone serial and names from the owner's library replaced in docs, scripts and tests; `scripts/check-privacy.ps1` (Tailscale range + local `.privacy-denylist`) in CI and in the CLAUDE.md gate. Backup: `F:\Projects\_backup\aulos-pre-scrub.bundle`.
- **Verified:** typecheck, lint, 360 unit tests, privacy check (incl. a negative test), screenshot flow and m3 mock-jam flows 3/3 on API 36; every screenshot inspected.
- **Open risks:** earlier commits on GitHub still contain the old screenshots and values (history not rewritten); the backup bundle contains them too.

## M4a Release candidate 1.0.0-rc.1 (closed 2026-10-29)

- **Done:** original adaptive/themed icon and light/dark splash; version 1.0.0-rc.1 with versionCode base 10000 + ABI digit; ABI split APKs (arm64-v8a 34.3 MB, armeabi-v7a 26.8 MB, x86_64 34.9 MB, universal 92.1 MB); release signing from `~/.gradle/gradle.properties` with no debug fallback, CI unsigned; Settings → About (version, licence, source, generated third-party licences, privacy); root error screen with redacted "Copy error details" and Restart; README, SECURITY, RELEASING, CHANGELOG, DOGFOOD; fastlane F-Droid metadata with screenshots; release check script and upgrade flows. Fix: PC tab rejected Nuclear queues with unresolved items. New dependency: expo-clipboard (MIT).
- **Verified:** typecheck, lint, 360 unit tests, signed `gradlew lint assembleRelease` (lint 0 errors, no icon warnings), apksigner v2+v3 on all 4 APKs, SHA256SUMS.txt, GitHub CI green; S23 signed upgrade universal → arm64 kept playlist, favourite, download and saved PC; Maestro S23 14/14 (real Nuclear), API 36 and API 31 fresh installs 13/13 of the flows that can run. npm audit (Expo tooling only), licences all GPL-compatible, permissions unchanged, no proprietary Google artifacts, gitleaks clean. Tag `v1.0.0-rc.1` local only. Details in `SESSIONS.md`.
- **Open risks:** emulators cannot run the Internet Archive flows behind the PC's TLS proxy; the adb server on this PC restarts under long runs (another process); F-Droid build would need Node/prebuild and may flag React Native's prebuilt binaries; the PC snapshot still fails as a whole if one Jam call fails; Tailscale pairing unverified.
- **Device testing (owner):** 7-day dogfood (DOGFOOD.md); Tailscale by 100.x; a real Nuclear export via the share sheet; Wi-Fi only on mobile data; gapless, Bluetooth/wired buttons, unplugging.

## M3 Nuclear pairing (closed 2026-10-26)

- **Done:** network guard (HTTP only to LAN/Tailscale/MagicDNS hosts, HTTPS elsewhere, enforced in every request path and the player); typed Nuclear Jam client with zod schemas and an XHR-based event stream (reconnect backoff, stale detection, background stop); Wi-Fi discovery (ports 4120–4129) and manual pairing with saved PCs; PC tab (status, now playing, transport, seek, volume, shuffle/repeat, favourite, PC queue, save queue as playlist, PC search); Send to PC from the track menu with candidates fallback; import of Nuclear playlists (export and legacy) from the picker and the share sheet with unavailable rows. No new dependency or permission; cleartext permitted at platform level, controlled in app code.
- **Verified:** typecheck, lint, 327 unit tests, `gradlew lint assembleRelease` with R8, Maestro 13/13 on API 31 against mock-jam and on the S23 against Nuclear 1.51.x. S23: discovery finds the PC, PC → phone update in ~0.1 s, Send to PC adds the chosen track, imported Nuclear playlist plays and greys unmatched rows, public HTTP refused. Details in `SESSIONS.md`.
- **Open risks:** Jam has no authentication (LAN users can control the PC); discovery is refused while a VPN is up on the phone; matching is exact (Greek vs Latin names fall back to candidates); any future network library must use the guard.
- **Device testing (owner):** Tailscale pairing by 100.x (blocked by the PC firewall/VPN during the session); Tailscale over mobile data; M2 Wi-Fi only on mobile data; a real Nuclear export via the share sheet; M1 hardware items.

## M2 Sources and downloads (closed 2026-10-25)

- **Done:** HTTP client with timeout, retries and zod validation; response cache; provider layer (local + Internet Archive); IA search, albums, MP3 streaming and MP3/FLAC/Ogg downloads with MD5 check; DownloadManager (persisted, 2 at a time, resume after restart or reconnect, Wi-Fi only, storage limit, delete one/all); offline skip of streamed tracks; Search source switcher, remote album screen, track info with licence, Downloads and Settings → Sources. INTERNET is the only new permission; cleartext stays off.
- **Verified:** typecheck, lint, 232 unit tests (provider tests on recorded archive.org fixtures), `gradlew lint assembleRelease` with R8, Maestro 10/10 on the S23 and 9/9 on API 31 (incl. `m2-archive-stream`, `m2-download-offline` in airplane mode). S23: resume after force-stop, MD5, storage-limit refusal. Wi-Fi only checked on the emulator (S23 has mobile data off). Details in `SESSIONS.md`.
- **Open risks:** downloads pause in the background unless the process keeps network access (no download foreground service); VPN may count as metered for Wi-Fi only; no artwork for remote items; User-Agent repository URL assumed; Expo CLI audit advisories unchanged.
- **Device testing (owner):** Wi-Fi only on real mobile data; streaming on a weak connection; licence link from Track info; M1 hardware items (gapless, Bluetooth/wired buttons, unplugging).

## M1 Offline player (closed 2026-10-24)

- **Done:** accent-insensitive search (Greek included), Songs/Albums/Artists browse with sorting and detail screens, artwork cache, library folders, player with queue/shuffle/repeat, persistence, background and lock-screen playback, sleep timer, mini player, Now Playing, queue sheet, playlists with drag reorder and JSON export/import, favorites, history and Recent, Search tab, R8 + resource shrinking. Albums group by an album key (album artist, else MediaStore album id, else album + folder); one folder's tracks with differing per-track album artist tags merge into one album unless their track numbers collide.
- **Verified:** typecheck, lint, 169 unit tests, `gradlew lint assembleRelease`, 8/8 Maestro flows on the S23 (API 36) and an API 31 emulator. S23: scan of 2,028 tracks 1.4 s, cold start 282 ms (median of 5), Songs scroll 0.41 % janky frames, sleep timer pauses with the screen off, a 12-track album with per-track album artists shows as one album; 60 min soak keeps playing with the screen off for the whole hour (checked every 5 min), media notification without `POST_NOTIFICATIONS`, lock-screen and media-key controls. Details in `SESSIONS.md`.
- **Open risks:** two same-named albums in one folder whose track numbers never collide would merge; the notification's previous button skips the 3 s restart rule; `node-forge`/`zod` advisories in Expo CLI tooling; APK 94 MiB until ABI splits (M4).
- **Device testing (owner):** gapless listening on "Gapless Test", physical Bluetooth and wired headset buttons, unplugging headphones pauses. Test media: `scripts/test-media.ps1 -Mode standard` (removed from the S23 after the run).

## M0 Foundation (closed 2026-10-23)

- **Done:** Expo SDK 58 app (TS strict), SQLite schema + forward migrations with FTS5, Kotlin MediaStore module, local library scan, Zustand stores, i18n (English), Library and Settings tabs, CI workflow, GPL-3.0 licence.
- **Verified:** full gate on the Windows dev machine and a Samsung S23 (Android API 36): 14 MediaStore tracks scanned and shown, count persisted across restart. Details in `SESSIONS.md`.
- **Open risks:** Greek accent-insensitive search needs normalisation (M1); 98 MB unminified APK; `node-forge` advisories in Expo CLI tooling; M0 APK signed with the debug keystore.
- **Device testing:** denied/blocked permission states, light theme and an Android 12- device not yet checked by hand (see SESSIONS.md checklist).
