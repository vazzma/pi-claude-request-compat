import { createHash, randomUUID } from "node:crypto";
import { readProfile, activeRecipe } from "./profile.js";
import { selectBetas } from "./recipes.js";
import { xxhash64 } from "./xxhash64.js";

const BILLING_PREFIX = "x-anthropic-billing-header:";
const PLACEHOLDER = "cch=00000";
const BILLING_ANCHOR = Buffer.from(`"system":[{"type":"text","text":"${BILLING_PREFIX}`);
const CCH_SEED = 0x4d659218e32a3268n;
const BUILTIN_TOOL_NAMES = new Set(["web_search", "code_execution", "text_editor", "computer"]);
const IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
const identityByTokenHash = new Map();

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function firstUserText(messages) {
  for (const message of messages ?? []) {
    if (message.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      const text = message.content.find((block) => block?.type === "text" && typeof block.text === "string");
      if (text) return text.text;
    }
  }
  return "";
}

function billingHeader(text, version) {
  const selected = [4, 7, 20].map((index) => text[index] ?? "0").join("");
  const suffix = sha256(`59cf53e54c78${selected}${version}`).slice(0, 3);
  return `${BILLING_PREFIX} cc_version=${version}.${suffix}; cc_entrypoint=cli; ${PLACEHOLDER};`;
}

function encodeToolName(name, declaredNames) {
  if (BUILTIN_TOOL_NAMES.has(name.toLowerCase())) return name;
  return `_${declaredNames.get(name.toLowerCase()) ?? name}`;
}

function rewriteContentBlock(block, declaredNames) {
  if (!block || typeof block !== "object") return block;
  if (block.type === "tool_use" && typeof block.name === "string") {
    return { ...block, name: encodeToolName(block.name, declaredNames) };
  }
  if (block.type === "tool_reference" && typeof block.name === "string") {
    return { ...block, name: encodeToolName(block.name, declaredNames) };
  }
  if ((block.type === "tool_addition" || block.type === "tool_removal") && block.tool?.name) {
    return { ...block, tool: { ...block.tool, name: encodeToolName(block.tool.name, declaredNames) } };
  }
  return block;
}

function rewriteMessages(messages, declaredNames) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    return { ...message, content: message.content.map((block) => rewriteContentBlock(block, declaredNames)) };
  });
}

function declaredToolNames(context) {
  const names = new Map();
  for (const message of context.messages ?? []) {
    for (const tool of message.toolsAdded ?? []) {
      if (typeof tool.name === "string") names.set(tool.name.toLowerCase(), tool.name);
    }
  }
  return names;
}

function deviceId(installId, accountId) {
  return accountId
    ? sha256(`omp-claude-device-id-v2\0${installId}\0${accountId}`)
    : sha256(`omp-claude-device-id-v1:${installId}`);
}

