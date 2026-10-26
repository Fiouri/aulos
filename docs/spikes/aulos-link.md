# Spike: "Aulos Link" Nuclear plugin (settings as a mailbox)

Date: 2026-10-25. Time-box: 2 h. Report only, no shipping code.
Source: read-only clone of `NuclearPlayer/nuclear` at `32f7c560` (player 1.52.0,
plugin-sdk 2.9.0), `F:\Projects\_ref\nuclear`. Installed Nuclear: 1.51.x.

## Question

Can a small Nuclear plugin ("Aulos Link") and the phone exchange messages through a plugin
setting that Nuclear Jam exposes at `GET/POST /api/settings/{id}`, so Aulos can do things Jam
has no endpoint for (for example: list Nuclear's playlists, push an Aulos playlist into
Nuclear) without any change to Nuclear itself?

## Findings

### 1. Setting IDs are readable and writable through `/api/settings/{id}`: yes

- `routes.rs` maps `GET /api/settings/{id}` to the bridge call `Settings.getGlobal {id}` and
  `POST /api/settings/{id}` (any JSON body) to `Settings.setGlobal {id, value}`.
- The bridge dispatcher (`services/bridge/bridgeDispatcher.ts`) calls the plugin API's
  `Settings.getGlobal/setGlobal`, which go straight to `settingsStore.getValue/setValue` with
  the **fully-qualified** ID. No allow-list, no check that the ID is registered.
- A plugin's own settings live at `plugin.<pluginId>.<id>` (`settingsHost.ts normalizeId`).
  A plugin `aulos-link` registering `inbox` and `outbox` is therefore reachable from the phone
  as `/api/settings/plugin.aulos-link.inbox` and `/api/settings/plugin.aulos-link.outbox`.
- Unregistered IDs are writable too (stored and persisted), and an unknown ID reads as
  `null`. Registering the two settings as `hidden: true` keeps them out of the Settings UI.

### 2. Payload size limits

- HTTP: the route uses axum's `Json` extractor with no `DefaultBodyLimit` layer, so axum's
  default request body limit of 2 MB applies to each POST.
- Bridge: each call waits at most 30 s for the frontend (`bridge.rs`).
- Storage: every `setValue` rewrites `settings.json` through `tauri-plugin-store`
  (`store.set` + `store.save`). A mailbox message is therefore a disk write of the whole
  settings file, and whatever is left in the mailbox is persisted across restarts.
- Practical budget: keep messages small (tens of KB); chunk anything bigger (a full playlist
  of a few thousand tracks is ~1 MB of Track JSON) and clear the mailbox after reading.

### 3. Change events: yes, but without the value

- Plugin side: `api.Settings.subscribe(id, listener)` fires when the value at
  `plugin.<pluginId>.<id>` changes, which includes writes made through the HTTP API. The
  plugin can react to the phone immediately.
- Phone side: Jam's `settings` SSE event is emitted on **every** settings-store change
  (`httpApiHandler.ts watchSettingsForRemote`), so a write by the plugin to `outbox` produces a
  `settings` event; its payload is the fixed snapshot (shuffle, repeat, theme…), not the
  outbox value. The phone has to `GET /api/settings/plugin.aulos-link.outbox` after each
  `settings` event (cheap, but every theme or volume change triggers it too).
- No ordering or delivery guarantee: two quick writes to the same key overwrite each other.
  A request/response protocol needs a request id, a single in-flight request per direction,
  and an explicit acknowledgement (clear the key) before the next message.

### 4. Licence implications

- `@nuclearplayer/plugin-sdk` is `AGPL-3.0-only` (its `package.json`), as is Nuclear.
  A plugin that imports the SDK is a derivative of AGPL code and should itself be
  AGPL-3.0 (GPL-3.0 §13 / AGPL-3.0 §13 allow combining with GPL-3.0 code, so a GPL-3.0 helper
  is fine inside it).
- Aulos (GPL-3.0) talks to the plugin only over HTTP/JSON, as separate programs; nothing from
  the SDK is linked into Aulos, so Aulos' licence is unaffected. The plugin would live in its
  own repository with its own licence file.

### 5. Plugin store publishing rules

- The store is the static registry `NuclearPlayer/plugin-registry`; a plugin is listed by
  **opening a pull request** to its `plugins.json` (id = package `name`, 2–64 chars, lowercase
  with hyphens; description 10–200 chars; `categories` from a fixed set — Aulos Link would be
  `other`; `addedAt`). Code stays in the author's GitHub repository; installs fetch the
  `plugin.zip` asset of the latest GitHub release (files at the zip root). Store plugins
  auto-update on Nuclear's start-up.
- The milestone's constraint is to open no issues or PRs in Nuclear's repositories. A store
  listing needs exactly such a PR, so it is the owner's decision. Without it, users install
  the plugin manually (Preferences → Plugins → Installed → Add Plugin, from a folder), which
  works but gets no auto-updates.
- `nuclear.permissions` in the manifest is informational only; nothing is sandboxed.

### 6. Security

Same exposure as Jam itself: no authentication, anyone on the network who can reach the Jam
port can read and write the mailbox. The plugin must treat every inbox message as untrusted
input (validate with a schema, size-cap, never execute paths or URLs from it) and must expose
only narrowly scoped operations.

## Live check (installed Nuclear 1.51.x, Jam enabled, 2026-10-25)

Run with curl from this PC against `http://192.168.1.50:4120` while `/api/events` was open:

| Check | Result |
|-------|--------|
| `POST /api/settings/plugin.aulos-link.probe` `{"id":"r1","op":"ping"}`, then `GET` | `200`, value read back unchanged (no plugin registered: unregistered IDs are writable) |
| `GET` of a never-written ID | `200` with `null` |
| ~1 MB body | `200` in 36 ms; `GET` returned the full 1,000,011 bytes |
| ~3 MB body | `413` "Failed to buffer the request body: length limit exceeded" (axum's 2 MB default) |
| `settings` SSE events | one per successful write (3 writes → 3 events), payload is the fixed snapshot |
| Restore | `POST … null`; the key now reads `null` (Nuclear keeps the key with a `null` value in its settings file; there is no delete endpoint) |

## Verdict: conditional GO (not before M4 planning)

Technically feasible with no change to Nuclear: hidden plugin settings work as a two-key
mailbox, the plugin gets change callbacks, and the phone learns about replies through the
existing `settings` event plus one GET. Conditions:

1. A concrete feature Jam lacks must justify it (candidates: list Nuclear playlists on the
   phone, push an Aulos playlist into Nuclear as a playlist). Everything Jam already does stays
   on Jam.
2. Separate AGPL-3.0 repository and release; Aulos stays GPL-3.0 and only speaks HTTP.
3. Distribution: manual install unless the owner approves a registry PR.
4. Protocol: request id, one message in flight per direction, chunking above ~64 KB, mailbox
   cleared after each read, schema validation on both sides.

If none of the candidate features is wanted for M4, the answer is **no-go**: the mailbox
adds a second unauthenticated channel and a settings-file write per message for no user gain.
