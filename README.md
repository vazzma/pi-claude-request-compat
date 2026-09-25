# pi-claude-request-compat

Use your Anthropic OAuth login in Pi with Claude Code compatible requests. The extension adjusts the request body, headers, and tool names while keeping Pi's built-in Anthropic models, login, streaming, and retries. API-key requests are left alone.

## Why another Claude Code provider?

- It isn't a second provider: it keeps Pi's Anthropic login and model catalog.
- It adds the OAuth billing attestation, Claude Code headers and beta flags, session metadata, and tool-name mapping; Pi still handles Anthropic streaming and retries.
- It only changes official Anthropic OAuth requests. API-key and proxy requests pass through unchanged.

## Get started

Requires `@earendil-works/pi-coding-agent` 0.87.1, Node 22.19+, and Claude Code **2.1.280** on `PATH`. This is the only Claude Code version with a reviewed recipe. Other versions, including 2.1.282, are rejected when an OAuth request starts.

The published npm version 0.1.0 still has the startup error. Until 0.1.1 is published, install this checkout:

```sh
cd /path/to/pi-claude-request-compat
npm install --ignore-scripts
pi install .
pi
```

In Pi, run `/login anthropic` and select an Anthropic model. The extension uses Pi's own OAuth credentials; it does not import Claude Code's login.

After 0.1.1 is published, use `pi install npm:pi-claude-request-compat`. Stock Pi no longer needs the patch in [`patches/pi-host.patch`](patches/pi-host.patch).

## Limits

Compatibility is checked against a specific Claude Code version. A new version needs a reviewed recipe. No live Anthropic acceptance is claimed yet. Subscription use may be subject to Anthropic's terms.

Run `npm test` for local request and extension tests. See [`NOTICE`](NOTICE) for provenance.
