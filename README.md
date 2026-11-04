# Meet Emily Dickinson

Website: https://happycow1002.github.io/meet-emily-dickinson/

An Emily Dickinson character conversation for one person or a group. The website opens directly into **Talk with Emily**, with open-ended conversation by voice or typing, natural spoken replies, and an optional quiet text mode. Four poems and a biography remain available. The footer explains the imagined AI portrayal; prepared replies are identified when the live connection is unavailable.

## Hosting

GitHub Pages publishes `index.html` and `app.js` from the root of `main`. Cloudflare runs `emily-worker.js` at https://emily-dickinson-ai.jedrek1002.workers.dev. The Worker root redirects to the student page.

Deploy the Worker as an **ES module**, with a Workers AI binding named **AI**. The committed `wrangler.jsonc` declares that binding. From an authenticated Cloudflare environment, run `npx wrangler deploy`, or paste `emily-worker.js` into the existing Worker's dashboard editor and add the AI binding. Do not replace the Worker with HTML. No API keys belong in the public repository or webpage.

## Use

- Talk: the opening view is **Talk with Emily**. Write a message, tap a suggestion, or press the microphone for one message. Turn off **Hear replies** for a quiet text conversation.
- Conversation: press **Start conversation** and allow the microphone. Speak, pause, and wait for Emily's answer. The microphone resumes after playback finishes. Press **End conversation** to stop. This is turn-by-turn conversation, not simultaneous speech or interruption detection.
- Read a poem: open **Read a poem**, select a poem and press **Hear the poem**. **Emily’s voice** is selected by default. **My device voice** is available only when you choose it explicitly.
- Microphone conversation uses the browser SpeechRecognition service, supported in compatible Chrome, Edge, and Safari environments. If unavailable or blocked by school policy, typing and spoken replies remain available. The page stops listening when hidden and pauses a conversation after ten minutes.
- If autoplay is blocked, tap **Hear Emily's last answer**. Prepared replies are labeled whenever the live service cannot answer.
- If Emily's natural voice is unavailable, her words remain readable and voice conversation stops safely. The site never switches automatically to a Google, Microsoft, or other device voice. Retry playback later, keep typing, or choose **My device voice** yourself.

## Runtime and privacy

The Worker calls Cloudflare Workers AI with `@cf/meta/llama-3.2-3b-instruct` for chat and `@cf/deepgram/aura-2-en`, speaker `athena`, for speech. Athena is the provider's mature, calm American voice; graceful period-inspired wording and a gentle playback pace shape Emily's delivery. This is an imagined character voice, not a reconstruction of Dickinson's historical voice. Cloudflare usage allowances and account/model availability apply; this is not a promise of unlimited free voice. Check the Cloudflare account's plan and AI usage before classroom-wide use. The code does not upgrade a plan or purchase credits.

Emily's conversation is open-ended for individual use or groups. The character welcomes everyday questions, practical topics, and imagined encounters with modern life, alongside poetry and history. Replies adapt to the conversation without assuming a person's age, abilities, or classroom role. Imagined experiences are distinguished from historical facts; the character answers honestly if asked about being an AI portrayal.

Conversation history lives only in page memory. The Worker does not store transcripts or log question content. Questions and recent context are processed by Cloudflare AI, speech text is sent to Cloudflare for audio generation, and microphone transcription uses the browser vendor's speech service. Provider data policies still apply. Avoid entering private information.

CORS restricts browser calls to the GitHub Pages origin; it is not authentication or a spending cap. The Worker has a best-effort per-isolate request limit that accommodates a shared school IP. For higher-traffic use, configure account-level limits separately.

## Validation

Run `npm test` and `npm run check` (Node 22+; no dependencies). The tests exercise routing, origin handling, malformed and oversized bodies, history filtering, natural voice output handling, and backend failures with a mock AI binding. Live model and audio quality must also be checked against the deployed Worker.

`GET /api/status` reports whether the AI binding exists. It does not run a model or prove available quota; verify a question and an audio request after deployment.

References: [Cloudflare Aura-2](https://developers.cloudflare.com/workers-ai/models/aura-2-en/), [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Emily Dickinson Museum](https://www.emilydickinsonmuseum.org/emily-dickinson/biography/).
