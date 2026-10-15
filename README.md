# ApolloOffice

A local office of Claude workers. You give the CEO a task. It designs the team (workers, models, prompts), the pipeline, the checks and the dashboard, asks for the permissions it needs, and then runs the office on your own Claude account. You watch it work in a pixel office in your browser.

It grew out of a private office that fixes bugs in open-source repos. ApolloOffice is the general version: it can work on anything you can describe, such as fixing issues, researching a list of companies, sorting a folder of documents or writing a report.

## Install

Needs [Claude Code](https://claude.com/claude-code) (logged in) and Node.js 22.18 or newer.

As a Claude Code plugin:

```
/plugin marketplace add Silvertree2010/ApolloOffice
/plugin install apollo-office@apollo-office
```

Then ask Claude for an office, or use the skill directly:

```
/office new docs-sweep "Find outdated install instructions in docs/ and rewrite them" --dir ~/code/my-app
```

Without the plugin, clone the repo and use the CLI:

```
git clone https://github.com/Silvertree2010/ApolloOffice && cd ApolloOffice
bin/office new research "Collect pricing pages of 30 note-taking apps and write out/pricing.md" --dir ~/notes
```

## How it works

1. `office new` starts a small local daemon (`127.0.0.1:47300`) and opens the dashboard.
2. The CEO (Opus) reads your task and your work folder. It may ask questions in the dashboard chat. Then it writes a plan: workers, stages, checks, custom tools, layout, budget and the permissions it needs.
3. You review the plan in the dashboard. Every permission has a checkbox. Untick what you do not want; the office works without it.
4. You press **Start office**. Workers pick up items stage by stage. Cheap models (Haiku) do searching, sorting and checking; Sonnet writes code and careful text; Opus only where the CEO thinks it is needed and your budget allows it.
5. The CEO audits the office every hour and fixes what goes wrong (prompts, checks, stages). If a change needs new permissions, the office pauses until you approve them.

Results go to `~/.apollo-office/<name>/out/` unless the task says otherwise.

## Commands

```
office new <name> "<task>" [--dir <folder>] [--no-open]
office list | status [<name>] | open <name> | url <name>
office chat <name> "<message>"
office start <name>          approve everything that was requested and start (the dashboard is the better place)
office pause <name> | resume <name> | rm <name>
office daemon | quit
```

## The pieces

- **Workers**: a role, a model, a prompt and a set of tools (`read`, `write`, `edit`, `grep`, `ls`, `sh`, `fetch`, plus custom tools written by the CEO).
- **Stages**: `source` stages create items on a timer, `work` stages hand one item to a worker, `code` stages run a command (for example the test suite) without a model. Items move along the stages until they are `done` or `drop`ped.
- **Checks**: small JS modules that decide by code whether a result is good enough, for example "the file exists" or "the tests pass". A failed check sends the item back with the reason as feedback.
- **Guard**: text from outside (web pages, issues, mails) goes through a Haiku prompt-injection screen first, and workers only ever see it marked as untrusted data.
- **Budget**: a daily token limit, a limit on parallel workers and a highest allowed model. When your Claude plan hits its limit, the office pauses until the reset. It never switches to an API key on its own.

The full plan format is in [prompts/plan.md](prompts/plan.md). [examples/github-bugfix.json](examples/github-bugfix.json) is a complete example.

## Security

ApolloOffice lets a model write code that runs on your machine, so it is built around limits you can see:

- Workers run as headless Claude Code sessions without your hooks, plugins, CLAUDE.md or memory, and with no built-in tools. They only get the office tools their role needs.
- File tools only reach the folders you approved and the office `out/` folder.
- Shell commands must match the approved patterns. Command chaining is checked segment by segment, command substitution needs full shell access, and `sudo`, credential stores, SSH keys and destructive `rm` are always blocked. `git push` and `gh` need their own approval.
- Network access only goes to approved domains.
- Custom tools and checks run in a separate Node process with the Node permission model (files only in approved folders), without direct network, child processes or native addons. Network and shell go through the same approved lists.
- The dashboard only listens on 127.0.0.1 and rejects requests from other origins.

What remains: with "any shell command" approved, a worker can do anything your user can do in a shell. Only approve it for folders and tasks where that is acceptable. Prompt injection screening reduces risk but is not perfect, so be careful with offices that read untrusted text and also have write, shell or push permissions.

## Development

```
npm test        # engine, permissions, sandbox and an end-to-end run against a fake Claude
npm run daemon  # run the daemon in the foreground
```

No build step and no dependencies: plain Node with type stripping.

## License

AGPL-3.0. The pixel figures come from ClawdCrab by the same author.
