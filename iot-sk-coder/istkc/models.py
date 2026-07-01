"""
Multi-model routing for IOT-ST-KITTS-CODE.

Supported backends
──────────────────
  openai     – OpenAI API directly (gpt-4o, o1, o3-mini …)
  openrouter – OpenRouter (Claude, Gemini, Llama, DeepSeek, Mistral, …)
  chatgpt    – ChatGPT Plus via Codex OAuth (no API key needed)

Model ID format stored in config:  "provider:slug"
   openai:gpt-4o
   openrouter:claude-sonnet-4-5
   chatgpt:gpt-4.1
"""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# questionary is only needed by the interactive CLI picker — the desktop bridge
# imports this module for make_client() and must not die if it's absent.
try:
    import questionary
    from questionary import Style as QStyle
except ImportError:          # pragma: no cover
    questionary = None
    QStyle = None

# ── ChatGPT OAuth (Codex) helpers ─────────────────────────────────────────────

_CODEX_AUTH_PATH   = Path.home() / ".codex" / "auth.json"
_CODEX_CLIENT_ID   = "app_EMoamEEZ73f0CkXaXp7hrann"
_OPENAI_TOKEN_URL  = "https://auth.openai.com/oauth/token"


def _codex_token_exp(token: str) -> float:
    """Decode JWT exp claim without a third-party library."""
    try:
        payload = token.split(".")[1] + "=="
        data = json.loads(base64.urlsafe_b64decode(payload.encode()))
        return float(data.get("exp", 0))
    except Exception:
        return 0.0


