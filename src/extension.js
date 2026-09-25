import { createOAuthRequestMiddleware } from "./request.js";
import { createProfile, readProfile } from "./profile.js";

export default async function claudeCompat(pi) {
  if (typeof pi.registerAnthropicOAuthRequestMiddleware !== "function") {
    throw new Error("pi-claude-request-compat requires a Pi build with the Anthropic OAuth request middleware hook; see patches/pi-host.patch in the package");
  }
  const profile = readProfile() ?? (await createProfile()).profile;
  pi.registerAnthropicOAuthRequestMiddleware(createOAuthRequestMiddleware(profile));
}
