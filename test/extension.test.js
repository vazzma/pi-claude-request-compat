import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai/compat";
import claudeCompat, { createFallbackStream } from "../src/extension.js";

test("first load creates a profile and registers the middleware", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-claude-compat-extension-"));
  const originalPath = process.env.PATH;
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PATH = root; // No Claude installation needed.
    process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");

    let middleware;
    await claudeCompat({ registerAnthropicOAuthRequestMiddleware(callback) { middleware = callback; } });

    assert.equal(typeof middleware, "function");
    const profile = JSON.parse(await fs.readFile(path.join(root, "agent", "claude-request-compat", "profile.json"), "utf8"));
    assert.equal(profile.schema, 2);
    assert.equal(profile.claudeVersion, undefined);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("stock Pi registers an Anthropic wrapper without requiring a profile at startup", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-claude-compat-stock-"));
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PI_CODING_AGENT_DIR = root;
    let registered;
    await claudeCompat({ registerProvider(name, config) { registered = { name, config }; } });
    assert.equal(registered.name, "anthropic");
    assert.equal(registered.config.api, "anthropic-messages");
    assert.equal(typeof registered.config.streamSimple, "function");
    await assert.rejects(fs.access(path.join(root, "claude-request-compat", "profile.json")));
  } finally {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    await fs.rm(root, { recursive: true, force: true });
  }
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
