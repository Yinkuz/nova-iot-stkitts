#!/usr/bin/env python3
"""IOT-ST-KITTS-CODE — Internal AI coding agent for IOT St. Kitts."""
from __future__ import annotations

import os
import sys
import time

# ── UTF-8 on Windows (must be first) ─────────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Dependency bootstrap ──────────────────────────────────────────────────────
_DEPS = {
    "rich":        "rich>=13.7",
    "questionary": "questionary>=2.0",
    "openai":      "openai>=1.30",       # LLM calls (also used for OpenRouter)
}

def _bootstrap() -> None:
    missing = [spec for pkg, spec in _DEPS.items() if not _importable(pkg)]
    if not missing:
        return
    print(f"\n\033[1;36m▸ IOT-ST-KITTS-CODE\033[0m  First-run setup — "
          f"installing {len(missing)} package(s) …\n")
    import subprocess as _sp
    r = _sp.run(
        [sys.executable, "-m", "pip", "install", "--quiet", "--upgrade", *missing],
        text=True, capture_output=True,
    )
    if r.returncode != 0:
        print(f"\033[31mDependency install failed:\033[0m\n{r.stderr}")
        sys.exit(1)
    print("\033[32m✓  Dependencies ready.\033[0m\n")

def _importable(pkg: str) -> bool:
    try:
        __import__(pkg); return True
    except ImportError:
        return False

_bootstrap()

# ── Standard imports ──────────────────────────────────────────────────────────
import argparse
import json
import platform
import shutil
import subprocess
from pathlib import Path

import questionary
from questionary import Style as QStyle
from rich import box
from rich.align import Align
from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table
from rich.text import Text
from rich.theme import Theme

# ── Console & theme ───────────────────────────────────────────────────────────
_THEME = Theme({
    "brand": "bold cyan",
    "ok":    "bold green",
    "warn":  "bold yellow",
    "err":   "bold red",
    "cmd":   "bold green",
    "head":  "bold white",
    "info":  "cyan",
    "muted": "dim white",
})
console = Console(theme=_THEME, highlight=False)

# ── Branding ──────────────────────────────────────────────────────────────────
VERSION  = "0.1.0-istkc"
COMPANY  = "IOT St. Kitts"
PRODUCT  = "IOT-ST-KITTS-CODE"
PROG     = "iot-st-kitts-code"
DOCS_URL = "https://wiki.iot-st-kitts.local/istkc"
SUPPORT  = "#iot-st-kitts-code on the company chat"

# ── NOVA head frames ──────────────────────────────────────────────────────────
#
#  All frames are identical in dimensions so Rich Live doesn't jump.
#  Eyes: ◉ open  ─ blink  ◈ focus/work
#  Mouth: ╰───╯ smile  ─────  neutral  ╰─────╯ big-smile
#  Status bar (4th row): ░ empty  ▓ filled
#
_F: dict[str, str] = {
    # boot sequence — elements appear one-by-one
    "b0": "  ╭─────────────╮\n  │             │\n  │             │\n  │             │\n  ╰──────┬──────╯",
    "b1": "  ╭─────────────╮\n  │  ·       ·  │\n  │             │\n  │             │\n  ╰──────┬──────╯",
    "b2": "  ╭─────────────╮\n  │  ◉       ◉  │\n  │             │\n  │             │\n  ╰──────┬──────╯",
    "b3": "  ╭─────────────╮\n  │  ◉       ◉  │\n  │    ╰───╯    │\n  │             │\n  ╰──────┬──────╯",
    # idle states
    "idle":  "  ╭─────────────╮\n  │  ◉       ◉  │\n  │    ╰───╯    │\n  │  ─────────  │\n  ╰──────┬──────╯",
    "blink": "  ╭─────────────╮\n  │  ─       ─  │\n  │    ╰───╯    │\n  │  ─────────  │\n  ╰──────┬──────╯",
    "wink":  "  ╭─────────────╮\n  │  ◉       ─  │\n  │    ╰───╯    │\n  │  ─────────  │\n  ╰──────┬──────╯",
    # working states
    "think": "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ░░░░░░░░░  │\n  ╰──────┬──────╯",
    "w0":    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓░░░░░░░  │\n  ╰──────┬──────╯",
    "w1":    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓▓▓░░░░░  │\n  ╰──────┬──────╯",
    "w2":    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓▓▓▓▓░░░  │\n  ╰──────┬──────╯",
    "w3":    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓▓▓▓▓▓▓▓  │\n  ╰──────┬──────╯",
    # done — big smile
    "done":  "  ╭─────────────╮\n  │  ◉       ◉  │\n  │   ╰─────╯   │\n  │  ─────────  │\n  ╰──────┬──────╯",
}

