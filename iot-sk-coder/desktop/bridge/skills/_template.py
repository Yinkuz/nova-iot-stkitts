"""
NOVA Skill Template
════════════════════
Copy this file, rename it (no leading underscore), fill in TOOL_DEFINITION
and execute(), then call reload_skills in NOVA to activate it immediately.

Rules
─────
• File name must NOT start with underscore (those are skipped)
• Must expose TOOL_DEFINITION (OpenAI function-calling format)
• Must expose execute(args: dict, workspace: str) -> str
• Return a plain string — it goes straight to the model as tool output
• Use workspace to resolve relative paths: Path(workspace) / "file.txt"
• Raise exceptions freely — the bridge catches and returns them as error strings
"""
from pathlib import Path

# ── 1. Describe the tool ──────────────────────────────────────────────────────

TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "example_skill",          # must match the file stem or be unique
        "description": "One clear sentence describing what this skill does.",
        "parameters": {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "An example string argument.",
                },
            },
            "required": ["message"],
        },
    },
}

# ── 2. Implement the tool ─────────────────────────────────────────────────────

def execute(args: dict, workspace: str) -> str:
    message = args.get("message", "")
    # do something useful here
    return f"echo: {message}"
