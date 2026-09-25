import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_RECIPE } from "./recipes.js";

const pendingProfiles = new Map();

export function profilePath() {
  const configured = process.env.PI_CODING_AGENT_DIR;
  const agentDir = configured
    ? path.resolve(configured.startsWith("~/") ? path.join(os.homedir(), configured.slice(2)) : configured)
    : path.join(os.homedir(), ".pi", "agent");
  return path.join(agentDir, "claude-request-compat", "profile.json");
}

export function readProfile() {
  let profile;
  try {
    profile = JSON.parse(fs.readFileSync(profilePath(), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  if (![1, 2].includes(profile?.schema) || typeof profile.installId !== "string" || !profile.installId ||
      (profile.schema === 1 && (typeof profile.claudeVersion !== "string" || typeof profile.recipeId !== "string")) ||
      !["short", "long"].includes(profile.cacheMain)) {
    throw new Error(`Invalid pi-claude-request-compat profile at ${profilePath()}; repair it or move it aside to recreate it`);
  }
  return profile;
}

export async function createProfile() {
  const target = profilePath();
  if (!pendingProfiles.has(target)) {
    pendingProfiles.set(target, storeProfile(target).finally(() => pendingProfiles.delete(target)));
  }
  return pendingProfiles.get(target);
}

async function storeProfile(target) {
  const previous = readProfile();
  const profile = {
    schema: 2,
    installId: previous?.installId ?? randomUUID(),
    cacheMain: previous?.cacheMain ?? "long",
    createdAt: previous?.createdAt ?? new Date().toISOString()
  };
  if (previous?.schema === 2) return { profile: previous, target };
  await fsPromises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fsPromises.writeFile(temporary, JSON.stringify(profile, null, 2) + "\n", { mode: 0o600 });
  await fsPromises.rename(temporary, target);
  return { profile, target };
}

export function activeRecipe(profile) {
  return profile?.schema === 2 ? DEFAULT_RECIPE : undefined;
}
