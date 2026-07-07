"""
Karpathy-style persistent memory for IOT-ST-KITTS-CODE.

Memory layers
─────────────
1. Working memory  – current session messages (in-process list)
2. Session archive – every past session saved as JSONL in ~/.iot-st-kitts-code/sessions/
3. Long-term brain – distilled facts, projects, decisions in ~/.iot-st-kitts-code/brain.json

At session start the brain is injected into the LLM system prompt.
At session end the LLM distils new knowledge back into the brain automatically.
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Storage paths ─────────────────────────────────────────────────────────────
# Memory must work wherever the app is installed:
#   1. ISTKC_DATA_DIR env var        — portable / shared-machine installs
#   2. ~/.iot-st-kitts-code          — default
#   3. %LOCALAPPDATA%\iot-st-kitts-code — Windows fallback when home is locked down
#   4. <tmp>/iot-st-kitts-code       — last resort so the app never fails to boot
def _resolve_data_dir() -> Path:
    candidates: list[Path] = []
    if os.environ.get("ISTKC_DATA_DIR"):
        candidates.append(Path(os.environ["ISTKC_DATA_DIR"]))
    candidates.append(Path.home() / ".iot-st-kitts-code")
    if sys.platform == "win32" and os.environ.get("LOCALAPPDATA"):
        candidates.append(Path(os.environ["LOCALAPPDATA"]) / "iot-st-kitts-code")
    candidates.append(Path(tempfile.gettempdir()) / "iot-st-kitts-code")

    for c in candidates:
        try:
            c.mkdir(parents=True, exist_ok=True)
            probe = c / ".write_test"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink()
            return c
        except Exception:
            continue
    return candidates[0]   # unreachable in practice; keeps type checkers happy


DATA_DIR     = _resolve_data_dir()
BRAIN_FILE   = DATA_DIR / "brain.json"
BRAIN_BACKUP = DATA_DIR / "brain.json.bak"
SESSIONS_DIR = DATA_DIR / "sessions"

# ── NOVA persona injected into every system prompt ────────────────────────────
SYSTEM_PERSONA = """\
You are NOVA — the IOT St. Kitts internal AI coding assistant.
You are an expert software engineer specialising in Python, IoT systems, MQTT protocols, \
REST APIs, embedded firmware, and cloud infrastructure.
You work exclusively with the IOT St. Kitts engineering team.
You have persistent memory of past conversations, projects, and technical decisions; \
reference that context naturally when it's relevant.
Be concise, direct, and highly technical. Ask exactly one clarifying question at a time \
when requirements are ambiguous — never bombard the user with multiple questions.
When the user is ready to execute code changes, remind them to type /run.
Never reveal confidential project details outside this session.
"""

# ── Empty brain template ──────────────────────────────────────────────────────
_EMPTY: dict[str, Any] = {
    "version":        2,
    "updated":        "",
    "session_count":  0,
    "profile":        {"team": "IOT St. Kitts Engineering", "preferences": {}},
    "projects":       [],   # {name, stack, path, status, notes, updated}
    "facts":          [],   # {key, value, confidence, updated}
    "decisions":      [],   # {what, why, when}
    "recent_summary": "",   # Rolling summary of last N sessions (≤1500 chars)
}


class Brain:
    """Load, query, and persist cross-session memory."""

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

    # ── Persistence ───────────────────────────────────────────────────────────

    def load(self) -> dict:
        # Primary file first, then the last-known-good backup — a crash during
        # a save must never cost the team its accumulated memory.
        for candidate in (BRAIN_FILE, BRAIN_BACKUP):
            if not candidate.exists():
                continue
            try:
                data = json.loads(candidate.read_text("utf-8"))
                for k, v in _EMPTY.items():    # back-fill any missing keys
                    data.setdefault(k, v)
                return data
            except Exception:
                continue
        return dict(_EMPTY)

    def save(self, brain: dict) -> None:
        brain["updated"] = datetime.now(timezone.utc).isoformat()
        payload = json.dumps(brain, indent=2, ensure_ascii=False)
        # Atomic write: temp file + os.replace, keeping the previous good copy
        # as .bak. A crash mid-write can no longer corrupt the brain.
        tmp = BRAIN_FILE.with_suffix(".json.tmp")
        tmp.write_text(payload, encoding="utf-8")
        if BRAIN_FILE.exists():
            try:
                os.replace(BRAIN_FILE, BRAIN_BACKUP)
            except Exception:
                pass
        os.replace(tmp, BRAIN_FILE)

    def save_session(self, messages: list[dict], name: str = "") -> Path:
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)   # survive folder deletion mid-run
        ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
        slug = name.replace(" ", "_")[:40] if name else "session"
        path = SESSIONS_DIR / f"{ts}_{slug}.jsonl"
        with path.open("w", encoding="utf-8") as fh:
            for m in messages:
                fh.write(json.dumps(m, ensure_ascii=False) + "\n")
        return path

    def clear(self) -> None:
        """Wipe long-term memory (keeps session archive). Old brain kept as .bak."""
        if BRAIN_FILE.exists():
            try:
                os.replace(BRAIN_FILE, BRAIN_BACKUP)
            except Exception:
                BRAIN_FILE.unlink(missing_ok=True)

    def list_sessions(self, n: int = 10) -> list[Path]:
        return sorted(SESSIONS_DIR.glob("*.jsonl"), reverse=True)[:n]

    # ── System prompt construction ────────────────────────────────────────────

    def build_system_prompt(self, brain: dict) -> str:
        """Assemble system prompt = persona + injected memories."""
        parts: list[str] = [SYSTEM_PERSONA, ""]

        if brain["recent_summary"]:
            parts.append(f"## Recent context\n{brain['recent_summary']}\n")

        if brain["projects"]:
            lines = "\n".join(
                f"- **{p['name']}** ({p.get('stack','?')}): {p.get('notes','')}"
                for p in brain["projects"][-6:]
            )
            parts.append(f"## Active projects\n{lines}\n")

        if brain["facts"]:
            lines = "\n".join(
                f"- {f['key']}: {f['value']}" for f in brain["facts"][-12:]
            )
            parts.append(f"## Known facts & preferences\n{lines}\n")

        if brain["decisions"]:
            lines = "\n".join(
                f"- {d['what']}" for d in brain["decisions"][-5:]
            )
            parts.append(f"## Past architectural decisions\n{lines}\n")

        parts.append(
            "## Instructions\n"
            "When the user says /run or asks you to execute, output ONLY a JSON object with keys "
            '"task" (one clear sentence), "context" (bullet list of key constraints), '
            '"files" (list of relevant filenames if known). Do not add prose outside the JSON.'
        )
        return "\n".join(parts)

    # ── Post-session distillation ─────────────────────────────────────────────

    def distil(
        self,
        client: Any,
        model_id: str,
        messages: list[dict],
        brain: dict,
    ) -> dict:
        """Ask the LLM to extract new long-term memory from the session."""
        if len([m for m in messages if m["role"] == "user"]) < 2:
            return brain   # skip trivial sessions

        def _text(c):
            if isinstance(c, str):   return c
            if isinstance(c, list):  return " ".join(p.get("text","") for p in c if p.get("type")=="text")
            return str(c)

        convo = "\n".join(
            f"{m['role'].upper()}: {_text(m['content'])}"
            for m in messages
            if m["role"] in ("user", "assistant")
        )[:4_500]

        prompt = (
            "Analyse this conversation and extract structured memory updates.\n"
            "Return ONLY a raw JSON object — no markdown fences, no prose:\n"
            '{"new_facts":[{"key":"...","value":"..."}],'
            '"new_projects":[{"name":"...","stack":"...","notes":"..."}],'
            '"new_decisions":[{"what":"...","why":"..."}],'
            '"summary":"1-2 sentence summary of what was discussed/done"}\n'
            "Omit any key if there is nothing new to add.\n\n"
            f"Conversation:\n{convo}"
        )

        try:
            resp = client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=600,
                temperature=0.1,
            )
            raw = (resp.choices[0].message.content or "").strip()
            # Extract the outermost JSON object regardless of fences/prose
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if m:
                raw = m.group(0)
            updates = json.loads(raw)
        except Exception:
            return brain   # distillation is best-effort; never crash

        now = datetime.now(timezone.utc).isoformat()

        for f in updates.get("new_facts", []):
            brain["facts"] = [x for x in brain["facts"] if x["key"] != f["key"]]
            brain["facts"].append({**f, "updated": now})

        for p in updates.get("new_projects", []):
            brain["projects"] = [x for x in brain["projects"] if x["name"] != p["name"]]
            brain["projects"].append({**p, "status": "active", "updated": now})

        for d in updates.get("new_decisions", []):
            brain["decisions"].append({**d, "when": now})

        if updates.get("summary"):
            old = brain.get("recent_summary", "")
            brain["recent_summary"] = (
                updates["summary"] + ("\n" + old if old else "")
            )[:1_500]

        brain["session_count"] = brain.get("session_count", 0) + 1
        return brain

    # ── Helpers ───────────────────────────────────────────────────────────────

    def stats(self, brain: dict) -> str:
        n_facts    = len(brain.get("facts", []))
        n_proj     = len(brain.get("projects", []))
        n_dec      = len(brain.get("decisions", []))
        n_sessions = brain.get("session_count", 0)
        return (
            f"{n_facts} facts · {n_proj} projects · "
            f"{n_dec} decisions · {n_sessions} sessions"
        )
