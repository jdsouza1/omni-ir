// npm run model:challenge [-- --seed 42]
// Runs one model check challenge (PLAN-MODELCHECK.md, SPEC.md [10.21]) against the server's configured
// model and prints how each reply scored. Free by default: it uses the mock model, which replays the
// fixtures, so its result shows how the check works rather than how well a model writes. A real model
// is used only with OMNI_MODEL=claude, and then costs six generations: run it that way only with the
// owner's go-ahead.
// Exits with code 1 if the challenge fails.
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { loadConfig } from "../server/config";
import { runChallenge, setupFingerprint } from "../server/modelCheck";
import { createModel } from "../server/models";
import { bold, dim, green, red, yellow } from "./lib";

const seedAt = process.argv.indexOf("--seed");
const seed = seedAt >= 0 ? Number(process.argv[seedAt + 1]) : Math.floor(Math.random() * 2 ** 31);
if (!Number.isInteger(seed)) {
  console.error("usage: npm run model:challenge [-- --seed <integer>]");
  process.exit(2);
}

const { config, warnings } = loadConfig({ OMNI_MOCK_SPEED: "instant", ...process.env });
for (const warning of warnings) console.warn(yellow(`warning: ${warning}`));
const model = createModel(config);
const setup = { model: model.setup?.id ?? model.kind, systemPrompt: model.setup?.systemPrompt ?? "", settings: model.setup?.settings, tools: TOOLS, assets: ASSETS };

/** The same seeded generator the tests use, so a run can be repeated with --seed. */
let state = seed >>> 0;
const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;

console.log(bold(`Model check: ${setup.model}`) + dim(`  (seed ${seed}, setup ${setupFingerprint(setup).slice(0, 12)})`));
if (model.kind === "mock") console.log(dim("The mock model replays fixtures chosen by keyword: its result shows how the check works, not how well a real model writes."));

const result = await runChallenge(model, { tools: TOOLS, assets: ASSETS, random, timeoutMs: config.timeoutMs });
for (const reply of result.replies) {
  const mark = !reply.safe ? red("fail") : reply.complete ? green("pass") : yellow("incomplete");
  const detail = [...reply.errors.map((code) => `error ${code}`), ...reply.missing.map((m) => `missing ${m}`)].join(", ");
  console.log(`  ${mark.padEnd(20)} ${reply.kind.padEnd(5)} ${reply.id}${detail ? dim(`  ${detail}`) : ""}`);
}
if (result.error) console.log(red(`  The model couldn't answer: ${result.error}`));
const safe = result.replies.filter((r) => r.safe).length;
const complete = result.replies.filter((r) => r.complete).length;
console.log(
  `\n${result.passed ? green(bold("Passed")) : red(bold("Failed"))}: ${safe} of ${result.requests.length} replies with no errors (all needed), ` +
    `${complete} of ${result.requests.length} with what was asked (all but one needed).`,
);
process.exit(result.passed ? 0 : 1);
