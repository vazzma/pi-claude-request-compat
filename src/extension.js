import { createOAuthRequestMiddleware } from "./request.js";

export default function claudeCompat(pi) {
  if (typeof pi.registerAnthropicOAuthRequestMiddleware !== "function") {
    throw new Error("pi-claude-request-compat requires Pi's Anthropic OAuth request middleware hook");
  }
  pi.registerAnthropicOAuthRequestMiddleware(createOAuthRequestMiddleware());
}
