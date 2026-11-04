import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function audioSession({ fetchAudio } = {}) {
 const elements=new Map(), timers=new Map(), played=[], created=[], requests=[], revoked=[];
 let timerId=0, objectId=0;
 const make=()=>({textContent:'',value:'',disabled:false,children:[],handlers:{},classList:{add(){},remove(){},toggle(){}},
  addEventListener(name,fn){this.handlers[name]=fn;},setAttribute(){},append(...items){this.children.push(...items);},
  querySelector(){return make();},remove(){}});
 const get=id=>{if(!elements.has(id))elements.set(id,make());return elements.get(id);};
 get('voiceEngine').value='natural';get('rateRange').value='0.9';get('spokenReplies').checked=true;
 const Recognition=class {start(){this.onstart?.();}abort(){}stop(){this.onend?.();}};
 const Audio=class {
  constructor(){this.currentTime=0;this.duration=1;this.paused=true;created.push(this);}
  async play(){this.paused=false;played.push(this);this.onplay?.();}
  pause(){this.paused=true;}removeAttribute(){}load(){this.disposed=true;}
 };
 const context=vm.createContext({
  console,AbortController,AbortSignal,Blob,Response,Audio,SpeechSynthesisUtterance:class {},
  URL:{createObjectURL:()=>`blob:part-${++objectId}`,revokeObjectURL:url=>revoked.push(url)},
  window:{SpeechRecognition:Recognition,speechSynthesis:{getVoices:()=>[],cancel(){},speak(){throw Error('Device speech was not selected');}}},
  document:{hidden:false,getElementById:get,querySelectorAll:()=>[],createElement:make},
  setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
  fetch:async (url,options)=>{
   assert.match(url,/\/api\/speak$/);
   requests.push({text:JSON.parse(options.body).text,signal:options.signal});
   return fetchAudio ? fetchAudio(requests.length,options) : audioResponse();
  },
 });
 vm.runInContext(readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,''),context);
 vm.runInContext('setupSpeechRecognition();aiOnline=true;',context);
 return {context,get,Audio,created,played,requests,revoked,timers,run:code=>vm.runInContext(code,context),
  fire(id){const timer=timers.get(id);timers.delete(id);timer.fn();},goLive(){get('liveBtn').handlers.click();}};
}
const audioResponse=()=>new Response(new Uint8Array([73,68,51]),{headers:{'Content-Type':'audio/mpeg'}});
const longReading=()=>('A quiet morning opened over Amherst. The garden held its small surprises.\n\n').repeat(65)+'The final words must be heard.';
function biographySession(options){
 const c=audioSession(options);
 c.context.document.querySelectorAll=selector=>selector==='#lifePanel .biography p'
  ? [{textContent:'Emily lived in Amherst.'},{textContent:'Her garden inspired her poems.'}] : [];
 c.context.document.addEventListener=()=>{};
 c.run('connectWorker=async()=>true;init();switchTab("life");');
 return c;
}

test('the biography button retries blocked playback without requesting the audio again',async()=>{
 const c=biographySession();let attempts=0;
 c.context.Audio=class extends c.Audio{
  async play(){if(++attempts===1)throw Object.assign(Error('Tap required'),{name:'NotAllowedError'});return super.play();}
 };
 await c.get('lifeReadBtn').handlers.click();
 assert.equal(c.requests.length,1);
 assert.equal(c.played.length,0);
 assert.match(c.get('lifeStatus').textContent,/Tap Play her life/);
 assert.match(c.get('lifeReadBtn').textContent,/Play her life/);
 await c.get('lifeReadBtn').handlers.click();
 assert.equal(c.requests.length,1);
 assert.equal(c.played.length,1);
 assert.match(c.get('lifeStatus').textContent,/Emily is speaking/);
 await c.played[0].onended();
 assert.equal(c.get('lifeStatus').textContent,'Biography reading complete.');
});

test('biography pause and resume reuse the same reading and preserve all paragraphs',async()=>{
 const c=biographySession();
 await c.get('lifeReadBtn').handlers.click();
 assert.equal(c.requests[0].text,'Emily lived in Amherst.\n\nHer garden inspired her poems.');
 await c.get('lifeReadBtn').handlers.click();
 assert.equal(c.played[0].paused,true);
 assert.match(c.get('lifeReadBtn').textContent,/Resume reading/);
 await c.get('lifeReadBtn').handlers.click();
 assert.equal(c.requests.length,1);
 assert.equal(c.played[0],c.played[1]);
 assert.match(c.get('lifeReadBtn').textContent,/Pause reading/);
});

test('biography voice failures are visible on Her life and the same button can retry',async()=>{
 const c=biographySession({fetchAudio:count=>count===1?new Response('Unavailable',{status:503}):audioResponse()});
 await c.get('lifeReadBtn').handlers.click();
 assert.match(c.get('lifeStatus').textContent,/Emily’s voice is unavailable/);
 assert.equal(c.played.length,0);
 await c.get('lifeReadBtn').handlers.click();
 assert.equal(c.played.length,1);
 assert.match(c.get('lifeStatus').textContent,/Emily is speaking/);
});

