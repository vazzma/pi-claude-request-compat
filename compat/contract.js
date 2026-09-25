import { isDeepStrictEqual } from "node:util";

export const SCOPE = "gateway-synthetic-oauth-envelope-v1";

// Deliberately bounded projection, not a claim of complete wire equivalence.
// No credentials, user text, tool descriptions, account IDs, or device IDs persist.
export function contract({ headers, body }) {
  const payload = typeof body === "string" ? JSON.parse(body) : body;
  const h = new Headers(headers);
  let user = {};
  try { user = JSON.parse(payload.metadata?.user_id ?? "{}"); } catch { /* Report missing shape below. */ }
  return {
    model: payload.model,
    stream: payload.stream,
    maxTokens: payload.max_tokens,
    thinking: payload.thinking ?? null,
    outputConfig: payload.output_config ?? null,
    betas: (h.get("anthropic-beta") ?? "").split(",").map((v) => v.trim()).filter(Boolean).sort(),
    app: h.get("x-app"),
    sdkVersion: h.get("x-stainless-package-version"),
    billingFirst: payload.system?.[0]?.text?.startsWith("x-anthropic-billing-header:") ?? false,
    identityPresent: payload.system?.some((block) => block.text === "You are Claude Code, Anthropic's official CLI for Claude.") ?? false,
    systemCache: (payload.system ?? []).map((block) => block.cache_control ?? null),
    tools: (payload.tools ?? []).map((tool) => ({ name: tool.name, schema: tool.input_schema,
      cache: tool.cache_control ?? null, strict: tool.strict ?? null })),
    metadataShape: Object.fromEntries(["session_id", "device_id", "account_uuid"].map((key) => [key, typeof user?.[key]])),
    sessionHeaderMatches: typeof user?.session_id === "string" && h.get("x-claude-code-session-id") === user.session_id
  };
}

export function differences(reference, actual) {
  return [...new Set([...Object.keys(reference), ...Object.keys(actual)])]
    .filter((key) => !isDeepStrictEqual(reference[key], actual[key]))
    .map((field) => ({ field, reference: reference[field], actual: actual[field] }));
}
