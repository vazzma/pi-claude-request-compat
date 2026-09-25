import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createOAuthRequestMiddleware } from "../src/request.js";
import { xxhash64 } from "../src/xxhash64.js";

const IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
const MODEL = {
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com",
  id: "claude-opus-4-8",
  compat: { supportsContextManagement: true }
};
const PROFILE = {
  schema: 1,
  claudeVersion: "2.1.280",
  recipeId: "cli-2.1.280-omp-f89a6db",
  installId: "local-install-id",
  cacheMain: "long"
};

function fetchFixture(accountId = "account-123", status = 200, errorBody = "") {
  const calls = [];
  const fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, init });
    if (url.includes("/api/claude_cli/bootstrap")) {
      return Response.json({ oauth_account: { account_uuid: accountId } });
    }
    return new Response(errorBody, { status });
  };
  return { fetch, calls };
}

function payload({ tools = [{ name: "Read", input_schema: { type: "object" } }], thinking } = {}) {
  return {
    model: MODEL.id,
    stream: true,
    max_tokens: 128000,
    system: [{ type: "text", text: IDENTITY, cache_control: { type: "ephemeral", ttl: "1h" } }],
    tools,
    messages: [
      { role: "user", content: [{ type: "text", text: "Please read this file." }] },
      { role: "assistant", content: [
        { type: "tool_use", id: "tool-1", name: "Read", input: {} },
        { type: "tool_addition", tool: { type: "tool_reference", name: "Read" } },
        { type: "tool_removal", tool: { type: "tool_reference", name: "Read" } }
      ] }
    ],
    betas: ["claude-code-20250219", "context-1m-2025-08-07", "fine-grained-tool-streaming-2025-05-14"],
    ...(thinking ? { thinking } : {})
  };
}

test("XXH64 matches published byte vectors used by the wire attestation", () => {
  assert.equal(xxhash64(Buffer.from("")).toString(16), "ef46db3751d8e999");
  assert.equal(xxhash64(Buffer.from("a")).toString(16), "d24ec4f1a98c6e5b");
  assert.equal(xxhash64(Buffer.from("abc")).toString(16), "44bc2cf5ad770999");
});

test("OAuth request emits account metadata, prefixed tools, selected betas, headers and a patched billing hash", async () => {
  const { fetch, calls } = fetchFixture();
  const context = { messages: [{ role: "system", content: [], toolsAdded: [{ name: "read" }] }] };
  const middleware = createOAuthRequestMiddleware(PROFILE);
  const options = middleware(MODEL, context, {
    apiKey: "sk-ant-oat-test-request-1",
    requestPurpose: "main",
    sessionId: "session-123",
    fetch
  });
  assert.equal(options.cacheRetention, "long");
  const transformed = await options.onPayload(payload(), MODEL);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/claude_cli\/bootstrap\?/);
  assert.equal(transformed.max_tokens, 64000);
  assert.equal(transformed.tools[0].name, "_read");
  assert.equal(transformed.messages[1].content[0].name, "_read");
  assert.equal(transformed.messages[1].content[1].tool.name, "_read");
  assert.equal(transformed.messages[1].content[2].tool.name, "_read");
  assert.equal(options.decodeToolName("_read", [{ name: "read" }]), "read");
  assert.equal(transformed.system[0].text.startsWith("x-anthropic-billing-header:"), true);
  assert.equal(transformed.system[1].text, IDENTITY);
  assert.equal(transformed.betas.includes("context-1m-2025-08-07"), false);
  assert.equal(transformed.betas.includes("extended-cache-ttl-2025-04-11"), true);
  assert.equal(transformed.betas.includes("fine-grained-tool-streaming-2025-05-14"), true);
  assert.equal(transformed.betas.includes("structured-outputs-2025-12-15"), false);
  const metadata = JSON.parse(transformed.metadata.user_id);
  assert.equal(metadata.session_id, "session-123");
  assert.equal(metadata.account_uuid, "account-123");
  assert.match(metadata.device_id, /^[0-9a-f]{64}$/);

  await options.fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(transformed)
  });
  assert.equal(calls.length, 2);
  const request = calls[1];
  assert.equal(request.init.headers.get("user-agent"), "claude-cli/2.1.280 (external, cli)");
  assert.equal(request.init.headers.get("x-claude-code-session-id"), "session-123");
  assert.equal(request.init.headers.get("x-stainless-package-version"), "0.112.1");
  const sent = request.init.body.toString();
  assert.equal(sent.includes("cch=00000"), false);
  const match = /cch=([0-9a-f]{5})/.exec(sent);
  assert.ok(match);
  const unpatched = sent.replace(`cch=${match[1]}`, "cch=00000");
  const expected = (xxhash64(Buffer.from(unpatched), 0x4d659218e32a3268n) & 0xfffffn)
    .toString(16).padStart(5, "0");
  assert.equal(match[1], expected);
  const firstUserText = "Please read this file.";
  const selected = [4, 7, 20].map((index) => firstUserText[index]).join("");
  const suffix = createHash("sha256").update(`59cf53e54c78${selected}2.1.280`).digest("hex").slice(0, 3);
  assert.equal(transformed.system[0].text,
    `x-anthropic-billing-header: cc_version=2.1.280.${suffix}; cc_entrypoint=cli; cch=00000;`);
});

