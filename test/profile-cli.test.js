import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI = path.join(import.meta.dirname, "..", "bin", "pi-claude-request-compat.js");

test("init stores a local profile and doctor detects a changed Claude CLI version", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-claude-request-compat-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const fakeClaude = path.join(root, "claude");
  const agentDir = path.join(root, "pi-agent");
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir };
  await fs.writeFile(fakeClaude, "#!/usr/bin/env node\nprocess.stdout.write('2.1.280 (Claude Code)\\n');\n", { mode: 0o755 });

  const init = await execFileAsync(process.execPath, [CLI, "init", "--claude", fakeClaude], { env });
  assert.match(init.stdout, /Stored cli-2\.1\.280-omp-f89a6db/);
  const profileFile = path.join(agentDir, "claude-request-compat", "profile.json");
  const profile = JSON.parse(await fs.readFile(profileFile, "utf8"));
  assert.equal(profile.claudeVersion, "2.1.280");
  assert.match(profile.installId, /^[0-9a-f-]{36}$/);
  assert.equal(JSON.stringify(profile).includes("sk-ant"), false);
  assert.equal((await fs.stat(profileFile)).mode & 0o777, 0o600);

  const doctor = await execFileAsync(process.execPath, [CLI, "doctor", "--claude", fakeClaude], { env });
  assert.match(doctor.stdout, /Profile ready: Claude Code 2\.1\.280/);
  await fs.writeFile(fakeClaude, "#!/usr/bin/env node\nprocess.stdout.write('2.1.281 (Claude Code)\\n');\n", { mode: 0o755 });
  await assert.rejects(
    execFileAsync(process.execPath, [CLI, "doctor", "--claude", fakeClaude], { env }),
    (error) => error.code === 1 && /Profile is stale/.test(error.stderr)
  );
  await assert.rejects(
    execFileAsync(process.execPath, [CLI, "init", "--claude", fakeClaude], { env }),
    (error) => error.code === 1 && /no reviewed compatibility recipe/.test(error.stderr)
  );
  assert.equal(JSON.parse(await fs.readFile(profileFile, "utf8")).claudeVersion, "2.1.280");

  await fs.writeFile(fakeClaude, "#!/usr/bin/env node\nprocess.stdout.write('2.1.282 (Claude Code)\\n');\n", { mode: 0o755 });
  const init282 = await execFileAsync(process.execPath, [CLI, "init", "--claude", fakeClaude], { env });
  assert.match(init282.stdout, /Stored cli-2\.1\.282-omp-f89a6db/);
  assert.equal(JSON.parse(await fs.readFile(profileFile, "utf8")).claudeVersion, "2.1.282");
});
