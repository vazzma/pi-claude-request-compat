#!/usr/bin/env node
import { createProfile, profilePath, readProfile } from "../src/profile.js";
import { DEFAULT_RECIPE } from "../src/recipes.js";

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (args.length > 0) {
    throw new Error("Usage: pi-claude-request-compat <init|doctor>. Claude Code is no longer required; remove --claude.");
  }
  if (command === "init") {
    const { target } = await createProfile();
    process.stdout.write(`Profile ready at ${target}\nUse Pi's /login anthropic for your own account.\n`);
    return;
  }
  if (command === "doctor") {
    const profile = readProfile();
    process.stdout.write(`Protocol: ${DEFAULT_RECIPE.id}; reference Claude Code ${DEFAULT_RECIPE.claudeVersion}; provenance ${DEFAULT_RECIPE.provenance}\n`);
    process.stdout.write(`Local profile: ${!profile ? "created automatically on first OAuth request" : profile.schema === 1 ? "will migrate automatically" : "ready"} (${profilePath()})\n`);
    process.stdout.write("Claude Code installation: not required. No network request made; live acceptance and direct Claude parity are not verified.\n");
    return;
  }
  throw new Error("Usage: pi-claude-request-compat <init|doctor>");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
