import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import claudeCompat from "../src/extension.js";

test("first load creates a profile and registers the middleware", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-claude-compat-extension-"));
  const originalPath = process.env.PATH;
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  try {
    const executable = path.join(root, "claude");
    await fs.writeFile(executable, "#!/bin/sh\necho '2.1.280 (Claude Code)'\n", { mode: 0o755 });
    process.env.PATH = `${root}${path.delimiter}${originalPath ?? ""}`;
    process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");

    let middleware;
    await claudeCompat({ registerAnthropicOAuthRequestMiddleware(callback) { middleware = callback; } });

    assert.equal(typeof middleware, "function");
    const profile = JSON.parse(await fs.readFile(path.join(root, "agent", "claude-request-compat", "profile.json"), "utf8"));
    assert.equal(profile.claudeVersion, "2.1.280");
    assert.equal(profile.recipeId, "cli-2.1.280-omp-f89a6db");
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    await fs.rm(root, { recursive: true, force: true });
  }
});
