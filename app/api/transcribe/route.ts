export const runtime = "nodejs";

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

type TranscriptionResponse = {
  text?: string;
};

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
  const transcript = transcription.text?.trim() ?? "";

  if (!transcript) {
    return Response.json(
      { error: "No speech was detected. Try recording again closer to the microphone." },
      { status: 422 }
    );
  }

  return Response.json({ transcript });
}
