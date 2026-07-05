export const CHAT_MODEL = "gpt-5.4-mini";
export const MAX_MESSAGE_CHARS = 1200;

export const AGE_BANDS = [
  {
    id: "child_6_8",
    label: "6-8",
    instruction: "Use short sentences, concrete examples, and one small question at a time."
  },
  {
    id: "child_9_12",
    label: "9-12",
    instruction: "Use clear explanations, friendly hints, and lightweight vocabulary building."
  },
  {
    id: "teen_13_17",
    label: "13-17",
    instruction: "Use respectful coaching, more precise vocabulary, and ask them to reason before revealing answers."
  }
];

export const DEFAULT_AGE_ID = "child_9_12";

const AGE_IDS = new Set(AGE_BANDS.map((age) => age.id));

const ADULT_TOPIC_PATTERNS = [
  /\b(?:porn|explicit sex|erotic|fetish)\b/i,
  /\b(?:suicide method|self-harm method|how to self harm)\b/i,
  /\b(?:buy drugs|make drugs|hide drugs|make meth)\b/i,
  /\b(?:weapon plans|build a gun|make a bomb|3d print a gun)\b/i,
  /\b(?:gambling|casino betting)\b/i
];

const PRIVATE_DATA_PATTERNS = [
  /\b(?:home address|street address|phone number|password|school id|credit card)\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
];

const HINT_STYLES = new Set(["gentle", "socratic", "step_by_step"]);

export function normalizeAgeId(ageId) {
  return AGE_IDS.has(ageId) ? ageId : DEFAULT_AGE_ID;
}

export function isAdultOnly(message) {
  return ADULT_TOPIC_PATTERNS.some((pattern) => pattern.test(String(message ?? "")));
}

export function includesPrivateData(text) {
  return PRIVATE_DATA_PATTERNS.some((pattern) => pattern.test(String(text ?? "")));
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, maxLength);

  if (!cleaned || isAdultOnly(cleaned) || includesPrivateData(cleaned)) {
    return null;
  }

  return cleaned;
}

function cleanList(values, maxItems, maxLength) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => cleanText(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function sanitizeLearnerMemory(memory) {
  if (!memory || typeof memory !== "object") {
    return {
      interests: [],
      recentConcepts: [],
      preferredHintStyle: "socratic"
    };
  }

  const preferredHintStyle = HINT_STYLES.has(memory.preferredHintStyle)
    ? memory.preferredHintStyle
    : "socratic";

  return {
    interests: cleanList(memory.interests, 6, 40),
    recentConcepts: cleanList(memory.recentConcepts, 8, 60),
    preferredHintStyle
  };
}

export function buildSystemPrompt(ageId, memory) {
  const age = AGE_BANDS.find((item) => item.id === normalizeAgeId(ageId));
  const safeMemory = sanitizeLearnerMemory(memory);
  const interests = safeMemory.interests.length ? safeMemory.interests.join(", ") : "none yet";
  const concepts = safeMemory.recentConcepts.length ? safeMemory.recentConcepts.join(", ") : "none yet";

  return `
You are Kids AI, a child-safe thinking chatbot.

Core requirements:
- Prevent adult-only, explicit, dangerous, or age-inappropriate information from reaching the child.
- If the child asks for adult-only or unsafe information, refuse briefly and redirect to a safe learning topic.
- Help the child think instead of giving direct answers by default.
- Ask clarifying questions, invite a guess, provide hints, and break problems into small steps.
- Do not collect private personal data such as full names, addresses, school IDs, passwords, phone numbers, emails, or photos.
- Never store or repeat sensitive personal details if the child volunteers them.

Age band:
- ${age.label}: ${age.instruction}

Safe learner memory:
- Interests: ${interests}
- Recent concepts: ${concepts}
- Preferred hint style: ${safeMemory.preferredHintStyle}

Answer style:
- Return Markdown.
- Keep answers concise and warm.
- Start with a short acknowledgement.
- Give one useful hint or question before the final answer when the question is homework-like.
- Use headings, bullets, or short numbered steps only when they make the answer easier to follow.
- End with a small next-thinking question.
`.trim();
}

export function safeRefusalMarkdown() {
  return [
    "I cannot help with adult-only or unsafe details.",
    "",
    "We can turn this into a safe learning question instead. What school-safe part do you want to understand?"
  ].join("\n");
}
