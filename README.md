# KidsAI

KidsAI is a static, no-login learning hub for child-safe AI activities.

## Local Preview

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Verification

```bash
npm test
```

## Deployment

The app is designed for Vercel static hosting from the repository root.
`vercel.json` sets `outputDirectory` to `.` so Vercel does not look for a
separate `public/` folder.
