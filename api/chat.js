const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const CHAT_MODEL = "gpt-5.4-mini";
const MAX_MESSAGE_CHARS = 1200;

const AGE_BANDS = new Set(["child_6_8", "child_9_12", "teen_13_17"]);

const ADULT_TOPIC_PATTERNS = [
  /\b(?:porn|explicit sex|erotic|fetish)\b/i,
  /\b(?:suicide method|self-harm method|how to self harm)\b/i,
  /\b(?:buy drugs|make drugs|hide drugs)\b/i,
  /\b(?:weapon plans|build a gun|make a bomb)\b/i,
  /\b(?:gambling|casino betting)\b/i
];

const SYSTEM_PROMPT = `
You are Kids AI, a child-safe thinking chatbot.

Core requirements:
- Use the selected age band to keep explanations age-appropriate.
- Prevent adult-only, explicit, dangerous, or age-inappropriate information from reaching the child.
- If the child asks for adult-only or unsafe information, refuse briefly and redirect to a safe learning topic.
- Help the child think instead of giving direct answers by default.
- Ask clarifying questions, invite a guess, provide hints, and break problems into small steps.
- Do not collect private personal data such as full names, addresses, school IDs, passwords, or photos.
- Keep responses concise, warm, and practical.

Answer style:
- Start with a short acknowledgement.
- If safe and educational, guide the child with one hint or one question before giving any final answer.
- For homework-like questions, do not simply solve it; coach the next thinking step.
- For factual claims, label uncertainty when needed and suggest checking a trusted source.
`.trim();

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
  });
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function isAdultOnly(message) {
  return ADULT_TOPIC_PATTERNS.some((pattern) => pattern.test(message));
}

function extractText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = [];

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

async function callOpenAI(apiKey, message, ageId) {
  const upstreamResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: SYSTEM_PROMPT }]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Age band: ${ageId}\nChild message: ${message}`
            }
          ]
        }
      ],
      max_output_tokens: 420
    })
  });

  if (!upstreamResponse.ok) {
    throw new Error("OpenAI response was not OK.");
  }

  const payload = await upstreamResponse.json();
  const reply = extractText(payload);

  if (!reply) {
    throw new Error("OpenAI response did not include text.");
  }

  return reply;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    sendJson(response, 405, { error: "Use POST for chat messages." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    sendJson(response, 500, {
      error:
        "OPENAI_API_KEY is not configured on the server. Add it in Vercel."
    });
    return;
  }

  let body;

  try {
    body = await parseBody(request);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const ageId = AGE_BANDS.has(body.ageId) ? body.ageId : "child_9_12";

  if (!message) {
    sendJson(response, 400, { error: "Message is required." });
    return;
  }

  if (message.length > MAX_MESSAGE_CHARS) {
    sendJson(response, 413, {
      error: `Message must be ${MAX_MESSAGE_CHARS} characters or fewer.`
    });
    return;
  }

  if (isAdultOnly(message)) {
    sendJson(response, 200, {
      reply:
        "I cannot help with adult-only or unsafe details. We can turn this into a safe learning question instead. What school-safe part do you want to understand?"
    });
    return;
  }

  try {
    const reply = await callOpenAI(apiKey, message, ageId);
    sendJson(response, 200, { reply });
  } catch {
    sendJson(response, 502, {
      error:
        "Kids AI could not answer right now. Try a shorter question in a moment."
    });
  }
}
