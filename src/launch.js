import { COMPAT_PROVIDER } from "./strict.js";

export function launchArgs(args) {
  let model = "claude-opus-4-8";
  if (args[0] === "--model") {
    model = args[1];
    args = args.slice(2);
  }
  if (!model || !/^claude-[a-z0-9.-]+$/.test(model)) throw new Error("Expected a Claude model ID");
  if (args[0] === "--") args = args.slice(1);
  if (args.some((arg) => /^--(?:provider|model|models|api-key)(?:=|$)/.test(arg))) {
    throw new Error("Compat run owns provider/model selection and OAuth authentication; remove conflicting flags");
  }
  // Explicit selection makes Pi reject a missing provider instead of restoring
  // a saved default/session and falling back to another authenticated provider.
  return ["--provider", COMPAT_PROVIDER, "--model", model, ...args];
}
