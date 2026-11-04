import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real conversation controller against browser media API doubles.
function classroom() {
  const elements = new Map(), timers = new Map(), spoken = [], played = [];
  let timerId = 0;
  const make = () => ({
    textContent: '', value: '', disabled: false, children: [], handlers: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(name, fn) { this.handlers[name] = fn; },
    setAttribute() {}, append(...children) { this.children.push(...children); },
    querySelector() { return make(); }, remove() {},
  });
  const get = id => { if (!elements.has(id)) elements.set(id, make()); return elements.get(id); };
  get('voiceEngine').value = 'natural'; get('rateRange').value = '0.9';
  const recognition = class {
    start() { this.starts = (this.starts || 0) + 1; this.onstart?.(); }
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
    window: { SpeechRecognition: recognition, speechSynthesis: {
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
  return { context, get, spoken, played, timers, run: code => vm.runInContext(code, context) };
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

test('blocked autoplay waits for a student tap instead of reopening the microphone', async () => {
  const c = classroom();
  c.context.Audio = class { async play() { throw new Error('NotAllowedError'); } pause() {} removeAttribute() {} load() {} };
  c.get('liveBtn').handlers.click();
  await c.run("answerQuestion('Hello')");
  assert.equal(c.run('audioReadyToPlay'), true);
  assert.equal(c.run('recognitionRunning'), false);
  assert.match(c.get('voiceStatus').textContent, /Hear Emily/);
  assert.equal([...c.timers.values()].filter(t => t.delay === 650).length, 0);
});
