import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { PROMPT, SYSTEM, sseResponse } from "./scenarios.js";

const execFileAsync = promisify(execFile);

export async function referenceExecutable(executable, expectedVersion) {
  const candidates = executable.includes(path.sep) ? [path.resolve(executable)]
    : (process.env.PATH ?? "").split(path.delimiter).map((dir) => path.join(dir, executable));
  let resolved;
  for (const candidate of candidates) {
    try { await fs.access(candidate, fs.constants.X_OK); resolved = await fs.realpath(candidate); break; } catch { /* Try next PATH entry. */ }
  }
  if (!resolved) throw new Error(`Cannot find Claude executable: ${executable}`);
  const { stdout } = await execFileAsync(resolved, ["--version"], { timeout: 10000, maxBuffer: 4096 });
  const version = /\b(\d+\.\d+\.\d+)\b/u.exec(stdout)?.[1];
  if (version !== expectedVersion) throw new Error(`Expected Claude ${expectedVersion}, found ${version ?? "unparseable version"}. Use --claude /path/to/the/pinned/binary.`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(resolved)) hash.update(chunk);
  return { executable: resolved, version, executableSha256: hash.digest("hex") };
}

export async function captureClaude(executable, scenario, modelId) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-claude-reference-"));
  let captured;
  let captureError;
  const server = createServer(async (request, response) => {
    try {
      if (!request.url.startsWith("/v1/messages")) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { type: "not_found_error", message: "fixture endpoint" } }));
        return;
      }
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 2_000_000) throw new Error("Reference request exceeded fixture limit");
      }
      const payload = JSON.parse(body);
      // Ignore optional background/utility requests, but never accept an empty capture.
      if (payload.model === modelId && JSON.stringify(payload.messages).includes(PROMPT)) {
        captured ??= { headers: request.headers, body };
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(sseResponse(payload.model));
    } catch (error) {
      captureError = error;
      response.writeHead(500);
      response.end();
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    // Fresh home/config/cwd; no inherited tokens, hooks, plugins or project config.
    // Do not use --bare: it disables the OAuth/attribution path being inspected.
    const env = {
      PATH: process.env.PATH, HOME: root, USERPROFILE: root,
      TMPDIR: root, XDG_CONFIG_HOME: root, CLAUDE_CONFIG_DIR: root,
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat-compat-synthetic-token",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      DISABLE_AUTOUPDATER: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1",
      CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
      CLAUDE_CODE_ENABLE_TELEMETRY: "0"
    };
    const args = ["-p", PROMPT, "--model", modelId, "--output-format", "stream-json", "--verbose",
      "--system-prompt", SYSTEM, "--tools", scenario.tools, "--permission-mode", "dontAsk",
      "--setting-sources", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
      "--no-session-persistence", "--disable-slash-commands", "--no-chrome",
      "--settings", JSON.stringify({ alwaysThinkingEnabled: !!scenario.reasoning }),
      ...(scenario.reasoning ? ["--effort", scenario.reasoning] : [])];
    await new Promise((resolve, reject) => {
      const child = spawn(executable, args, { cwd: root, env, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      const timeout = setTimeout(() => child.kill("SIGKILL"), 30000);
      child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("close", (code, signal) => {
        clearTimeout(timeout);
        if (code !== 0) reject(new Error(`Claude reference failed (${signal ?? code}): ${stderr}`));
        else resolve();
      });
    });
    if (captureError) throw captureError;
    if (!captured) throw new Error("Claude emitted no matching request; this release/auth mode is not supported by the capture harness");
    return captured;
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
}
