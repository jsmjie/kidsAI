# Kids AI

Kids AI is a kid-facing chatbot project. Its motivation is to give children an
AI companion that is safer than a general adult chatbot and more useful than an
answer machine.

The product has two core features:

1. Guardrails
   Kids AI should prevent adult knowledge, adult information, and age-inappropriate
   content from reaching children. Safety cannot rely on a prompt alone; the
   target design needs layered input checks, age-aware policy, output checks,
   curated tools, monitoring, and escalation paths.
2. Help with thinking
   Kids AI should guide children through the thinking process instead of giving
   direct answers by default. It should ask clarifying questions, break problems
   into smaller steps, invite the child to make a guess, and only reveal answers
   when that supports learning.

This repo uses Next.js with the Vercel AI SDK for a simple ChatGPT-like
streaming chat experience at `/chat`. It uses `OPENAI_API_KEY` on the server,
fixes the chat model to `gpt-5.4-mini`, and uses `gpt-4o-mini-transcribe` for
voice transcription by default. Voice input is then post-processed with the fixed
`gpt-5.4-mini` model before the cleaned text is pasted into the chat box. The
chat renders assistant answers as Markdown and keeps a small, safe learning
memory in the browser.

## Links

- GitHub: https://github.com/jsmjie/kidsAI
- Production: https://kidsai-plum.vercel.app
- Vercel project: `kidsai`

## Local Preview

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:3000`.

## Verification

```bash
npm test
npm run build
```

## Environment

Server-side chat requires:

```bash
OPENAI_API_KEY=
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

The chat and voice post-processing model is intentionally not configurable
through environment variables. Kids AI uses `gpt-5.4-mini` only for LLM text
generation and voice transcript cleanup. Voice transcription defaults to the
same transcription model used by AI Speaking Coach.

## Current Architecture

- `app/page.tsx`: Minimal entry page that links to `/chat`.
- `app/chat/page.tsx`: ChatGPT-like chat UI using `useChat`, AI SDK transport, and
  Streamdown Markdown rendering. It also records browser audio and places the
  post-processed transcript into the composer for review before sending.
- `app/api/chat/route.ts`: Streaming chat endpoint using `streamText` and the
  fixed OpenAI model.
- `app/api/transcribe/route.ts`: Server-side voice transcription endpoint using
  OpenAI audio transcriptions, followed by `gpt-5.4-mini` transcript cleanup.
- `lib/kids-ai-policy.mjs`: Shared guardrail policy, age-band prompt, model
  constant, refusal text, and memory sanitization.
- Browser memory is intentionally narrow: recent safe learning concepts and
  hint style only. It should not store private personal details.

## Database Recommendation

If Kids AI needs to memorize every chat, use Neon Postgres through the Vercel
Marketplace. Postgres is the right default because full chat history is
structured, relational data: sessions, messages, safe memory summaries, consent
state, age band, and audit metadata. Use Vercel Blob only if storing raw audio
files becomes necessary; do not put full chats in Edge Config.

Recommended first schema:

- `chat_sessions`: anonymous session id, age band, created/updated timestamps.
- `chat_messages`: session id, role, Markdown/text content, safety outcome,
  created timestamp.
- `learner_memory`: session id, safe concept summary, hint style, updated
  timestamp.

For kids, storing every chat should be opt-in and have a retention policy. Avoid
storing full names, school names, addresses, phone numbers, emails, or raw audio
unless a parent/teacher workflow explicitly requires it.

## Product Direction

Kids AI should be designed as a coach:

- It asks before answering when the child has not shown their thinking.
- It gives hints, examples, and checkpoints before final answers.
- It adjusts explanations by age band: `child_6_8`, `child_9_12`, and
  `teen_13_17`.
- It refuses or redirects adult-only content instead of simplifying unsafe
  material for children.
- It keeps personal data, unrestricted web access, and external tools out of the
  child-facing path unless they are explicitly gated server-side.

## Deployment

The app is designed for Vercel as a Next.js project. The current production
deployment was created with Vercel CLI. GitHub auto-deploy can be connected
after the Vercel GitHub App has access to this repository.
