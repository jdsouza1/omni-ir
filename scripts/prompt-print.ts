// npm run prompt:print
// Prints the system prompt a real model would receive. For the free manual check: paste it into a
// Claude.ai chat, ask for a few screens, save each reply to a file and run `npm run validate` on them.
import { buildSystemPrompt } from "../server/prompt";

const prompt = buildSystemPrompt();
process.stdout.write(prompt);
// Rough size: about 4 characters per token for English text and code.
process.stderr.write(`\n\n(${prompt.length} characters, roughly ${Math.round(prompt.length / 4)} tokens)\n`);