_TAGLINE = f"[bold bright_cyan]{PRODUCT}[/bold bright_cyan]   [dim cyan]·   {COMPANY}   ·   v{VERSION}[/dim cyan]"


def _head(frame: str, label: str = "", tagline: bool = False) -> Align:
    """Render one NOVA frame as a centred Rich renderable."""
    markup = f"[bold bright_cyan]{_F[frame]}[/bold bright_cyan]"
    if tagline:
        markup += f"\n\n  {_TAGLINE}"
    if label:
        markup += f"\n  [dim cyan]▸ {label}[/dim cyan]"
    return Align.center(Text.from_markup(markup, justify="center"))


# ── Boot animation ────────────────────────────────────────────────────────────
def animate_boot() -> None:
    """Play the NOVA power-on sequence, then idle with a wink."""
    if not sys.stdout.isatty():
        console.print(_head("idle", tagline=True))
        console.print()
        return

    # (frame, hold_seconds, show_tagline)
    seq = [
        ("b0", 0.12, False),
        ("b1", 0.18, False),
        ("b2", 0.22, False),
        ("b3", 0.18, False),
        ("idle",  0.30, True),
        ("blink", 0.08, True),
        ("idle",  0.40, True),
        ("wink",  0.10, True),
        ("idle",  0.35, True),
    ]

    with Live(_head("b0"), console=console,
              refresh_per_second=30, transient=False) as live:
        for frame, hold, tag in seq:
            live.update(_head(frame, tagline=tag))
            time.sleep(hold)

    console.print()


# ── Working animation ─────────────────────────────────────────────────────────
def animate_working(task: str, seconds: float = 2.8) -> None:
    """Show NOVA thinking/working, then flash the done face."""
    if not sys.stdout.isatty():
        return

    label = task if len(task) <= 52 else task[:49] + "…"
    cycle = ["think", "w0", "w1", "w2", "w3", "w2", "w1", "w0"]
    steps = max(8, int(seconds / 0.13))

    with Live(_head("think", label), console=console,
              refresh_per_second=10, transient=True) as live:
        for i in range(steps):
            live.update(_head(cycle[i % len(cycle)], label))
            time.sleep(0.13)
        live.update(_head("done", "Done!"))
        time.sleep(0.5)


# ── Banner ────────────────────────────────────────────────────────────────────
def print_banner(short: bool = False) -> None:
    if os.environ.get("ISTKC_NO_BANNER"):
        return
    if short:
        console.print(f"[brand]▸ {PRODUCT}[/brand]  [muted]v{VERSION}[/muted]\n")
        return
    animate_boot()


def print_summary() -> None:
    console.print(
        f"Run [brand]{PRODUCT} --help[/brand] for all commands, or try one of:\n"
    )
    t = Table(show_header=False, box=None, padding=(0, 2))
    t.add_column("cmd",  style="cmd",   no_wrap=True)
    t.add_column("desc", style="muted")
    for name, desc in [
        ("chat",      "★  Interactive cowork chat  (start here)"),
        ("model",     "Pick or change the AI model  (OpenAI · OpenRouter)"),
        ("memory",    "Show NOVA's persistent brain"),
        ("welcome",   "Quick-start tips for new IOT St. Kitts engineers"),
        ("version",   "Version and build info"),
        ("doctor",    "Environment self-check  (Python · git · cargo · API keys)"),
        ("info",      "Project & configuration summary"),
        ("configure", "Provider / model wizard  (legacy)"),
        ("run",       f'{PROG} run "fix the MQTT handler"  ← one-shot mode'),
    ]:
        t.add_row(name, desc)
    console.print(t)
    console.print()


