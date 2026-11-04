import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real conversation controller against browser media API doubles.
function classroom({ microphone = true } = {}) {
  const elements = new Map(), timers = new Map(), spoken = [], played = [], recognizers = [];
  let timerId = 0;
  const make = () => ({
    textContent: '', value: '', disabled: false, children: [], handlers: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(name, fn) { this.handlers[name] = fn; },
    setAttribute() {}, append(...children) { this.children.push(...children); },
    querySelector() { return make(); }, remove() {},
  });
  const get = id => { if (!elements.has(id)) elements.set(id, make()); return elements.get(id); };
  get('voiceEngine').value = 'natural'; get('rateRange').value = '0.9'; get('spokenReplies').checked = true;
  const recognition = class {
    constructor() { recognizers.push(this); }
    start() { this.starts = (this.starts || 0) + 1; this.onstart?.(); }
    stop() { this.stops = (this.stops || 0) + 1; this.onend?.(); }
    abort() { this.aborts = (this.aborts || 0) + 1; }
  };
  const Audio = class {
    async play() { played.push(this); this.onplay?.(); }
    pause() {} removeAttribute() {} load() {}
  };
  const context = vm.createContext({
    console, AbortController, AbortSignal, Blob, Response,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    Audio, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    window: { SpeechRecognition: microphone ? recognition : undefined, speechSynthesis: {
      getVoices: () => [], cancel() {}, speak: u => spoken.push(u),
    } },
    document: { hidden: false, getElementById: get, querySelectorAll: () => [], createElement: make },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async url => url.endsWith('/api/chat')
      ? Response.json({ answer: 'My dog was named Carlo.' })
      : new Response(new Uint8Array([73, 68, 51]), { headers: { 'Content-Type': 'audio/mpeg' } }),
  });
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/\ninit\(\);\s*$/, '');
  vm.runInContext(source, context);
  vm.runInContext('setupSpeechRecognition(); aiOnline=true;', context);
  return { context, get, spoken, played, timers, recognizers, run: code => vm.runInContext(code, context) };
}

test('a live spoken answer pauses the microphone and resumes only after playback', async () => {
  const c = classroom();
  c.get('liveBtn').handlers.click();
  assert.equal(c.run('recognitionRunning'), true);
  await c.run("answerQuestion('What was your dog named?')");
  assert.equal(c.played.length, 1);
  assert.equal(c.run('recognitionRunning'), false);
  assert.equal(c.run('speaking'), true);
  assert.equal([...c.timers.values()].filter(t => t.delay === 650).length, 0);
  c.played[0].onended();
  const resume = [...c.timers.values()].find(t => t.delay === 650);
  assert.ok(resume);
  resume.fn();
  assert.equal(c.run('recognitionRunning'), true);
});

test('ending a conversation releases the microphone and prevents automatic restart', async () => {
  const c = classroom();
  c.get('liveBtn').handlers.click();
  c.get('liveBtn').handlers.click();
  assert.equal(c.run('live'), false);
  assert.equal(c.run('recognitionRunning'), false);
  assert.equal(c.run('recognition.aborts'), 1);
  c.run('recognition.onend()');
  assert.equal([...c.timers.values()].filter(t => t.delay === 650).length, 0);
});

test('cancelled chat cannot play a late reply', async () => {
  const c = classroom();
  let resolve;
  c.context.fetch = () => new Promise(r => { resolve = r; });
  const reply = c.run("answerQuestion('Tell me about Amherst')");
  c.run('cancelTurn()');
  resolve(Response.json({ answer: 'This arrived after Stop.' }));
  await reply;
  assert.equal(c.played.length, 0);
  assert.equal(c.spoken.length, 0);
  assert.equal(c.run('aiBusy'), false);
  assert.equal(c.run('conversationHistory.length'), 0);
});

