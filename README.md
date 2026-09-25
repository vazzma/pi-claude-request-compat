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
hook is in [`patches/pi-host.patch`](patches/pi-host.patch). Stock Pi cannot run
the extension until that hook is merged upstream or applied locally. The npm
package has not been published; `pi install npm:pi-claude-request-compat` will
work only after publication. A successful package installation alone does not
make the extension usable on stock Pi.

## Install

First, use a Pi checkout at the pinned commit, apply the host patch, and run
that patched Pi build. The patch is pinned to that source revision; verify it
against any other Pi version before using it.

```sh
cd /path/to/pi
git checkout 7fd564cbb78f35f3de14d5382fea692b87ec4026
git apply --check /path/to/pi-claude-request-compat/patches/pi-host.patch
git apply /path/to/pi-claude-request-compat/patches/pi-host.patch
npm install --ignore-scripts
npm run build
```

The patch adds one OAuth-scoped request middleware hook to Pi's Anthropic
transport and marks main-session calls for cache policy. It does not replace
Pi's provider.

Install the package with that Pi build. Until it is published, use a local
checkout or the GitHub source:

```sh
./pi-test.sh install /path/to/pi-claude-request-compat
# or: ./pi-test.sh install git:github.com/vazzma/pi-claude-request-compat
./pi-test.sh
```

After publication, use `./pi-test.sh install npm:pi-claude-request-compat`
from the patched Pi checkout. Once the hook is available in a released Pi,
use `pi install npm:pi-claude-request-compat` instead. Pi
discovers `src/extension.js` from the `pi.extensions` package manifest. For a
one-time local run, use
`./pi-test.sh -e /path/to/pi-claude-request-compat`.

On first load, the extension reads the installed `claude --version` and saves a
local profile at `~/.pi/agent/claude-request-compat/profile.json` (or under
`PI_CODING_AGENT_DIR`). Claude Code must be on `PATH` and have a reviewed
recipe. If it is elsewhere, initialize the profile from a checkout before
starting Pi:

```sh
node bin/pi-claude-request-compat.js init --claude /path/to/claude
```

The profile contains an installation ID, the detected version, and the
reviewed recipe ID. It contains no OAuth token.
Only Claude Code `2.1.280` has a recipe in this draft. An unknown version is
rejected rather than treated as compatible from its version number alone. The
command reads the official CLI version and creates a local installation ID;
it does not read Claude Code's private state or generate a reusable wire hash.

Run `node bin/pi-claude-request-compat.js doctor` from a checkout to compare
the current CLI version with the profile. This check is offline. If the
installed Claude Code version changes, run `init` again after a matching
reviewed recipe is available. Sign in to your own account through Pi's
`/login anthropic`; Claude Code's own login is not imported. When Pi makes
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

## Publish to npm (maintainers)

The package manifest already declares the Pi extension entry point and the
`pi-package` discovery keyword. Before a release, verify the pinned host patch
and recipe against the Pi and Claude Code versions you intend to support, then
run:

```sh
npm test
npm pack --dry-run
npm login
npm publish --access public
```

Publication needs npm ownership of the package name. Check that
`pi-claude-request-compat` is available with
`npm view pi-claude-request-compat version` before publishing, or choose a scoped name
and update the installation instructions. For later releases, update the
`version` in `package.json` before publishing. The `prepublishOnly` script runs
the local tests as a release gate. Publishing does not install or patch Pi for
users; the host hook remains a prerequisite.