# ── welcome ───────────────────────────────────────────────────────────────────
def cmd_welcome(_args: argparse.Namespace) -> int:
    console.print(Rule(f"[brand]Welcome to {PRODUCT}[/brand]", style="cyan"))
    console.print()
    for title, body in [
        ("1  First-time setup",
         f"Run [cmd]{PROG} configure[/cmd] to choose your provider\n"
         "    (OpenAI · Anthropic · OpenRouter · Azure · internal gateway)."),
        ("2  Daily use",
         f"Interactive session:  [cmd]{PROG} session[/cmd]\n"
         f"    One-shot task:        [cmd]{PROG} run \"add unit tests for mqtt_handler.py\"[/cmd]"),
        ("3  Diagnose issues",
         f"Run [cmd]{PROG} doctor[/cmd] — checks your entire local environment."),
    ]:
        console.print(Panel(
            body, title=f"[head]{title}[/head]",
            border_style="cyan", box=box.ROUNDED, padding=(0, 1),
        ))
        console.print()
    console.print(f"[muted]Docs:[/muted]    {DOCS_URL}")
    console.print(f"[muted]Support:[/muted] {SUPPORT}")
    console.print()
    return 0


# ── version ───────────────────────────────────────────────────────────────────
def cmd_version(_args: argparse.Namespace) -> int:
    t = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
    t.add_column("k", style="muted", no_wrap=True)
    t.add_column("v", style="white")
    t.add_row(PRODUCT,    f"[brand]v{VERSION}[/brand]")
    t.add_row("Python",   platform.python_version())
    t.add_row("Platform", f"{platform.system()} {platform.release()} ({platform.machine()})")
    t.add_row("Company",  COMPANY)
    console.print(t)
    return 0


# ── doctor ────────────────────────────────────────────────────────────────────
def cmd_doctor(_args: argparse.Namespace) -> int:
    console.print(Rule("[brand]Environment Self-Check[/brand]", style="cyan"))
    console.print()
    t = Table(box=box.SIMPLE_HEAD, show_header=True, padding=(0, 1),
              header_style="bold cyan")
    t.add_column("",       width=3, justify="center", no_wrap=True)
    t.add_column("Check",  style="white", no_wrap=True)
    t.add_column("Detail", style="muted")
    checks: list[bool] = []

    def row(label: str, ok: bool, detail: str = "") -> None:
        t.add_row("[ok]✓[/ok]" if ok else "[err]✗[/err]", label, detail)
        checks.append(ok)

    row("Python ≥ 3.8",  sys.version_info >= (3, 8), platform.python_version())
    git = shutil.which("git")
    row("git on PATH", git is not None, git or "not found")
    cargo = shutil.which("cargo")
    row("cargo on PATH  (needed to build Rust binary)",
        cargo is not None, cargo or "install via https://rustup.rs/")
    rust = _find_rust_binary()
    row(f"{PROG} Rust binary built",
        rust is not None, str(rust) if rust else "run  scripts/build.ps1")
    cfg_p = _config_path()
    row("Config file present",
        cfg_p.exists(), str(cfg_p) if cfg_p.exists() else f"will be created at {cfg_p}")
    keys = [k for k in ["OPENAI_API_KEY","ANTHROPIC_API_KEY","OPENROUTER_API_KEY",
                         "AZURE_OPENAI_API_KEY","GOOGLE_API_KEY"] if os.environ.get(k)]
    row("Provider API key in env", bool(keys),
        ", ".join(keys) if keys else "set OPENAI_API_KEY or run `configure`")

    console.print(t)
    console.print()
    passed = sum(checks)
    if passed == len(checks):
        console.print(f"[ok]✓  All {len(checks)} checks passed.[/ok]\n")
        return 0
    console.print(f"[warn]  {passed}/{len(checks)} checks passed — "
                  f"{len(checks)-passed} need attention.[/warn]\n")
    return 1


