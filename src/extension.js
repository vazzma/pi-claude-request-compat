import { createOAuthRequestMiddleware } from "./request.js";
import { createProfile } from "./profile.js";

async function loadProfile() {
  return (await createProfile()).profile;
}

function isAnthropicOAuth(model, options) {
  const authorization = Object.entries(options?.headers ?? {})
    .find(([name]) => name.toLowerCase() === "authorization")?.[1];
  const token = options?.apiKey ?? /^Bearer\s+(sk-ant-oat\S*)$/i.exec(authorization ?? "")?.[1];
  return model.provider === "anthropic" && token?.toLowerCase().includes("sk-ant-oat") &&
    new URL(model.baseUrl).hostname === "api.anthropic.com";
}

function decodeToolCalls(event, names) {
  const message = event.partial ?? event.message ?? event.error;
  for (const block of message?.content ?? []) {
    if (block.type !== "toolCall" || !block.name?.startsWith("_")) continue;
    const original = names.get(block.name.slice(1).toLowerCase());
    if (original) block.name = original;
  }
  return event;
}

export function createFallbackStream(streamSimpleAnthropic, createStream) {
  return (model, context, options) => {
    if (!isAnthropicOAuth(model, options)) return streamSimpleAnthropic(model, context, options);
    const output = createStream();
    void (async () => {
      try {
        const profile = await loadProfile();
        const middleware = createOAuthRequestMiddleware(profile);
        const names = new Map();
        for (const message of context.messages ?? []) {
          for (const tool of message.toolsAdded ?? []) {
            if (typeof tool.name === "string") names.set(tool.name.toLowerCase(), tool.name);
          }
        }
        const source = streamSimpleAnthropic(model, context, middleware(model, context, options));
        for await (const event of source) output.push(decodeToolCalls(event, names));
        output.end();
      } catch (error) {
        output.push({ type: "error", error: {
          role: "assistant", provider: model.provider, model: model.id,
          timestamp: Date.now(), content: [], stopReason: "error",
          errorMessage: error instanceof Error ? error.message : String(error),
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
            totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
        } });
        output.end();
      }
    })();
    return output;
  };
}

export default async function claudeCompat(pi) {
  if (typeof pi.registerAnthropicOAuthRequestMiddleware === "function") {
    const profile = await loadProfile();
    pi.registerAnthropicOAuthRequestMiddleware(createOAuthRequestMiddleware(profile));
    return;
  }
  if (typeof pi.registerProvider !== "function") {
    throw new Error("pi-claude-request-compat requires Pi provider registration support");
  }
  const { streamSimpleAnthropic, createAssistantMessageEventStream } = await import("@earendil-works/pi-ai/compat");
  pi.registerProvider("anthropic", {
    api: "anthropic-messages",
    streamSimple: createFallbackStream(streamSimpleAnthropic, createAssistantMessageEventStream)
  });
}
