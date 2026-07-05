export const runtime = "nodejs";

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { CHAT_MODEL, MAX_MESSAGE_CHARS } from "../../../lib/kids-ai-policy.mjs";

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const VOICE_POSTPROCESS_SYSTEM_PROMPT = [
  "You clean speech-to-text transcripts before they are pasted into the Kids AI chat box.",
  "Fix likely transcription mistakes, punctuation, capitalization, spacing, and filler words.",
  "Preserve the child's meaning, language, tone, and first-person wording.",
  "If the child is asking for translation, keep it as a question or request for the chatbot to answer.",
  "Do not answer the question, add new facts, or explain your edits.",
  "Return only the cleaned chat-box text."
].join(" ");

type TranscriptionResponse = {
  text?: string;
};

function cleanTranscriptText(text: string) {
  return text
    .replace(/^```(?:text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
}

async function postProcessTranscript(transcript: string) {
  const rawTranscript = cleanTranscriptText(transcript);

  if (!rawTranscript) {
    return "";
  }

  try {
    const result = await generateText({
      model: openai(CHAT_MODEL),
      system: VOICE_POSTPROCESS_SYSTEM_PROMPT,
      prompt: `Raw transcript:\n${rawTranscript}`,
      maxOutputTokens: 260
    });
    const cleanedTranscript = cleanTranscriptText(result.text);

    return cleanedTranscript || rawTranscript;
  } catch {
    return rawTranscript;
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "Kids AI voice input is not connected yet. Please try again later." },
      { status: 500 }
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Upload an audio file in the audio field." }, { status: 400 });
  }

  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return Response.json({ error: "Upload an audio file in the audio field." }, { status: 400 });
  }

  if (audio.size === 0) {
    return Response.json({ error: "The uploaded recording is empty." }, { status: 400 });
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "The recording is larger than the 25MB transcription limit." }, { status: 413 });
  }

  const upstreamFormData = new FormData();
  const model = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL;

  upstreamFormData.append("model", model);
  upstreamFormData.append("file", audio, audio.name || "kids-ai.webm");
  upstreamFormData.append("response_format", "json");
  upstreamFormData.append(
    "prompt",
    "A child is asking a short school-safe learning question for Kids AI."
  );

  const upstreamResponse = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: upstreamFormData
  });

  if (!upstreamResponse.ok) {
    return Response.json(
      { error: "The transcription service could not process this recording. Try again with clearer audio." },
      { status: 502 }
    );
  }

  const transcription = (await upstreamResponse.json()) as TranscriptionResponse;
  const transcript = await postProcessTranscript(transcription.text ?? "");

  if (!transcript) {
    return Response.json(
      { error: "No speech was detected. Try recording again closer to the microphone." },
      { status: 422 }
    );
  }

  return Response.json({ transcript });
}
