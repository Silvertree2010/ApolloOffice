# Plan format

plan_set takes the whole plan as one JSON object. Fields:

```
{
  "task": "the task in one or two sentences",
  "dir": "/absolute/work/folder (default: the work folder of the office)",
  "est": "short cost and time estimate for the user",
  "budget": { "tok": 2000000, "par": 3, "max": "sonnet" },
  "perm": {
    "fs": ["."],                      // folders workers may read and write, relative to dir; out/ of the office is always allowed
    "sh": ["npm test", "git diff *"], // false (default), a list of allowed command patterns (* = anything), or true for any command
    "net": ["api.github.com", "*.wikipedia.org"],
    "push": false,                    // git push
    "gh": false                       // GitHub CLI
  },
  "guard": true,                      // screen untrusted items with Guard (default true)
  "audit": 60,                        // minutes between your audits
  "hook": "",                         // optional https webhook (ntfy, Discord, Slack) for notifications
  "workers": [
    { "id": "scout", "name": "Scout", "model": "haiku", "prompt": "…", "tools": ["fetch", "write"], "n": 1, "turns": 20, "min": 10, "color": "#3fb6a8", "acc": "antenna" }
  ],
  "stages": [
    { "id": "find", "kind": "source", "worker": "scout", "task": "…", "spawn": "write", "every": 900, "max": 20, "untrusted": true },
    { "id": "write", "kind": "work", "worker": "writer", "task": "…", "to": ["test", "drop"], "check": "checks/has-file.js", "retry": 2 },
    { "id": "test", "kind": "code", "run": { "sh": "npm test", "min": 15 }, "to": ["done"], "fail": "write", "retry": 2 }
  ],
  "seed": [ { "ti": "first item", "d": { "url": "…" }, "st": "write" } ],
  "layout": {
    "rooms": [ { "name": "Research", "ws": ["scout"] }, { "name": "Writing", "ws": ["writer"] } ],
    "tiles": [ { "kind": "count", "label": "Reports done", "st": "done" }, { "kind": "chart", "label": "Done per day", "st": "done" } ]
  }
}
```

Workers:
- id: lowercase, unique, not done/drop/ceo/guard. name: shown in the dashboard.
- model: haiku, sonnet, opus (or a full claude-* id). Must not be above budget.max.
- tools: any of read, write, edit, grep, ls, sh, fetch, and custom tools as "tool:<name>" (file tools/<name>.js). No tools = a pure thinking step with 1 turn.
- n: how many copies may work in parallel. turns: max agent turns per item. min: timeout in minutes.
- color: #rrggbb. acc: one of none, tie, cap, antenna, shield, glasses, magnifier, pen, headset, hat, beanie, scarf, badge, apron, shades, headband, tophat.

Stages:
- kind "source": the worker runs every "every" seconds (min 30) and creates new items for the stage in "spawn", as long as fewer than "max" items wait there.
- kind "work": the worker takes one item at a time and answers with next (one of "to" or "drop"), data and optional spawn.
- kind "code": no model. Runs run.sh (must be allowed by perm.sh) in dir, or run.js (a check module). Exit 0 / ok goes to to[0], anything else goes to "fail" with the output as feedback. After "retry" failures the item is dropped. The command gets ITEM_ID, ITEM_FILE (JSON of the item) and OFFICE_OUT in its environment.
- check: optional check module that must say ok before the item moves on. On failure the same stage runs again with the reason as feedback, up to "retry" times, then the item goes to "fail" (default drop).
- untrusted: items created by this stage come from outside and pass Guard first.
- Targets: other stage ids, "done", "drop".

Items: { id, ti (title), d (data object) }. Workers receive the item and add fields through "data". Keep data small; long results belong in files (store the path).

Tiles: count (items in st), sum (sum of a numeric data field over st), text (fixed text), list (last titles or a field in st), chart (items reaching st per day). st defaults to done.

Custom tool module (tools/<name>.js), runs in a sandbox (no direct network or processes; files only inside the approved folders and out/). ctx paths are relative to dir; paths starting with out/ point to the office out/ folder:
```
export default {
  d: "what the tool does",
  s: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
  f: async (args, ctx) => {
    const r = await ctx.fetch("https://api.example.com/?q=" + encodeURIComponent(args.q)) // { status, text }, perm.net applies
    const o = await ctx.sh("npm test")                                                 // { c, o }, perm.sh applies
    ctx.write("out/x.txt", r.text); ctx.read("README.md"); ctx.ls("."); ctx.exists("a")
    return "a string or JSON-able value"
  }
}
```

Check module (checks/<name>.js):
```
export default async (item, ctx) => {
  if (!ctx.exists(item.d.file)) return { ok: false, why: "file missing" }
  return { ok: true, why: "", data: { size: 123 } }   // data is optional and is merged into the item
}
```
