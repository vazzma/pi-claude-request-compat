#!/usr/bin/env node
import { createProfile, profilePath, readProfile } from "../src/profile.js";
import { DEFAULT_RECIPE } from "../src/recipes.js";
import { spawn } from "node:child_process";
import { launchArgs } from "../src/launch.js";

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "run") {
    const child = spawn("pi", launchArgs(args), { stdio: "inherit" });
    const forward = (signal) => child.kill(signal);
    const interrupt = () => forward("SIGINT");
    const terminate = () => forward("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    try {
      process.exitCode = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 130 : 1)));
      });
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    }
    return;
  }
  if (args.length > 0) {
    throw new Error("Usage: pi-claude-request-compat <init|doctor>. Claude Code is no longer required; remove --claude.");
  }
  if (command === "init") {
    const { target } = await createProfile();
    process.stdout.write(`Profile ready at ${target}\nUse Pi's /login claude-compat for your own account.\n`);
    return;
  }
  if (command === "doctor") {
    const profile = readProfile();
    process.stdout.write(`Protocol: ${DEFAULT_RECIPE.id}; reference Claude Code ${DEFAULT_RECIPE.claudeVersion}; provenance ${DEFAULT_RECIPE.provenance}\n`);
    process.stdout.write(`Local profile: ${!profile ? "created automatically on first OAuth request" : profile.schema === 1 ? "will migrate automatically" : "ready"} (${profilePath()})\n`);
    process.stdout.write("Claude Code installation: not required. No network request made; live acceptance and direct Claude parity are not verified.\n");
    process.stdout.write("Select Claude Compat and use /claude-compat-status in Pi. Launch with pi-claude-request-compat run to reject a missing provider at startup.\n");
    return;
  }
  throw new Error("Usage: pi-claude-request-compat <init|doctor|run [--model claude-model-id] [-- pi-options]>");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
