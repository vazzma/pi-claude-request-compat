# pi-claude-request-compat

[![npm version](https://img.shields.io/npm/v/pi-claude-request-compat?logo=npm)](https://www.npmjs.com/package/pi-claude-request-compat)
[![CI](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/ci.yml)
[![Security audit](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/security.yml)
[![CodeQL](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/github/license/vazzma/pi-claude-request-compat)](LICENSE)

Use your Anthropic OAuth login in Pi with Claude Code compatible requests. The extension adjusts the request body, headers, and tool names while keeping Pi's built-in Anthropic models, login, streaming, and retries. API-key requests are left alone.

## Why another Claude Code provider?

- It isn't a second provider: it keeps Pi's Anthropic login and model catalog.
- It adds the OAuth billing attestation, Claude Code headers and beta flags, session metadata, and tool-name mapping; Pi still handles Anthropic streaming and retries.
- It only changes official Anthropic OAuth requests. API-key and proxy requests pass through unchanged.

## Install

```sh
pi install npm:pi-claude-request-compat
```

## Setup

Requires Pi **0.87.1** and Node **22.19+**. Claude Code is not required.

In Pi, run `/login anthropic` and choose an Anthropic model. That's it.

The extension automatically creates a credential-free profile at
`~/.pi/agent/claude-request-compat/profile.json` (or under `PI_CODING_AGENT_DIR`).
Existing profiles migrate automatically, preserving installation identity and
cache preference. Installing or updating Claude Code has no effect on Pi.

Optional diagnostics: `pi-claude-request-compat doctor`. Optional pre-creation:
`pi-claude-request-compat init`. Neither requires Claude Code or a network call.

## Developer checks

```sh
npm ci
npm test
# Compare a pinned Claude executable against the real Pi provider/SDK:
npm run compat:check -- --claude-version 2.1.282 --claude /path/to/claude
# Replay checked-in reference evidence offline:
npm run compat:check -- --reference compat/fixtures/claude-2.1.156-gateway.json
```

The offline reference currently reports **DIFF**, intentionally: it was captured
from Claude 2.1.156, predates the bundled profile and uses gateway mode. A green
unit-test suite does not mean a successful Claude comparison. See
[`compat/README.md`](compat/README.md) for capture scope and fixture maintenance.

## Security and transparency

- **Automated scanning:** CodeQL for JavaScript and workflow code, weekly
  dependency vulnerability audits, and dependency signature verification.
- **Reviewed updates:** Dependabot opens update PRs; dependency review checks
  newly introduced vulnerabilities. Workflow actions are pinned to commit hashes.
- **Traceable releases:** npm releases are published from GitHub Actions with
  signed provenance. Follow the provenance link on the
  [npm package page](https://www.npmjs.com/package/pi-claude-request-compat).
- **Credential handling:** Pi owns your login. The extension's local profile
  contains no credentials; it uses your OAuth token in memory for Anthropic
  requests and account bootstrap. It has no telemetry endpoint of its own.

See [the security policy](https://github.com/vazzma/pi-claude-request-compat/blob/main/SECURITY.md)
for data handling and check scope, or
[report a vulnerability privately](https://github.com/vazzma/pi-claude-request-compat/security/advisories/new).
Badges link to check results; they are not a security certification.

## Limits

The bundled protocol profile (`oauth-wire-v1`, reference version **2.1.282**) is
derived from oh-my-pi, not proven direct Claude Code parity. It changes only when
the protocol needs updating, rather than for every local CLI upgrade. Server
rejection of the bundled version requires an extension update.

Tests cover local request behavior and real Pi/SDK serialization. Reference
captures use synthetic OAuth and a local gateway; gateway behavior differs from
direct `api.anthropic.com` behavior. They do not establish full wire equivalence,
agent behavior equivalence, or live Anthropic acceptance. Pi retains its own
prompts, tools, orchestration and retries. Subscription use may be subject to
Anthropic's terms.

See [`NOTICE`](NOTICE) for provenance.
