# Essay Structurer (voice → outline)

Production-ready Next.js app that:
1. Records a 3-minute oral brief (FR) or lets you upload an audio file
2. Uploads audio to Supabase Storage (keeps original MIME/extension)
3. Transcribes with Whisper on Replicate (forced French, verbatim)
4. Analyzes the transcript with an LLM on Replicate and returns JSON:
   - task_understanding, introduction, detailed_plan, conclusion, draft (FR)
5. Reads the draft aloud with MiniMax Speech-02 Turbo on Replicate

> **Important**: Previously, this app generated only structure. Now it also generates:
> - a precise introduction and a concise conclusion (FR),
> - plus a short draft (FR, 180–300 words) intended for TTS playback.
> Use placeholders [A REMPLIR] to maintain exam integrity.

---

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Replicate** (unified `/v1/predictions` endpoint) — Whisper, your LLM, MiniMax Speech-02 Turbo
- **Supabase** (Auth ready-to-wire, Storage for audio/tts files; we use service role on the server routes)
- **TailwindCSS** (minimal UI)

## Environment

Copy `.env.example` to `.env.local` and fill values:

```
cp .env.example .env.local
```

- `REPLICATE_API_TOKEN`: From your Replicate account
- `REPLICATE_WHISPER_MODEL`: default `openai/whisper` (`large-v3` preferred)
- `REPLICATE_LLM_MODEL`: default `openai/gpt-5` (or your private alias). You can also set `REPLICATE_GPT5_MODEL` explicitly.
- `REPLICATE_TTS_MODEL`: `minimax/speech-02-turbo`
- `MINIMAX_TTS_VOICE`: pick one from the model page
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET`: defaults to `recordings`

Create a public bucket in Supabase called `recordings` (or your chosen name).

## Run locally

```bash
npm i
npm run dev
```

Visit http://localhost:3000/

## Security/Prod notes

- API routes run server-side and use the **Supabase service role** for storage uploads so your anon key stays on the client only.
- Replicate calls happen on the server. Do not expose your `REPLICATE_API_TOKEN` to the client.
- We poll Replicate for completion; you can also enable **webhooks** and process async if you prefer.
- If a model’s input schema differs, adjust the payload in `src/app/api/*/route.ts` or set the environment to a model that matches the current mapping.
- Rate-limit API routes behind an edge middleware or WAF for public deployments.
- Add auth-gating with Supabase (email magic links / OAuth) if needed.

## Customizing prompts and output

- `SYSTEM_PROMPT_TEXT` can prepend extra instructions (e.g., domain, criteria) to the system prompt.
- The transcript → prompt shaper lives in `src/lib/prompt.ts`. It now requests strict JSON with keys:
  `task_understanding`, `introduction`, `detailed_plan`, `conclusion`, `draft`.
  If your chosen model needs a different input shape, update `api/analyze` accordingly.

## Deployment

- Works out-of-the-box on **Vercel**.
- Set all environment variables in your host.
- Confirm your Supabase Storage CORS settings allow your deployment domain to fetch served files.
- For stable audio hosting, we proxy generated TTS back into Supabase storage. You can disable that in `api/tts` if you prefer direct Replicate URLs.

## Notes on models

- Whisper (`openai/whisper`) is called with `language: "fr"`, `translate: false` to keep French text.
- MiniMax Speech-02 Turbo uses `language_boost: "French"` and your selected `MINIMAX_TTS_VOICE`.
- The app defaults to `openai/gpt-5` on Replicate. If you maintain a private deployment or alias, set its identifier in `REPLICATE_LLM_MODEL` or `REPLICATE_GPT5_MODEL`.

## License

MIT
# essay-structurer-app
