**Current:** M1 Offline player — built; API 31 emulator gate green; S23 performance, soak and final suite pending
**Next step:** Owner unlocks the S23 (it locked during a screen-off test), then the agent runs the S23 bulk scan, cold start, full Maestro suite, sleep timer and 60 min soak
**Last session:** 2026-10-24 — M1 implemented; typecheck, lint, 153 tests, R8 release build, 8/8 Maestro flows on API 31; S23: 8 flows passed, notification/lock screen/media keys verified

## M0 Foundation (closed 2026-10-23)

- **Done:** Expo SDK 58 app (TS strict), SQLite schema + forward migrations with FTS5, Kotlin MediaStore module, local library scan, Zustand stores, i18n (English), Library and Settings tabs, CI workflow, GPL-3.0 licence.
- **Verified:** full gate on the Windows dev machine and a Samsung S23 (Android API 36): 14 MediaStore tracks scanned and shown, count persisted across restart. Details in `SESSIONS.md`.
- **Open risks:** Greek accent-insensitive search needs normalisation (M1); 98 MB unminified APK; `node-forge` advisories in Expo CLI tooling; M0 APK signed with the debug keystore.
- **Device testing:** denied/blocked permission states, light theme and an Android 12- device not yet checked by hand (see SESSIONS.md checklist).
