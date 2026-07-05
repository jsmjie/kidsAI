import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
  validateUIMessages
} from "ai";
import {
  buildSystemPrompt,
  CHAT_MODEL,
  isAdultOnly,
  MAX_MESSAGE_CHARS,
  normalizeAgeId,
  safeRefusalMarkdown,
  sanitizeLearnerMemory
} from "../../../lib/kids-ai-policy.mjs";

export const maxDuration = 30;
const WEB_SEARCH_TRIGGER_PATTERN =
  /\b(latest|today|current|recent|news|right now|search online|look it up|look up|web search|online)\b/i;
const DEFAULT_WEB_SEARCH_ALLOWED_DOMAINS = [
  "britannica.com",
  "khanacademy.org",
  "nasa.gov",
  "nationalgeographic.com",
  "noaa.gov",
  "pbskids.org",
  "si.edu",
  "spaceplace.nasa.gov",
  "timeforkids.com",
  "weather.gov"
];

function latestUserText(messages: UIMessage[]) {
  const latest = [...messages].reverse().find((message) => message.role === "user");

  return (
    latest?.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ")
      .trim() ?? ""
  );
}

function isWebSearchEnabled() {
  return process.env.OPENAI_ENABLE_WEB_SEARCH?.trim().toLowerCase() === "true";
}

function webSearchAllowedDomains() {
  const customDomains = process.env.OPENAI_WEB_SEARCH_ALLOWED_DOMAINS?.split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  return customDomains?.length ? customDomains : DEFAULT_WEB_SEARCH_ALLOWED_DOMAINS;
}

function textStreamResponse(text: string, messages: UIMessage[]) {
  const stream = createUIMessageStream<UIMessage>({
    originalMessages: messages,
    execute({ writer }) {
      const id = crypto.randomUUID();
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    }
  });

  return createUIMessageStreamResponse({ stream });
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "Kids AI chat is not connected yet. Please try again later." },
      { status: 500 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const ageId = normalizeAgeId(payload.ageId);
  const learnerMemory = sanitizeLearnerMemory(payload.learnerMemory);

  let messages: UIMessage[];

  try {
    messages = await validateUIMessages<UIMessage>({ messages: payload.messages });
  } catch {
    return Response.json({ error: "Chat messages were not valid." }, { status: 400 });
  }

  const userText = latestUserText(messages);

  if (!userText) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  if (userText.length > MAX_MESSAGE_CHARS) {
    return Response.json(
      { error: `Message must be ${MAX_MESSAGE_CHARS} characters or fewer.` },
      { status: 413 }
    );
  }

  if (isAdultOnly(userText)) {
    return textStreamResponse(safeRefusalMarkdown(), messages);
  }

  const webSearchEnabled = isWebSearchEnabled();
  const systemPrompt = [
    buildSystemPrompt(ageId, learnerMemory),
    webSearchEnabled
      ? [
          "For school-safe questions that need current or live information, use the web_search tool instead of guessing.",
          "Only use web search for age-appropriate topics.",
          "Prefer the allowlisted educational sources made available through the tool."
        ].join(" ")
      : null
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = streamText({
    model: openai(CHAT_MODEL),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 520,
    tools: webSearchEnabled
      ? {
          web_search: openai.tools.webSearch({
            externalWebAccess: true,
            searchContextSize: "medium",
            filters: {
              allowedDomains: webSearchAllowedDomains()
            }
          })
        }
      : undefined,
    toolChoice:
      webSearchEnabled && WEB_SEARCH_TRIGGER_PATTERN.test(userText)
        ? { type: "tool", toolName: "web_search" }
        : undefined,
    stopWhen: stepCountIs(5)
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onError: () => "Kids AI could not answer right now. Try a shorter question in a moment."
  });
}
