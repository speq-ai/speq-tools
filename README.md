<p align="center">
  <img src="assets/banner.svg?v=2" alt="speq"/>
</p>

<p align="center">
  <a href="https://github.com/speq-ai/speq-tools/actions/workflows/ci.yml"><img src="https://github.com/speq-ai/speq-tools/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <a href="https://github.com/speq-ai/speq-tools/actions/workflows/lint.yml"><img src="https://github.com/speq-ai/speq-tools/actions/workflows/lint.yml/badge.svg" alt="Lint"/></a>
  <a href="https://github.com/speq-ai/speq-tools/actions/workflows/codeql.yml"><img src="https://github.com/speq-ai/speq-tools/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"/></a>
  <a href="https://github.com/speq-ai/speq-tools/actions/workflows/security-scan.yml"><img src="https://github.com/speq-ai/speq-tools/actions/workflows/security-scan.yml/badge.svg" alt="Security Scan"/></a>
  <a href="https://securityscorecards.dev/viewer/?uri=github.com/speq-ai/speq-tools"><img src="https://api.securityscorecards.dev/projects/github.com/speq-ai/speq-tools/badge" alt="OpenSSF Scorecard"/></a>
  <a href="https://slsa.dev"><img src="https://slsa.dev/images/gh-badge-level3.svg" alt="SLSA 3"/></a>
</p>

<p align="center">
  CLI companion for the <a href="https://github.com/speq-ai/speq">SpeQ</a> spec format.
</p>

---

A `.speq` file is the architectural contract of your project. Entities, constraints, layer boundaries, naming conventions. Write it once. Every AI session reads it before touching a single line of code.

The CLI validates your spec, tracks build progress, and produces the context block you paste into any AI assistant. Have an existing codebase? `speq reverse` reads it and generates a starter spec.

## Install

<p align="center">
  <a href="https://www.npmjs.com/package/@speq-ai/speq">
    <img src="https://img.shields.io/badge/npm_install_--g_@speq-ai/speq-ffafff?style=for-the-badge&labelColor=cc55cc&color=ffafff" alt="npm install -g speq"/>
  </a>
</p>

```sh
npm install -g @speq-ai/speq
```

Requires Node.js 20+. No telemetry.

<p align="center">
  <img src="assets/screen-speq1.png" alt="speq cli" width="760"/>
  <br/>
  <img src="assets/screen-speq2.png" alt="speq cli" width="760"/>
</p>

## Commands

All commands are also available interactively - just run `speq`.

| Command | Description |
|---|---|
| `speq guide` | quick start guide for new users |
| `speq new` | create a new `.speq` spec with AI |
| `speq update [file]` | refine an existing spec with AI |
| `speq check [file]` | validate + lint, errors and warnings grouped by severity |
| `speq context [file]` | generate the AI context block from your spec and state |
| `speq state show [file]` | show build progress *(automation in progress)* |
| `speq state set <entity> <status> [file]` | update entity status *(automation in progress)* |
| `speq reverse [dir]` | reverse-engineer a codebase into a starter spec *(in development)* |
| `speq open` | open a project in `$EDITOR` |
| `speq delete` | delete a project |
| `speq setup` | configure AI provider, API key, and model |

`[file]` defaults to the `.speq` file in `~/.speq/workspace/<project>/`.

## Generated files

`speq check` on a valid spec creates:

**`state_[name].speq`** - build progress, updated as you work.

```
STATE myapp

  ENTITY
    user              PENDING
    session           PENDING
    order             PENDING

  LAYERS
    API               PENDING
    SERVICE           PENDING
    STORAGE           PENDING
```

---

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-lightgrey.svg" alt="MIT"/></a>
  &nbsp;
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20+-brightgreen.svg" alt="Node.js 20+"/></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/@speq-ai/speq"><img src="https://img.shields.io/badge/npm-v0.1.4-ffafff.svg" alt="npm v0.1.3"/></a>
</p>
