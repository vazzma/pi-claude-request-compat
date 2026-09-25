import { getModel, streamSimpleAnthropic } from "@earendil-works/pi-ai/compat";
import { createOAuthRequestMiddleware } from "../src/request.js";

export const PROMPT = "Reply with exactly OK. Do not call any tools.";
export const SYSTEM = "You are a helpful coding assistant.";
export const SCENARIOS = [
  { id: "utility", tools: "", reasoning: undefined },
  { id: "tools-thinking", tools: "Read", reasoning: "high" }
];

export function sseResponse(model, toolName) {
  const block = toolName
    ? { type: "tool_use", id: "toolu_fixture", name: toolName, input: { file_path: "README.md" } }
    : { type: "text", text: "OK" };
  const events = [
    { type: "message_start", message: { id: "msg_fixture", type: "message", role: "assistant", model,
      content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: block },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: toolName ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
    { type: "message_stop" }
  ];
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
}

// Exercise the real Pi provider and Anthropic SDK, intercepting only transport.
export async function capturePi(scenario, modelId, { tools = [], headerAuth = false, toolResponse = false } = {}) {
  const model = getModel("anthropic", modelId);
  if (!model) throw new Error(`Pi has no model ${modelId}`);
  const context = { messages: [
    { role: "system", content: [{ type: "text", text: SYSTEM }], toolsAdded: tools },
    { role: "user", content: [{ type: "text", text: PROMPT }], timestamp: 0 }
  ] };
  const calls = [];
  const middleware = createOAuthRequestMiddleware({ schema: 2, installId: "fixture-install", cacheMain: "long" });
  const token = "sk-ant-oat-compat-fixture";
  const options = middleware(model, context, {
    ...(headerAuth ? { headers: { authorization: `Bearer ${token}` } } : { apiKey: token }),
    sessionId: "11111111-1111-4111-8111-111111111111",
    metadata: { user_id: JSON.stringify({ session_id: "11111111-1111-4111-8111-111111111111", account_uuid: "fixture-account" }) },
    reasoning: scenario.reasoning,
    requestPurpose: scenario.id === "utility" ? "utility" : "main",
    maxRetries: 0,
    fetch: async (input, init) => {
      const url = String(input);
      if (!url.startsWith("https://api.anthropic.com/v1/messages")) throw new Error(`Unexpected fixture request: ${url}`);
      const body = Buffer.from(init.body).toString();
      calls.push({ headers: Object.fromEntries(new Headers(init.headers)), body });
      return new Response(sseResponse(modelId, toolResponse ? JSON.parse(body).tools[0].name : undefined), {
        headers: { "content-type": "text/event-stream" }
      });
    }
  });
  const result = await streamSimpleAnthropic(model, context, options).result();
  if (result.stopReason === "error") throw new Error(result.errorMessage);
  if (calls.length !== 1) throw new Error(`Expected one Pi request, got ${calls.length}`);
  return { ...calls[0], result };
}
