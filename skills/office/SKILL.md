---
name: office
description: Create and run an ApolloOffice, a local team of Claude workers that a CEO designs for a task, with a live pixel dashboard. Use when the user says /office, wants an "office" or "team of agents/workers" for a task, or asks about the state of an existing office.
---

ApolloOffice runs a local daemon on http://127.0.0.1:47300 that hosts offices. Each office has a CEO (Claude Opus) that designs workers, stages, checks and a dashboard for the user's task, then runs them with the user's own Claude Code login.

Run the CLI with:

```
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" <command>
```

Commands:
- `new <name> "<task>" [--dir <folder>]`: create an office. The name is lowercase letters, digits and dashes. The work folder defaults to the current directory. The dashboard opens in the browser and the CEO starts designing.
- `list`, `status [<name>]`: show offices, items, workers, the last CEO message and pending approvals.
- `chat <name> "<message>"`: send a message to the CEO (answers show up in the dashboard and in `status`).
- `open <name>`, `url <name>`: open the dashboard or print its URL.
- `pause <name>`, `resume <name>`, `rm <name>`, `quit` (stops the daemon).

How to handle a request:
1. If the user gave no task, ask what the office should do and in which folder. Otherwise derive a short name and run `new`. Pass the task in the user's own words.
2. Tell the user the dashboard URL. The CEO may ask questions in the dashboard chat; relay them if the user asks you, and pass answers back with `chat`.
3. Starting the office means approving permissions (files, shell commands, network, git push). The user approves them in the dashboard, where each one can be unticked. Do NOT run `start` yourself. Only run it if the user explicitly tells you to start the office after seeing the requested permissions in `status`.
4. Never run `rm` without the user asking for it in this conversation.

Requirements: Node.js 22.18 or newer and Claude Code logged in. Everything runs locally; offices live in ~/.apollo-office/<name>/ (deliverables in out/).
