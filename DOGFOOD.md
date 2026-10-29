# Dogfood: Aulos 1.0.0-rc.1

Seven days of daily use on the S23 before 1.0.0 (SPEC §8, M4b). The final release needs **zero
crashes** in this period; every bug found is fixed with a test or recorded as a known issue.

- **Build:** 1.0.0-rc.1, `aulos-1.0.0-rc.1-arm64-v8a.apk` (versionCode 10002), release-signed.
- **Device:** Samsung S23 (SM-S911B), Android 17 (API 37), arm64-v8a.
- **Start:** 2026-10-29. **End:** 2026-11-05 (seven full days, then M4b).

## Daily checklist

Tick each day; write anything odd under the day, with the time.

| Day | Date       | Daily use | No crash / error screen | Battery normal | Downloads OK | PC remote OK |
| --- | ---------- | --------- | ----------------------- | -------------- | ------------ | ------------ |
| 1   | 2026-10-29 | [ ]       | [ ]                     | [ ]            | [ ]          | [ ]          |
| 2   | 2026-10-30 | [ ]       | [ ]                     | [ ]            | [ ]          | [ ]          |
| 3   | 2026-10-31 | [ ]       | [ ]                     | [ ]            | [ ]          | [ ]          |
| 4   | 2026-11-01 | [ ]       | [ ]                     | [ ]            | [ ]          | [ ]          |
| 5   | 2026-11-02 | [ ]       | [ ]                     | [ ]            | [ ]          | [ ]          |
| 6   | 2026-11-03 | [ ]       | [ ]                     | [ ]            | [ ]          | [ ]          |
| 7   | 2026-11-04 | [ ]       | [ ]                     | [ ]            | [ ]          | [ ]          |

What each column means:

- **Daily use:** at least one real listening session from the library (local files), with the
  screen off for part of it; use the queue, a playlist or favourites, and search at least once.
- **No crash / error screen:** Aulos never closed by itself and never showed "Something went
  wrong". If it did: tap **Copy error details**, paste them into the log below, then **Restart**.
  If the app closed without the error screen, note the time; the agent reads the crash buffer
  (`adb logcat -b crash`) at the end.
- **Battery normal:** Settings → Battery → Aulos shows nothing unusual for the hours played
  (note the percentage for a long session), and the phone did not warn about Aulos.
- **Downloads OK:** at least every other day, download something from the Internet Archive (a
  track or an album). It finishes in the foreground, pauses when the app is in the background
  without playback (known v1 limitation) and resumes when you come back; downloaded tracks play in
  airplane mode.
- **PC remote OK:** when the PC is on, the PC tab connects to Nuclear, shows what plays, and the
  controls work. Try "Send to PC" once and, if possible, once over Tailscale away from home.

## Also try once during the week

- [ ] Gapless: the "Gapless Test" album or a live album plays without gaps.
- [ ] Bluetooth headset or car: play/pause/next from the device; disconnecting pauses.
- [ ] Wired headphones: unplugging pauses.
- [ ] Sleep timer stops playback with the screen off.
- [ ] Import a playlist exported from Nuclear through the share sheet.
- [ ] Export a playlist from Aulos and import it again.
- [ ] Rotate through light and dark theme; the splash screen matches the theme.
- [ ] Themed icon: with Material You themed icons on, the Aulos icon follows the theme.

## How to report

- Write it in the log below (date, time, what you did, what happened, what you expected), or
  tell the agent in the next session. Paste copied error details verbatim; they contain no
  personal data (paths, addresses and URLs are replaced).
- A crash or data loss is a release blocker. Anything else can become a known issue for 1.0.0 if
  you agree.

## Log

Day 1 (2026-10-29): rc.1 installed; see SESSIONS.md for how the data was carried over.
