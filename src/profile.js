import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { recipeFor } from "./recipes.js";

const execFileAsync = promisify(execFile);
const VERSION = /\b(\d+\.\d+\.\d+)\b/u;

export function profilePath() {
  const configured = process.env.PI_CODING_AGENT_DIR;
  const agentDir = configured
    ? path.resolve(configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured)
    : path.join(os.homedir(), ".pi", "agent");
  return path.join(agentDir, "claude-request-compat", "profile.json");
}

export async function installedClaudeVersion(executable = "claude") {
  const { stdout } = await execFileAsync(executable, ["--version"], {
    timeout: 10000,
    maxBuffer: 4096,
    env: process.env
  });
  const version = VERSION.exec(stdout)?.[1];
  if (!version) throw new Error(`Could not parse Claude Code version from ${JSON.stringify(stdout.trim())}`);
  return version;
}

export function readProfile() {
  let profile;
  try {
    profile = JSON.parse(fs.readFileSync(profilePath(), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  if (profile?.schema !== 1 || typeof profile.installId !== "string" ||
      typeof profile.claudeVersion !== "string" || typeof profile.recipeId !== "string" ||
      !["short", "long"].includes(profile.cacheMain)) {
    throw new Error("Invalid pi-claude-request-compat profile; rerun pi-claude-request-compat init");
  }
  return profile;
}

export async function createProfile(executable = "claude") {
  const claudeVersion = await installedClaudeVersion(executable);
  const recipe = recipeFor(claudeVersion);
  if (!recipe) {
    throw new Error(`Claude Code ${claudeVersion} has no reviewed compatibility recipe. Update pi-claude-request-compat before enabling it.`);
  }
  const previous = readProfile();
  const profile = {
    schema: 1,
    claudeVersion,
    recipeId: recipe.id,
    installId: previous?.installId ?? randomUUID(),
    cacheMain: previous?.cacheMain ?? "long",
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    checkedAt: new Date().toISOString()
  };
  const target = profilePath();
  await fsPromises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fsPromises.writeFile(temporary, JSON.stringify(profile, null, 2) + "\n", { mode: 0o600 });
  await fsPromises.rename(temporary, target);
  return { profile, target };
}

export function activeRecipe(profile) {
  const recipe = recipeFor(profile?.claudeVersion);
  if (!recipe || recipe.id !== profile?.recipeId) return undefined;
  return recipe;
}