async function accountIdFor(token, fetchImpl, recipe, signal) {
  const key = sha256(token);
  if (!identityByTokenHash.has(key)) {
    const load = async () => {
      const url = `https://api.anthropic.com/api/claude_cli/bootstrap?entrypoint=cli&model=${encodeURIComponent(recipe.bootstrapModel)}`;
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json, text/plain, */*",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "user-agent": `claude-code/${recipe.claudeVersion}`,
          "anthropic-beta": "oauth-2025-04-20"
        },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
      });
      if (!response.ok) return undefined;
      const body = await response.json();
      const id = body?.oauth_account?.account_uuid;
      return typeof id === "string" && id.length > 0 ? id : undefined;
    };
    identityByTokenHash.set(key, load().then((accountId) => {
      if (!accountId) identityByTokenHash.delete(key);
      return accountId;
    }).catch(() => {
      identityByTokenHash.delete(key);
      return undefined;
    }));
  }
  return identityByTokenHash.get(key);
}

function stainlessArch(arch) {
  if (arch === "x64" || arch === "amd64") return "x64";
  if (arch === "arm64" || arch === "aarch64") return "arm64";
  if (arch === "ia32" || arch === "x86") return "x86";
  return `other::${arch}`;
}

function stainlessOs(platform) {
  if (platform === "darwin") return "MacOS";
  if (platform === "win32") return "Windows";
  if (platform === "linux") return "Linux";
  if (platform === "freebsd") return "FreeBSD";
  return `Other::${platform}`;
}

function compatibleHeaders(recipe, sessionId) {
  return {
    "user-agent": `claude-cli/${recipe.claudeVersion} (external, cli)`,
    "x-app": "cli",
    "x-stainless-arch": stainlessArch(process.arch),
    "x-stainless-lang": "js",
    "x-stainless-os": stainlessOs(process.platform),
    "x-stainless-package-version": recipe.sdkVersion,
    "x-stainless-retry-count": "0",
    "x-stainless-runtime": "node",
    "x-stainless-runtime-version": recipe.runtimeVersion,
    "x-stainless-timeout": "600",
    "x-client-request-id": randomUUID(),
    ...(sessionId ? { "x-claude-code-session-id": sessionId } : {})
  };
}

function patchCch(body) {
  if (typeof body !== "string") throw new Error("Claude compatibility expected a serialized string request body");
  const bytes = Buffer.from(body);
  const anchor = bytes.indexOf(BILLING_ANCHOR);
  if (anchor < 0) throw new Error("Claude billing block is not the first serialized system block");
  const start = anchor + BILLING_ANCHOR.length;
  const placeholder = bytes.indexOf(PLACEHOLDER, start);
  if (placeholder < 0 || placeholder - start > 150) throw new Error("Claude billing attestation placeholder is missing or misplaced");
  const cch = (xxhash64(bytes, CCH_SEED) & 0xfffffn).toString(16).padStart(5, "0");
  bytes.write(cch, placeholder + 4, 5, "ascii");
  return bytes;
}

export function createOAuthRequestMiddleware(profile = readProfile()) {
  const recipe = activeRecipe(profile);
  if (!profile || !recipe) {
    throw new Error("pi-claude-request-compat needs a reviewed local profile; run pi-claude-request-compat init");
  }
  return (model, context, options) => {
    const headerToken = Object.entries(options?.headers ?? {}).find(([name]) => name.toLowerCase() === "authorization")?.[1];
    const token = options?.apiKey ?? /^Bearer\s+(sk-ant-oat\S*)$/i.exec(headerToken ?? "")?.[1];
    if (model.provider !== "anthropic" || !token?.toLowerCase().includes("sk-ant-oat") ||
        new URL(model.baseUrl).hostname !== "api.anthropic.com") return options;
    const sessionId = options.sessionId ?? randomUUID();
    let wireSessionId = sessionId;
    const declaredNames = declaredToolNames(context);
    const baseFetch = options.fetch ?? globalThis.fetch;
    if (typeof baseFetch !== "function") throw new Error("No fetch implementation for Anthropic OAuth request");
    const previousOnPayload = options.onPayload;
    return {
      ...options,
      cacheRetention: options.cacheRetention ?? (options.requestPurpose === "main" ? profile.cacheMain : undefined),
      onPayload: async (payload, requestModel) => {
        const prior = await previousOnPayload?.(payload, requestModel);
        const current = prior ?? payload;
        if (!current || typeof current !== "object" || !Array.isArray(current.system) ||
            current.system[0]?.text !== IDENTITY) {
          throw new Error("Pi's Anthropic OAuth identity layout changed; update pi-claude-request-compat");
        }
        if (current.system.some((block) => block?.text?.startsWith?.(BILLING_PREFIX))) {
          throw new Error("Another extension already inserted a Claude billing block");
        }
        let supplied = {};
        if (typeof current.metadata?.user_id === "string") {
          try {
            const parsed = JSON.parse(current.metadata.user_id);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
                typeof parsed.session_id === "string" && parsed.session_id.length > 0) {
              supplied = parsed;
              wireSessionId = parsed.session_id;
            }
          } catch {
            // Pi also accepts arbitrary metadata strings; OAuth needs the Claude shape.
          }
        }
        const accountId = typeof supplied.account_uuid === "string" && supplied.account_uuid.length > 0
          ? supplied.account_uuid
          : await accountIdFor(token, baseFetch, recipe, options.signal);
        const userId = JSON.stringify({
          ...supplied,
          session_id: wireSessionId,
          device_id: typeof supplied.device_id === "string" && supplied.device_id.length > 0
            ? supplied.device_id : deviceId(profile.installId, accountId),
          ...(accountId ? { account_uuid: accountId } : {})
        });
        const maxTokens = typeof current.max_tokens === "number"
          ? Math.min(current.max_tokens, recipe.maxOutputTokens)
          : recipe.maxOutputTokens;
        const thinking = current.thinking?.type === "enabled" && typeof current.thinking.budget_tokens === "number"
          ? { ...current.thinking, budget_tokens: Math.min(current.thinking.budget_tokens, Math.max(1, maxTokens - 1024)) }
          : current.thinking;
        return {
          ...current,
          system: [{ type: "text", text: billingHeader(firstUserText(current.messages), recipe.claudeVersion) }, ...current.system],
          messages: rewriteMessages(current.messages, declaredNames),
          tools: Array.isArray(current.tools)
            ? current.tools.map((tool) => ({ ...tool, name: encodeToolName(tool.name, declaredNames) }))
            : current.tools,
          tool_choice: current.tool_choice?.type === "tool"
            ? { ...current.tool_choice, name: encodeToolName(current.tool_choice.name, declaredNames) }
            : current.tool_choice,
          max_tokens: maxTokens,
          thinking,
          betas: selectBetas(recipe, current, requestModel),
          metadata: { ...current.metadata, user_id: userId }
        };
      },
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.hostname !== "api.anthropic.com" || !url.pathname.includes("/messages")) {
          return baseFetch(input, init);
        }
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        for (const [name, value] of Object.entries(compatibleHeaders(recipe, wireSessionId))) headers.set(name, value);
        const response = await baseFetch(input, { ...init, headers, body: patchCch(init?.body) });
        if (response.status >= 400 && response.status < 500 &&
            (await response.clone().text()).includes("claude_code_version_too_old")) {
          throw new Error("Claude Code version is no longer accepted. Update Claude Code, then run pi-claude-request-compat init after a reviewed recipe is available.");
        }
        return response;
      },
      decodeToolName: (wireName, tools) => {
        if (!wireName.startsWith("_")) return undefined;
        const original = wireName.slice(1);
        return tools.find((tool) => tool.name.toLowerCase() === original.toLowerCase())?.name;
      }
    };
  };
}