test('blocked autoplay waits for a tap instead of reopening the microphone', async () => {
  const c = classroom();
  c.context.Audio = class { async play() { throw Object.assign(new Error('Tap required'), { name: 'NotAllowedError' }); } pause() {} removeAttribute() {} load() {} };
  c.get('liveBtn').handlers.click();
  await c.run("answerQuestion('Hello')");
  assert.equal(c.run('audioReadyToPlay'), true);
  assert.equal(c.run('recognitionRunning'), false);
  assert.match(c.get('voiceStatus').textContent, /Hear Emily/);
  assert.equal(c.spoken.length, 0);
  assert.equal([...c.timers.values()].filter(t => t.delay === 650).length, 0);
});

function assertNaturalVoiceStopped(c) {
  assert.equal(c.spoken.length, 0);
  assert.equal(c.run('live'), false);
  assert.equal(c.run('recognitionRunning'), false);
  assert.equal(c.run('speaking'), false);
  assert.equal(c.run('audioReadyToPlay'), false);
  assert.equal(c.run('currentAudio'), null);
  assert.match(c.get('voiceStatus').textContent, /Emily’s voice is unavailable/);
  assert.equal([...c.timers.values()].filter(t => t.delay === 650).length, 0);
}

test('offline natural voice keeps the readable reply without device speech or a listening loop', async () => {
  const c = classroom();
  c.run('aiOnline=false');
  c.get('liveBtn').handlers.click();
  await c.run("answerQuestion('Tell me about your garden.')");
  assert.ok(c.run('lastReply.length') > 0);
  assert.equal(c.played.length, 0);
  assertNaturalVoiceStopped(c);
});

test('natural voice service failures never substitute a device voice', async t => {
  const failures = [
    ['service error', () => new Response('Unavailable', { status: 503 })],
    ['network error', () => { throw new Error('Network unavailable'); }],
    ['invalid audio type', () => new Response('Not audio', { headers: { 'Content-Type': 'text/plain' } })],
    ['empty audio', () => new Response(new Uint8Array(), { headers: { 'Content-Type': 'audio/mpeg' } })],
  ];
  for (const [name, response] of failures) await t.test(name, async () => {
    const c = classroom();
    c.context.fetch = async url => url.endsWith('/api/chat')
      ? Response.json({ answer: 'My dog was named Carlo.' }) : response();
    c.get('liveBtn').handlers.click();
    await c.run("answerQuestion('What was your dog named?')");
    assert.equal(c.run('lastReply'), 'My dog was named Carlo.');
    assert.equal(c.played.length, 0);
    assertNaturalVoiceStopped(c);
  });
});

test('natural audio playback errors stop conversation without device speech', async () => {
  const c = classroom();
  c.get('liveBtn').handlers.click();
  await c.run("answerQuestion('Hello')");
  assert.equal(c.played.length, 1);
  c.played[0].onerror();
  assert.equal(c.run('lastReply'), 'My dog was named Carlo.');
  assertNaturalVoiceStopped(c);
});

test('an unsupported natural audio format is not treated as blocked autoplay', async () => {
  const c = classroom();
  c.context.Audio = class { async play() { throw Object.assign(new Error('Cannot decode'), { name: 'NotSupportedError' }); } pause() {} removeAttribute() {} load() {} };
  c.get('liveBtn').handlers.click();
  await c.run("answerQuestion('Hello')");
  assertNaturalVoiceStopped(c);
});

test('device speech remains available only through an explicit voice selection', async () => {
  const c = classroom();
  c.get('voiceEngine').value = 'device';
  c.run('aiOnline=false');
  await c.run("express('A voice chosen by you.')");
  assert.equal(c.spoken.length, 1);
  assert.equal(c.spoken[0].text, 'A voice chosen by you.');
  assert.equal(c.played.length, 0);
});

test('typing remains available without microphone support and can stay silent', async () => {
  const c = classroom({ microphone: false });
  assert.equal(c.get('liveBtn').disabled, true);
  assert.equal(c.get('micBtn').disabled, true);
  assert.equal(c.get('questionInput').disabled, false);
  c.get('spokenReplies').checked = false;
  await c.run("answerQuestion('Let us talk about my day.')");
  assert.equal(c.run('conversationHistory.length'), 2);
  assert.equal(c.run('lastReply'), 'My dog was named Carlo.');
  assert.equal(c.played.length, 0);
  assert.equal(c.spoken.length, 0);
  assert.equal(c.get('questionInput').disabled, false);
  assert.equal(c.run('recognitionRunning'), false);
});

