<h1 align="center">ApolloOffice</h1>

<p align="center">
  A small office of AI workers that turns GitHub issues into verified pull
  requests, on your own computer and with your own accounts.
</p>

<p align="center">
  <a href="https://github.com/Silvertree2010/ApolloOffice/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Silvertree2010/ApolloOffice/ci.yml?branch=main&amp;label=CI" alt="CI"></a>
  <a href="https://github.com/Silvertree2010/ApolloOffice/releases/latest"><img src="https://img.shields.io/github/v/release/Silvertree2010/ApolloOffice" alt="Latest release"></a>
  <a href="https://github.com/Silvertree2010/ApolloOffice/releases"><img src="https://img.shields.io/github/downloads/Silvertree2010/ApolloOffice/total" alt="Downloads"></a>
  <img src="https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-supported-2b2b2b" alt="Windows, macOS and Linux">
  <img src="https://img.shields.io/badge/status-beta-cc785c" alt="Status: beta">
  <img src="https://img.shields.io/badge/Rust-single%20binary-B7410E?logo=rust&amp;logoColor=white" alt="Rust, single binary">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License: AGPL-3.0"></a>
</p>

<p align="center"><a href="https://office.apollonet.dev">Website</a></p>

![The office: a pixel floor with one desk per worker, the queue, pull requests and the log on the right](docs/images/office.png)

Add any GitHub repository. ApolloOffice picks up its bug reports (or hunts for
bugs itself), reproduces them, writes a fix with a regression test, proves the
test fails without the fix and passes with it, runs the project's tests,
reviews the change and opens a pull request. Nothing goes through a server of
ours.

> [!WARNING]
> ApolloOffice is in beta. Expect bugs, and please
> [report them](https://github.com/Silvertree2010/ApolloOffice/issues).

> [!NOTE]
> Every pull request waits for your approval by default, with the diff, the
> proof and an editable PR text. You can switch a repository to submit on its
> own.

For optional free-model authors with Codex/Claude subscription review, see
[the free-first guide](docs/free-first.md).

## What's inside

- **A fixed pipeline** of small workers: Scout, Guard, Vet, Hunter, Repro,
  Fixer, CI, Reviewer, Submit and Watcher, each at its own desk.
- **Proof, not trust.** ApolloOffice itself checks that the test is red
  without the fix and green with it, and that your test command passes.
- **Any provider per worker.** Claude Code or Codex with your own login, or
  Claude, OpenAI and Gemini with an API key, or a local model through Ollama.
  Click the gear on a worker's card to change it.
- **Docker isolation** on this computer or any machine you reach with `ssh`.
  The GitHub token never leaves your computer.
- **Watcher** follows your open PRs: merges, review requests from maintainers
  and merge conflicts, which it rebases on its own.
- **API** for bug reports from your own tools (error trackers, CI, scripts):
  `POST /v1/report` with a token from Settings. Reports go through Guard and
  Vet like issues.
- **Error trackers and CI**: Sentry and GlitchTip alerts arrive through a
  webhook link from Settings, and a failed GitHub Actions run can report itself
  (see below). The same error lands in one report.
- **Costs** per job, worker and repository, a daily budget in USD for API keys
  (overall or per repository), and a table of which model gets merged how often
  at what cost, with a hint when a cheaper one does as well.
- **Sign in** with a one-time link or your Google account, notifications by
  ntfy or Discord, and automatic updates.

## Install

You need `git` (on Windows: Git for Windows), the [GitHub CLI][gh] logged in
with `gh auth login`, and at least one provider: [Claude Code][cc] or Codex
logged in, an API key, or Ollama. Docker is recommended.

Download the binary for your system from the [latest release][rel] and run it:

```sh
apollo-office
```

It prints a one-time login link. Open it and follow the setup: add a machine,
add a repository, check its test command.

```sh
apollo-office login-link      # new login link (10 minutes)
apollo-office autostart on    # start at login (Windows, macOS, Linux)
apollo-office status
```

Options: `--port` (default 47300), `--data <folder>`.

## Report failed CI runs

Add a workflow that sends failed runs of your CI on the default branch to the
office. The office has to be reachable from GitHub, for example through a
tunnel. Store its address and an API token as repository secrets.

```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
jobs:
  report:
    if: github.event.workflow_run.conclusion == 'failure'
    runs-on: ubuntu-latest
    permissions:
      actions: read
    steps:
      - uses: Silvertree2010/ApolloOffice/report@main
        with:
          url: ${{ secrets.APOLLO_OFFICE_URL }}
          token: ${{ secrets.APOLLO_OFFICE_TOKEN }}
```

## AI disclosure

Every commit carries `Co-Authored-By` trailers for the models that worked on
it, and every PR text says it was generated with AI by ApolloOffice. This is
always on: many projects require it, and hiding it can get you banned.

## License

[AGPL-3.0](LICENSE)

[gh]: https://cli.github.com
[cc]: https://claude.com/claude-code
[rel]: https://github.com/Silvertree2010/ApolloOffice/releases/latest
