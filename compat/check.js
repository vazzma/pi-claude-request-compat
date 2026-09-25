import * as fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { DEFAULT_RECIPE } from "../src/recipes.js";
import { captureClaude, referenceExecutable } from "./claude.js";
import { contract, differences, SCOPE } from "./contract.js";
import { capturePi, SCENARIOS } from "./scenarios.js";

const { values } = parseArgs({ options: {
  claude: { type: "string", default: "claude" },
  "claude-version": { type: "string" },
  reference: { type: "string" },
  record: { type: "string" },
  help: { type: "boolean" }
} });

async function main() {
  if (values.help) {
    console.log("Live: npm run compat:check -- --claude-version X.Y.Z [--claude /path/to/claude] [--record fixture.json]");
    console.log("Offline: npm run compat:check -- --reference fixture.json");
    console.log("Scope: synthetic OAuth gateway envelope only. Exit 0 = scoped match, 1 = differences, 2 = incomplete/error.");
    return;
  }
  if (!!values.reference === !!values["claude-version"] || (values.reference && values.record)) {
    throw new Error("Choose --claude-version X.Y.Z for live capture OR --reference fixture.json for offline comparison; use --help for details.");
  }
  let fixture;
  const live = new Map();
  if (values.reference) {
    fixture = JSON.parse(await fs.readFile(values.reference, "utf8"));
  } else {
    const reference = await referenceExecutable(values.claude, values["claude-version"]);
    fixture = { schema: 1, scope: SCOPE, capturedAt: new Date().toISOString(),
      reference: { version: reference.version, executableSha256: reference.executableSha256 },
      model: DEFAULT_RECIPE.bootstrapModel, scenarios: [] };
    for (const scenario of SCENARIOS) {
      const captured = await captureClaude(reference.executable, scenario, fixture.model);
      live.set(scenario.id, captured);
      fixture.scenarios.push({ id: scenario.id, contract: contract(captured) });
    }
  }
  if (fixture.schema !== 1 || fixture.scope !== SCOPE || !fixture.reference?.version ||
      !/^[0-9a-f]{64}$/.test(fixture.reference.executableSha256 ?? "") ||
      fixture.scenarios?.length !== SCENARIOS.length ||
      SCENARIOS.some((scenario) => fixture.scenarios.filter((entry) => entry.id === scenario.id).length !== 1)) {
    throw new Error("Invalid or incomplete reference fixture");
  }
  console.log(`Protocol ${DEFAULT_RECIPE.id}; Claude reference ${fixture.reference.version}; scope ${SCOPE}`);
  console.log("NOT direct OAuth parity, full agent parity, or live Anthropic acceptance.");
  let changed = false;
  for (const scenario of SCENARIOS) {
    const expected = fixture.scenarios.find((entry) => entry.id === scenario.id).contract;
    if (!expected || expected.model !== fixture.model || expected.stream !== true ||
        !Array.isArray(expected.tools) || !Array.isArray(expected.betas) ||
        !Array.isArray(expected.systemCache) || typeof expected.maxTokens !== "number") {
      throw new Error(`Invalid contract for ${scenario.id}`);
    }
    const rawTools = live.has(scenario.id) ? JSON.parse(live.get(scenario.id).body).tools : undefined;
    const tools = (rawTools ?? expected.tools).map((tool) => ({
      name: tool.name.replace(/^_/, ""), description: tool.description ?? "Reference fixture tool",
      parameters: tool.input_schema ?? tool.schema
    }));
    const actual = contract(await capturePi(scenario, fixture.model, { tools }));
    const diff = differences(expected, actual);
    console.log(`${scenario.id}: ${diff.length ? "DIFF" : "PASS (scoped)"}`);
    for (const { field, reference, actual: value } of diff) {
      console.log(`  ${field}: Claude=${JSON.stringify(reference)} Pi=${JSON.stringify(value)}`);
    }
    changed ||= diff.length > 0;
  }
  if (values.record) {
    // No overwrite: refreshing evidence must be an intentional new capture.
    await fs.writeFile(values.record, JSON.stringify(fixture, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(`Saved sanitized reference to ${values.record}`);
  }
  process.exitCode = changed ? 1 : 0;
}

main().catch((error) => {
  console.error(`Compatibility check incomplete: ${error.message}`);
  process.exitCode = 2;
});
