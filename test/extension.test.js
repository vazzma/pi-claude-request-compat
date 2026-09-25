import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { createAssistantMessageEventStream, streamSimpleAnthropic, getModel } from "@earendil-works/pi-ai/compat";
import claudeCompat, { createFallbackStream } from "../src/extension.js";
import { COMPAT_API, COMPAT_PROVIDER } from "../src/strict.js";
import { sseResponse } from "../compat/scenarios.js";

test("registers an OAuth-only provider, independent of the legacy host hook", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-claude-compat-extension-"));
  const originalPath = process.env.PATH;
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PATH = root; // No Claude installation needed.
    process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");

    let provider;
    const handlers = {};
    const commands = {};
    await claudeCompat({
      registerAnthropicOAuthRequestMiddleware() { assert.fail("Must not patch the ordinary provider"); },
      registerProvider(value) { provider = value; },
      on(name, callback) { handlers[name] = callback; },
      registerCommand(name, config) { commands[name] = config; }
    });
    assert.equal(provider.id, COMPAT_PROVIDER);
    assert.equal(provider.auth.apiKey, undefined);
    assert.equal(provider.auth.oauth.isSubscription, true);
    assert.equal(typeof provider.auth.oauth.refresh, "function");
    assert.ok(provider.getModels().length > 0);
    assert.ok(provider.getModels().every((model) => model.provider === COMPAT_PROVIDER && model.api === COMPAT_API));
    const statuses = [];
    const notices = [];
    const ctx = { model: provider.getModels()[0], ui: {
      setStatus: (_key, text) => statuses.push(text), notify: (text) => notices.push(text)
    } };
    handlers.session_start({}, ctx);
    assert.match(statuses.at(-1), /Compat active.*not sent/);
    await commands["claude-compat-status"].handler("", ctx);
    assert.match(notices.at(-1), /OAuth only/);
    handlers.model_select({}, { ...ctx, model: { provider: "anthropic" } });
    assert.match(statuses.at(-1), /Compat inactive/);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("stock Pi registers Compat without requiring a profile at startup", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-claude-compat-stock-"));
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PI_CODING_AGENT_DIR = root;
    let registered;
    await claudeCompat({ registerProvider(provider) { registered = provider; }, on() {}, registerCommand() {} });
    assert.equal(registered.id, COMPAT_PROVIDER);
    assert.equal(typeof registered.streamSimple, "function");
    await assert.rejects(fs.access(path.join(root, "claude-request-compat", "profile.json")));
  } finally {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("strict route blocks non-OAuth and unexpected endpoints before any provider call", async () => {
  let calls = 0;
  const stream = createFallbackStream(() => { calls++; assert.fail("Unexpected dispatch"); }, createAssistantMessageEventStream, { strict: true });
  const model = { ...getModel("anthropic", "claude-opus-4-8"), provider: COMPAT_PROVIDER, api: COMPAT_API };
  const cases = [
    [model, {}],
    [model, { apiKey: "sk-ant-api-key" }],
    [model, { apiKey: "sk-ant-oat-test", headers: { "x-api-key": "paid-key" } }],
    [model, { apiKey: "sk-ant-oat-test", headers: { Authorization: "Bearer sk-ant-oat-other" } }],
    [{ ...model, baseUrl: "https://proxy.test" }, { apiKey: "sk-ant-oat-test" }],
    [{ ...model, baseUrl: "http://api.anthropic.com" }, { apiKey: "sk-ant-oat-test" }],
    [{ ...model, baseUrl: "https://api.anthropic.com:8443" }, { apiKey: "sk-ant-oat-test" }],
    [{ ...model, provider: "anthropic" }, { apiKey: "sk-ant-oat-test" }]
  ];
  for (const [candidate, options] of cases) {
    const result = await stream(candidate, { messages: [] }, options).result();
    assert.equal(result.stopReason, "error");
    assert.match(result.errorMessage, /Claude Compat/);
  }
  assert.equal(calls, 0);
});

test("strict route validates real SDK wire requests and preserves tool history across turns", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-compat-strict-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  t.after(async () => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  });
  const states = [];
  const stream = createFallbackStream(streamSimpleAnthropic, createAssistantMessageEventStream, {
    strict: true, onState: (state) => states.push(state)
  });
  const model = { ...getModel("anthropic", "claude-opus-4-8"), provider: COMPAT_PROVIDER, api: COMPAT_API };
  const context = { messages: [
    { role: "system", content: [{ type: "text", text: "Test" }], toolsAdded: [
      { name: "Read", description: "Read", parameters: { type: "object", properties: {} } }
    ] },
    { role: "user", content: [{ type: "text", text: "Read a file" }], timestamp: 0 }
  ] };
  const bodies = [];
  const options = {
    headers: { Authorization: "Bearer sk-ant-oat-strict-fixture" },
    maxRetries: 0,
    metadata: { user_id: JSON.stringify({ account_uuid: "fixture", session_id: "fixture-session" }) },
    fetch: async (input, init) => {
      assert.equal(new URL(input).pathname, "/v1/messages");
      assert.equal(init.redirect, "error");
      assert.equal(states.at(-1), "validated");
      bodies.push(JSON.parse(Buffer.from(init.body).toString()));
      return new Response(sseResponse(model.id, "_Read"), { headers: { "content-type": "text/event-stream" } });
    }
  };
  const result = await stream(model, context, options).result();
  assert.equal(result.stopReason, "toolUse", result.errorMessage);
  assert.equal(result.provider, COMPAT_PROVIDER);
  assert.equal(result.api, COMPAT_API);
  assert.equal(result.content[0].name, "Read");
  const second = await stream(model, { messages: [...context.messages, result,
    { role: "toolResult", toolCallId: result.content[0].id, toolName: "Read", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 1 }
  ] }, options).result();
  assert.equal(second.stopReason, "toolUse", second.errorMessage);
  assert.equal(bodies[1].messages.find((message) => message.role === "assistant").content.find((block) => block.type === "tool_use").name, "_Read");
  assert.equal(result.provider, COMPAT_PROVIDER, "input history must not be mutated");
  const failed = await stream(model, context, { ...options, onPayload: () => ({ system: [] }) }).result();
  assert.equal(failed.stopReason, "error");
  assert.equal(bodies.length, 2, "invalid payload must not reach transport or fall back");
  assert.equal(states.at(-1), "error");
});