test("utility OAuth request removes agent-only betas and keeps short cache", async () => {
  const { fetch } = fetchFixture("account-utility");
  const options = createOAuthRequestMiddleware(PROFILE)(MODEL, { messages: [] }, {
    apiKey: "sk-ant-oat-test-utility",
    requestPurpose: "utility",
    fetch
  });
  assert.equal(options.cacheRetention, undefined);
  const transformed = await options.onPayload(payload({ tools: [] }), MODEL);
  assert.equal(transformed.betas.includes("claude-code-20250219"), false);
  assert.equal(transformed.betas.includes("structured-outputs-2025-12-15"), true);
  assert.equal(transformed.betas.includes("fallback-credit-2026-06-01"), false);
});

test("OAuth thinking request clamps its budget to the output ceiling and enables effort beta", async () => {
  const { fetch } = fetchFixture("account-thinking");
  const options = createOAuthRequestMiddleware(PROFILE)(MODEL, { messages: [] }, {
    apiKey: "sk-ant-oat-test-thinking",
    fetch
  });
  const transformed = await options.onPayload(
    payload({ tools: [], thinking: { type: "enabled", budget_tokens: 90000 } }), MODEL
  );
  assert.equal(transformed.max_tokens, 64000);
  assert.equal(transformed.thinking.budget_tokens, 62976);
  assert.equal(transformed.betas.includes("effort-2025-11-24"), true);
  assert.equal(transformed.betas.includes("fallback-credit-2026-06-01"), true);
});

test("API-key and nonofficial endpoints retain the exact original options", () => {
  const middleware = createOAuthRequestMiddleware(PROFILE);
  const keyOptions = { apiKey: "sk-ant-api03-example" };
  assert.strictEqual(middleware(MODEL, { messages: [] }, keyOptions), keyOptions);
  const proxyOptions = { apiKey: "sk-ant-oat-example" };
  assert.strictEqual(middleware({ ...MODEL, baseUrl: "https://example.invalid" }, { messages: [] }, proxyOptions), proxyOptions);
});

test("header-owned OAuth token works and preserves explicit cache and metadata", async () => {
  const { fetch, calls } = fetchFixture();
  const options = createOAuthRequestMiddleware(PROFILE)(MODEL, { messages: [] }, {
    headers: { Authorization: "Bearer sk-ant-oat-header-token" },
    cacheRetention: "short",
    fetch
  });
  assert.equal(options.cacheRetention, "short");
  const input = payload({ tools: [] });
  input.metadata = { user_id: JSON.stringify({ session_id: "provided-session", account_uuid: "provided-account" }) };
  const transformed = await options.onPayload(input, MODEL);
  assert.equal(calls.length, 0);
  assert.equal(JSON.parse(transformed.metadata.user_id).account_uuid, "provided-account");
  await options.fetch("https://api.anthropic.com/v1/messages", { body: JSON.stringify(transformed) });
  assert.equal(calls[0].init.headers.get("x-claude-code-session-id"), "provided-session");
});

test("an unreviewed identity layout fails before an OAuth request is sent", async () => {
  const { fetch, calls } = fetchFixture();
  const options = createOAuthRequestMiddleware(PROFILE)(MODEL, { messages: [] }, {
    apiKey: "sk-ant-oat-test-layout",
    fetch
  });
  await assert.rejects(options.onPayload({ ...payload(), system: [] }, MODEL), /identity layout changed/);
  assert.equal(calls.length, 0);
});

test("old Claude Code version response produces an actionable stale-recipe error", async () => {
  const { fetch } = fetchFixture("account-stale", 400, '{"error":"claude_code_version_too_old"}');
  const options = createOAuthRequestMiddleware(PROFILE)(MODEL, { messages: [] }, {
    apiKey: "sk-ant-oat-test-stale",
    fetch
  });
  const transformed = await options.onPayload(payload(), MODEL);
  await assert.rejects(
    options.fetch("https://api.anthropic.com/v1/messages", { body: JSON.stringify(transformed) }),
    /reviewed recipe is available/
  );
});
