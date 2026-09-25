# pi-claude-request-compat

[![npm version](https://img.shields.io/npm/v/pi-claude-request-compat?logo=npm)](https://www.npmjs.com/package/pi-claude-request-compat)
[![CI](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/ci.yml)
[![Security audit](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/security.yml)
[![CodeQL](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/vazzma/pi-claude-request-compat/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/github/license/vazzma/pi-claude-request-compat)](LICENSE)

Use Anthropic OAuth in Pi through an explicit **Claude Compat** model selection. Keep Pi's tools and workflow—no Claude Code installation needed.

## Why this exists

A valid login is only part of the story: Claude Code's OAuth requests also carry specific headers, billing information, session metadata, and tool names. This extension adds those details using Pi's Anthropic transport. The dedicated provider rejects API keys, custom endpoints, redirects, and invalid request envelopes before sending a Messages request. Errors never retry through the ordinary Anthropic provider.

The idea and request behavior came from **oh-my-pi (omp)**—credit where it's due ([NOTICE](NOTICE)). This project builds on that work as a small extension for stock Pi, with automatic setup, a bundled compatibility profile that doesn't depend on your installed Claude version, and tests through the real Pi SDK. A separate comparison tool checks captured Claude requests and reports differences rather than assuming they match.

## Get started

```sh
pi install npm:pi-claude-request-compat
```

Requires Pi **0.87.1** and Node **22.19+**. Run `/login claude-compat` in Pi, then use `/model` to choose a **[Compat]** model. Pi manages this separate OAuth login and token refresh using its built-in Anthropic login flow.

**Upgrading from 0.1.3:** ordinary `anthropic` models are no longer patched. Select Claude Compat and log in once; existing Anthropic credentials are not copied.

Setup is automatic, including migration of older profiles. The credential-free profile lives at `~/.pi/agent/claude-request-compat/profile.json` (or under `PI_CODING_AGENT_DIR`).

The footer shows `Compat active`, the profile, and the last local validation state. `/claude-compat-status` explains the current route; `pi-claude-request-compat doctor` checks the local profile.

### Prevent missing-plugin fallback

Pi can fall back to another provider when a saved model disappears. For a startup that fails if Compat is unavailable, use explicit selection:

```sh
pi --provider claude-compat --model claude-opus-4-8
# Equivalent convenience launcher (CLI must be on PATH):
pi-claude-request-compat run
pi-claude-request-compat run --model claude-opus-4-8 -- --continue
```

This pins the startup model, including resumed sessions. Starting plain `pi` with only a saved default does **not** provide missing-plugin protection. You can still deliberately select another provider during a session. Requests still consume subscription usage; this is not a spending cap.

## Developer checks

```sh
npm ci
npm test
# Compare with a specific Claude executable:
npm run compat:check -- --claude-version 2.1.282 --claude /path/to/claude
```

See [the comparison guide](https://github.com/vazzma/pi-claude-request-compat/blob/main/compat/README.md) for offline replay and capture details. The checked-in Claude 2.1.156 reference currently reports **DIFF**; passing unit tests does not mean matching Claude requests.

## Security and transparency

- CodeQL, weekly dependency audits, signature checks, and Dependabot update PRs.
- Commit-pinned workflow actions and [npm releases with signed provenance](https://www.npmjs.com/package/pi-claude-request-compat).
- Pi manages your login. The extension uses your token in memory for Anthropic requests and account lookup; it stores no credentials in its profile and has no telemetry endpoint of its own.

[Security policy](https://github.com/vazzma/pi-claude-request-compat/blob/main/SECURITY.md) · [Report a vulnerability privately](https://github.com/vazzma/pi-claude-request-compat/security/advisories/new). Badges show check results, not a security certification.

## Limits

The bundled profile (`oauth-wire-v1`, reference **2.1.282**) follows request behavior studied from omp. It is not proven 1:1 Claude Code compatibility. Tests use the real Pi SDK, but Claude captures use synthetic credentials and a local gateway—not live Anthropic acceptance.

Pi keeps its own prompts and agent behavior. If Anthropic rejects the bundled version, the extension needs an update. Subscription use remains subject to Anthropic's terms.