# ── info ──────────────────────────────────────────────────────────────────────
def cmd_info(_args: argparse.Namespace) -> int:
    console.print(Rule("[brand]Project Info[/brand]", style="cyan"))
    console.print()
    rust = _find_rust_binary()
    cfg_p = _config_path()
    cfg   = _load_config()
    t = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
    t.add_column("k", style="muted", no_wrap=True, width=14)
    t.add_column("v", style="white")
    t.add_row("Version",     f"[brand]v{VERSION}[/brand]")
    t.add_row("Install dir", str(Path(__file__).resolve().parent))
    t.add_row("Config",
              f"{cfg_p}  {'[ok](present)[/ok]' if cfg_p.exists() else '[muted](not yet created)[/muted]'}")
    t.add_row("Rust binary", str(rust) if rust else "[muted]not built — run scripts/build.ps1[/muted]")
    console.print(t)
    if cfg:
        console.print(Rule("[head]Saved Configuration[/head]", style="dim"))
        ct = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
        ct.add_column("k", style="muted", no_wrap=True, width=14)
        ct.add_column("v", style="info")
        for k, v in cfg.items():
            ct.add_row(k, f"{v} [muted](env var)[/muted]" if k == "api_key_env" else v)
        console.print(ct)
    else:
        console.print()
        console.print(f"[muted]No saved config. Run [cmd]{PROG} configure[/cmd] to set one up.[/muted]")
    console.print()
    return 0


# ── configure ─────────────────────────────────────────────────────────────────
_Q_STYLE = QStyle([
    ("qmark",       "fg:cyan bold"),
    ("question",    "bold"),
    ("answer",      "fg:cyan bold"),
    ("pointer",     "fg:cyan bold"),
    ("highlighted", "fg:cyan bold"),
    ("selected",    "fg:cyan"),
    ("separator",   "fg:cyan"),
])

def cmd_configure(_args: argparse.Namespace) -> int:
    console.print(Rule("[brand]Configuration Wizard[/brand]", style="cyan"))
    console.print()
    cfg = _load_config()

    provider = questionary.select(
        "Provider:",
        choices=["openai", "anthropic", "openrouter", "azure", "internal-gateway"],
        default=cfg.get("provider", "openai"), style=_Q_STYLE,
    ).ask()
    if provider is None:
        return 1

    default_model = {"openai":"gpt-4o","anthropic":"claude-sonnet-4-6",
                     "openrouter":"anthropic/claude-sonnet-4","azure":"gpt-4o",
                     "internal-gateway":"istkc-default"}[provider]
    model = questionary.text(
        "Model:", default=cfg.get("model", default_model), style=_Q_STYLE,
    ).ask()
    if model is None:
        return 1

    default_env = {"openai":"OPENAI_API_KEY","anthropic":"ANTHROPIC_API_KEY",
                   "openrouter":"OPENROUTER_API_KEY","azure":"AZURE_OPENAI_API_KEY",
                   "internal-gateway":"ISTKC_GATEWAY_TOKEN"}[provider]
    api_key_env = questionary.text(
        "API key env var:", default=cfg.get("api_key_env", default_env), style=_Q_STYLE,
    ).ask()
    if api_key_env is None:
        return 1

    mode = questionary.select(
        "Mode:", choices=["auto", "approve", "chat"],
        default=cfg.get("mode", "approve"), style=_Q_STYLE,
    ).ask()
    if mode is None:
        return 1

    cfg.update(provider=provider, model=model, api_key_env=api_key_env, mode=mode)
    _save_config(cfg)
    console.print()
    console.print(f"[ok]✓  Saved to {_config_path()}[/ok]")
    return 0


