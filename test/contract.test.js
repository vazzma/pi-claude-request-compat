import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { contract, differences } from "../compat/contract.js";
import { referenceExecutable } from "../compat/claude.js";

test("comparison removes credentials and volatile IDs but detects envelope drift", () => {
  const sample = (id) => ({
    headers: { authorization: "Bearer secret", "anthropic-beta": "b,a", "x-claude-code-session-id": id },
    body: JSON.stringify({ model: "example", stream: true, max_tokens: 64000,
      system: [{ type: "text", text: "private instructions" }],
      messages: [{ role: "user", content: "private prompt" }],
      metadata: { user_id: JSON.stringify({ session_id: id, device_id: "private-device", account_uuid: "private-account" }) }
    })
  });
  const first = contract(sample("session-one"));
  const second = contract(sample("session-two"));
  assert.deepEqual(differences(first, second), []);
  assert.doesNotMatch(JSON.stringify(first), /secret|private|session-one/);
  second.maxTokens = 32000;
  assert.deepEqual(differences(first, second).map(({ field }) => field), ["maxTokens"]);
  const missing = sample("session-two");
  delete missing.headers["x-claude-code-session-id"];
  assert.equal(contract(missing).sessionHeaderMatches, false);
});

test("reference executable refuses a mismatched version before capture", async () => {
  // Node supports --version too, making this test independent of a Claude install.
  await assert.rejects(referenceExecutable(process.execPath, "0.0.0"), /Expected Claude 0.0.0/);
});

test("offline Claude evidence reports real differences with a failing exit status", async () => {
  const root = path.join(import.meta.dirname, "..");
  await assert.rejects(promisify(execFile)(process.execPath, [
    "compat/check.js", "--reference", "compat/fixtures/claude-2.1.156-gateway.json"
  ], { cwd: root }), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /utility: DIFF/);
    assert.match(error.stdout, /tools-thinking: DIFF/);
    assert.match(error.stdout, /sdkVersion: Claude="0\.94\.0" Pi="0\.112\.1"/);
    assert.doesNotMatch(error.stdout, /PASS/);
    return true;
  });
});
