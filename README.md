# Meet Emily Dickinson

Website: https://happycow1002.github.io/meet-emily-dickinson/

An Emily Dickinson character conversation for one person or a group. The website opens directly into **Talk with Emily**, with open-ended conversation by voice or typing, natural spoken replies, and an optional quiet text mode. The searchable library contains 444 complete public-domain poems from the three early published series (1890, 1891, 1896), with source links. It is not the entire modern scholarly catalog. Poems and the biography have direct read-aloud controls; long readings play in sequential parts. The footer explains the imagined AI portrayal; prepared replies are identified when the live connection is unavailable.

## Hosting

GitHub Pages publishes `index.html` and `app.js` from the root of `main`. Cloudflare runs `emily-worker.js` at https://emily-dickinson-ai.jedrek1002.workers.dev. The Worker root redirects to the student page.

Deploy the Worker as an **ES module**, with a Workers AI binding named **AI**. The committed `wrangler.jsonc` declares that binding. From an authenticated Cloudflare environment, run `npx wrangler deploy`, or paste `emily-worker.js` into the existing Worker's dashboard editor and add the AI binding. Do not replace the Worker with HTML. No API keys belong in the public repository or webpage.

## Use

- Talk: the opening view is **Talk with Emily**. Write a message, tap a suggestion, or press the microphone for one message. Turn off **Hear replies** for a quiet text conversation.
- Conversation: press **Start conversation** and allow the microphone. Speak naturally; Emily waits about 1.5 seconds after detected speech stops, collects final recognition, and then answers. There is no Finish-speaking button. The microphone resumes after her whole reply finishes. Press **End conversation** to stop. This is turn-by-turn conversation, not simultaneous speech or interruption detection.
- Transcript: recognized words appear while speaking. The page keeps the full recognized conversation and Emily's replies without the old 25-message cutoff. **Download full transcript** saves a text copy; download before closing or refreshing. Canceled recognized speech is retained and marked as not sent. No audio recording or persistent transcript storage is created. Automatic recognition can still mishear or miss words, especially overlapping speakers.
- Read a poem: open **Read a poem**, select a poem and press **Hear the poem**. **Emily’s voice** is selected by default. **My device voice** is available only when you choose it explicitly.
- Library: search first lines, words within poems, or sections. **Hear poem** selects a result and reads its full text. Open **Her life** and press **Hear her life** to hear the full biography.
- Microphone conversation uses the browser SpeechRecognition service, supported in compatible Chrome, Edge, and Safari environments. If unavailable or blocked by school policy, typing and spoken replies remain available. The page stops listening when hidden and pauses a conversation after ten minutes.
- If autoplay is blocked, tap **Hear Emily's last answer**. Prepared replies are labeled whenever the live service cannot answer.
- If Emily's natural voice is unavailable, her words remain readable and voice conversation stops safely. The site never switches automatically to a Google, Microsoft, or other device voice. Retry playback later, keep typing, or choose **My device voice** yourself.

## Runtime and privacy

The Worker calls Cloudflare Workers AI with `@cf/meta/llama-3.2-3b-instruct` for chat and `@cf/deepgram/aura-2-en`, speaker `athena`, for speech. Athena is the provider's mature, calm American voice; graceful period-inspired wording and a gentle playback pace shape Emily's delivery. This is an imagined character voice, not a reconstruction of Dickinson's historical voice. Cloudflare usage allowances and account/model availability apply; this is not a promise of unlimited free voice. Check the Cloudflare account's plan and AI usage before classroom-wide use. The code does not upgrade a plan or purchase credits.

Emily's conversation is open-ended for individual use or groups. The character welcomes everyday questions, practical topics, and imagined encounters with modern life, alongside poetry and history. When people introduce themselves as a class or group, Emily warmly welcomes everyone and their different voices; she does not assume a classroom otherwise. Replies adapt to the conversation without assuming a person's age, abilities, or classroom role. Imagined experiences are distinguished from historical facts; the character answers honestly if asked about being an AI portrayal.

The full conversation transcript lives only in page memory. The Worker does not store transcripts or log question content. Each current message is accepted intact up to 12,000 JavaScript string characters; longer messages receive a readable 400 error and are not sent to the model. Request bodies are capped at 128,000 bytes. For model context, the Worker selects up to 24 recent valid user/assistant messages, with at most 12,000 characters per message and a 48,000-character combined budget. It preserves chronological order and the newest content when trimming context; this bounded model context is separate from the full transcript. Questions and recent context are processed by Cloudflare AI, speech text is sent to Cloudflare for audio generation, and microphone transcription uses the browser vendor's speech service. Provider data policies still apply. Avoid entering private information.

CORS restricts browser calls to the GitHub Pages origin; it is not authentication or a spending cap. The Worker has a best-effort per-isolate request limit that accommodates a shared school IP. For higher-traffic use, configure account-level limits separately.

## Validation

Run `npm test` and `npm run check` (Node 22+; no dependencies). The tests exercise routing, origin handling, malformed and oversized bodies, history filtering, natural voice output handling, and backend failures with a mock AI binding. Live model and audio quality must also be checked against the deployed Worker.

`GET /api/status` reports whether the AI binding exists. It does not run a model or prove available quota; verify a question and an audio request after deployment.

References: [Cloudflare Aura-2](https://developers.cloudflare.com/workers-ai/models/aura-2-en/), [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Emily Dickinson Museum](https://www.emilydickinsonmuseum.org/emily-dickinson/biography/).
