# Developer compatibility checks

## Two independent layers

1. `npm test`: offline regression tests, including the real pinned Pi provider
   and Anthropic SDK. Transport is intercepted and returns synthetic SSE. Covers
   OAuth in `apiKey` and in an owned Authorization header, beta serialization,
   tool declarations, profile creation/migration, and independently generated
   long/Unicode seeded XXH64 vectors. Stub tests cover response-name decoding.
2. `npm run compat:check`: a black-box observation from an actual Claude CLI,
   compared with Pi's serialized request. Differences fail the command.

## Capture a reference

Supply an already-installed **native executable** at an exact version. The
checker verifies `--version` and records the executable's SHA-256. It does not
download or update Claude and does not change your normal Claude installation.
For a script/launcher, the hash covers only that file, not its dependencies;
native executables are the reproducible reference format.

```sh
npm run compat:check -- --claude-version 2.1.282 --claude /path/to/pinned/claude \
  --record compat/fixtures/claude-2.1.282-gateway.json
```

Each scenario gets an empty temporary home/config/work directory, synthetic
OAuth credentials, no loaded settings/MCP servers/skills, and a local HTTP
Messages endpoint returning `OK`. Tools are never requested by the synthetic
response. Normal user credentials are not inherited. Background traffic is
disabled via CLI settings/environment; this is not an OS-level network sandbox.
Do not use `--bare`, which disables OAuth and attribution.

The harness currently runs two scenarios on `claude-opus-4-8`:

- `utility`: tools disabled, thinking disabled, a short fixed prompt. This is a
  harness label, not a claim that Claude routes it as an internal utility call.
- `tools-thinking`: the built-in Read tool with high-effort adaptive thinking.
  Pi receives the captured tool schema so schema conversion drift is observable.

Record output is sanitized, never contains raw auth or prompt bodies, and refuses
to overwrite a file. CLI version, executable hash, timestamp, model, and scope
travel with every fixture. A record is written even if comparison returns DIFF.

Exit status: **0** = all scoped fields match; **1** = differences; **2** = error or
incomplete capture. Version mismatch, missing request, timeout or invalid fixture
must never become a passing comparison.

## What is compared

Scope `gateway-synthetic-oauth-envelope-v1` compares model, stream, token limit,
thinking, output config, beta set, x-app, SDK version, billing block position,
identity-block presence, system cache markers, tool names/schemas/cache/strict,
metadata types and session-header consistency. Random IDs are normalized by
shape. Beta order is ignored. Other fields remain visible as differences.

Excluded: complete prompts/messages, billing checksum value, user-agent/runtime
platform values, authentication values, retry/recovery behavior, multi-turn
history, full response handling, built-in tool semantics and direct endpoint
acceptance. A PASS means only that this finite projection matches.

`ANTHROPIC_BASE_URL` changes Claude behavior. In particular, attribution and
gateway hints can differ from direct requests. Do not tune the production
adapter just to erase gateway differences. Keep observed differences until
their relevance to the direct OAuth path is established.

The checked-in 2.1.156 capture is **diagnostic evidence**, not a parity baseline
or a supported CLI version. It reports differences in betas, SDK version,
thinking, identity, cache policy and tool serialization. CI checks that this
negative control really reports DIFF. No 2.1.282 capture or live acceptance has
been established yet.

## Updating the adapter

Capture the proposed reference version, review the focused differences, and
change `src/recipes.js` only for a verified protocol change. Keep provenance
explicit and add relevant regression coverage. Do not add an installed-version
allowlist. User profiles store identity/preferences only, so an extension update
can select a new bundled protocol without requiring users to rerun setup.

The public Claude Code repository is not a library-level runtime oracle; no
submodule is needed for these black-box checks.
