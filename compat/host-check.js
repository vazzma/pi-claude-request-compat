// Explicit host acceptance check: requires Pi 0.87.1 on PATH. No real credentials.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { sseResponse } from "./scenarios.js";

const exec = promisify(execFile);
const extension = path.resolve(import.meta.dirname, "../src/extension.js");
const launcher = path.resolve(import.meta.dirname, "../bin/pi-claude-request-compat.js");

test("real Pi loads Compat, blocks paid keys, and refuses missing-plugin fallback", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-compat-host-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const networkGuard = path.join(root, "network-guard.mjs");
  await fs.writeFile(networkGuard, 'globalThis.fetch = async () => { throw new Error("Unexpected host-test network request"); };');
  const env = {
    PATH: process.env.PATH, HOME: root, PI_CODING_AGENT_DIR: root,
    PI_OFFLINE: "1", PI_TELEMETRY: "0", PI_SKIP_VERSION_CHECK: "1",
    TERM: "dumb", NO_COLOR: "1", NODE_OPTIONS: `--import=${pathToFileURL(networkGuard).href}`
  };
  const run = async (args, launch = false) => {
    try {
      const pending = exec(launch ? process.execPath : "pi", launch ? [launcher, "run", "--", ...args] : args,
        { cwd: root, env, timeout: 30000, maxBuffer: 1024 * 1024 });
      pending.child.stdin.end();
      const result = await pending;
      return { ...result, code: 0 };
    } catch (error) {
      if (typeof error.code !== "number") throw error;
      return error;
    }
  };
  assert.equal((await run(["--version"])).stdout.trim(), "0.87.1", "Run with the supported Pi version");
  const common = ["--offline", "--no-approve", "--no-extensions", "--no-skills", "--no-context-files", "--no-prompt-templates", "--no-themes", "--no-tools", "--no-session"];
  const select = ["--provider", "claude-compat", "--model", "claude-opus-4-8"];
  // Presence of ordinary authenticated Anthropic must not enable fallback.
  await fs.writeFile(path.join(root, "auth.json"), JSON.stringify({
    anthropic: { type: "api_key", key: "paid-fixture-never-send" }
  }), { mode: 0o600 });
  const missing = await run([...common, "-p", "Test"], true);
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr + missing.stdout, /Unknown provider "claude-compat"/);
  await fs.writeFile(path.join(root, "settings.json"), JSON.stringify({
    defaultProvider: "claude-compat", defaultModel: "claude-opus-4-8"
  }));
  const missingSaved = await run([...common, "-p", "Test"], true);
  assert.notEqual(missingSaved.code, 0);
  assert.match(missingSaved.stderr, /Unknown provider "claude-compat"/);
  const brokenExtension = path.join(root, "broken.mjs");
  await fs.writeFile(brokenExtension, 'throw new Error("Synthetic extension load failure");');
  const broken = await run([...common, "-e", brokenExtension, "-p", "Test"], true);
  assert.notEqual(broken.code, 0);
  assert.match(broken.stderr + broken.stdout, /Unknown provider "claude-compat"/);

  const hook = path.join(root, "transport.mjs");
  const callsFile = path.join(root, "calls.jsonl");
  await fs.writeFile(hook, `import { appendFileSync } from "node:fs";
export default function () {
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify({url: String(url), redirect: init?.redirect}) + "\\n");
    if (url.origin !== "https://api.anthropic.com") throw new Error("Unexpected host test request");
    if (url.pathname === "/api/claude_cli/bootstrap") return Response.json({oauth_account: {account_uuid: "fixture-account"}});
    if (url.pathname !== "/v1/messages") throw new Error("Unexpected host test path");
    const payload = JSON.parse(Buffer.from(init.body).toString());
    if (!payload.system[0].text.startsWith("x-anthropic-billing-header:")) throw new Error("Unpatched request");
    return new Response(${JSON.stringify(sseResponse("claude-opus-4-8"))}, {headers: {"content-type": "text/event-stream"}});
  };
}`);
  const loaded = [...common, "-e", hook, "-e", extension, ...select];
  const paid = await run([...loaded, "--api-key", "paid-fixture-never-send", "-p", "Test"]);
  assert.notEqual(paid.code, 0);
  assert.match(paid.stderr + paid.stdout, /OAuth only|No auth|No API key/);
  assert.equal((await fs.readdir(root)).includes("calls.jsonl"), false, "paid credential never reaches fetch");
  await fs.writeFile(path.join(root, "auth.json"), JSON.stringify({
    "claude-compat": { type: "oauth", access: "sk-ant-oat-host-fixture", refresh: "unused", expires: Date.now() + 3600000 }
  }), { mode: 0o600 });
  const oauth = await run([...loaded, "-p", "Test"]);
  assert.equal(oauth.code, 0, oauth.stderr + oauth.stdout);
  assert.match(oauth.stdout, /OK/);
  const calls = (await fs.readFile(callsFile, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(calls.filter((call) => new URL(call.url).pathname === "/v1/messages").length, 1);
  assert.ok(calls.every((call) => call.redirect === "error"));
});
