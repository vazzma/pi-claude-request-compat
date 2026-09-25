# pi-claude-request-compat

Adds Claude Code OAuth request compatibility to Pi while retaining Pi's
built-in Anthropic provider.

This Pi package addresses the Claude Code OAuth request gaps documented in OMP.
It uses Pi's built-in Anthropic provider, OAuth login and refresh, model
catalog, message streaming, and retry handling. It does not register another
provider or alter Anthropic API-key calls.

## Status

This is an implementation draft against Pi commit
`7fd564cbb78f35f3de14d5382fea692b87ec4026`. The required Pi transport
hook is in [`patches/pi-host.patch`](patches/pi-host.patch). The extension fails
clearly on an unpatched Pi. Stock Pi cannot run this package until that hook is
merged upstream or applied locally. The package has not been published.

## Install from a local checkout

Apply the host patch in a checkout of the pinned Pi commit and run that patched
Pi build:

```sh
cd /path/to/pi
git apply /path/to/pi-claude-request-compat/patches/pi-host.patch
```

The patch adds one OAuth-scoped request middleware hook to Pi's Anthropic
transport and marks main-session calls for cache policy. It does not replace
Pi's provider.

From this package directory, initialize the profile before loading the
extension, then register the directory as a local Pi package:

```sh
node bin/pi-claude-request-compat.js init
pi install .
```

For a one-time run, use `pi -e .` instead of `pi install .`. Users can install
the GitHub source with `pi install git:github.com/vazzma/pi-claude-request-compat`;
they still need a patched Pi and the local `init` command.

The command reads the installed `claude --version` and saves a local profile at
`~/.pi/agent/claude-request-compat/profile.json` (or under
`PI_CODING_AGENT_DIR`). Use `--claude /path/to/claude` if needed. The profile
contains an installation ID,
the detected version, and the reviewed recipe ID. It contains no OAuth token.
Only Claude Code `2.1.280` has a recipe in this draft. An unknown version is
rejected rather than treated as compatible from its version number alone. The
command reads the official CLI version and creates a local installation ID;
it does not read Claude Code's private state or generate a reusable wire hash.

Run `node bin/pi-claude-request-compat.js doctor` to compare the current CLI
version with the profile. This check is offline. Sign in to your own account through
Pi's `/login anthropic`; Claude Code's own login is not imported. When Pi makes
the first OAuth inference request, the extension uses the token to ask the
Claude CLI bootstrap endpoint for the account UUID if available. Bootstrap
failure leaves the account field out and does not replace Pi's login or refresh.

## Request boundary

The middleware changes only official `anthropic` provider requests with a Pi
OAuth token, including a bearer token supplied through `ANTHROPIC_AUTH_TOKEN`.
It composes with Pi's existing payload callback and per-request fetch. It adds
the billing system block, computes the body hash after SDK
serialization, applies conditional betas and the OAuth output clamp, and maps
wire tool names back to Pi names on streamed responses. Pi's API-key branch is
untouched. Main calls default to one-hour caching; other calls keep Pi's
five-minute default, and explicit `cacheRetention` always wins. If Anthropic
rejects the pinned Claude Code version, the request fails with an actionable
stale-recipe error; version changes require a reviewed recipe update.

The stored profile is not a reusable billing hash. The suffix depends on the
first user message; `cch` depends on the exact serialized request body. Both
are calculated per request.

## Validation

Run `npm test` in this folder for dependency-free, local mocked tests. These
cover the profile command, OAuth-only routing, account metadata, conditional
betas, tool names, headers, and serialized billing attestation. They do not
contact Anthropic. From the pinned Pi checkout, check the host patch with
`git apply --check /path/to/pi-claude-request-compat/patches/pi-host.patch`. A full Pi type/style check
requires Pi's development dependencies; live OAuth acceptance remains untested.

## Provenance and limits

Behavior was examined at OMP `f89a6db15e9de4db1f08f6eb4ec8d1a901ca07f7`
and Pi `7fd564cbb78f35f3de14d5382fea692b87ec4026` on 2026-09-23. See
[`NOTICE`](NOTICE) for attribution. The recipe must be reviewed after relevant
Claude Code, OMP, or Pi changes. No claim of live Anthropic acceptance is made
without user-initiated validation on that user's own account.

Subscription OAuth and Claude Code fingerprinting may carry account and terms
risks. Review Anthropic's current terms before distributing this package.
