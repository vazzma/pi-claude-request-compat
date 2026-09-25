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

Requires Pi 0.87.1, Node 22.19+, and Claude Code **2.1.280** on `PATH`. This is the only version with a reviewed compatibility recipe. You don't need to create or import config, or sign in to Claude Code. On the first Anthropic OAuth request, the extension reads `claude --version` and creates its own profile at `~/.pi/agent/claude-request-compat/profile.json`; it contains no credentials.

In Pi, run `/login anthropic` and choose an Anthropic model. Pi uses its own OAuth login. Other Claude Code versions, including 2.1.282, are currently rejected.

## Limits

Compatibility is checked against a specific Claude Code version. A new version needs a reviewed recipe. No live Anthropic acceptance is claimed yet. Subscription use may be subject to Anthropic's terms.

Run `npm test` for local request and extension tests. See [`NOTICE`](NOTICE) for provenance.
