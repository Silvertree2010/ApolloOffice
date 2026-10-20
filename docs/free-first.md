# Optional free authors and subscription review

This mode is opt in. Normal provider selection, repository settings and the
existing pipeline remain available when it is disabled. Start the controller
with `APOLLO_OFFICE_FREE_FIRST=1` to use free API authors followed by the existing
Codex and Claude Code subscription clients. These clients must already be
installed and signed in; a subscription is not an unlimited or free API account.
No new subscription credentials are stored by this feature.

The default author sequence is NVIDIA Nemotron, Mistral Ministral, Codex CLI,
then Claude Code. An explicitly selected OpenCode author precedes these routes.
Each failed free attempt passes bounded concrete diagnostics to the next route.
The existing retry limits still apply. Subscription reviewers review candidates;
a rejected review is retained as a pending lesson with evidence and a patch hash.
Lessons are never automatically promoted into trusted instructions. Approval is
still required to publish free-first work, including resumed jobs.

Free API access is account specific. Set `APOLLO_OFFICE_FREE_APPROVALS` to a
private operator-maintained JSON file. Each approved route needs an entry under
`providers` containing `provider`, `model`, `base_url`,
`user_approved_free_only: true`, `billing_disabled_verified: true`,
`tool_calling_verified: true`, and a future Unix-seconds `expires_at`.
Use the exact provider URL and model from the selected route. Missing, expired
or mismatched approval blocks that route. Do not declare billing disabled
without checking the actual account. Paid API models and endpoint overrides are
refused in this mode; no API key implies a free entitlement by itself.

Rate limits belong to their provider. A Claude CLI limit suppresses Claude
without pausing Codex or the free routes. Manual pause, token and cost limits
remain effective; this mode does not remove operator budgets. A working login
or installed executable is not evidence that a live coding task can finish.

Optional independent acceptance checks are documented in
[quality/README.md](../quality/README.md). They freeze behavioral checks against
the original revision before the author starts, then require those same checks
to pass on the fix. Runtime setup detects a single supported Python CI version
and prepares a project virtualenv on the worker. Model shell commands use that
venv even after entering a subdirectory. Setup still requires network access
and remains untrusted repository execution on the isolated worker.

## OpenCode ACP adapter (Linux, optional)

This adapter uses the unmodified client from
[jovylle/hermes-opencode-acp](https://github.com/jovylle/hermes-opencode-acp).
It requires an existing compatible Hermes Python runtime (the upstream client
imports Hermes modules), that plugin checkout, OpenCode CLI, and bubblewrap.
It is separate from Apollo's core and from its normal CLI-only installation.

Set these variables in the environment of both the adapter and controller:

```
APOLLO_OFFICE_OPENCODE_SOCKET=/absolute/private-state/bridge.sock
```

For the adapter additionally configure:

```
APOLLO_OPENCODE_STATE=/absolute/private-state
APOLLO_OPENCODE_BINARY=/absolute/path/to/real/opencode
APOLLO_OPENCODE_PLUGIN=/absolute/path/to/hermes-opencode-acp/plugin
```

Run using the Hermes-compatible Python environment:

```
python adapters/opencode/refresh_catalog.py
python adapters/opencode/opencode_bridge.py
```

The actual `models opencode --verbose --refresh` metadata must explicitly list
active models with zero input, output and cache costs. Catalogs expire after
24 hours. New stealth/free models appear in the catalog automatically, but this
is discovery, not a successful coding benchmark. Only tested adapter routes are
selectable in Apollo; currently `opencode/beam-free` and
`opencode/deepseek-v4.1-flash-free`. Enable a route in the controller with e.g.
`APOLLO_OFFICE_OPENCODE_AUTHORS=opencode:opencode/beam-free`.
Existing API and subscription fallback routes stay in the sequence.

The launcher requires bubblewrap, uses an isolated home and does not mount the
repository or inherit provider keys, user config or external plugins. OpenCode
native actions are permission-cancelled and represented as controller requests.
The adapter never executes requested repo actions: Apollo's existing worker
read/edit/shell tools execute them and return their actual results on the next
turn. The projected MCP catalog itself cannot execute actions. The socket is
local and mode 0600. There is no public TCP inference endpoint, WARP, IP rotation
or automatic paid fallback. Use a dedicated worker account for untrusted code.

```
cargo test --locked
python3 -m unittest discover -s quality -p 'test_*.py'
python3 -m unittest discover -s adapters/opencode -p 'test_*.py'
```

Tests include real subprocess red/green verification, bounded planner repair,
provider-limit separation, tool-intent mapping, history preservation and refusal
of stale or paid models. Unit doubles are not live provider success evidence.

## Interpreting execution evidence

`evidence_summary` attributes a failure to the model that produced it. The raw
routing entry's `feedback` is input for the next attempt and describes its
predecessor. An accepted code author is reported only after successful regression
proof and review; intermediate attempts remain identified separately.

Regression test names, independent acceptance checks and full-suite totals are
different quantities. New CI runs retain their actual command, candidate, exit
status and output tail; reruns replace stale CI evidence. Historical runs without
that record report null. Worker system tool inventory does not establish the
active project Python version. Missing evidence must remain unknown.

Report API tokens receive status, acceptance status and model names only. Full
private diffs and execution records require the existing owner session at
`GET /api/report?id=...`; `GET /v1/reports` does not enumerate these artifacts.

Free-first model shell calls are limited to three minutes. CI and repository
setup retain their own requested timeouts within the overall job deadline.
GNU coreutils timeout is used on compatible workers; other platforms retain the
controller process watchdog. CI capacity is released when work is cancelled.
Diagnosis review is best effort, cannot approve an already rejected candidate,
and cannot promote a lesson. Missing or duplicate verifier result markers are
infrastructure errors; behavioral or candidate compilation failures remain
repair feedback.
