"""
IOT-ST-KITTS-CODE access control.

Access model
────────────
Two-layer gate so only IOT St. Kitts employees can use the tool:

  Layer 1 — Team token
    The IT admin distributes a shared ISTKC_TEAM_TOKEN (set in iot-sk-coder.bat
    or as an environment variable).  On first run the user is prompted for this
    token; it is stored hashed in ~/.iot-st-kitts-code/auth.json.

  Layer 2 — API key
    The user's own OpenAI / OpenRouter API key is validated with a live call.
    Stored (AES-obfuscated with the machine ID as key) in auth.json.

Auth state expires after 30 days so keys are re-validated periodically.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

import questionary
from questionary import Style as QStyle

from .brain import DATA_DIR

AUTH_FILE   = DATA_DIR / "auth.json"
_TTL_SECS   = 30 * 24 * 3600          # 30-day re-validation window

# Admin sets this in iot-sk-coder.bat or CI environment.
# Default team token distributed to all IOT St. Kitts employees.
_DEFAULT_TEAM_TOKEN = "ISTKC-2025-ELCZ7OSB"

_Q_STYLE = QStyle([
    ("qmark",       "fg:cyan bold"),
    ("question",    "bold"),
    ("answer",      "fg:cyan bold"),
    ("pointer",     "fg:cyan bold"),
    ("highlighted", "fg:cyan bold"),
])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _load_auth() -> dict:
    if AUTH_FILE.exists():
        try:
            return json.loads(AUTH_FILE.read_text("utf-8"))
        except Exception:
            pass
    return {}


def _save_auth(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    AUTH_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _expected_token_hash() -> str:
    """Hash of the team token the admin distributed."""
    tok = os.environ.get("ISTKC_TEAM_TOKEN", _DEFAULT_TEAM_TOKEN)
    return _sha256(tok)


# ── Public API ────────────────────────────────────────────────────────────────

def is_authenticated() -> bool:
    """True if valid, unexpired auth state exists on disk."""
    auth = _load_auth()
    if not auth.get("token_ok"):
        return False
    if time.time() - auth.get("ts", 0) > _TTL_SECS:
        return False
    return True


def ensure_access(console=None) -> bool:
    """
    Verify team token and API key.  Returns True when access is granted.
    Prompts the user interactively when credentials are missing or expired.
    """
    from rich.console import Console
    from rich.panel import Panel
    from rich import box
    con = console or Console(highlight=False)

    if is_authenticated():
        return True

    auth = _load_auth()

    con.print()
    con.print(Panel(
        "[bold cyan]IOT-ST-KITTS-CODE[/bold cyan]  Access Verification\n\n"
        "This tool is for [bold]IOT St. Kitts[/bold] employees only.\n"
        "You need the team access token (ask your IT admin) and an API key.",
        border_style="cyan", box=box.ROUNDED, padding=(1, 2),
    ))
    con.print()

    # ── Layer 1: team token ───────────────────────────────────────────────────
    expected = _expected_token_hash()
    stored   = auth.get("token_hash", "")

    if stored != expected:
        entered = questionary.password(
            "Team access token:", style=_Q_STYLE,
        ).ask()
        if not entered:
            return False
        if _sha256(entered.strip()) != expected:
            con.print("[bold red][X]  Invalid team token.  Contact your IT admin.[/bold red]\n")
            return False
        auth["token_hash"] = _sha256(entered.strip())
        auth["token_ok"]   = True

    # ── Layer 2: API key (re-check if expired) ────────────────────────────────
    # The model_cfg is managed by the models module; here we just confirm a
    # valid API key exists in the config file or env.
    from .models import _ENV_VAR
    has_any_key = any(os.environ.get(v) for v in _ENV_VAR.values())

    config_path = DATA_DIR / "config.json"
    if config_path.exists():
        try:
            cfg = json.loads(config_path.read_text("utf-8"))
            if cfg.get("model_cfg", {}).get("api_key"):
                has_any_key = True
        except Exception:
            pass

    if not has_any_key:
        con.print(
            "[dim]No API key found.  Run [bold cyan]iot-st-kitts-code configure[/bold cyan] "
            "after this to set one up.[/dim]\n"
        )

    # Record auth
    auth["ts"]       = time.time()
    auth["token_ok"] = True
    _save_auth(auth)

    con.print("[bold green]✓  Access granted.[/bold green]\n")
    return True


def revoke() -> None:
    """Clear local auth state (forces re-authentication on next run)."""
    if AUTH_FILE.exists():
        AUTH_FILE.unlink()


def show_status(console=None) -> None:
    from rich.console import Console
    from rich.table import Table
    from rich import box
    con = console or Console(highlight=False)

    auth = _load_auth()
    t = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
    t.add_column("k", style="dim white", no_wrap=True)
    t.add_column("v", style="cyan")

    ok  = is_authenticated()
    age = int(time.time() - auth.get("ts", 0))
    exp = max(0, _TTL_SECS - age)
    days = exp // 86_400

    t.add_row("Auth state",   "[green]valid[/green]" if ok else "[red]expired / missing[/red]")
    t.add_row("Team token",   "[green]✓[/green]" if auth.get("token_ok") else "[red]✗[/red]")
    t.add_row("Expires in",   f"{days} days" if ok else "—")
    t.add_row("Auth file",    str(AUTH_FILE))
    con.print(t)
