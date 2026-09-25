# pi-claude-request-compat

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
