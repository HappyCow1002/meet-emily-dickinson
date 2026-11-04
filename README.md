# Meet Emily Dickinson

Student link: https://happycow1002.github.io/meet-emily-dickinson/

An accessible classroom portrayal of Emily Dickinson, with four poems, a biography, typed AI questions, natural spoken replies, and turn-by-turn microphone conversation. The portrait and voice are imagined; the site labels generated and prepared answers clearly.

## Hosting

GitHub Pages publishes `index.html` and `app.js` from the root of `main`. Cloudflare runs `emily-worker.js` at https://emily-dickinson-ai.jedrek1002.workers.dev. The Worker root redirects to the student page.

Deploy the Worker as an **ES module**, with a Workers AI binding named **AI**. The committed `wrangler.jsonc` declares that binding. From an authenticated Cloudflare environment, run `npx wrangler deploy`, or paste `emily-worker.js` into the existing Worker's dashboard editor and add the AI binding. Do not replace the Worker with HTML. No API keys belong in the public repository or webpage.

## Use

- Read a poem: select a poem and press **Hear the poem**. Natural AI voice is selected by default; device speech is available as a fallback.
- Talk: type, tap a suggested question, or press the microphone for one question.
- Conversation: press **Start conversation** and allow the microphone. Speak, pause, and wait for Emily's answer. The microphone resumes after playback finishes. Press **End conversation** to stop. This is turn-by-turn conversation, not simultaneous speech or interruption detection.
- Microphone conversation uses the browser SpeechRecognition service, supported in compatible Chrome, Edge, and Safari environments. If unavailable or blocked by school policy, typing and spoken replies remain available. The page stops listening when hidden and pauses a conversation after ten minutes.
- If autoplay is blocked, tap **Hear Emily's last answer**. Prepared replies are labeled whenever the live service cannot answer.

## Runtime and privacy

The Worker calls Cloudflare Workers AI with `@cf/meta/llama-3.2-3b-instruct` for chat and `@cf/deepgram/aura-2-en`, speaker `asteria`, for speech. Cloudflare usage allowances and account/model availability apply; this is not a promise of unlimited free voice. Check the Cloudflare account's plan and AI usage before classroom-wide use. The code does not upgrade a plan or purchase credits.

Conversation history lives only in page memory. The Worker does not store transcripts or log question content. Questions and recent context are processed by Cloudflare AI, speech text is sent to Cloudflare for audio generation, and microphone transcription uses the browser vendor's speech service. Provider data policies still apply. Students should avoid entering private information.

CORS restricts browser calls to the GitHub Pages origin; it is not authentication or a spending cap. The Worker has a best-effort per-isolate request limit that accommodates a shared school IP. For higher-traffic use, configure account-level limits separately.

## Validation

Run `npm test` and `npm run check` (Node 22+; no dependencies). The tests exercise routing, origin handling, malformed and oversized bodies, history filtering, natural voice output handling, and backend failures with a mock AI binding. Live model and audio quality must also be checked against the deployed Worker.

`GET /api/status` reports whether the AI binding exists. It does not run a model or prove available quota; verify a question and an audio request after deployment.

References: [Cloudflare Aura-2](https://developers.cloudflare.com/workers-ai/models/aura-2-en/), [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Emily Dickinson Museum](https://www.emilydickinsonmuseum.org/emily-dickinson/biography/).
