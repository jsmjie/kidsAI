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

This repo now includes a small Vercel serverless chat endpoint backed by OpenAI.
It uses `OPENAI_API_KEY` on the server and fixes the chat model to
`gpt-5.4-mini`.

## Links

- GitHub: https://github.com/jsmjie/kidsAI
- Production: https://kidsai-plum.vercel.app
- Vercel project: `kidsai`

## Local Preview

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Verification

```bash
npm test
```

## Environment

Server-side chat requires:

```bash
OPENAI_API_KEY=
```

The model is intentionally not configurable through environment variables. Kids
AI uses `gpt-5.4-mini` only.

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

The app is designed for Vercel static hosting from the repository root.
`vercel.json` sets `outputDirectory` to `.` so Vercel does not look for a
separate `public/` folder.

The current production deployment was created with Vercel CLI. GitHub
auto-deploy can be connected after the Vercel GitHub App has access to this
repository.