test("stock Pi wrapper leaves API keys alone and decodes OAuth tool names", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-claude-compat-stream-"));
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  const originalPath = process.env.PATH;
  try {
    process.env.PI_CODING_AGENT_DIR = root;
    await fs.writeFile(path.join(root, "claude"), "#!/bin/sh\necho '2.1.280 (Claude Code)'\n", { mode: 0o755 });
    process.env.PATH = `${root}${path.delimiter}${originalPath ?? ""}`;
    await fs.mkdir(path.join(root, "claude-request-compat"));
    await fs.writeFile(path.join(root, "claude-request-compat", "profile.json"), JSON.stringify({
      schema: 1, installId: "test-install", claudeVersion: "2.1.280",
      recipeId: "cli-2.1.280-omp-f89a6db", cacheMain: "long"
    }));
    const calls = [];
    const message = { role: "assistant", provider: "anthropic", model: "test", content: [
      { type: "toolCall", id: "tool-1", name: "_Bash", arguments: {} }
    ], stopReason: "toolUse" };
    const stream = createFallbackStream((model, context, options) => {
      calls.push(options);
      const events = createAssistantMessageEventStream();
      queueMicrotask(() => {
        events.push({ type: "toolcall_start", contentIndex: 0, partial: message });
        events.push({ type: "done", message });
        events.end();
      });
      return events;
    }, createAssistantMessageEventStream);
    const model = { provider: "anthropic", id: "test", baseUrl: "https://api.anthropic.com" };
    const context = { messages: [{ toolsAdded: [{ name: "Bash" }] }] };
    const keyOptions = { apiKey: "sk-ant-api-key" };
    const keyResult = await stream(model, context, keyOptions).result();
    assert.strictEqual(calls[0], keyOptions);
    assert.equal(keyResult.content[0].name, "_Bash");
    const oauthResult = await stream(model, context, { apiKey: "sk-ant-oat-test" }).result();
    assert.equal(typeof calls[1].onPayload, "function");
    assert.equal(typeof calls[1].fetch, "function");
    assert.equal(oauthResult.content[0].name, "Bash");
    await fs.writeFile(path.join(root, "claude"), "#!/bin/sh\necho '2.1.282 (Claude Code)'\n", { mode: 0o755 });
    const upgradedResult = await stream(model, context, { apiKey: "sk-ant-oat-test" }).result();
    assert.equal(upgradedResult.content[0].name, "Bash");
    assert.equal(calls.length, 3);
    const proxyOptions = { apiKey: "sk-ant-oat-test" };
    await stream({ ...model, baseUrl: "https://proxy.example.test" }, context, proxyOptions).result();
    assert.strictEqual(calls[3], proxyOptions);
  } finally {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    await fs.rm(root, { recursive: true, force: true });
  }
});
