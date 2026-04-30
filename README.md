# pi-model-cycler

Interactive model switcher for [Pi coding agent](https://pi.dev) — browse, search, favorite, and cycle models directly from the terminal.

```
/model-picker       Open the interactive picker
Ctrl+Alt+M          Quick shortcut to open the picker
Ctrl+Shift+L        Cycle through your favorite models
```

![TUI interactive](https://img.shields.io/badge/TUI-interactive-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Pi extension](https://img.shields.io/badge/pi-extension-purple)
![npm](https://img.shields.io/npm/v/pi-model-cycler)

---

## Why?

Pi has a rich model registry, but switching models mid-session is tedious — you either remember exact model IDs or guess. `pi-model-picker` gives you a full-screen TUI to visually browse providers, search by name, mark favorites, and switch with one keystroke.

- **Browse** all models grouped by provider
- **Filter** by typing any part of the name, ID, or provider
- **Favorite** models with Space for quick cycling
- **See what's active** — current model is marked `(current)`
- **Cycle** through favorites with a single shortcut

---

## Installation

### From npm (recommended)

```bash
pi install npm:pi-model-cycler
```

Then restart Pi.

### Manual (local)

```bash
# Clone or copy the extension directory
git clone https://github.com/baflow/pi-model-cycler.git ~/.pi/agent/extensions/pi-model-cycler
```

Then restart Pi.

> **Note:** The extension loads from `~/.pi/agent/extensions/pi-model-cycler/`. Make sure the directory contains `index.ts` and `tsconfig.json`.

---

## Usage

### Open the picker

```
/model-picker
```

Or use the shortcut: **`Ctrl+Alt+M`**

A full-screen TUI opens showing all available models grouped by provider:

```
╭── Model Picker ───────────────────────────────────────────────────╮
│ ◎  type to filter...                                              │
│                                                                   │
│ ─── ollama-cloud ──────────────────────────────────────────────── │
│ > ★  DeepSeek V4 Pro           ollama-cloud/deepseek-v4-pro       │
│   ☆  DeepSeek V4 Flash         ollama-cloud/deepseek-v4-flash     │
│   ★  Gemini 3 Flash Preview    ollama-cloud/gemini-3-flash-preview│
│   ★  GLM 5.1                   ollama-cloud/glm-5.1               │
│   ★  Gemma4:31b                ollama-cloud/gemma4:31b            │
│   ☆  Kimi K2.6 (current)      ollama-cloud/kimi-k2.6             │
│   ★  MiniMax M2.7              ollama-cloud/minimax-m2.7          │
│                                                                   │
│ ↑↓ = nav  Enter = pick  Space = fav  Esc = close                  │
╰───────────────────────────────────────────────────────────────────╯
```

### Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate through models |
| `Enter` | Select model and switch session |
| `Space` | Toggle favorite (★) |
| `Esc` / `q` | Close without switching |
| Type any text | Filter models by name, ID, or provider |
| `Backspace` | Remove last character from filter |

### Cycle favorites

**`Ctrl+Shift+L`** — cycles through your favorited models one by one. Useful for quick A/B comparisons between models.

The cycle order matches the order models appear in the picker (sorted by provider, then by name). Wraps around when reaching the end.

---

## Configuration

### Favorites

Favorites are stored in `~/.pi/agent/extensions/pi-model-cycler/favorites.json`:

```json
[
  "ollama-cloud/deepseek-v4-pro",
  "ollama-cloud/kimi-k2.6",
  "ollama-cloud/gemini-3-flash-preview"
]
```

You can edit this file directly. Entries are `provider/model-id` strings matching Pi's model registry keys.

---

## How it works

The extension uses Pi's built-in APIs:

- **`ctx.modelRegistry.getAvailable()`** — fetches all registered models with metadata (provider, ID, name, reasoning support, context window, token limits, costs)
- **`pi.setModel(model)`** — switches the current session model
- **`ctx.ui.custom()`** — renders a custom TUI component as an overlay
- **`ctx.model`** — reads the currently active model

No external dependencies. Zero network calls. The extension is a single TypeScript file (`~5KB` after stripping types).

---

## Key bindings reference

All shortcuts are registered globally in Pi:

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Ctrl+Alt+M` | Open picker | Opens the interactive model picker |
| `Ctrl+Shift+L` | Cycle favorite | Cycles through favorited models |

To change shortcuts, edit the `pi.registerShortcut()` calls in `index.ts`.

---

## Tips

1. **Filter is fuzzy-ish** — typing `deep` matches `deepseek-v4-pro`, `deepseek-v4-flash`
2. **Star your top 3-5 models** — then use `Ctrl+Shift+L` to rotate through them during a session
3. **No favorites set?** Cycle does nothing (shows a warning)
4. **Combined with pi-prompt-template-model** — use the picker for session-wide switching, and templates for one-shot model overrides
5. **The picker shows all available models** including those from multiple providers (Anthropic, OpenAI, Ollama Cloud, etc.)

---

## Development

```bash
# Make changes to index.ts
# Restart Pi to reload the extension
```

The extension has a minimal footprint: one file, no build step, no external npm packages beyond Pi's own API.

---

## Acknowledgments

This extension builds on the Pi coding agent ecosystem. Special thanks to:

- **[pi-subagents](https://github.com/nicobailon/pi-subagents)** by [nicopreme](https://github.com/nicobailon) — the TUI overlay rendering (`ctx.ui.custom()`) and component architecture that powers the model picker's UI was inspired by pi-subagents' approach to interactive components. pi-subagents also complements this extension perfectly: use the picker to set a session model, then delegate tasks to subagents with different models via pi-subagents' `subagent({model: "..."})`.

---

## License

MIT
