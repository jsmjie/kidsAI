import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import chatHandler from "../api/chat.js";

const requiredFiles = [
  "index.html",
  "styles.css",
  "src/app.js",
  "api/chat.js",
  ".env.example",
  "content/activities.json",
  "assets/kids-ai-workshop.svg",
  "vercel.json"
];

for (const file of requiredFiles) {
  if (!existsSync(new URL(`../${file}`, import.meta.url))) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const [html, app, chatApi, activitiesText, vercelText] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../api/chat.js", import.meta.url), "utf8"),
  readFile(new URL("../content/activities.json", import.meta.url), "utf8"),
  readFile(new URL("../vercel.json", import.meta.url), "utf8")
]);

const activities = JSON.parse(activitiesText);
const vercel = JSON.parse(vercelText);

if (!html.includes('id="age-tabs"') || !html.includes("./src/app.js")) {
  throw new Error("index.html is missing the app mount or script reference.");
}

if (!html.includes("./assets/kids-ai-workshop.svg")) {
  throw new Error("index.html is missing the visual asset reference.");
}

if (!html.includes('id="chat-form"') || !app.includes('fetch("/api/chat"')) {
  throw new Error("The browser chat UI must post to /api/chat.");
}

if (!chatApi.includes('const CHAT_MODEL = "gpt-5.4-mini";')) {
  throw new Error("api/chat.js must fix the chat model to gpt-5.4-mini.");
}

if (/OPENAI_CHAT_MODEL|OPENAI_MODEL|process\.env\.[A-Z0-9_]*MODEL/.test(chatApi)) {
  throw new Error("api/chat.js must not allow runtime model overrides.");
}

if (!chatApi.includes("process.env.OPENAI_API_KEY")) {
  throw new Error("api/chat.js must use the server-side OPENAI_API_KEY.");
}

if (/model[:,]\s*|CHAT_MODEL|gpt-5\.4-mini/.test(app)) {
  throw new Error("The browser app must not expose chat model metadata.");
}

if (!app.includes('fetch("./content/activities.json")')) {
  throw new Error("app.js must load activities from content/activities.json.");
}

if (vercel.outputDirectory !== ".") {
  throw new Error('vercel.json must deploy the repository root with outputDirectory ".".');
}

if (!Array.isArray(activities.ageBands) || activities.ageBands.length !== 3) {
  throw new Error("Expected three learner age bands.");
}

for (const ageBand of activities.ageBands) {
  if (!ageBand.id || !ageBand.label || !Array.isArray(ageBand.activities)) {
    throw new Error(`Invalid age band: ${ageBand.id ?? "unknown"}`);
  }

  if (ageBand.activities.length === 0) {
    throw new Error(`Age band ${ageBand.id} has no activities.`);
  }

  for (const activity of ageBand.activities) {
    const required = ["id", "title", "summary", "goal", "time", "mode", "steps", "prompts"];
    for (const key of required) {
      if (!activity[key]) {
        throw new Error(`Activity ${activity.id ?? "unknown"} is missing ${key}.`);
      }
    }

    if (activity.steps.length < 3 || activity.prompts.length < 2) {
      throw new Error(`Activity ${activity.id} needs enough steps and prompt starters.`);
    }
  }
}

function createRequest(payload) {
  const request = new EventEmitter();

  request.method = "POST";

  process.nextTick(() => {
    request.emit("data", Buffer.from(JSON.stringify(payload)));
    request.emit("end");
  });

  return request;
}

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value) {
      this.body = value;
      this.finished = true;
    }
  };
}

const originalApiKey = process.env.OPENAI_API_KEY;
const originalFetch = globalThis.fetch;

try {
  process.env.OPENAI_API_KEY = "test-key";

  let capturedRequest;

  globalThis.fetch = async (url, options) => {
    capturedRequest = {
      url,
      body: JSON.parse(options.body),
      authorization: options.headers.authorization
    };

    return {
      ok: true,
      async json() {
        return { output_text: "Good question. What do you already think?" };
      }
    };
  };

  const response = createResponse();
  await chatHandler(createRequest({ ageId: "child_9_12", message: "Why is the sky blue?" }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).reply, "Good question. What do you already think?");
  assert.equal(capturedRequest.body.model, "gpt-5.4-mini");
  assert.equal(capturedRequest.authorization, "Bearer test-key");

  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Adult-only requests should not call OpenAI.");
  };

  const blockedResponse = createResponse();
  await chatHandler(createRequest({ ageId: "teen_13_17", message: "Tell me about porn" }), blockedResponse);

  assert.equal(blockedResponse.statusCode, 200);
  assert.match(JSON.parse(blockedResponse.body).reply, /adult-only/i);
  assert.equal(fetchCalls, 0);
} finally {
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }

  globalThis.fetch = originalFetch;
}
