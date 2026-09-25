import { createOAuthRequestMiddleware } from "./request.js";
import { createProfile } from "./profile.js";
import { DEFAULT_RECIPE } from "./recipes.js";
import { COMPAT_API, COMPAT_PROVIDER, assertOfficialUrl, requireOAuth } from "./strict.js";

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

export function createFallbackStream(streamSimpleAnthropic, createStream, { strict = false, onState = () => {} } = {}) {
  return (model, context, options) => {
    if (!strict && !isAnthropicOAuth(model, options)) return streamSimpleAnthropic(model, context, options);
    const output = createStream();
    void (async () => {
      try {
        if (strict) {
          onState("checking");
          if (model.provider !== COMPAT_PROVIDER || model.api !== COMPAT_API) {
            throw new Error("Claude Compat blocked unexpected provider routing");
          }
          assertOfficialUrl(model.baseUrl);
          requireOAuth(options, model.headers);
        }
        const profile = await loadProfile();
        const middleware = createOAuthRequestMiddleware(profile, { strict, onValidated: () => onState("validated") });
        const names = new Map();
        for (const message of context.messages ?? []) {
          for (const tool of message.toolsAdded ?? []) {
            if (typeof tool.name === "string") names.set(tool.name.toLowerCase(), tool.name);
          }
        }
        const wireModel = strict ? { ...model, provider: "anthropic", api: "anthropic-messages" } : model;
        const wireContext = strict ? { ...context, messages: context.messages.map((message) =>
          message.role === "assistant" && message.provider === COMPAT_PROVIDER
            ? { ...message, provider: "anthropic", api: "anthropic-messages" } : message) } : context;
        const source = streamSimpleAnthropic(wireModel, wireContext, middleware(wireModel, wireContext, options));
        for await (const event of source) {
          if (strict) {
            for (const message of [event.partial, event.message, event.error]) {
              if (message) { message.provider = COMPAT_PROVIDER; message.api = COMPAT_API; }
            }
            if (event.type === "error") onState("error");
          }
          output.push(decodeToolCalls(event, names));
        }
        output.end();
      } catch (error) {
        if (strict) onState("error");
        output.push({ type: "error", error: {
          role: "assistant", provider: model.provider, api: model.api, model: model.id,
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
  if (typeof pi.registerProvider !== "function") {
    throw new Error("pi-claude-request-compat requires Pi provider registration support");
  }
  const { anthropicProvider } = await import("@earendil-works/pi-ai/providers/anthropic");
  const { streamSimpleAnthropic, streamAnthropic, createAssistantMessageEventStream } = await import("@earendil-works/pi-ai/compat");
  const base = anthropicProvider();
  let state = "not sent";
  let uiContext;
  const showStatus = () => {
    uiContext?.ui.setStatus("claude-compat", uiContext.model?.provider === COMPAT_PROVIDER
      ? `Compat active · ${DEFAULT_RECIPE.id} · ${state}` : "Compat inactive — select Claude Compat");
  };
  const wrap = (stream) => createFallbackStream(stream, createAssistantMessageEventStream, {
    strict: true, onState(value) { state = value; showStatus(); }
  });
  pi.registerProvider({
    id: COMPAT_PROVIDER,
    name: "Claude Compat",
    baseUrl: base.baseUrl,
    auth: { oauth: { ...base.auth.oauth, name: "Claude Compat (Anthropic OAuth)" } },
    getModels: () => base.getModels().map((model) => ({
      ...model, provider: COMPAT_PROVIDER, api: COMPAT_API, name: `${model.name} [Compat]`
    })),
    stream: wrap(streamAnthropic),
    streamSimple: wrap(streamSimpleAnthropic)
  });
  const update = (_event, ctx) => { uiContext = ctx; showStatus(); };
  pi.on("session_start", (_event, ctx) => { state = "not sent"; update(_event, ctx); });
  pi.on("model_select", update);
  pi.registerCommand("claude-compat-status", {
    description: "Show Claude Compat routing and local validation status (no network request)",
    handler: async (_args, ctx) => {
      update(undefined, ctx);
      ctx.ui.notify(`Claude Compat: ${ctx.model?.provider === COMPAT_PROVIDER ? "selected" : "not selected"}. ` +
        `Auth policy: OAuth only. Profile: ${DEFAULT_RECIPE.id}. Last request: ${state}. ` +
        "Local validation does not prove server acceptance. For missing-plugin protection launch with pi-claude-request-compat run.", "info");
    }
  });
}
