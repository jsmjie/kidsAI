import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  buildSystemPrompt,
  CHAT_MODEL,
  isAdultOnly,
  normalizeAgeId,
  safeRefusalMarkdown,
  sanitizeLearnerMemory
} from "../lib/kids-ai-policy.mjs";

const requiredFiles = [
  "app/layout.tsx",
  "app/page.tsx",
  "app/api/chat/route.ts",
  "app/globals.css",
  "lib/client-policy.ts",
  "lib/kids-ai-policy.mjs",
  ".env.example",
  "assets/kids-ai-workshop.svg",
  "next.config.mjs",
  "tsconfig.json",
  "vercel.json"
];

for (const file of requiredFiles) {
  assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), true, `Missing required file: ${file}`);
}

const [packageText, page, route, policy, css, vercelText] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/kids-ai-policy.mjs", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../vercel.json", import.meta.url), "utf8")
]);

const packageJson = JSON.parse(packageText);
const vercel = JSON.parse(vercelText);

for (const dependency of ["next", "react", "react-dom", "ai", "@ai-sdk/react", "@ai-sdk/openai", "streamdown"]) {
  assert.ok(packageJson.dependencies[dependency], `Missing dependency: ${dependency}`);
}

assert.equal(packageJson.scripts.build, "next build");
assert.equal(packageJson.scripts.dev, "next dev");

assert.equal(vercel.framework, "nextjs");
assert.equal(vercel.outputDirectory, undefined);
assert.equal(CHAT_MODEL, "gpt-5.4-mini");
assert.match(policy, /export const CHAT_MODEL = "gpt-5\.4-mini";/);
assert.doesNotMatch(route, /OPENAI_CHAT_MODEL|OPENAI_MODEL|process\.env\.[A-Z0-9_]*MODEL/);
assert.match(route, /openai\(CHAT_MODEL\)/);
assert.match(route, /streamText\(/);
assert.match(route, /toUIMessageStreamResponse/);
assert.match(route, /validateUIMessages/);
assert.match(route, /process\.env\.OPENAI_API_KEY/);

assert.match(page, /useChat/);
assert.match(page, /DefaultChatTransport/);
assert.match(page, /Streamdown/);
assert.match(page, /localStorage/);
assert.match(page, /prepareSendMessagesRequest/);
assert.match(page, /Type a message\.\.\./);
assert.match(page, /General Chat/);

assert.match(css, /grid-template-columns: minmax\(260px, 320px\)/);
assert.match(css, /@media \(max-width: 860px\)/);

assert.equal(normalizeAgeId("teen_13_17"), "teen_13_17");
assert.equal(normalizeAgeId("unknown"), "child_9_12");
assert.equal(isAdultOnly("Tell me about porn"), true);
assert.equal(isAdultOnly("Help me understand photosynthesis"), false);
assert.match(safeRefusalMarkdown(), /adult-only or unsafe/);

const memory = sanitizeLearnerMemory({
  interests: ["space", "my email is test@example.com", "fractions"],
  recentConcepts: ["photosynthesis", "home address"],
  preferredHintStyle: "step_by_step"
});

assert.deepEqual(memory.interests, ["space", "fractions"]);
assert.deepEqual(memory.recentConcepts, ["photosynthesis"]);
assert.equal(memory.preferredHintStyle, "step_by_step");

const prompt = buildSystemPrompt("child_6_8", memory);
assert.match(prompt, /Return Markdown/);
assert.match(prompt, /Help the child think/);
assert.match(prompt, /Do not collect private personal data/);
assert.match(prompt, /space, fractions/);
