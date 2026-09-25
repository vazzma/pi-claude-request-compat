#!/usr/bin/env node
import { activeRecipe, createProfile, installedClaudeVersion, profilePath, readProfile } from "../src/profile.js";

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const executable = args[0] === "--claude" ? args[1] : "claude";
  if (args.length > 0 && (args.length !== 2 || args[0] !== "--claude" || !args[1])) {
    throw new Error("Usage: pi-claude-request-compat <init|doctor> [--claude /path/to/claude]");
  }
  if (command === "init") {
    const { profile, target } = await createProfile(executable);
    process.stdout.write(`Stored ${profile.recipeId} at ${target}\nUse Pi's /login anthropic for your own account.\n`);
    return;
  }
  if (command === "doctor") {
    const profile = readProfile();
    if (!profile) throw new Error(`No profile at ${profilePath()}; run pi-claude-request-compat init`);
    const actualVersion = await installedClaudeVersion(executable);
    if (!activeRecipe(profile) || actualVersion !== profile.claudeVersion) {
      throw new Error(`Profile is stale: stored ${profile.claudeVersion}, installed ${actualVersion}. Rerun init after a reviewed recipe is available.`);
    }
    process.stdout.write(`Profile ready: Claude Code ${actualVersion}, recipe ${profile.recipeId}. No network request made.\n`);
    return;
  }
  throw new Error("Usage: pi-claude-request-compat <init|doctor> [--claude /path/to/claude]");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
