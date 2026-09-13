# The Node Network

Paste or upload lecture material and get: level-personalized revision notes, an auto-generated 5-question quiz, instant grading, and targeted remediation (with fully worked solutions) for anything you get wrong.

This is a real, deployable app — a small React (Vite) frontend plus one serverless function that calls the Anthropic API. Your API key lives only on the server side; the browser never sees it.

## 1. Install

```bash
npm install
```

## 2. Get an Anthropic API key

Create one at [console.anthropic.com](https://console.anthropic.com/settings/keys) if you don't have one. API usage is billed separately from any Claude.ai subscription — check current pricing at [anthropic.com/pricing](https://www.anthropic.com/pricing).

## 3. Run it locally

The `/api/generate` function needs a serverless runtime, so plain `vite dev` alone won't run the backend. Easiest path:

```bash
npm install -g vercel   # one-time
vercel dev
```

`vercel dev` will ask to link a project (just accept the defaults for local testing) and will prompt you for environment variables — or copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY` first, and it'll pick it up.

Open the URL it prints (usually `http://localhost:3000`).

## Notes on scope

- **File formats**: paste text directly, or upload `.txt` / `.docx`. PDF isn't parsed — there's no PDF-parsing library wired in, so the app asks you to paste the extracted text instead.
- **Cost**: every "Generate" click makes 2 API calls (notes + quiz), plus 1 more only if you miss a question (remediation). There's no caching or rate limiting — add some if you're putting this in front of other people.
- **Grading** happens instantly and locally, since the correct answers are already known the moment the quiz is generated — no extra round trip needed for that part.
