import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
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

  const result = streamText({
    model: openai(CHAT_MODEL),
    system: buildSystemPrompt(ageId, learnerMemory),
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 520
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onError: () => "Kids AI could not answer right now. Try a shorter question in a moment."
  });
}