def _codex_refresh(auth: dict) -> dict:
    rt = auth.get("tokens", {}).get("refresh_token", "")
    if not rt:
        raise ValueError("No refresh_token in Codex auth — re-run `codex auth login`.")
    payload = urllib.parse.urlencode({
        "grant_type":    "refresh_token",
        "client_id":     _CODEX_CLIENT_ID,
        "refresh_token": rt,
    }).encode()
    req = urllib.request.Request(
        _OPENAI_TOKEN_URL, data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    auth["tokens"]["access_token"] = data["access_token"]
    if "id_token"      in data: auth["tokens"]["id_token"]      = data["id_token"]
    if "refresh_token" in data: auth["tokens"]["refresh_token"] = data["refresh_token"]
    auth["last_refresh"] = time.strftime("%Y-%m-%dT%H:%M:%S.000000Z", time.gmtime())
    _CODEX_AUTH_PATH.write_text(json.dumps(auth, indent=2))
    return auth


def get_chatgpt_access_token() -> str:
    """Return a valid ChatGPT OAuth Bearer token, refreshing if near-expiry."""
    if not _CODEX_AUTH_PATH.exists():
        raise FileNotFoundError(
            "No Codex auth found. Open the Codex app and sign in with your ChatGPT Plus account."
        )
    auth = json.loads(_CODEX_AUTH_PATH.read_text())
    if auth.get("auth_mode") != "chatgpt":
        raise ValueError("Codex is not in ChatGPT auth mode.")
    access_token = auth.get("tokens", {}).get("access_token", "")
    if not access_token or _codex_token_exp(access_token) - time.time() < 300:
        auth = _codex_refresh(auth)
        access_token = auth["tokens"]["access_token"]
    return access_token


def get_codex_status() -> dict:
    """Return auth status info for the /codex/status endpoint."""
    if not _CODEX_AUTH_PATH.exists():
        return {"authenticated": False}
    try:
        auth = json.loads(_CODEX_AUTH_PATH.read_text())
        if auth.get("auth_mode") != "chatgpt":
            return {"authenticated": False}
        tok  = auth.get("tokens", {}).get("access_token", "")
        exp  = _codex_token_exp(tok)
        try:
            payload = json.loads(base64.urlsafe_b64decode((tok.split(".")[1] + "==").encode()))
            oa = payload.get("https://api.openai.com/auth", {})
            email = payload.get("https://api.openai.com/profile", {}).get("email", "")
        except Exception:
            oa, email = {}, ""
        return {
            "authenticated": True,
            "plan":          oa.get("chatgpt_plan_type", "unknown"),
            "email":         email,
            "token_valid":   exp > time.time(),
            "token_expires": int(exp),
        }
    except Exception as exc:
        return {"authenticated": False, "error": str(exc)}

# ── Model catalogue ───────────────────────────────────────────────────────────

@dataclass
class ModelDef:
    id:       str   # Config key  e.g. "openai:gpt-4o"
    display:  str   # Human label in the picker
    provider: str   # "openai" | "openrouter"
    api_id:   str   # Model ID sent to the API
    ctx_k:    int   # Context window (thousands of tokens)
    note:     str   # Speed / cost / capability hint

MODELS: list[ModelDef] = [
    # ── ChatGPT Plus (OAuth — no API key needed) ──────────────────────────────
    ModelDef("chatgpt:gpt-4.1",      "gpt-4.1            (ChatGPT Plus · flagship)",    "chatgpt", "gpt-4.1",       1_000, "latest · best at code · uses Plus quota"),
    ModelDef("chatgpt:gpt-4.1-mini", "gpt-4.1-mini       (ChatGPT Plus · fast)",        "chatgpt", "gpt-4.1-mini",  1_000, "fast · efficient · uses Plus quota"),
    ModelDef("chatgpt:gpt-4o",       "gpt-4o             (ChatGPT Plus · multimodal)",  "chatgpt", "gpt-4o",          128, "multimodal · reliable · uses Plus quota"),
    ModelDef("chatgpt:o4-mini",      "o4-mini            (ChatGPT Plus · reasoning)",   "chatgpt", "o4-mini",         200, "fast reasoning · uses Plus quota"),
    ModelDef("chatgpt:o3-mini",      "o3-mini            (ChatGPT Plus · reasoning)",   "chatgpt", "o3-mini",         200, "deep reasoning · uses Plus quota"),
    # ── OpenAI ────────────────────────────────────────────────────────────────
    ModelDef("openai:gpt-4o",      "GPT-4o             (OpenAI · flagship)",        "openai", "gpt-4o",                         128, "fast · multimodal · great at code"),
    ModelDef("openai:gpt-4o-mini", "GPT-4o mini        (OpenAI · fast & cheap)",    "openai", "gpt-4o-mini",                    128, "quick tasks · low cost"),
    ModelDef("openai:o1",          "o1                 (OpenAI · deep reasoning)",   "openai", "o1",                             200, "best reasoning · slower · expensive"),
    ModelDef("openai:o3-mini",     "o3-mini            (OpenAI · fast reasoning)",   "openai", "o3-mini",                        200, "fast reasoning · balanced cost"),
    ModelDef("openai:gpt-4-turbo", "GPT-4 Turbo        (OpenAI · stable)",          "openai", "gpt-4-turbo",                    128, "reliable · well-tested"),
    # ── OpenRouter — Anthropic ────────────────────────────────────────────────
    ModelDef("openrouter:claude-sonnet-4-5", "Claude Sonnet 4.5  (via OpenRouter · excellent code)", "openrouter", "anthropic/claude-sonnet-4-5",      200, "best at coding tasks"),
    ModelDef("openrouter:claude-haiku",      "Claude Haiku 3.5   (via OpenRouter · fast/cheap)",     "openrouter", "anthropic/claude-3-5-haiku",        200, "quick tasks · cheapest Claude"),
    ModelDef("openrouter:claude-opus",       "Claude Opus 4      (via OpenRouter · most capable)",   "openrouter", "anthropic/claude-opus-4-5",         200, "heavyweight · expensive"),
    # ── OpenRouter — Google ───────────────────────────────────────────────────
    ModelDef("openrouter:gemini-flash",      "Gemini 2.0 Flash   (via OpenRouter · huge context)",   "openrouter", "google/gemini-2.0-flash-001",       1_000, "1M token context · fast"),
    ModelDef("openrouter:gemini-pro",        "Gemini 1.5 Pro     (via OpenRouter)",                  "openrouter", "google/gemini-pro-1.5",             2_000, "2M context · strong reasoning"),
    # ── OpenRouter — Meta / Open-source ──────────────────────────────────────
    ModelDef("openrouter:llama-70b",         "Llama 3.3 70B      (via OpenRouter · open-source)",    "openrouter", "meta-llama/llama-3.3-70b-instruct",  128, "open weights · fast · no data retention"),
    ModelDef("openrouter:deepseek-v3",       "DeepSeek V3        (via OpenRouter · strong coder)",   "openrouter", "deepseek/deepseek-chat",              64, "excellent at code · low cost"),
    ModelDef("openrouter:deepseek-v4-pro",   "DeepSeek V4 Pro    (via OpenRouter · heavy duty)",     "openrouter", "deepseek/deepseek-v4-pro",           128, "flagship · heavy tasks · auto-pairs with flash"),
    ModelDef("openrouter:deepseek-v4-flash", "DeepSeek V4 Flash  (via OpenRouter · lightwork)",      "openrouter", "deepseek/deepseek-v4-flash",         128, "fast · cheap · auto-used for simple turns"),
    ModelDef("openrouter:mistral-large",     "Mistral Large 2    (via OpenRouter)",                  "openrouter", "mistralai/mistral-large-latest",     128, "strong at code · European"),
    ModelDef("openrouter:qwen-coder",        "Qwen 2.5 Coder 32B (via OpenRouter)",                  "openrouter", "qwen/qwen-2.5-coder-32b-instruct",   32, "specialised code model · fast"),
]

_BY_ID: dict[str, ModelDef] = {m.id: m for m in MODELS}

_PROVIDER_LABELS = {
    "chatgpt":    "ChatGPT Plus  (OAuth — no API key needed)",
    "openai":     "OpenAI  (GPT-4o, o1, o3-mini …)",
    "openrouter": "OpenRouter  (Claude · Gemini · Llama · DeepSeek · 300+ models)",
}

_ENV_VAR: dict[str, str] = {
    "openai":     "OPENAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "chatgpt":    "",   # no key — uses Codex OAuth
}

_Q_STYLE = QStyle([
    ("qmark",       "fg:cyan bold"),
    ("question",    "bold"),
    ("answer",      "fg:cyan bold"),
    ("pointer",     "fg:cyan bold"),
    ("highlighted", "fg:cyan bold"),
    ("selected",    "fg:cyan"),
    ("separator",   "fg:cyan"),
]) if QStyle else None


# ── Interactive model picker ──────────────────────────────────────────────────

def pick_model(current_id: str | None = None) -> dict | None:
    """Full interactive wizard → returns model_cfg dict or None if cancelled."""
    if questionary is None:
        raise RuntimeError("questionary is not installed — run: pip install questionary rich")
    from rich.console import Console
    from rich.rule import Rule
    con = Console(highlight=False)

    con.print()
    con.print(Rule("[bold cyan]  Model Selection[/bold cyan]", style="cyan"))
    con.print()

    # 1. Provider
    provider = questionary.select(
        "AI Provider:",
        choices=[questionary.Choice(v, value=k) for k, v in _PROVIDER_LABELS.items()],
        style=_Q_STYLE,
    ).ask()
    if provider is None:
        return None

    # 2. Model
    provider_models = [m for m in MODELS if m.provider == provider]
    model_choices   = [
        questionary.Choice(f"{m.display:<52}  [{m.note}]", value=m.id)
        for m in provider_models
    ]
    model_choices.append(questionary.Choice("↩  Enter custom model ID…", value="_custom"))

    model_key = questionary.select(
        "Model:", choices=model_choices, style=_Q_STYLE,
    ).ask()
    if model_key is None:
        return None

    if model_key == "_custom":
        raw_id = questionary.text(
            f"Model ID (e.g. 'anthropic/claude-opus-4-5' for OpenRouter):",
            style=_Q_STYLE,
        ).ask()
        if not raw_id:
            return None
        model_def = None
        api_id    = raw_id.strip()
        display   = api_id
    else:
        model_def = _BY_ID[model_key]
        api_id    = model_def.api_id
        display   = model_def.display.strip()

    # 3. API key
    env_var     = _ENV_VAR.get(provider, "API_KEY")
    env_key     = os.environ.get(env_var, "")
    if env_key:
        con.print(f"[dim cyan]  Using {env_var} from environment.[/dim cyan]")
        api_key = env_key
    else:
        api_key = questionary.password(
            f"{env_var}:", style=_Q_STYLE,
        ).ask()
        if not api_key:
            return None

    return {
        "provider": provider,
        "model_key": model_key,
        "api_id":    api_id,
        "api_key":   api_key,
        "env_var":   env_var,
        "display":   display,
    }


# ── Client factory ────────────────────────────────────────────────────────────

def make_client(model_cfg: dict) -> Any:
    """Return an openai.OpenAI client configured for the provider."""
    import openai

    key      = model_cfg.get("api_key", "")
    provider = model_cfg.get("provider", "openai")

    if provider == "chatgpt":
        token = get_chatgpt_access_token()
        return openai.OpenAI(api_key=token)

    if provider == "openai":
        return openai.OpenAI(api_key=key)

    if provider == "openrouter":
        return openai.OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=key,
            default_headers={
                "HTTP-Referer": "https://iot-st-kitts.local",
                "X-Title": "IOT-ST-KITTS-CODE",
            },
        )

    if provider == "ollama":
        # Ollama exposes an OpenAI-compatible API at localhost:11434
        base_url = model_cfg.get("base_url", "http://localhost:11434/v1")
        return openai.OpenAI(base_url=base_url, api_key="ollama")

    # Fallback: honour an explicit base_url if provided (custom OpenAI-compatible endpoints)
    if base_url := model_cfg.get("base_url"):
        return openai.OpenAI(base_url=base_url, api_key=key or "none")

    return openai.OpenAI(api_key=key)


def validate_key(model_cfg: dict) -> tuple[bool, str]:
    """Ping the API with a zero-cost call. Returns (ok, error_message)."""
    try:
        client = make_client(model_cfg)
        # Cheapest possible call that verifies the key is valid
        client.chat.completions.create(
            model=model_cfg["api_id"],
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
        )
        return True, ""
    except Exception as exc:
        return False, str(exc)
