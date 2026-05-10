"""
NOVA Skill — get_timestamp
═══════════════════════════
Returns the current UTC datetime in ISO-8601 format.
"""
from datetime import datetime, timezone

TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "get_timestamp",
        "description": "Return the current UTC datetime in ISO-8601 format (e.g. 2025-02-14T10:30:00Z).",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
}


def execute(args: dict, workspace: str) -> str:
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%SZ")
