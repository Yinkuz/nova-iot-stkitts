#!/usr/bin/env python3
"""Logo options preview — run and pick your favourite."""
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from rich.console import Console
from rich.panel import Panel
from rich.columns import Columns
from rich.text import Text
from rich.rule import Rule
from rich import box

console = Console(highlight=False, width=160)

OPTIONS = {

"A  ·  LYRA": """\
   .---------.
  /  ◉     ◉  \\
 |    (_____)   |
 |    |     |   |
  \\___| === |__/
      |     |
   .--+-----+--.
  /   |     |   \\
 |    |     |    |
  \\__/|     |\\__/
      |     |
     _|     |_
    (_)     (_)""",

"B  ·  KAI": """\
    .~~~~~~.
   / -    - \\
  |  \\   /  |
  |   ---   |
   \\ _____ /
    '-___-'
    /|   |\\
   / |   | \\
  /  |   |  \\
     |   |
   __|   |__
  (  )   (  )""",

"C  ·  NOVA": """\
  ╭───────────╮
  │  ●       ●  │
  │    ╰─╯    │
  │  ────────  │
  ╰─────┬─────╯
      ╔═╧═╗
      ║░░░║
      ║░░░║
      ╚═╤═╝
       ╱ ╲
      ╱   ╲
    ╔╧╗   ╔╧╗
    ╚═╝   ╚═╝""",

"D  ·  ZARA": """\
      ______
    .´  __ `.
   / ´ /  \\ `\\
  | ´(  ◕◕  )`|
  | ´ \\____/ `|
   \\`._______./
     |       |
   __|       |__
  |   -------   |
  |_____________|
     |       |
    _|       |_
   (_)       (_)""",

}

console.print()
console.print(Rule("[bold cyan]  IOT-ST-KITTS-CODE  ·  Logo Candidates  [/bold cyan]", style="cyan"))
console.print()

panels = []
for title, art in OPTIONS.items():
    t = Text(art, justify="center")
    t.stylize("bold bright_cyan")
    panels.append(
        Panel(
            t,
            title=f"[bold white]{title}[/bold white]",
            border_style="cyan",
            box=box.ROUNDED,
            padding=(1, 3),
        )
    )

console.print(Columns(panels, equal=True, expand=True))
console.print()
console.print("[dim cyan]  Reply with A, B, C, or D and I'll wire it in as the live logo.[/dim cyan]")
console.print()
