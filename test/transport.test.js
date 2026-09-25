import assert from "node:assert/strict";
import { test } from "node:test";
import { capturePi, SCENARIOS } from "../compat/scenarios.js";
import { DEFAULT_RECIPE } from "../src/recipes.js";

const readTool = { name: "read", description: "Read a file", parameters: {
  type: "object", properties: { file_path: { type: "string" } }, required: ["file_path"]
} };

for (const headerAuth of [false, true]) {
  test(`real Pi/SDK serializes OAuth, beta headers and tool declarations (${headerAuth ? "header" : "apiKey"} auth)`, async () => {
    const captured = await capturePi(SCENARIOS[1], DEFAULT_RECIPE.bootstrapModel, { tools: [readTool], headerAuth, toolResponse: true });
    const payload = JSON.parse(captured.body);
    assert.equal(payload.betas, undefined, "SDK must move betas to headers");
    assert.match(captured.headers["anthropic-beta"], /oauth-2025-04-20/);
    assert.equal(captured.headers.authorization, "Bearer sk-ant-oat-compat-fixture");
    assert.equal(captured.headers["x-api-key"], undefined);
    assert.match(payload.system[0].text, /cch=[0-9a-f]{5};$/);
    assert.equal(payload.tools[0].name, "_read");
    assert.equal(payload.thinking.type, "adaptive");
    assert.equal(payload.max_tokens, 64000);
    assert.equal(captured.result.stopReason, "toolUse");
    assert.equal(captured.result.content[0].name, "_read", "stock Pi leaves decoding to our stream wrapper");
  });
}

test("real Pi/SDK utility request completes with synthetic SSE", async () => {
  const captured = await capturePi(SCENARIOS[0], DEFAULT_RECIPE.bootstrapModel);
  assert.equal(captured.result.content[0].text, "OK");
  assert.equal(captured.result.stopReason, "stop");
});
