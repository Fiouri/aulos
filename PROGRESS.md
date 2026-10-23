**Current:** M0 Foundation — done; gate passed on the S23
**Next step:** Owner reviews M0 (SESSIONS.md), then start M1 Offline player (prompt for M1)
**Last session:** 2026-10-23 — M0 built; typecheck, lint (0 warnings), 46 tests, Gradle lint + assembleRelease, Maestro m0-launch on S23 all pass

## M0 Foundation (closed 2026-10-23)

- **Done:** Expo SDK 58 app (TS strict), SQLite schema + forward migrations with FTS5, Kotlin MediaStore module, local library scan, Zustand stores, i18n (English), Library and Settings tabs, CI workflow, GPL-3.0 licence.
- **Verified:** full gate on the Windows dev machine and a Samsung S23 (Android API 36): 14 MediaStore tracks scanned and shown, count persisted across restart. Details in `SESSIONS.md`.
- **Open risks:** Greek accent-insensitive search needs normalisation (M1); 98 MB unminified APK; `node-forge` advisories in Expo CLI tooling; M0 APK signed with the debug keystore.
- **Device testing:** denied/blocked permission states, light theme and an Android 12- device not yet checked by hand (see SESSIONS.md checklist).
