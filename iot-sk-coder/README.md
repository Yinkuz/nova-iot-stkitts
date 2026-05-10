# IOT-SK-CODER

**Internal AI coding agent for IOT ST Kits engineering teams.**

IOT-SK-CODER is the in-house command-line AI assistant used at IOT ST Kits to
help our engineers build, debug, and ship software faster. It's forked and
customised from the open-source [`goose`](https://github.com/block/goose)
project (Apache-2.0).

```
  ___  ___  _____    ____  _  __    ____ ___  ____  _____ ____
 |_ _|/ _ \|_   _|__/ ___|| |/ /   / ___/ _ \|  _ \| ____|  _ \
  | || | | | | |/ __\___ \| ' /___| |  | | | | | | |  _| | |_) |
  | || |_| | | |\__ \___) | . \___| |__| |_| | |_| | |___|  _ <
 |___|\___/  |_||___/____/|_|\_\   \____\___/|____/|_____|_| \_\
```

## What's in this folder

| Path | Purpose |
|---|---|
| `iot-sk-coder.bat` | Windows launcher. Prefers the Rust binary if built; falls back to the Python front-end. |
| `iot_sk_coder.py` | Runnable Python launcher with the IOT-SK-CODER UX (banner, help, configure, doctor, info, run). Works immediately. |
| `scripts\build.ps1` | Builds the full Rust binary from `goose-src\` using `cargo`. |
| `goose-src\` | Rebranded `goose` source tree (CLI binary renamed to `iot-sk-coder`, banner + welcome command added). |

## Quick start

From a Windows terminal in `C:\Users\IOT\IOT-SK-CLI\iot-sk-coder`:

```cmd
iot-sk-coder.bat                     :: show banner + summary
iot-sk-coder.bat --help              :: full help
iot-sk-coder.bat welcome             :: getting-started tips
iot-sk-coder.bat doctor              :: environment self-check
iot-sk-coder.bat configure           :: provider / model wizard
iot-sk-coder.bat run "add unit tests for mqtt_handler.py"
```

## Building the full Rust binary

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
```

This compiles `goose-src\` and drops `iot-sk-coder.exe` next to the launcher.
After that, `iot-sk-coder.bat` automatically uses the compiled binary instead
of the Python front-end.

## Source-level rebrand summary

The following files in `goose-src/` were modified relative to upstream `goose`:

- `Cargo.toml` - workspace description updated to IOT-SK-CODER.
- `crates/goose-cli/Cargo.toml` - package renamed `iot-sk-coder-cli`, binary renamed `iot-sk-coder`.
- `crates/goose-cli/src/cli.rs`:
  - `#[command(name = ...)]` set to `iot-sk-coder` with `display_name = "IOT-SK-CODER"`.
  - Added `IOT_SK_CODER_BANNER` ASCII art and `print_iot_sk_coder_banner()` helper.
  - Banner is printed at the top of `cli()` (TTY-only, suppressed by `IOT_SK_CODER_NO_BANNER=1`).
  - New `welcome` subcommand showing IOT ST Kits getting-started tips.
- `crates/goose-cli/src/commands/configure.rs` - first-time-setup welcome line rebranded.
- `README.md` - top-of-file IOT-SK-CODER header.

## Configuration

Saved to `%USERPROFILE%\.iot-sk-coder\config.json` by `iot-sk-coder configure`.
Provider API keys are read from environment variables (e.g. `OPENAI_API_KEY`).
