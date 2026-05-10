"""
Interactive cowork chat session for IOT-ST-KITTS-CODE.

What this does
──────────────
  · Full multi-turn conversation with an LLM (OpenAI or OpenRouter)
  · NOVA face animates while thinking; response streams live to the terminal
  · Karpathy-style brain is injected at session start and updated at session end
  · /run  packages the conversation into a precise task brief for the coding agent
  · /model  switches the model mid-session
  · /memory  shows what NOVA remembers about your team
  · /save <name>  saves the session with a custom name
  · /clear  starts a fresh conversation (keeps brain)
  · /status  shows auth + model + brain stats
  · /help  prints the command list
  · /quit | /exit  ends the session
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from rich import box
from rich.align import Align
from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table
from rich.text import Text
from rich.theme import Theme

# ── Console ───────────────────────────────────────────────────────────────────
_THEME = Theme({
    "brand": "bold cyan",
    "ok":    "bold green",
    "warn":  "bold yellow",
    "err":   "bold red",
    "cmd":   "bold green",
    "head":  "bold white",
    "info":  "cyan",
    "muted": "dim white",
    "user":  "bold white",
    "nova":  "bold bright_cyan",
})
console = Console(theme=_THEME, highlight=False)

# ── NOVA face frames (shared with main launcher) ──────────────────────────────
_F: dict[str, str] = {
    "idle":  "  ╭─────────────╮\n  │  ◉       ◉  │\n  │    ╰───╯    │\n  │  ─────────  │\n  ╰──────┬──────╯",
    "blink": "  ╭─────────────╮\n  │  ─       ─  │\n  │    ╰───╯    │\n  │  ─────────  │\n  ╰──────┬──────╯",
    "think": "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ░░░░░░░░░  │\n  ╰──────┬──────╯",
    "w0":    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓░░░░░░░  │\n  ╰──────┬──────╯",
    "w1":    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓▓▓░░░░░  │\n  ╰──────┬──────╯",
    "w2":    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓▓▓▓▓░░░  │\n  ╰──────┬──────╯",
    "w3":    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓▓▓▓▓▓▓▓  │\n  ╰──────┬──────╯",
    "done":  "  ╭─────────────╮\n  │  ◉       ◉  │\n  │   ╰─────╯   │\n  │  ─────────  │\n  ╰──────┬──────╯",
}


def _face(frame: str, label: str = "") -> Align:
    markup = f"[bold bright_cyan]{_F[frame]}[/bold bright_cyan]"
    if label:
        markup += f"\n  [dim cyan]▸ {label}[/dim cyan]"
    return Align.center(Text.from_markup(markup, justify="center"))


# ── Message rendering ─────────────────────────────────────────────────────────

def _nova_panel(text: str, cursor: bool = False) -> Panel:
    body = text + ("[bold cyan]▌[/bold cyan]" if cursor else "")
    return Panel(
        body,
        title="[nova]  NOVA[/nova]",
        border_style="cyan",
        box=box.ROUNDED,
        padding=(0, 2),
    )


def _user_panel(text: str) -> Panel:
    return Panel(
        f"[user]{text}[/user]",
        title="[head]  You[/head]",
        border_style="dim white",
        box=box.ROUNDED,
        padding=(0, 2),
    )


# ── LLM call with live streaming ──────────────────────────────────────────────

def _stream_response(client: Any, messages: list[dict], model_id: str) -> str:
    """
    Stream the LLM response to the terminal.
    Shows NOVA thinking face first, then switches to live text streaming.
    """
    # 1. Thinking face
    cycle = ["think", "w0", "w1", "w2", "w3", "w2", "w1", "w0"]
    accumulated = ""

    # Start the streaming request
    stream = client.chat.completions.create(
        model=model_id,
        messages=messages,
        stream=True,
        max_tokens=2048,
    )

    # 2. Stream text live
    with Live(
        _nova_panel("", cursor=True),
        console=console,
        refresh_per_second=20,
        transient=False,
    ) as live:
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            accumulated += delta
            live.update(_nova_panel(accumulated, cursor=True))
        live.update(_nova_panel(accumulated, cursor=False))

    return accumulated


def _thinking_then_call(
    client: Any, messages: list[dict], model_id: str, label: str = "thinking…"
) -> str:
    """Show animated NOVA face for ≥0.6 s, then stream the response."""
    # Brief pre-roll animation
    if sys.stdout.isatty():
        frames = ["think", "w0", "w1", "w2", "w3"]
        with Live(_face("think", label), console=console,
                  refresh_per_second=10, transient=True) as live:
            for i in range(6):
                live.update(_face(frames[i % len(frames)], label))
                time.sleep(0.10)
    return _stream_response(client, messages, model_id)


# ── /run: build and execute agent task brief ──────────────────────────────────

def _build_task_brief(client: Any, messages: list[dict], model_id: str) -> dict | None:
    """Ask the LLM to distil the conversation into a structured task brief."""
    prompt = (
        "Based on this conversation, produce a precise task brief for the coding agent. "
        "Return ONLY a raw JSON object (no markdown fences):\n"
        '{"task":"one clear sentence describing what to implement",'
        '"context":["bullet 1","bullet 2",...],'
        '"files":["relevant/file.py",...],'
        '"tests":true}\n'
        "Be specific. Include constraints, expected behaviour, error handling.\n"
        "Conversation follows."
    )
    brief_messages = (
        [m for m in messages if m["role"] == "system"]
        + [{"role": "user", "content": prompt}]
        + [m for m in messages if m["role"] in ("user", "assistant")]
        + [{"role": "user", "content": "Now produce the JSON task brief."}]
    )

    try:
        resp = client.chat.completions.create(
            model=model_id,
            messages=brief_messages[-10:],   # keep context window manageable
            max_tokens=600,
            temperature=0.2,
        )
        raw = resp.choices[0].message.content.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception:
        return None


def _run_agent(task_brief: dict, model_cfg: dict) -> int:
    """Fire the Rust agent (or dry-run if not built)."""
    task_sentence = task_brief.get("task", "")
    context_pts   = task_brief.get("context", [])
    files         = task_brief.get("files", [])

    # Pretty-print the brief
    console.print()
    console.print(Rule("[brand]Agent Task Brief[/brand]", style="cyan"))
    console.print()

    t = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
    t.add_column("k", style="dim", no_wrap=True, width=10)
    t.add_column("v", style="white")
    t.add_row("Task",    task_sentence)
    if context_pts:
        t.add_row("Context", "\n".join(f"· {c}" for c in context_pts))
    if files:
        t.add_row("Files",   "\n".join(files))
    console.print(t)
    console.print()

    # Try to find the Rust binary
    here = Path(__file__).resolve().parent.parent
    rust_bin = None
    for candidate in (
        here / "iot-st-kitts-code.exe",
        here / "iot-st-kitts-code",
        here / "goose-src" / "target" / "release" / "iot-st-kitts-code.exe",
    ):
        if candidate.exists():
            rust_bin = candidate
            break

    if rust_bin:
        console.print(f"[muted]Launching agent binary:[/muted] [cmd]{rust_bin}[/cmd]\n")
        full_task = task_sentence
        if context_pts:
            full_task += "\n\nContext:\n" + "\n".join(f"- {c}" for c in context_pts)
        return subprocess.call([str(rust_bin), "run", "--text", full_task])

    # Dry-run: show what would happen
    env = os.environ.copy()
    env_var = model_cfg.get("env_var", "OPENAI_API_KEY")
    env[env_var] = model_cfg.get("api_key", "")

    console.print(Panel(
        f"[muted]Provider:[/muted] [info]{model_cfg.get('provider')}[/info]   "
        f"[muted]Model:[/muted] [info]{model_cfg.get('display', model_cfg.get('api_id'))}[/info]\n\n"
        f"[head]{task_sentence}[/head]\n\n"
        + ("\n".join(f"  · {c}" for c in context_pts) if context_pts else "")
        + "\n\n[muted](Dry-run — build the Rust binary with "
          "[cmd]scripts/build.ps1[/cmd] for full agent execution.)[/muted]",
        title="[brand]▸ IOT-ST-KITTS-CODE · Agent (dry-run)[/brand]",
        border_style="cyan", box=box.ROUNDED, padding=(1, 2),
    ))
    return 0


# ── Slash command handler ─────────────────────────────────────────────────────

_HELP_TEXT = """\
[bold cyan]Chat commands[/bold cyan]

  [cmd]/run[/cmd]           Package conversation → coding agent task
  [cmd]/model[/cmd]         Switch AI model mid-session
  [cmd]/memory[/cmd]        Show what NOVA remembers about your team
  [cmd]/save [name][/cmd]   Save this session to disk
  [cmd]/clear[/cmd]         Start a fresh conversation (brain is kept)
  [cmd]/status[/cmd]        Auth · model · brain stats
  [cmd]/sessions[/cmd]      List recent saved sessions
  [cmd]/help[/cmd]          This message
  [cmd]/quit[/cmd]          End the session