# ── chat ──────────────────────────────────────────────────────────────────────
def cmd_chat(_args: argparse.Namespace) -> int:
    """Interactive cowork chat — main entry point for non-technical users."""
    # Ensure istkc package is importable (same directory as this script)
    _here = str(Path(__file__).resolve().parent)
    if _here not in sys.path:
        sys.path.insert(0, _here)

    from istkc.auth   import ensure_access
    from istkc.models import pick_model, make_client, validate_key
    from istkc.chat   import run_chat

    # 1. Access gate
    if not ensure_access(console):
        return 1

    # 2. Load or pick model config
    cfg       = _load_config()
    model_cfg = cfg.get("model_cfg")

    if not model_cfg:
        console.print()
        console.print("[muted]No model configured yet — let's pick one.[/muted]\n")
        model_cfg = pick_model()
        if not model_cfg:
            return 1
        # Validate key before saving
        console.print("[muted]  Validating API key…[/muted]")
        ok, err = validate_key(model_cfg)
        if not ok:
            console.print(f"[err]✗  API key validation failed: {err}[/err]\n")
            console.print("[muted]Check the key and try again.  Your key is NOT saved.[/muted]\n")
            return 1
        console.print("[ok]✓  API key valid.[/ok]\n")
        cfg["model_cfg"] = model_cfg
        _save_config(cfg)

    return run_chat(model_cfg)


# ── model ─────────────────────────────────────────────────────────────────────
def cmd_model(_args: argparse.Namespace) -> int:
    """Interactive model picker — saves selection to config."""
    _here = str(Path(__file__).resolve().parent)
    if _here not in sys.path:
        sys.path.insert(0, _here)

    from istkc.models import pick_model, validate_key

    cfg       = _load_config()
    current   = cfg.get("model_cfg", {}).get("model_key")
    model_cfg = pick_model(current)
    if not model_cfg:
        return 1

    console.print("[muted]  Validating API key…[/muted]")
    ok, err = validate_key(model_cfg)
    if not ok:
        console.print(f"[err]✗  Validation failed: {err}[/err]\n")
        return 1
    console.print("[ok]✓  Key valid.[/ok]\n")

    cfg["model_cfg"] = model_cfg
    _save_config(cfg)
    console.print(
        f"[ok]Model saved:[/ok] [brand]{model_cfg['display']}[/brand]  "
        f"[muted]({model_cfg['provider']})[/muted]\n"
    )
    return 0


# ── memory ────────────────────────────────────────────────────────────────────
def cmd_memory(_args: argparse.Namespace) -> int:
    """Print NOVA's persistent brain to the terminal."""
    _here = str(Path(__file__).resolve().parent)
    if _here not in sys.path:
        sys.path.insert(0, _here)

    from istkc.brain import Brain
    from rich.rule import Rule

    brain = Brain()
    data  = brain.load()

    console.print()
    console.print(Rule("[brand]NOVA's Brain[/brand]", style="cyan"))
    console.print()

    t = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
    t.add_column("k", style="muted", no_wrap=True, width=14)
    t.add_column("v", style="white")
    t.add_row("Sessions",  str(data.get("session_count", 0)))
    t.add_row("Summary",   data.get("recent_summary") or "[dim](empty)[/dim]")
    console.print(t)

    if data.get("projects"):
        console.print(Rule("[head]Projects[/head]", style="dim"))
        pt = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
        pt.add_column("n", style="cyan", no_wrap=True)
        pt.add_column("d", style="white")
        for p in data["projects"]:
            pt.add_row(p["name"], f"{p.get('stack','?')}  {p.get('notes','')}")
        console.print(pt)

    if data.get("facts"):
        console.print(Rule("[head]Facts[/head]", style="dim"))
        ft = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
        ft.add_column("k", style="cyan", no_wrap=True, width=24)
        ft.add_column("v", style="white")
        for f in data["facts"]:
            ft.add_row(f["key"], f["value"])
        console.print(ft)

    if data.get("decisions"):
        console.print(Rule("[head]Decisions[/head]", style="dim"))
        for d in data["decisions"]:
            console.print(f"  [dim]·[/dim]  {d['what']}")
        console.print()

    console.print(f"  [muted]{brain.stats(data)}[/muted]\n")
    return 0


# ── auth ──────────────────────────────────────────────────────────────────────
def cmd_auth(args: argparse.Namespace) -> int:
    """Show or reset access-control status."""
    _here = str(Path(__file__).resolve().parent)
    if _here not in sys.path:
        sys.path.insert(0, _here)

    from istkc.auth import show_status, revoke
    from rich.rule import Rule

    console.print()
    console.print(Rule("[brand]Access Control Status[/brand]", style="cyan"))
    console.print()
    show_status(console)
    console.print()
    return 0


