# Security policy

## Supported versions

| Version                  | Supported                   |
| ------------------------ | --------------------------- |
| Latest release           | Yes                         |
| Latest release candidate | Yes, until the next release |
| Anything older           | No, please update first     |

## Reporting a vulnerability

Please report security problems privately by e-mail to **anywecon@gmail.com**, not in a public
issue. Include the Aulos version (Settings → About), the Android version, what you found and,
if you can, the steps to reproduce it. You will get an answer within seven days. Once a fix is
released, the report is credited in the changelog unless you prefer otherwise.

## Scope notes

- Aulos has no accounts, servers or analytics. It only connects to the Internet Archive (HTTPS)
  and to Nuclear on your own PC (HTTP, private networks only).
- Nuclear's remote-control API (Nuclear Jam) has no authentication. Anyone on the same network
  can control the PC player; this is a limitation of Nuclear, not of Aulos. The README's pairing
  guide explains how to limit it to private networks.
- Release APKs are signed with the Aulos key; the certificate fingerprint is in
  [RELEASING.md](RELEASING.md). An APK signed with another key is not an official build.
