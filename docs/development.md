# Orca Development Environment

Setup details beyond [`CONTRIBUTING.md`](../.github/CONTRIBUTING.md).

## Prerequisites

Install Node 24, the pnpm version in `packageManager` in [`package.json`](../package.json), and the Bun version in [`config/.bun-version`](../config/.bun-version).

The server, its workers, and its packaged dependencies target Node 24. The compatibility launcher and CLI still target Node 18; the launcher hands off to bundled Node 24 before loading server code. WSL guest programs and host discovery retain their Node 18 minimum. Keep Node 24 APIs and server imports out of these host compatibility paths. Running an unpackaged server directly requires Node 24 or newer.

`corepack enable` needs Corepack 0.34.5 or newer (`npm install -g corepack@latest`). On Windows it fails with `EPERM` outside an elevated shell when Node is in `C:\Program Files\nodejs`; run `npm install -g pnpm@<that version>` instead.

`pnpm install` compiles native modules such as `node-pty`, so a fresh machine also needs:

- **macOS**: Xcode Command Line Tools (`xcode-select --install`).
- **Windows**: Python 3 and Visual Studio Build Tools with the "Desktop development with C++" workload.
- **Linux**: a C++ toolchain, Python 3, Electron's libraries, and `xvfb` (used by `*.electron.test.ts` when `DISPLAY` is unset). On Ubuntu 24.04+ and Debian 13+ (older releases name the last package `libasound2`):

  ```bash
  sudo apt-get update && sudo apt-get install -y build-essential python3 xvfb libgtk-3-0 libnss3 libgbm1 libasound2t64
  ```

Re-run `pnpm -C mobile install --frozen-lockfile` whenever `mobile/pnpm-lock.yaml` changes.

## Dev Profiles and Parallel Instances

On macOS, dev instances use Electron's mock keychain by default so native Keychain prompts do
not block startup or automated tests. Mock-keychain encryption uses a fixed test key and does
not provide OS keychain protection. Use `ORCA_DEV_USE_KEYCHAIN=1 pnpm dev` to test real Keychain
access or read credentials previously encrypted with it. Credentials saved in one mode cannot
be decrypted in the other. Mock-mode session-cookie snapshots are kept separately to preserve
real-keychain browser sign-ins. Credential stores requiring OS protection refuse the mock key.
Local account sign-ins stay in memory unless `ORCA_CLOUD_ALLOW_PLAINTEXT_SESSION=1` is explicitly
enabled. Packaged macOS builds keep the OS keychain. Profiles previously launched with a manually
enabled mock keychain need fresh test credentials: unmarked legacy ciphertext is rejected
rather than risk reading real-Keychain credentials with the wrong key. Bot tool secrets
require a protected store; built-in keys (including Linux `basic_text`) are refused.

`pnpm dev` in a linked Git worktree uses its own profile, renderer port (from 15200), and CDP port (from 9333), so worktrees run side by side. The main checkout uses the shared `orca-dev` profile. The chosen profile and ports are printed on an `ORCA_DEV_INSTANCE` line and written to `out/dev-instance.json`.

| Option                                                                  | Effect                                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev --shared-profile` or `ORCA_DEV_PROFILE=shared`                | Use the shared `orca-dev` profile                          |
| `pnpm dev --worktree-profile` or `ORCA_DEV_PROFILE=worktree`            | Use a per-worktree profile, including in the main checkout |
| `ORCA_DEV_USER_DATA_PATH=<dir>`                                         | Use an explicit profile directory                          |
| `REMOTE_DEBUGGING_PORT=<port>`, `ORCA_DEV_RENDERER_PORT=<port>`         | Pin a port                                                 |
| `pnpm dev --seed-profile[=<dir>]` or `ORCA_DEV_SEED_PROFILE=<dir or 1>` | Seed an empty profile on first launch                      |

After a worktree is removed and no process still uses its profile, a later `pnpm dev` can automatically delete that profile and its saved state. Back up any state you need before removing the worktree; the `userData` field in `ORCA_DEV_INSTANCE` or `out/dev-instance.json` gives the profile directory.

Seeding copies projects, workspaces, settings, SSH targets, and the Orca account session from another profile (default `orca-dev`, else the installed app's). Seed from `orca-dev` if you need to stay signed in: dev builds cannot decrypt secrets the installed app encrypted.

```bash
pnpm dev:seed-profile [--from=<profile dir>] [--to=<profile dir>] [--reset]
pnpm dev:fresh [--keep] [--seed-from[=<profile dir>]]   # temporary profile, removed on exit
```

## Installs and Builds

- Local installs use pnpm's global virtual store (`~/pnpm/store`) shared by all worktrees. Do not keep a `node_modules` in your home directory: it hides missing-dependency bugs. Set `ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0` in your shell to opt out.
- Before a cross-architecture build (including `pnpm build:mac`, which builds x64 and arm64), run `pnpm install:release`.
- On Linux, `pnpm build`, `pnpm build:native`, and packaging need a running Docker daemon for the clipboard helper. For native Wayland development, run `pnpm build:native` before `pnpm dev`. See the [clipboard build guide](../native/wayland-clipboard/README.md#building-and-testing).

## Troubleshooting

- Slow main-process rebuilds: set `ORCA_DEV_MAIN_SOURCEMAPS=0` before `pnpm dev` when you don't need main-process source maps.
- Renderer misbehaving in dev: set `ORCA_DEV_BUNDLED=0` to turn off bundled dev mode, and report it.
- Test passes alone but fails after others: add `// @orca-isolated-worker` to the file; `ORCA_VITEST_ISOLATE_EVERY_FILE=1` isolates every file to confirm a leak. Windows always isolates every file, because native addons kept across files corrupt the heap.
- Slow typechecks: where supported, `pnpm tc` keeps incremental caches in `.cache/typecheck/`; delete it to force a fresh check.

## Phone pairing from a headless server's browser client

A paired browser does not receive the owner's pairing-admin permission. The server
owner can opt specific E2EE-authenticated runtime device IDs into mobile-only
pairing by setting both environment variables before starting the server:

- `ORCA_WEB_MOBILE_PAIRING_ENDPOINT`: the fixed reachable `wss://` origin, for
  example `wss://orca.example.com`. Credentials, paths, queries and fragments are
  refused. The setting does not configure TLS or expose a port.
- `ORCA_WEB_MOBILE_PAIRING_CLIENT_IDS`: comma-separated paired runtime device UUIDs
  (up to 16). These are device identities, not names or client-chosen request IDs.

Absent or invalid settings disable the capability. An owner must approve a new
browser identity explicitly; clearing its saved key does not transfer permission.
These settings grant the listed clients permission to issue phone access, so keep
this an explicit owner decision. Do not put credentials or pairing URLs in logs.

In an approved browser, open Orca Mobile, choose LAN, and generate the QR. The
address is supplied by the server policy, including when the server lives behind
a reverse proxy. The phone must reach that address (for example over the home LAN
or a private overlay network). This flow does not enable Orca Relay.

Unscanned codes expire after ten minutes. Phones keep their access after scanning.
The browser can list and revoke only the mobile devices it created, and up to 32
paired phones can be issued per browser. The existing device registry records the
creator; revoking the issuing runtime device also revokes its created credentials.
Key migration preserves creator ownership. Existing unrelated phones, desktops,
owner-only pairing methods, and listener/network policy remain unchanged.

The paired browser cannot choose another destination, issue desktop credentials,
set grants, or access another issuer's phone-management scope. A phone and a
non-E2EE request cannot use these browser methods. `orca pair --mobile` remains the
owner's CLI alternative.