# ── run ───────────────────────────────────────────────────────────────────────
def cmd_run(args: argparse.Namespace) -> int:
    task = " ".join(args.task) if args.task else ""
    if not task:
        console.print(
            f"[err]No task provided.[/err]  "
            f"Example: [cmd]{PROG} run \"refactor mqtt_handler.py\"[/cmd]"
        )
        return 2

    rust = _find_rust_binary()
    if rust:
        animate_working(task)
        return subprocess.call([str(rust), "run", "--text", task])

    cfg = _load_config()
    if not cfg:
        console.print(Panel(
            f"[warn]No configuration found.[/warn]\n\n"
            f"Run [cmd]{PROG} configure[/cmd] to set up a provider first.",
            border_style="yellow", box=box.ROUNDED, padding=(1, 2),
        ))
        return 1

    animate_working(task)
    console.print(Panel(
        f"[muted]Provider:[/muted] [info]{cfg.get('provider')}[/info]   "
        f"[muted]Model:[/muted] [info]{cfg.get('model')}[/info]\n\n"
        f"[head]{task}[/head]\n\n"
        f"[muted](Dry-run — build the Rust binary with [cmd]scripts/build.ps1[/cmd] "
        f"for the full agent.)[/muted]",
        title=f"[brand]▸ {PRODUCT} run[/brand]  [muted](dry-run)[/muted]",
        border_style="cyan", box=box.ROUNDED, padding=(1, 2),
    ))
    return 0


# ── Helpers ───────────────────────────────────────────────────────────────────
def _config_path() -> Path:
    return Path.home() / ".iot-st-kitts-code" / "config.json"

def _load_config() -> dict:
    p = _config_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}

def _save_config(cfg: dict) -> None:
    p = _config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(cfg, indent=2))

def _find_rust_binary() -> Path | None:
    found = shutil.which(PROG)
    if found:
        return Path(found)
    here = Path(__file__).resolve().parent
    for c in (here/f"{PROG}.exe", here/PROG,
              here/"goose-src"/"target"/"release"/f"{PROG}.exe",
              here/"goose-src"/"target"/"release"/PROG):
        if c.exists():
            return c
    return None


# ── Argparse ──────────────────────────────────────────────────────────────────
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog=PROG,
        description=f"{PRODUCT} — {COMPANY} internal AI coding agent",
        epilog=f"Docs: {DOCS_URL}",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--version",   action="store_true", help="Print version and exit")
    p.add_argument("--no-banner", action="store_true",
                   help="Suppress banner (or set ISTKC_NO_BANNER=1)")
    sub = p.add_subparsers(dest="cmd", metavar="<command>")
    sub.add_parser("chat",      help="Interactive cowork chat with NOVA  ← start here")
    sub.add_parser("welcome",   help="Quick-start tips for new IOT St. Kitts engineers")
    sub.add_parser("version",   help="Version and build info")
    sub.add_parser("doctor",    help="Self-check the local engineering environment")
    sub.add_parser("info",      help="Project & configuration information")
    sub.add_parser("configure", help="Interactive provider / model wizard")
    rp = sub.add_parser("run",  help=f'One-shot task, e.g. {PROG} run "fix lint"')
    rp.add_argument("task", nargs=argparse.REMAINDER, help="Natural-language task")
    sub.add_parser("model",     help="Pick / change the AI model (saved to config)")
    sub.add_parser("memory",    help="Show NOVA's persistent brain")
    sub.add_parser("auth",      help="Show or reset access-control status")
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.no_banner:
        os.environ["ISTKC_NO_BANNER"] = "1"

    if getattr(args, "version", False) and args.cmd is None:
        return cmd_version(args)

    print_banner(short=args.cmd is not None)

    if args.cmd is None:
        print_summary()
        return 0

    return {
        "chat":      cmd_chat,
        "model":     cmd_model,
        "memory":    cmd_memory,
        "auth":      cmd_auth,
        "welcome":   cmd_welcome,
        "version":   cmd_version,
        "doctor":    cmd_doctor,
        "info":      cmd_info,
        "configure": cmd_configure,
        "run":       cmd_run,
    }[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
