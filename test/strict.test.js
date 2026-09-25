import assert from "node:assert/strict";
import { test } from "node:test";
import { launchArgs } from "../src/launch.js";
import { createOAuthRequestMiddleware } from "../src/request.js";
import { getModel } from "@earendil-works/pi-ai/compat";

test("launcher pins explicit selection even when resuming and rejects routing overrides", () => {
  assert.deepEqual(launchArgs(["--model", "claude-opus-4-8", "--", "--continue"]),
    ["--provider", "claude-compat", "--model", "claude-opus-4-8", "--continue"]);
  for (const flag of ["--provider=anthropic", "--model", "--models", "--api-key=paid"]) {
    assert.throws(() => launchArgs(["--", flag]), /conflicting flags/);
  }
});

test("strict final transport rejects missing fields, auth changes, and redirected destinations", async () => {
  let calls = 0;
  const model = getModel("anthropic", "claude-opus-4-8");
  const wrap = createOAuthRequestMiddleware({ schema: 2, installId: "test", cacheMain: "long" }, { strict: true });
  const options = wrap(model, { messages: [] }, {
    apiKey: "sk-ant-oat-fixture", fetch: () => { calls++; assert.fail("Must not reach network"); }
  });
  const payload = await options.onPayload({
    model: model.id, stream: true, max_tokens: 100,
    system: [{ type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." }],
    metadata: { user_id: JSON.stringify({ account_uuid: "fixture", session_id: "session" }) }
  }, model);
  const headers = { authorization: "Bearer sk-ant-oat-fixture", "anthropic-beta": "oauth-2025-04-20" };
  const send = (body, customHeaders = headers, url = "https://api.anthropic.com/v1/messages") =>
    options.fetch(url, { body: JSON.stringify(body), headers: customHeaders });
  await assert.rejects(send({ ...payload, metadata: undefined }), /request envelope/);
  await assert.rejects(send(payload, { ...headers, authorization: "Bearer other" }), /wire authentication/);
  await assert.rejects(send(payload, { ...headers, "x-api-key": "paid" }), /wire authentication/);
  await assert.rejects(send(payload, headers, "https://other.test/v1/messages"), /official HTTPS/);
  assert.equal(calls, 0);
});
