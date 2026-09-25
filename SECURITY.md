# Security policy

## Report a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/vazzma/pi-claude-request-compat/security/advisories/new).
Include the affected package version, reproduction steps, and likely impact.
Use synthetic credentials and redact tokens, account IDs, and conversation content.
Please keep exploitable details out of public issues until a fix is available.

Security fixes target the latest published version. Older releases are not
maintained separately. This is a community project with no guaranteed response SLA.

## Credentials and data

- Pi owns login and credential storage. This extension receives the OAuth token
  in memory to adapt official Anthropic requests; it does not store that token
  in its profile.
- The local profile stores a random installation ID, cache preference, schema
  version, and creation time. New profile files use owner-only permissions on
  systems that support POSIX permissions.
- When account metadata is missing, the extension can send an authenticated
  bootstrap request to `https://api.anthropic.com/api/claude_cli/bootstrap`.
  Adapted messages include account, device, and session metadata.
- The extension has no telemetry collection endpoint of its own. Request
  content still goes to the configured model provider through Pi.
- The `claude-compat` provider accepts OAuth only and validates its final
  Messages envelope before sending. It rejects API keys, nonofficial endpoints,
  and redirects. Ordinary `anthropic` models are not modified.
- Pi stores a separate `claude-compat` OAuth credential using its existing
  Anthropic login/refresh implementation. Existing credentials are not copied.
- A missing extension cannot enforce policy. Use explicit `--provider
  claude-compat --model <id>` or `pi-claude-request-compat run` to block startup
  fallback; plain Pi may fall back from missing saved models. Local validation
  is neither proof of server acceptance nor a subscription spending cap.
- The developer capture harness uses synthetic credentials and a local gateway;
  it is not an operating-system sandbox.

## Automated checks and supply chain

| Control | Evidence / scope |
| --- | --- |
| CodeQL | [Workflow](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/codeql.yml) scans JavaScript and GitHub Actions on PRs, main, and weekly; findings appear in code scanning. |
| Dependency audit | [Workflow](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/security.yml) fails on known moderate-or-higher vulnerabilities and verifies registry signatures and available attestations. It also runs weekly to detect newly disclosed issues. |
| Dependency review | [Workflow](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/dependency-review.yml) checks dependency changes in PRs for moderate-or-higher vulnerabilities. |
| Dependabot | [Configuration](.github/dependabot.yml) proposes weekly npm and GitHub Actions updates for review. Updates are not automatically merged. |
| Secret protection | GitHub secret scanning and push protection are enabled for supported secret patterns. |
| Release provenance | [Publish workflow](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/publish.yml) tests and audits before publishing with `npm publish --provenance`. Check a release's provenance on npm. |

Workflow actions are pinned to commit hashes, checkout does not persist Git
credentials, and dependency installation disables lifecycle scripts. Jobs receive
only the permissions they need; publishing additionally needs an npm token and
OIDC permission to generate provenance.

Run the dependency checks locally with:

```sh
npm ci --ignore-scripts
npm audit --audit-level=moderate
npm audit signatures
```

A passing workflow means its checks completed; CodeQL findings must also be
reviewed in the Security tab. Signatures and provenance establish origin and
build traceability, not that code is harmless. These controls are not an
independent security audit or a guarantee of Claude Code compatibility.
