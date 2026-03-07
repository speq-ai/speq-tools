# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately via GitHub Security Advisories:
[https://github.com/speq-ai/speq-tools/security/advisories/new](https://github.com/speq-ai/speq-tools/security/advisories/new)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive a response within 72 hours. We aim to patch and disclose within 14 days.

## Security Model

SpeQ handles API keys and project secrets. The security boundaries are:

| Asset | Storage | Protection |
|-------|---------|------------|
| API keys | `~/.speq/global.keys` | ChaCha20-Poly1305 encrypted |
| Key encryption key | `~/.speq/global.key` | chmod 600, never leaves disk |
| Project secrets | `~/.speq/[project].secrets` | ChaCha20-Poly1305 encrypted |
| Vault status file | `vault_[name].speq` | SET/UNSET only — no values |
| Spec file | `[name].speq` | Plaintext — contains no secrets |

**Values never appear in:** the spec file, version control, chat history, logs, or network traffic.

## Known Limitations

- Keys stored in `~/.speq/` are protected by filesystem permissions only. Full-disk encryption is recommended on multi-user systems.
- The tool does not verify TLS certificates beyond the defaults of the underlying HTTP client. Use on trusted networks.
