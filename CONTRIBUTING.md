# Contributing to speq-tools

## Before You Start

Read the [SpeQ Specification](https://github.com/speq-ai/speq) first.
The CLI is a direct implementation of that spec. Changes to behavior must be grounded in the spec — not convenience or personal preference.

## What We Welcome

- Bug fixes with a clear reproduction case
- Spec compliance improvements (parser, validator)
- Platform support (Windows, Linux ARM)
- Performance improvements with benchmarks
- Documentation improvements that are accurate and minimal

## What We Do Not Accept

- New features that are not in the spec (open a spec issue first)
- Dependency additions without strong justification
- Style-only changes
- Breaking changes to the `.speq` format without a spec update

## Development Setup

```bash
git clone https://github.com/speq-ai/speq-tools
cd speq-tools
npm install
npm run build
npm run typecheck
npm run lint
```

## Submitting a PR

1. Fork the repository
2. Create a branch: `fix/parser-edge-case` or `feat/windows-support`
3. Write or update tests if applicable
4. Run `npm run lint` and `npm run typecheck` before pushing
5. Open a PR with a clear description of what changes and why

## Code Style

- `npm run lint` (ESLint + TypeScript) is the law
- No uncaught exceptions in library code — handle errors and surface them to the user
- Errors must be actionable (tell the user what to do, not just what went wrong)
- Secrets never in logs, never in error messages

## Questions

Open a [Discussion](https://github.com/speq-ai/speq-tools/discussions) rather than an issue for questions.
