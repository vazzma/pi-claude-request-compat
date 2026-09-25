import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { createProfile } from "../src/profile.js";

const execFileAsync = promisify(execFile);
const CLI = path.join(import.meta.dirname, "..", "bin", "pi-claude-request-compat.js");

test("setup and doctor work without Claude; legacy profiles preserve identity and preferences", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-claude-request-compat-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = { ...process.env, PATH: root, PI_CODING_AGENT_DIR: root };
  const run = (command) => execFileAsync(process.execPath, [CLI, command], { env });
  const profileFile = path.join(root, "claude-request-compat", "profile.json");

  assert.match((await run("doctor")).stdout, /created automatically/);
  await assert.rejects(fs.access(profileFile));
  assert.match((await run("init")).stdout, /Profile ready/);
  const initial = JSON.parse(await fs.readFile(profileFile, "utf8"));
  assert.equal(initial.schema, 2);
  assert.match(initial.installId, /^[0-9a-f-]{36}$/);
  assert.equal((await fs.stat(profileFile)).mode & 0o777, 0o600);
  await run("init");
  assert.deepEqual(JSON.parse(await fs.readFile(profileFile, "utf8")), initial);

  await fs.writeFile(profileFile, JSON.stringify({
    ...initial, schema: 1, claudeVersion: "2.1.280",
    recipeId: "cli-2.1.280-omp-f89a6db", cacheMain: "short"
  }));
  assert.match((await run("doctor")).stdout, /will migrate automatically/);
  await run("init");
  assert.deepEqual(JSON.parse(await fs.readFile(profileFile, "utf8")), { ...initial, cacheMain: "short" });
  assert.match((await run("doctor")).stdout, /reference Claude Code 2.1.282/);
  await fs.writeFile(profileFile, '{"schema":99}');
  await assert.rejects(run("init"), /Invalid.*profile/);
  assert.equal(await fs.readFile(profileFile, "utf8"), '{"schema":99}');
});

test("concurrent first requests share one installation identity", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-claude-concurrent-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PI_CODING_AGENT_DIR = root;
    const profiles = await Promise.all(Array.from({ length: 8 }, () => createProfile()));
    assert.equal(new Set(profiles.map(({ profile }) => profile.installId)).size, 1);
    const stored = JSON.parse(await fs.readFile(profiles[0].target, "utf8"));
    assert.equal(stored.installId, profiles[0].profile.installId);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
