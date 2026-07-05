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
  "app/chat/page.tsx",
  "app/api/chat/route.ts",
  "app/api/transcribe/route.ts",
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

const [packageText, homePage, chatPage, route, transcribeRoute, policy, css, envExample, readme, vercelText] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/chat/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/transcribe/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/kids-ai-policy.mjs", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8"),
  readFile(new URL("../README.md", import.meta.url), "utf8"),
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

assert.match(homePage, /href="\/chat"|href=\{["']\/chat["']\}/);
assert.doesNotMatch(homePage, /useChat|DefaultChatTransport|Streamdown/);

assert.match(chatPage, /useChat/);
assert.match(chatPage, /DefaultChatTransport/);
assert.match(chatPage, /Streamdown/);
assert.match(chatPage, /MediaRecorder/);
assert.match(chatPage, /getUserMedia/);
assert.match(chatPage, /fetch\("\/api\/transcribe"/);
assert.match(chatPage, /localStorage/);
assert.match(chatPage, /prepareSendMessagesRequest/);
assert.match(chatPage, /Message Kids AI\.\.\./);
assert.match(chatPage, /General Chat/);

assert.match(transcribeRoute, /DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe"/);
assert.match(transcribeRoute, /OPENAI_TRANSCRIPTIONS_URL/);
assert.match(transcribeRoute, /\/v1\/audio\/transcriptions/);
assert.match(transcribeRoute, /generateText\(/);
assert.match(transcribeRoute, /openai\(CHAT_MODEL\)/);
assert.match(transcribeRoute, /VOICE_POSTPROCESS_SYSTEM_PROMPT/);
assert.match(transcribeRoute, /pasted into the Kids AI chat box/);
assert.match(transcribeRoute, /process\.env\.OPENAI_API_KEY/);
assert.match(transcribeRoute, /process\.env\.OPENAI_TRANSCRIBE_MODEL/);
assert.match(transcribeRoute, /MAX_AUDIO_BYTES = 25 \* 1024 \* 1024/);
assert.match(envExample, /OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe/);
assert.match(readme, /Neon Postgres/);
assert.match(readme, /chat_sessions/);

assert.match(css, /\.chat-sidebar/);
assert.match(css, /grid-template-columns: 260px minmax\(0, 1fr\)/);
assert.match(css, /\.voice-button/);
assert.match(css, /@media \(max-width: 780px\)/);

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
