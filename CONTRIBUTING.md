# Contributing to enthropic-tools

## Before You Start

Read the [Enthropic Specification](https://github.com/enthropic-spec/enthropic) first.
The CLI is a direct implementation of that spec. Changes to behavior must be grounded in the spec — not convenience or personal preference.

## What We Welcome

- Bug fixes with a clear reproduction case
- Spec compliance improvements (parser, validator)
- Platform support (Windows, Linux ARM)
- Performance improvements with benchmarks
- Documentation improvements that are accurate and minimal

## What We Do Not Accept

- New features that are not in the spec (open a spec issue first)
- Dependency additions without strong justification (this is a single-binary tool)
- Style-only changes
- Breaking changes to the `.enth` format without a spec update

## Development Setup

```bash
git clone https://github.com/enthropic-spec/enthropic-tools
cd enthropic-tools
cargo build
cargo test
cargo clippy --all-targets -- -D warnings
```

## Submitting a PR

1. Fork the repository
2. Create a branch: `fix/parser-edge-case` or `feat/windows-support`
3. Write or update tests if applicable
4. Run `cargo fmt` and `cargo clippy` before pushing
5. Open a PR with a clear description of what changes and why

## Code Style

- `cargo fmt` is the law
- No `unwrap()` in library code — use `?` and `anyhow`
- Errors must be actionable (tell the user what to do, not just what went wrong)
- Secrets never in logs, never in error messages

## Questions

Open a [Discussion](https://github.com/enthropic-spec/enthropic-tools/discussions) rather than an issue for questions.