test('opening conversation mode stops an active poem reading', () => {
  const c = classroom();
  c.run("activeTab='read'; speaking=true; speakingKind='poem'; switchTab('talk')");
  assert.equal(c.run('speaking'), false);
  assert.equal(c.run('speakingKind'), null);
  assert.equal(c.run('activeTab'), 'talk');
  assert.equal(c.get('portraitTitle').textContent, 'A conversation with Emily');
});

function voiceCapture({ live = true } = {}) {
  const c = classroom(), sent = [], unsent = [];
  c.context.capturedTurns = sent; c.context.unsentTurns = unsent;
  c.run('answerQuestion=words=>capturedTurns.push(words); preserveUnsentSpeech=words=>unsentTurns.push(words);');
  c.get(live ? 'liveBtn' : 'micBtn').handlers.click();
  return { ...c, sent, unsent, current: () => c.run('recognition') };
}

function speechResults(recognizer, parts, resultIndex = 0) {
  const results = parts.map(([transcript, final]) => Object.assign([{ transcript }], { isFinal: final }));
  recognizer.onresult({ resultIndex, results });
}

function fireTimer(c, delay) {
  const entry = [...c.timers].find(([, timer]) => timer.delay === delay);
  assert.ok(entry, `Expected a ${delay} ms timer`);
  c.timers.delete(entry[0]); entry[1].fn();
}

test('continuous speech revises interim results and sends all segments after a natural pause', () => {
  const c = voiceCapture(), r = c.current();
  assert.equal(r.continuous, true); assert.equal(r.interimResults, true);
  r.onspeechstart();
  speechResults(r, [['I would', false]]);
  speechResults(r, [['I would like', true], [' to share', false]]);
  speechResults(r, [['I would like', true], [' to share a thought.', false]], 1);
  assert.equal(c.get('listeningTranscript').textContent, 'I would like to share a thought.');
  assert.equal(c.sent.length, 0);
  assert.equal([...c.timers.values()].filter(t => t.delay === 1500).length, 0);
  // A removal-only event discards the superseded interim suffix.
  speechResults(r, [['I would like', true]], 1);
  assert.equal(c.get('listeningTranscript').textContent, 'I would like');
  speechResults(r, [['I would like', true], [' to share a thought.', true]], 1);
  r.onspeechend(); fireTimer(c, 1500);
  assert.deepEqual(c.sent, ['I would like to share a thought.']);
  assert.equal(r.stops, 1); assert.deepEqual(c.unsent, []);
});

test('separate recognition results keep word boundaries without supplied whitespace', () => {
  const c=voiceCapture(), r=c.current();
  speechResults(r,[['We have',true],['two questions.',true]]);
  assert.equal(c.get('listeningTranscript').textContent,'We have two questions.');
  r.onspeechend();fireTimer(c,1500);
  assert.deepEqual(c.sent,['We have two questions.']);
});

test('a renewed phrase or newer interim invalidates earlier pause callbacks', () => {
  const c = voiceCapture(), r = c.current();
  speechResults(r, [['The first part', false]]);
  const oldPause = [...c.timers.values()].find(t => t.delay === 1500).fn;
  r.onspeechstart(); oldPause();
  assert.equal(c.sent.length, 0);
  speechResults(r, [['The first part continues', false]]);
  r.onspeechend();
  const supersededPause = [...c.timers.values()].find(t => t.delay === 1500).fn;
  speechResults(r, [['The first part continues a little longer.', true]]);
  supersededPause(); assert.equal(c.sent.length, 0);
  fireTimer(c, 1500);
  assert.deepEqual(c.sent, ['The first part continues a little longer.']);
});

