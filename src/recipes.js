// Reviewed against OMP f89a6db (2026-09-23). A CLI version alone does not
// establish compatibility with a different recipe.
export const RECIPES = Object.freeze({
  "2.1.280": Object.freeze({
    id: "cli-2.1.280-omp-f89a6db",
    claudeVersion: "2.1.280",
    sdkVersion: "0.112.1",
    runtimeVersion: "v26.3.0",
    bootstrapModel: "claude-opus-4-8",
    maxOutputTokens: 64000,
    utilityBetas: [
      "oauth-2025-04-20",
      "interleaved-thinking-2025-05-14",
      "thinking-token-count-2026-05-13",
      "context-management-2025-06-27",
      "prompt-caching-scope-2026-01-05",
      "structured-outputs-2025-12-15"
    ],
    agentBetas: [
      "claude-code-20250219",
      "oauth-2025-04-20",
      "interleaved-thinking-2025-05-14",
      "thinking-token-count-2026-05-13",
      "context-management-2025-06-27",
      "prompt-caching-scope-2026-01-05",
      "mid-conversation-system-2026-04-07"
    ]
  })
});

export function recipeFor(version) {
  return RECIPES[version];
}

export function selectBetas(recipe, payload, model) {
  const hasTools = Array.isArray(payload.tools) && payload.tools.length > 0;
  const thinking = payload.thinking?.type === "adaptive" || payload.thinking?.type === "enabled";
  const base = (hasTools || thinking ? recipe.agentBetas : recipe.utilityBetas).filter((beta) =>
    (beta !== "context-management-2025-06-27" || model.compat?.supportsContextManagement !== false) &&
    (beta !== "structured-outputs-2025-12-15" ||
      (model.compat?.disableStrictTools !== true && model.compat?.supportsStrictTools !== false))
  );
  const extra = hasTools || thinking ? ["fallback-credit-2026-06-01"] : [];
  if (thinking) extra.unshift("effort-2025-11-24");
  if (payload.system?.some?.((block) => block?.cache_control?.ttl === "1h")) {
    extra.push("extended-cache-ttl-2025-04-11");
  }
  const governed = new Set([
    ...recipe.agentBetas,
    ...recipe.utilityBetas,
    "effort-2025-11-24",
    "fallback-credit-2026-06-01",
    "extended-cache-ttl-2025-04-11",
    "context-1m-2025-08-07"
  ]);
  const existing = Array.isArray(payload.betas)
    ? payload.betas.filter((beta) => !governed.has(beta))
    : [];
  return [...new Set([...existing, ...base, ...extra])];
}
