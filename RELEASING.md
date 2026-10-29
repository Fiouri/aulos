# Releasing Aulos

Releases are built locally with Gradle, signed with the Aulos release key and published on
GitHub Releases with a `SHA256SUMS.txt`. CI never sees the key: it builds unsigned APKs.

## Version scheme

- **versionName** follows [Semantic Versioning](https://semver.org): `1.0.0-rc.1`, `1.0.0`, `1.0.1`, …
- **versionCode** = _base_ + _ABI digit_.
  - The base is a multiple of 10. It was 10000 for `1.0.0-rc.1` and grows by 10 with every build
    that is published (release candidates included): `1.0.0` is 10010, the next release 10020.
  - ABI digit: `0` universal, `1` armeabi-v7a, `2` arm64-v8a, `3` x86_64. The universal APK has
    the lowest code of a release, so an ABI APK always installs over it.
- Both live at the top of `app.config.ts` (`VERSION`, `VERSION_CODE_BASE`, `ABI_DIGITS`); the
  ABI split plugin there applies the digits. `package.json` carries the same version name.

| Release    | Base  | universal | armeabi-v7a | arm64-v8a | x86_64 |
| ---------- | ----- | --------- | ----------- | --------- | ------ |
| 1.0.0-rc.1 | 10000 | 10000     | 10001       | 10002     | 10003  |
| 1.0.0      | 10010 | 10010     | 10011       | 10012     | 10013  |

## Signing certificate

|         |                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------- |
| Subject | `CN=Any WeCon, O=Any WeCon, C=GR`                                                                 |
| Key     | RSA 4096                                                                                          |
| SHA-256 | `E4:12:6F:AA:AC:F8:C7:A8:DB:98:9E:0D:7E:87:C4:50:50:40:8A:99:DC:F6:C1:5E:10:94:B2:58:1C:4E:DC:A1` |

The same fingerprint without colons is what `apksigner verify --print-certs` prints, and what
`scripts/release-apks.ps1` checks: `e4126faaacf8c7a8db989e0d7e87c45050408a99dcf6c15e1094b2581c4edca1`.

## Release keystore (once)

The owner creates the keystore; it never enters the repository, CI or any log.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.keystores\aulos" | Out-Null
keytool -genkeypair -v -storetype PKCS12 `
  -keystore "$env:USERPROFILE\.keystores\aulos\aulos-release.jks" `
  -alias aulos -keyalg RSA -keysize 4096 -validity 10950 -dname "CN=Any WeCon, O=Any WeCon, C=GR"
```

- 4096-bit RSA, 10,950 days (30 years) of validity: the key must outlive the app, because Android
  only accepts updates signed with the same key.
- Keep an **offline backup** of the `.jks` file and its password (for example an encrypted USB
  stick stored away from the PC). Losing either means no more updates for existing installs.
- PKCS12 keystores use one password for the store and the key.

Then add four lines to `~/.gradle/gradle.properties` (outside the repository):

```properties
AULOS_STORE_FILE=C:/Users/<you>/.keystores/aulos/aulos-release.jks
AULOS_STORE_PASSWORD=<password>
AULOS_KEY_ALIAS=aulos
AULOS_KEY_PASSWORD=<same password>
```

The release signing plugin in `app.config.ts` reads them. If one is missing, `assembleRelease`
stops with "Release signing is not configured: … missing from ~/.gradle/gradle.properties"; it
never falls back to the debug keystore. `-Paulos.unsignedRelease=true` builds unsigned APKs (CI).

## Build, sign and verify

1. Update `VERSION` and `VERSION_CODE_BASE` in `app.config.ts`, `npm version <name>
--no-git-tag-version`, `CHANGELOG.md` and
   `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` (one file per APK versionCode,
   at most 500 characters). Commit.
2. Gate and build:

   ```powershell
   npm ci
   npm run typecheck; npm run lint; npm test -- --ci
   $env:NODE_TLS_REJECT_UNAUTHORIZED = '0'   # only behind the TLS-intercepting proxy
   npm run android:prebuild
   cd android; .\gradlew.bat lint assembleRelease; cd ..
   ```

3. Verify and collect:

   ```powershell
   .\scripts\release-apks.ps1
   ```

   For every APK it checks APK Signature Scheme v2 and v3, the certificate fingerprint above and
   the versionName/versionCode, then writes `dist/<version>/aulos-<version>-<abi>.apk` and
   `dist/<version>/SHA256SUMS.txt`. By hand, the same check is
   `apksigner verify --verbose --print-certs <apk>`.

4. Upgrade check on a phone: with the previous release installed, run
   `maestro test -e JAM_HOST=<PC>:4120 scripts/upgrade-before.yaml` (playlist, favourite,
   download, saved PC), then `adb install -r dist/<version>/aulos-<version>-arm64-v8a.apk` and
   `maestro test scripts/upgrade-after.yaml`. Then run the Maestro suite (README → Build from
   source).

## Publish

1. Tag: `git tag -a v<version> -m "Aulos <version>"`, then `git push origin main v<version>`.
2. Create the release with the APKs, the checksums and the notes from `CHANGELOG.md`:

   ```powershell
   gh release create v<version> dist\<version>\*.apk dist\<version>\SHA256SUMS.txt `
     --title "Aulos <version>" --notes-file <notes.md>   # add --prerelease for an rc
   ```

   The notes end with the certificate SHA-256 fingerprint and a pointer to README → Verify the
   download.

3. F-Droid builds from source using `fastlane/metadata`; nothing is uploaded there by hand.