test('early recognition endings preserve segments across one-shot restarts without duplicate sends', () => {
  const c = voiceCapture({ live: false }), first = c.current();
  speechResults(first, [['One thought.', true], [' Another', false]]);
  first.onend(); fireTimer(c, 650);
  const next = c.current(); assert.notEqual(next, first);
  next.onspeechstart();
  speechResults(next, [[' thought follows.', true]]);
  speechResults(first, [['Late old words', true]]); first.onend();
  next.onspeechend(); fireTimer(c, 1500);
  assert.deepEqual(c.sent, ['One thought. Another thought follows.']);
  next.onend(); assert.equal(c.sent.length, 1);
});

test('graceful stop waits for final corrections and commits only once', () => {
  const c = voiceCapture(), r = c.current();
  r.stop = () => { r.stops = (r.stops || 0) + 1; };
  speechResults(r, [['A little flour', false]]); fireTimer(c, 1500);
  assert.equal(c.sent.length, 0); assert.equal(r.stops, 1);
  const fallback = [...c.timers.values()].find(t => t.delay === 1200).fn;
  speechResults(r, [['A little flower', true]]); r.onend(); fallback();
  assert.deepEqual(c.sent, ['A little flower']);
  assert.deepEqual(c.unsent, []);
});

test('missing final events preserve the complete observed interim at the guarded fallback', () => {
  const c = voiceCapture(), r = c.current(), words = 'A complete long recognized thought. '.repeat(20);
  r.stop = () => {};
  speechResults(r, [[words, false]]); fireTimer(c, 1500); fireTimer(c, 1200);
  assert.deepEqual(c.sent, [words]);
  r.onend(); speechResults(r, [['Late replacement', true]]);
  assert.equal(c.sent.length, 1);
});

test('stopping, hiding, or changing mode cancels pending speech and preserves it once', async t => {
  for (const reason of ['stop', 'hidden', 'mode']) await t.test(reason, () => {
    const c = voiceCapture(), r = c.current();
    speechResults(r, [['Words still being spoken', false]]);
    const pending = [...c.timers.values()].find(timer => timer.delay === 1500).fn;
    if (reason === 'stop') c.get('liveBtn').handlers.click();
    else if (reason === 'hidden') { c.context.document.hidden = true; c.run('endLive()'); }
    else c.run("switchTab('read')");
    pending(); r.onend(); speechResults(r, [['Late result', true]]);
    assert.deepEqual(c.sent, []); assert.deepEqual(c.unsent, ['Words still being spoken']);
    assert.equal(c.run('captureActive'), false);
    assert.equal([...c.timers.values()].filter(timer => [650, 1500, 1200].includes(timer.delay)).length, 0);
  });
});

test('three empty recognition sessions pause instead of restarting forever', () => {
  const c = voiceCapture();
  for (let i = 0; i < 3; i++) {
    const r = c.current(); r.onerror({ error: 'no-speech' }); r.onend();
    if (i < 2) fireTimer(c, 650);
  }
  assert.equal(c.run('captureActive'), false); assert.equal(c.run('live'), false);
  assert.deepEqual(c.sent, []);
  assert.equal([...c.timers.values()].filter(timer => timer.delay === 650).length, 0);
});

test('cancelled finalization and queued restart callbacks cannot send or reopen the microphone', () => {
  const c = voiceCapture(), r = c.current();
  r.stop = () => {};
  speechResults(r, [['A thought waiting for final recognition', false]]); fireTimer(c, 1500);
  const finalFallback = [...c.timers.values()].find(timer => timer.delay === 1200).fn;
  c.get('liveBtn').handlers.click(); finalFallback(); r.onend();
  assert.deepEqual(c.sent, []);
  assert.deepEqual(c.unsent, ['A thought waiting for final recognition']);
  c.get('liveBtn').handlers.click(); c.current().onend();
  const restart = [...c.timers.values()].find(timer => timer.delay === 650).fn;
  c.get('liveBtn').handlers.click();
  const count = c.recognizers.length; restart();
  assert.equal(c.recognizers.length, count); assert.equal(c.run('recognitionRunning'), false);
});