"""


def _handle_command(
    cmd: str,
    messages: list[dict],
    model_cfg: dict,
    brain_data: dict,
    client: Any,
    brain,              # Brain instance
) -> str:
    """
    Returns a control token:
      "continue"  – keep chatting
      "run"       – user wants to fire the agent
      "clear"     – start fresh messages list
      "quit"      – end session
    """
    parts = cmd.strip().split(None, 1)
    verb  = parts[0].lower()
    arg   = parts[1] if len(parts) > 1 else ""

    # ── /run ──────────────────────────────────────────────────────────────────
    if verb == "/run":
        user_turns = [m for m in messages if m["role"] in ("user", "assistant")]
        if not user_turns:
            console.print("[warn]Nothing to run yet — describe what you want first.[/warn]\n")
            return "continue"
        console.print("[muted]  Building task brief from conversation…[/muted]\n")
        brief = _build_task_brief(client, messages, model_cfg["api_id"])
        if not brief:
            console.print("[warn]  Could not extract a task brief. Try describing the task more concisely.[/warn]\n")
            return "continue"
        _run_agent(brief, model_cfg)
        return "continue"

    # ── /model ────────────────────────────────────────────────────────────────
    if verb == "/model":
        from .models import pick_model, make_client
        new_cfg = pick_model(model_cfg.get("model_key"))
        if new_cfg:
            model_cfg.update(new_cfg)
            client.__class__ = make_client(new_cfg).__class__
            # Replace client in-place (reassign caller's ref via return)
            console.print(f"[ok]  Switched to [bold]{new_cfg['display']}[/bold][/ok]\n")
        return "continue"

    # ── /memory ───────────────────────────────────────────────────────────────
    if verb == "/memory":
        console.print()
        console.print(Rule("[brand]NOVA's Brain[/brand]", style="cyan"))
        console.print()
        t = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
        t.add_column("k", style="dim", no_wrap=True, width=12)
        t.add_column("v", style="white")
        t.add_row("Summary", brain_data.get("recent_summary") or "[dim](empty)[/dim]")
        for p in brain_data.get("projects", []):
            t.add_row("Project", f"[cyan]{p['name']}[/cyan]  {p.get('notes','')}")
        for f in brain_data.get("facts", []):
            t.add_row("Fact", f"{f['key']}: {f['value']}")
        for d in brain_data.get("decisions", []):
            t.add_row("Decision", d['what'])
        console.print(t)
        console.print(f"\n  [muted]{brain.stats(brain_data)}[/muted]\n")
        return "continue"

    # ── /save ─────────────────────────────────────────────────────────────────
    if verb == "/save":
        path = brain.save_session(messages, name=arg or "chat")
        console.print(f"[ok]  Session saved → {path}[/ok]\n")
        return "continue"

    # ── /sessions ─────────────────────────────────────────────────────────────
    if verb == "/sessions":
        sessions = brain.list_sessions(15)
        if not sessions:
            console.print("[muted]  No saved sessions yet.[/muted]\n")
        else:
            for p in sessions:
                console.print(f"  [dim]·[/dim]  {p.name}")
            console.print()
        return "continue"

    # ── /clear ────────────────────────────────────────────────────────────────
    if verb == "/clear":
        console.print("[muted]  Conversation cleared. Brain is kept.[/muted]\n")
        return "clear"

    # ── /status ───────────────────────────────────────────────────────────────
    if verb == "/status":
        from .auth import show_status
        console.print()
        console.print(Rule("[brand]Status[/brand]", style="cyan"))
        console.print()
        t = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
        t.add_column("k", style="dim", no_wrap=True, width=12)
        t.add_column("v", style="cyan")
        t.add_row("Model",    model_cfg.get("display", model_cfg.get("api_id", "?")))
        t.add_row("Provider", model_cfg.get("provider", "?"))
        t.add_row("Brain",    brain.stats(brain_data))
        t.add_row("Messages", str(len([m for m in messages if m["role"] != "system"])))
        console.print(t)
        console.print()
        show_status(console)
        return "continue"

    # ── /help ─────────────────────────────────────────────────────────────────
    if verb == "/help":
        console.print(_HELP_TEXT)
        return "continue"

    # ── /quit / /exit ─────────────────────────────────────────────────────────
    if verb in ("/quit", "/exit", "quit", "exit"):
        return "quit"

    console.print(f"[warn]  Unknown command: {verb}.  Type [cmd]/help[/cmd] for the list.[/warn]\n")
    return "continue"


# ── Session header ────────────────────────────────────────────────────────────

def _print_header(model_cfg: dict, brain_data: dict, brain) -> None:
    n_sessions = brain_data.get("session_count", 0)
    display    = model_cfg.get("display", model_cfg.get("api_id", "?")).split("(")[0].strip()
    mem_stats  = brain.stats(brain_data)

    console.print()
    console.print(Rule(
        f"[bold cyan]  NOVA · IOT-ST-KITTS-CODE[/bold cyan]  "
        f"[dim]·  Session #{n_sessions + 1}  ·  {display}  ·  {mem_stats}[/dim]",
        style="cyan",
    ))
    console.print()
    console.print(
        "  [dim]Type your request in plain English.  "
        "[cmd]/run[/cmd] executes code changes.  "
        "[cmd]/help[/cmd] for all commands.[/dim]\n"
    )


# ── Main chat loop ────────────────────────────────────────────────────────────

def run_chat(model_cfg: dict) -> int:
    """
    Entry point called from iot_sk_coder.py  cmd_chat().
    Runs the interactive session and returns an exit code.
    """
    from .brain import Brain
    from .models import make_client

    brain      = Brain()
    brain_data = brain.load()
    client     = make_client(model_cfg)

    system_prompt = brain.build_system_prompt(brain_data)
    messages: list[dict] = [{"role": "system", "content": system_prompt}]

    _print_header(model_cfg, brain_data, brain)

    # Opening greeting – mention context if brain has memories
    n_mem = len(brain_data.get("facts", [])) + len(brain_data.get("projects", []))
    if n_mem:
        opener = (
            f"Hello! I remember {n_mem} thing(s) about your team and projects. "
            "What would you like to build or fix today?"
        )
    else:
        opener = (
            "Hello! I'm NOVA, your IOT St. Kitts coding assistant. "
            "What would you like to build or fix today?"
        )
    console.print(_nova_panel(opener))
    console.print()
    messages.append({"role": "assistant", "content": opener})

    # ── Main loop ─────────────────────────────────────────────────────────────
    while True:
        # Prompt
        try:
            raw = console.input("[bold cyan]You ▸[/bold cyan] ").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if not raw:
            continue

        # Echo as user panel
        console.print()
        console.print(_user_panel(raw))
        console.print()

        # Slash command?
        if raw.startswith("/"):
            result = _handle_command(
                raw, messages, model_cfg, brain_data, client, brain
            )
            if result == "quit":
                break
            if result == "clear":
                messages = [{"role": "system", "content": system_prompt}]
            continue

        # Normal chat turn
        messages.append({"role": "user", "content": raw})

        response = _thinking_then_call(
            client, messages, model_cfg["api_id"], label="thinking…"
        )
        messages.append({"role": "assistant", "content": response})
        console.print()

    # ── End of session ────────────────────────────────────────────────────────
    console.print()
    console.print(Rule("[muted]Session ended — updating brain…[/muted]", style="dim"))

    user_turns = [m for m in messages if m["role"] == "user"]
    if user_turns:
        brain.save_session(messages)
        updated = brain.distil(client, model_cfg["api_id"], messages, brain_data)
        brain.save(updated)
        console.print(f"[ok]  Brain updated. {brain.stats(updated)}[/ok]\n")
    else:
        console.print("[muted]  No messages to save.[/muted]\n")

    return 0