test('repeated biography clicks while preparing do not cancel or request another reading',async()=>{
 let resolveAudio;
 const c=biographySession({fetchAudio:()=>new Promise(resolve=>{resolveAudio=resolve;})});
 const pending=c.get('lifeReadBtn').handlers.click();
 assert.equal(c.get('lifeReadBtn').disabled,true);
 assert.match(c.get('lifeReadBtn').textContent,/Preparing voice/);
 await c.get('lifeReadBtn').handlers.click();
 assert.equal(c.requests.length,1);
 assert.equal(c.requests[0].signal.aborted,false);
 resolveAudio(audioResponse());await pending;
 assert.equal(c.get('lifeReadBtn').disabled,false);
 assert.equal(c.played.length,1);
});

test('waiting for the initial voice connection cannot start a canceled biography reading',async()=>{
 const c=biographySession();let resolveConnection;
 c.context.pendingConnection=new Promise(resolve=>{resolveConnection=resolve;});
 c.run('aiOnline=false;aiCheck=pendingConnection;');
 const pending=c.get('lifeReadBtn').handlers.click();
 c.run('stopSpeech();aiOnline=true;');resolveConnection(true);await pending;
 assert.equal(c.requests.length,0);
 assert.equal(c.played.length,0);
});

test('long speech chunks preserve every word and respect the request limit',()=>{
 const c=audioSession();
 for(const text of [longReading(),'x'.repeat(1399)+'😀'+'y'.repeat(1600)]){
  c.context.reading=text;
  const chunks=Array.from(c.run('splitSpeechText(reading)'));
  assert.ok(chunks.length>1);
  assert.equal(chunks.join(''),text);
  assert.ok(chunks.every(chunk=>chunk.length>0&&chunk.length<=1400));
  assert.ok(chunks.every(chunk=>!/[\uD800-\uDBFF]$/.test(chunk)&&! /^[\uDC00-\uDFFF]/.test(chunk)));
 }
});

test('the full reading plays sequentially and listening resumes only after its final part',async()=>{
 const c=audioSession();c.goLive();c.context.reading=longReading();
 await c.run("express(reading,'poem')");
 assert.equal(c.requests.length,1);
 assert.equal(c.run('recognitionRunning'),false);
 await c.played[0].onended();
 assert.equal(c.requests.length,2);
 assert.equal(c.run('speaking'),true);
 assert.equal(c.run('recognitionRunning'),false);
 assert.equal([...c.timers.values()].filter(timer=>timer.delay===650).length,0);
 assert.equal(c.played[0].disposed,true);
 assert.deepEqual(c.revoked,['blob:part-1']);
 while(c.run('speaking'))await c.played.at(-1).onended();
 assert.equal(c.requests.map(request=>request.text).join(''),c.context.reading);
 const resumes=[...c.timers.entries()].filter(([,timer])=>timer.delay===650);
 assert.equal(resumes.length,1);
 c.fire(resumes[0][0]);
 assert.equal(c.run('recognitionRunning'),true);
 assert.equal(c.revoked.length,c.played.length);
});

test('Stop aborts a pending later part and prevents stale audio or additional requests',async()=>{
 let resolvePart;
 const c=audioSession({fetchAudio:count=>count===2?new Promise(resolve=>{resolvePart=resolve;}):audioResponse()});
 c.context.reading=longReading();await c.run("express(reading,'poem')");
 const pending=c.played[0].onended();
 assert.equal(c.requests.length,2);
 c.run('stopSpeech()');
 assert.equal(c.requests[1].signal.aborted,true);
 resolvePart(audioResponse());await pending;
 assert.equal(c.played.length,1);
 assert.equal(c.requests.length,2);
 assert.equal(c.run('speaking'),false);
 assert.equal(c.run('currentAudio'),null);
});

test('a later part blocked by autoplay resumes in place and keeps its remaining reading',async()=>{
 const c=audioSession();c.goLive();c.context.reading=longReading();
 await c.run("express(reading,'poem')");
 let attempts=0;
 c.context.Audio=class extends c.Audio {
  async play(){if(++attempts===1)throw Object.assign(Error('Tap required'),{name:'NotAllowedError'});return super.play();}
 };
 await c.played[0].onended();
 assert.equal(c.run('audioReadyToPlay'),true);
 assert.equal(c.run('recognitionRunning'),false);
 assert.equal([...c.timers.values()].filter(timer=>timer.delay===650).length,0);
 await c.run("playCurrentAudio('poem')");
 while(c.run('speaking'))await c.played.at(-1).onended();
 assert.equal(c.requests.map(request=>request.text).join(''),c.context.reading);
 assert.equal([...c.timers.values()].filter(timer=>timer.delay===650).length,1);
});

test('failure in a later reading part stops safely without a device fallback',async()=>{
 const c=audioSession({fetchAudio:count=>count===2?new Response('Unavailable',{status:503}):audioResponse()});
 c.goLive();c.context.reading=longReading();await c.run("express(reading,'poem')");
 await c.played[0].onended();
 assert.equal(c.requests.length,2);
 assert.equal(c.played.length,1);
 assert.equal(c.run('live'),false);
 assert.equal(c.run('speaking'),false);
 assert.equal(c.run('recognitionRunning'),false);
 assert.match(c.get('voiceStatus').textContent,/Emily’s voice is unavailable/);
 assert.equal([...c.timers.values()].filter(timer=>timer.delay===650).length,0);
});
