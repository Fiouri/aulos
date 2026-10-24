**Current:** M1 Offline player — closed; gate green on the S23 and API 31
**Next step:** Owner: listen to "Gapless Test", try real Bluetooth/wired headset buttons and unplugging, and decide on grouping albums whose tracks carry per-track album artist tags (e.g. "Street Tape 3"); then M2
**Last session:** 2026-10-24 — album grouping by album key (migration 003); typecheck, lint, 161 tests, R8 release build, 8/8 Maestro flows on S23 and API 31, S23 scan 1.4 s / cold start 282 ms / 0.41 % janky, sleep timer screen-off and 60 min soak passed

## M1 Offline player (closed 2026-10-24)

- **Done:** accent-insensitive search (Greek included), Songs/Albums/Artists browse with sorting and detail screens, artwork cache, library folders, player with queue/shuffle/repeat, persistence, background and lock-screen playback, sleep timer, mini player, Now Playing, queue sheet, playlists with drag reorder and JSON export/import, favorites, history and Recent, Search tab, R8 + resource shrinking. Albums group by an album key (album artist, else MediaStore album id, else album + folder).
- **Verified:** typecheck, lint, 161 unit tests, `gradlew lint assembleRelease`, 8/8 Maestro flows on the S23 (API 36) and an API 31 emulator. S23: scan of 2,028 tracks 1.4 s, cold start 282 ms (median of 5), Songs scroll 0.41 % janky frames, sleep timer pauses with the screen off, 60 min soak keeps playing, media notification without `POST_NOTIFICATIONS`, lock-screen and media-key controls. Details in `SESSIONS.md`.
- **Open risks:** albums whose files carry per-track album artist tags with featured artists (the owner's "Street Tape 3") still split, as the agreed rule keys on album artist; the notification's previous button skips the 3 s restart rule; `node-forge`/`zod` advisories in Expo CLI tooling; APK 94 MiB until ABI splits (M4).
- **Device testing (owner):** gapless listening on "Gapless Test", physical Bluetooth and wired headset buttons, unplugging headphones pauses. Test media: `scripts/test-media.ps1 -Mode standard` (removed from the S23 after the run).

## M0 Foundation (closed 2026-10-23)

- **Done:** Expo SDK 58 app (TS strict), SQLite schema + forward migrations with FTS5, Kotlin MediaStore module, local library scan, Zustand stores, i18n (English), Library and Settings tabs, CI workflow, GPL-3.0 licence.
- **Verified:** full gate on the Windows dev machine and a Samsung S23 (Android API 36): 14 MediaStore tracks scanned and shown, count persisted across restart. Details in `SESSIONS.md`.
- **Open risks:** Greek accent-insensitive search needs normalisation (M1); 98 MB unminified APK; `node-forge` advisories in Expo CLI tooling; M0 APK signed with the debug keystore.
- **Device testing:** denied/blocked permission states, light theme and an Android 12- device not yet checked by hand (see SESSIONS.md checklist).
