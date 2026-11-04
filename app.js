
'use strict';
const poems=window.emilyPoemLibrary||[
{id:'hope',title:'“Hope” is the thing with feathers —',short:'Hope is the thing with feathers',mood:'For courage & the difficult days',lines:[
'“Hope” is the thing with feathers —','That perches in the soul —','And sings the tune without the words —','And never stops — at all —','',
'And sweetest — in the Gale — is heard —','And sore must be the storm —','That could abash the little Bird','That kept so many warm —','',
'I’ve heard it in the chillest land —','And on the strangest Sea —','Yet — never — in Extremity,','It asked a crumb — of me.']},
{id:'nobody',title:'I’m Nobody! Who are you?',short:'I’m Nobody! Who are you?',mood:'For anyone who feels different',lines:[
'I’m Nobody! Who are you?','Are you — Nobody — too?','Then there’s a pair of us!','Don’t tell! they’d advertise — you know!','',
'How dreary — to be — Somebody!','How public — like a Frog —','To tell one’s name — the livelong June —','To an admiring Bog!']},
{id:'bird',title:'A Bird came down the Walk —',short:'A Bird came down the Walk',mood:'For lovers of the natural world',lines:[
'A Bird came down the Walk —','He did not know I saw —','He bit an Angleworm in halves','And ate the fellow, raw,','',
'And then he drank a Dew','From a convenient Grass —','And then hopped sidewise to the Wall','To let a Beetle pass —','',
'He glanced with rapid eyes','That hurried all abroad —','They looked like frightened Beads, I thought —','He stirred his Velvet Head','',
'Like one in danger, Cautious,','I offered him a Crumb','And he unrolled his feathers','And rowed him softer Home —','',
'Than Oars divide the Ocean,','Too silver for a seam —','Or Butterflies, off Banks of Noon','Leap, plashless as they swim.']},
{id:'heart',title:'If I can stop one Heart from breaking',short:'If I can stop one Heart from breaking',mood:'For kindness & compassion',lines:[
'If I can stop one Heart from breaking','I shall not live in vain','If I can ease one Life the Aching','Or cool one Pain','',
'Or help one fainting Robin','Unto his Nest again','I shall not live in Vain.']}
];
// Fixed public backend; students never enter credentials or configuration.
const workerURL = 'https://emily-dickinson-ai.jedrek1002.workers.dev';
let aiOnline=false, aiBusy=false, aiCheck=null, conversationHistory=[], lastReply='';
const transcript=[], MAX_MESSAGE_CHARS=12000;
let currentAudio=null, currentAudioObjectURL=null, speechRun=0, audioReadyToPlay=false, speechRequest=null;
let currentPoem=0, activeTab='talk', speaking=false, speakingKind=null, chosenVoice='';
let libraryUI=null;
let recognition=null, recognitionRunning=false, live=false, listenTimer=null, liveTimer=null, noSpeech=0;
let recognitionFactory=null, recognitionStarting=false, recognitionSession=0;
let captureActive=false, captureGeneration=0, capturePauseRevision=0, captureTimer=null, captureFinalTimer=null, captureFinishing=false, speechActive=false;
let capturedSegments=[], recognitionSegments=[];
const TURN_PAUSE_MS=1500;
let turnRun=0, chatRequest=null;
const $=id=>document.getElementById(id), synth=window.speechSynthesis||null;
function recordTranscript(role,text,source='live'){
 if(!text)return;
 transcript.push({role,text,source});
 $('downloadTranscriptBtn').disabled=false;
 $('transcriptStatus').textContent=`${transcript.length} ${transcript.length===1?'message':'messages'} kept in this session. Download before closing or refreshing.`;
 if($('fullTranscriptView'))$('fullTranscriptView').value=transcriptText();
}
function preserveUnsentSpeech(text){
 if(text?.trim()){addBubble('you',text,'unsent');status('Your recognized words are kept in the transcript.');}
}
function transcriptText(){
 return 'Conversation with Emily Dickinson\nAutomatically transcribed speech may contain errors. No audio recording is saved.\n\n'+transcript.map(entry=>`${entry.role==='you'?(entry.source==='unsent'?'You (not sent)':'You'):'Emily'}: ${entry.text}`).join('\n\n');
}
function downloadTranscript(){
 const url=URL.createObjectURL(new Blob([transcriptText()],{type:'text/plain;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download='Conversation-with-Emily.txt';link.hidden=true;document.body.append(link);link.click();
 setTimeout(()=>{link.remove();URL.revokeObjectURL(url);},1000);
}
function chatBody(question){
 const history=conversationHistory.slice(-24).map(message=>({...message}));
 while(history.reduce((total,message)=>total+message.content.length,0)>48000)history.shift();
 let body=JSON.stringify({question,history});
 while(history.length&&new Blob([body]).size>120000){history.shift();body=JSON.stringify({question,history});}
 return body;
}
function escapeHTML(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function status(text){$('readStatus').textContent=text;$('voiceStatus').textContent=text;}
function displayPoem(){const p=poems[currentPoem];$('poemText').innerHTML=p.lines.map((line,i)=>line?`<div class="poem-line" data-idx="${i}">${escapeHTML(line)}</div>`:'<div class="poem-break"></div>').join('');$('portraitTitle').textContent=p.title;document.querySelectorAll('.poem-tile').forEach(el=>el.classList.toggle('selected',el.dataset.poem===p.id));libraryUI?.refreshSelection();}
function choosePoem(i){endLive();stopSpeech();currentPoem=i;displayPoem();switchTab('read');}
function switchTab(tab){
 const changed=activeTab!==tab;
 if(tab!=='talk'||changed){endLive();stopSpeech();cancelTurn();}
 activeTab=tab;document.querySelectorAll('.tab').forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
 document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===tab+'Panel'));
 const copy={read:['From the poetry of Emily Dickinson','A poem, spoken just for you'],talk:['A conversation across time','Talk with Emily'],life:['1830 — 1886 · Amherst, Massachusetts','The poet behind the words'],library:[`${poems.length} poems · many possible worlds`,'Choose your next poem']};
 $('panelEyebrow').textContent=copy[tab][0];$('panelHeading').textContent=copy[tab][1];
 $('portraitQuote').textContent=tab==='talk'?'“Tell me what is on your mind, and let us begin.”':'“My words have little wings. Shall we listen for them?”';
 $('portraitTitle').textContent=tab==='talk'?'A conversation with Emily':poems[currentPoem].title;
 if(!speaking)$('portraitStatus').textContent=tab==='talk'?'Ready to talk with you':'Ready to share a poem';
 if(tab==='talk'&&changed)status('Start a voice conversation, or write to Emily below.');
}
function setSpeaking(on,kind){speaking=on;speakingKind=on?kind:null;$('portrait').classList.toggle('speaking',on);$('portraitStatus').textContent=on?(kind==='poem'?'Reading her poetry…':'Emily is speaking…'):activeTab==='talk'?'Ready to talk with you':'Ready to share a poem';$('playBtn').textContent=on&&kind==='poem'?'Ⅱ Pause reading':'▶ Hear the poem';}
function stopListening({preserve=true}={}){
 const pending=recognizedSpeech();
 if(preserve&&pending.trim()&&typeof preserveUnsentSpeech==='function')preserveUnsentSpeech(pending);
 clearTimeout(listenTimer);clearTimeout(captureTimer);clearTimeout(captureFinalTimer);listenTimer=captureTimer=captureFinalTimer=null;
 captureActive=false;captureGeneration++;capturePauseRevision++;recognitionSession++;speechActive=false;
 captureFinishing=false;
 capturedSegments=[];recognitionSegments=[];
 const wasListening=recognitionRunning||recognitionStarting;recognitionRunning=recognitionStarting=false;
 if(wasListening)try{recognition?.abort();}catch{}
 $('micBtn').classList.remove('active');
}
function stopSpeech(){
 speechRun++;speechRequest?.abort();speechRequest=null;
 if(synth)synth.cancel();
 releaseCurrentAudio();
 audioReadyToPlay=false;setSpeaking(false);document.querySelectorAll('.poem-line').forEach(e=>e.classList.remove('highlight'));
}
function releaseCurrentAudio(){
 if(currentAudio){const a=currentAudio;currentAudio=null;a.onended=a.onerror=a.onplay=a.onpause=null;a.pause();a.removeAttribute('src');a.load();}
 if(currentAudioObjectURL){URL.revokeObjectURL(currentAudioObjectURL);currentAudioObjectURL=null;}
}
function speechFinished(){stopSpeech();status(live?'Your turn. Listening…':'Ready for your next question.');maybeListen();}
function maybeListen(){clearTimeout(listenTimer);if(live&&!aiBusy&&!speaking&&!audioReadyToPlay&&!document.hidden){const generation=captureGeneration;listenTimer=setTimeout(()=>{listenTimer=null;if(live&&generation===captureGeneration&&!document.hidden)startListening();},650);}}
function endLive(message='Voice conversation ended. You can keep typing.'){
 live=false;clearTimeout(liveTimer);stopListening();$('liveBtn').textContent='🎙 Start conversation';$('liveBtn').setAttribute('aria-pressed','false');status(message);
}
function cancelTurn(){turnRun++;chatRequest?.abort();chatRequest=null;setBusy(false);document.querySelectorAll('.bubble.waiting').forEach(el=>el.remove());}
function joinSpeechSegments(parts){return parts.reduce((all,part)=>!part?all:!all?part:all+(/\s$/.test(all)||/^\s/.test(part)?'':' ')+part,'');}
function recognizedSpeech(){
 const current=joinSpeechSegments(recognitionSegments.map(result=>result?.text||''));
 return joinSpeechSegments([...capturedSegments,current]);
}
function showRecognizedSpeech(){const display=$('listeningTranscript');if(display)display.textContent=recognizedSpeech();}
function canCaptureSpeech(){return captureActive&&!aiBusy&&!speaking&&!audioReadyToPlay&&!document.hidden&&activeTab==='talk';}
function sendRecognizedSpeech(generation){
 if(generation!==captureGeneration||!canCaptureSpeech())return;
 const words=recognizedSpeech();if(!words.trim()){endLive('I did not hear words clearly. You can try again or type.');return;}
 stopListening({preserve:false});answerQuestion(words);
}
function finishRecognizedSpeech(generation){
 if(generation!==captureGeneration||!canCaptureSpeech()||speechActive||captureFinishing)return;
 captureFinishing=true;clearTimeout(listenTimer);listenTimer=null;
 status('Waiting for your final words…');
 if(recognitionRunning||recognitionStarting){
  captureFinalTimer=setTimeout(()=>sendRecognizedSpeech(generation),1200);
  try{recognition.stop();}catch{sendRecognizedSpeech(generation);}
 }else sendRecognizedSpeech(generation);
}
function scheduleSpeechCommit(){
 const pauseRevision=++capturePauseRevision;
 clearTimeout(captureTimer);captureTimer=null;
 if(!canCaptureSpeech()||captureFinishing||speechActive||!recognizedSpeech().trim())return;
 const generation=captureGeneration;
 status('Waiting for a pause… Keep speaking if you have more to say.');
 captureTimer=setTimeout(()=>{
  if(pauseRevision!==capturePauseRevision)return;
  captureTimer=null;
  if(generation!==captureGeneration||!canCaptureSpeech()||speechActive)return;
  finishRecognizedSpeech(generation);
 },TURN_PAUSE_MS);
}
function restartRecognition(){
 clearTimeout(listenTimer);listenTimer=null;
 if(!canCaptureSpeech()||captureFinishing)return;
 const generation=captureGeneration;
 listenTimer=setTimeout(()=>{listenTimer=null;if(generation===captureGeneration&&canCaptureSpeech())startListening();},650);
}
function startListening(){
 if(!recognitionFactory||recognitionRunning||recognitionStarting||captureFinishing||aiBusy||speaking||audioReadyToPlay||document.hidden||activeTab!=='talk')return;
 if(!captureActive){captureActive=true;captureGeneration++;capturedSegments=[];recognitionSegments=[];noSpeech=0;showRecognizedSpeech();}
 recognition=createRecognition();recognitionStarting=true;
 try{recognition.start();$('micBtn').classList.add('active');}
 catch{recognitionStarting=recognitionRunning=false;endLive('Microphone unavailable. Try typing your question.');}
}
function createRecognition(){
 const session=++recognitionSession, generation=captureGeneration;
 const current=new recognitionFactory();let emptyReported=false;
 current.lang='en-US';current.continuous=true;current.interimResults=true;current.maxAlternatives=1;
 const active=()=>session===recognitionSession&&generation===captureGeneration&&captureActive;
 current.onstart=()=>{if(!active())return;recognitionStarting=false;recognitionRunning=true;status('Listening… Take your time.');};
 current.onspeechstart=()=>{if(!active()||captureFinishing)return;speechActive=true;capturePauseRevision++;clearTimeout(captureTimer);captureTimer=null;status('Listening… Keep speaking.');};
 current.onspeechend=()=>{if(!active()||captureFinishing)return;speechActive=false;scheduleSpeechCommit();};
 current.onresult=event=>{
  if(!active()||!canCaptureSpeech())return;
  const results=event.results;if(!results)return;
  const first=Number.isInteger(event.resultIndex)?event.resultIndex:0;
  for(let i=first;i<results.length;i++)recognitionSegments[i]={text:results[i]?.[0]?.transcript||'',final:!!results[i]?.isFinal};
  recognitionSegments.length=results.length;noSpeech=0;
  showRecognizedSpeech();
  if(!captureFinishing){scheduleSpeechCommit();if(speechActive)status('Listening… Keep speaking.');}
 };
 current.onend=()=>{
  if(!active())return;
  recognitionStarting=recognitionRunning=false;speechActive=false;$('micBtn').classList.remove('active');
  const segment=joinSpeechSegments(recognitionSegments.map(result=>result?.text||''));
  if(segment)capturedSegments.push(segment);recognitionSegments=[];showRecognizedSpeech();
  if(captureFinishing){sendRecognizedSpeech(generation);return;}
  if(!segment&&!emptyReported)noSpeech++;
  if(noSpeech>=3&&!recognizedSpeech().trim()){endLive('Conversation paused. Tap the microphone when you are ready.');return;}
  if(!captureTimer)scheduleSpeechCommit();
  if(noSpeech<3)restartRecognition();
 };
 current.onerror=event=>{
  if(!active())return;
  if(event.error==='no-speech'){
   emptyReported=true;noSpeech++;
   if(noSpeech>=3&&!recognizedSpeech().trim())endLive('Conversation paused. Tap the microphone when you are ready.');
   else status('Listening… Take your time.');
   return;
  }
  endLive(event.error==='not-allowed'?'Microphone permission was denied. You can type instead.':'Microphone unavailable. You can type instead.');
 };
 return current;
}
function preferredSpeechMode(){return $('voiceEngine').value;}
function naturalVoiceUnavailable(){
 stopSpeech();endLive('Emily’s voice is unavailable right now. You can read her words and try again later.');return false;
}
async function playCurrentAudio(kind='chat'){
 const run=speechRun;
 try{await currentAudio.play();return true;}
 catch(error){
  if(run!==speechRun)return false;
  if(error?.name==='NotAllowedError'){
   audioReadyToPlay=true;setSpeaking(false);status(kind==='poem'?'Voice ready. Tap Hear the poem again.':'Voice ready. Tap Hear Emily’s last answer.');return false;
  }
  return naturalVoiceUnavailable();
 }
}
function splitSpeechText(text,maximum=1400){
 if(!Number.isInteger(maximum)||maximum<2)throw new RangeError('Speech chunk size must be at least two characters');
 if(typeof text!=='string'||!text.trim())return [];
 const chunks=[];let rest=text;
 while(rest.length>maximum){
  const window=rest.slice(0,maximum), minimum=Math.floor(maximum/2);
  let end=0;
  const stanza=window.lastIndexOf('\n\n');
  if(stanza>=minimum)end=stanza+2;
  if(!end)for(const match of window.matchAll(/[.!?…]["'’”)]*\s+/g)){const boundary=match.index+match[0].length;if(boundary>=minimum)end=boundary;}
  if(!end)for(const match of window.matchAll(/\s+/g)){const boundary=match.index+match[0].length;if(boundary>=minimum)end=boundary;}
  if(!end)end=maximum;
  // Keep a Unicode character intact even when a very long word must be split.
  if(/[\uD800-\uDBFF]/.test(rest[end-1])&&/[\uDC00-\uDFFF]/.test(rest[end]))end--;
  chunks.push(rest.slice(0,end));rest=rest.slice(end);
 }
 if(rest)chunks.push(rest);
 return chunks;
}
async function express(text,kind='chat'){
 stopListening();stopSpeech();
 if(preferredSpeechMode()==='device')return say(text,kind);
 if(!aiOnline)return naturalVoiceUnavailable();
 const run=speechRun, chunks=splitSpeechText(text).filter(part=>part.trim());
 if(!chunks.length)return false;
 const playChunk=async index=>{
  if(run!==speechRun)return false;
  releaseCurrentAudio();audioReadyToPlay=false;
  setSpeaking(true,kind);status('Preparing Emily’s natural voice…');
  const controller=new AbortController();speechRequest=controller;const timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const res=await fetch(workerURL+'/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:chunks[index]}),signal:controller.signal});
   if(run!==speechRun)return false;
   if(!res.ok)throw Error('Voice unavailable');
   const blob=await res.blob();if(run!==speechRun)return false;
   if(!blob.type.startsWith('audio/')||!blob.size)throw Error('Invalid audio');
   const audio=new Audio();currentAudio=audio;currentAudioObjectURL=URL.createObjectURL(blob);audio.src=currentAudioObjectURL;
   audio.playbackRate=Number($('rateRange').value);audio.preload='auto';
   audio.onplay=()=>{if(run===speechRun&&currentAudio===audio){audioReadyToPlay=false;setSpeaking(true,kind);status('Emily is speaking…');}};
   audio.onpause=()=>{if(currentAudio===audio&&audio.currentTime<audio.duration)status('Paused');};
   audio.onended=()=>{
    if(run!==speechRun||currentAudio!==audio)return false;
    if(index+1<chunks.length)return playChunk(index+1);
    speechFinished();return true;
   };
   audio.onerror=()=>{if(run===speechRun&&currentAudio===audio)naturalVoiceUnavailable();};
   return await playCurrentAudio(kind);
  }catch{if(run!==speechRun)return false;return naturalVoiceUnavailable();}
  finally{clearTimeout(timeout);if(speechRequest===controller)speechRequest=null;}
 };
 return await playChunk(0);
}
function aiMode(text,ready=false){$('aiModeLabel').textContent=text;$('talkPanel').querySelector('.ai-mode').classList.toggle('live',ready);}
async function connectWorker(){
 aiMode('Connecting to Emily…');$('retryBtn').disabled=true;
 try{const r=await fetch(workerURL+'/api/status',{signal:AbortSignal.timeout(9000),cache:'no-store'});const data=await r.json();aiOnline=r.ok&&data.status==='ready'&&data.service==='emily-poetry-ai';}
 catch{aiOnline=false;}
 finally{$('retryBtn').disabled=false;aiMode(aiOnline?'● Connected to Emily':'Connection unavailable · Prepared replies available',aiOnline);}
 return aiOnline;
}
function preferredVoice(){if(!synth)return null;let voices=synth.getVoices().filter(v=>/^en/i.test(v.lang));if(chosenVoice){const picked=voices.find(v=>v.voiceURI===chosenVoice);if(picked)return picked;}const score=(v)=>{let n=v.name.toLowerCase();let s=0;if(/en-us/i.test(v.lang))s+=20;if(/samantha|jenny|aria|ava|susan|victoria|allison|salli|joanna|female|zira/i.test(n))s+=35;if(/google us english|natural|neural|premium|enhanced/i.test(n))s+=30;if(/english \(united states\)/i.test(n))s+=4;if(/male|david|mark|guy/i.test(n))s-=8;return s;};return voices.sort((a,b)=>score(b)-score(a))[0]||null;}
function loadVoices(){if(!synth)return;const list=synth.getVoices().filter(v=>/^en/i.test(v.lang));let sel=$('voiceChoice'),before=sel.value;sel.innerHTML='<option value="">Automatic English voice</option>'+list.map(v=>`<option value="${escapeHTML(v.voiceURI)}">${escapeHTML(v.name)} (${escapeHTML(v.lang)})</option>`).join('');sel.value=before||chosenVoice||'';}
function say(text,kind='chat'){
 if(!synth){endLive('Voice playback is unavailable. You can read Emily’s answer above.');return false;}
 const run=speechRun, utterance=new SpeechSynthesisUtterance(text), voice=preferredVoice();if(voice)utterance.voice=voice;
 utterance.lang=voice?.lang||'en-US';utterance.rate=Number($('rateRange').value);utterance.pitch=1.02;
 setSpeaking(true,kind);
 utterance.onstart=()=>{if(run===speechRun){setSpeaking(true,kind);status('Emily is speaking with your device voice…');}};
 utterance.onend=()=>{if(run===speechRun)speechFinished();};
 utterance.onerror=()=>{if(run===speechRun){stopSpeech();endLive('Voice playback stopped. You can read the answer above.');}};
 if(kind==='poem'){
  let offset=0;const ranges=poems[currentPoem].lines.map((line,i)=>{const r={start:offset,end:offset+line.length+1,i};offset+=line.length+1;return r;});
  utterance.onboundary=e=>{const r=ranges.find(r=>e.charIndex>=r.start&&e.charIndex<r.end);if(r)document.querySelectorAll('.poem-line').forEach(el=>el.classList.toggle('highlight',Number(el.dataset.idx)===r.i));};
 }
 synth.speak(utterance);return true;
}
function readPoem(){
 if(currentAudio&&audioReadyToPlay){playCurrentAudio('poem');return;}
 if(speaking&&speakingKind==='poem'){
  if(currentAudio){if(currentAudio.paused)playCurrentAudio('poem');else{currentAudio.pause();$('playBtn').textContent='▶ Resume reading';}}
  else if(synth?.paused){synth.resume();$('playBtn').textContent='Ⅱ Pause reading';}else{synth?.pause();$('playBtn').textContent='▶ Resume reading';}
  return;
 }
 const p=poems[currentPoem];express(p.lines.map(l=>l||' ').join('\n'),'poem');
}
function addBubble(who,text,source='prepared'){
 const el=document.createElement('div');el.className='bubble '+who;
 const small=document.createElement('small');small.textContent=who==='you'?(source==='unsent'?'You · not sent':'You'):source==='live'?'Emily':source==='waiting'?'Emily · thinking…':'Emily · prepared response';
 const body=document.createElement('span');body.textContent=text;el.append(small,body);$('conversation').append(el);
 if(who==='you'||source!=='waiting')recordTranscript(who,text,source);
 $('conversation').scrollTop=$('conversation').scrollHeight;return el;
}
const answers=[
{re:/\b(hope|feather|bird.? song|keep going|hard time|resilien|optimis)/i,answer:'Hope, to my imagining, is a small and steadfast visitor. It does not promise that storms will cease. It sings even while the wind is strong. Is there something that helps you keep hoping?'},
{re:/\b(why.*(write|poe)|what.*(inspir|write)|inspir|poetry|poem|words|verse)/i,answer:'Words have a way of opening doors where walls once stood. I often found that a small image — a bird, a flower, a window — could hold a much larger feeling. Which image in a poem stays with you?'},
{re:/\b(garden|flower|plant|rose|botan|nature|outdoor)/i,answer:'I loved the company of flowers. My Amherst garden offered a world of color, patience, and surprise; I also gathered plants into a herbarium when I was young. A garden is a kind of poem that the seasons write.'},
{re:/\b(lonely|alone|friend|reclus|isolat|stay home|house)/i,answer:'People often imagine me entirely alone, but letters, family, friends, and books brought many voices into my world. I spent much time at home in Amherst, yes; that does not mean my thoughts were small.'},
{re:/\b(death|dying|die|grave|immortal|afterlife|etern)/i,answer:'Death and eternity were great mysteries to me, so I placed them in poems and examined them from unexpected angles. In one poem, Death is a courteous carriage driver — a startling image, perhaps, but one that makes a mystery easier to approach.'},
{re:/\b(age|born|birth|when.*live|year|century|amherst|massachusetts|where.*from)/i,answer:'I was born in Amherst, Massachusetts, on December 10, 1830, and lived until May 15, 1886. Amherst was a small town with more worlds inside it than any map could show.'},
{re:/\b(famil|sister|brother|mother|father|lavinia|austin|susan)/i,answer:'I grew up with my older brother, Austin, and my younger sister, Lavinia — dear Vinnie. My family and the friends beside our home were woven into my days, letters, and thinking.'},
{re:/\b(publish|famous|readers|success|recognition|books?)/i,answer:'Few of my poems were published while I lived. Many were discovered and brought to readers after my death. Fame was not the center of my work; making something true in words mattered more.'},
{re:/\b(rhyme|dash|punctuat|capital|style|short lines|meter)/i,answer:'A dash can leave a door ajar for the reader. My poems often use brief lines, unusual pauses, and surprising rhymes. Silence may say as much as a full stop.'},
{re:/\b(love|romanc|heart|marry|husband|relationship)/i,answer:'Love was a deep subject in my poems, and scholars continue to debate the relationships behind some of my writing. Poems give us feelings, but they do not always provide a complete biography.'},
{re:/\b(school|teach|student|educat|learn|study)/i,answer:'I attended Amherst Academy and later Mount Holyoke Female Seminary. I learned from books, from the world around me, and from questions that had no simple answer. I hope you will continue asking yours.'},
{re:/\b(dog|carlo|pet|animal)/i,answer:'My beloved dog was named Carlo, a Newfoundland. He was a companion in my walks and a presence in my life. Animals have a way of making the world both larger and kinder.'},
{re:/\b(nobody|somebody|frog|fame|different|shy)/i,answer:'Ah, to be Nobody! I rather liked the playful thought that one might live more freely without trumpeting a name to the world. The frog in the poem is rather fond of an audience, do you not think?'},
{re:/\b(hello|hi|good morning|good afternoon|hey|greetings)/i,answer:'A very good day to you. How rare and wonderful to meet a stranger across so many years. Shall we talk of a poem, or something dear to your heart?'},
{re:/\b(thank|goodbye|bye|farewell)/i,answer:'Thank you for sharing this little hour with me. May you find a bright thought waiting quietly in your next ordinary moment.'},
{re:/\b(are you real|actually emily|artificial|ai|robot|computer|alive)/i,answer:'I am a fictional digital portrayal of Emily Dickinson, made from historical research and imagination. The real poet left us poems and letters — no recording of her voice. I hope this small encounter encourages you to discover her own words.'}
];
const fallbacks=['I cannot find a new reply just now. Would you try me again in a moment?','Our conversation has paused for a moment. Your thought is still welcome; please try again shortly.'];
let fallbackIndex=0;
function preparedAnswer(q){const match=answers.find(({re})=>re.test(q.toLowerCase()));return match?.answer||fallbacks[(fallbackIndex++)%fallbacks.length];}
function setBusy(busy){aiBusy=busy;$('questionInput').disabled=busy;$('chatForm').querySelector('[type="submit"]').disabled=busy;$('micBtn').disabled=busy||!recognition;document.querySelectorAll('.chip').forEach(b=>b.disabled=busy);}
async function answerQuestion(q){
 q=q.trim();if(!q||aiBusy)return;
 if(q.length>MAX_MESSAGE_CHARS){preserveUnsentSpeech(q);endLive('Your full message is in the transcript. Please send it in smaller parts.');return;}
 stopListening();stopSpeech();noSpeech=0;const run=++turnRun;setBusy(true);addBubble('you',q);status('Emily is thinking…');
 const waiting=addBubble('emily','Thinking of a reply…','waiting');waiting.classList.add('waiting');
 let answer,source='prepared';
 try{
  if(aiCheck)await aiCheck;
  if(run!==turnRun)return;
  if(!aiOnline)throw Error('offline');
  const controller=new AbortController();chatRequest=controller;const timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const r=await fetch(workerURL+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:chatBody(q),signal:controller.signal});
   const data=await r.json().catch(()=>({}));if(run!==turnRun)return;if(!r.ok||typeof data.answer!=='string'||!data.answer.trim())throw Error('AI unavailable');
   answer=data.answer.trim();source='live';aiMode('● Connected to Emily',true);
  }finally{clearTimeout(timeout);}
 }catch{if(run!==turnRun)return;answer=preparedAnswer(q);aiMode('Connection unavailable · This is a prepared reply');}
 finally{
  if(run===turnRun){
   chatRequest=null;lastReply=answer||preparedAnswer(q);waiting.querySelector('small').textContent=source==='live'?'Emily':'Emily · prepared response (connection unavailable)';
   waiting.querySelector('span').textContent=lastReply;waiting.classList.remove('waiting');$('replayAnswerBtn').disabled=false;setBusy(false);
   recordTranscript('emily',lastReply,source);conversationHistory.push({role:'user',content:q},{role:'assistant',content:lastReply});
   if($('spokenReplies').checked)await express(lastReply,'chat');else status(live?'Your turn. Listening…':'Your reply is ready. Keep typing whenever you like.');maybeListen();
  }
 }
}
function setupSpeechRecognition(){
 const SpeechRec=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SpeechRec){$('micBtn').disabled=true;$('liveBtn').disabled=true;$('liveBtn').textContent='Microphone: use Chrome or Edge';status('You can type questions and hear Emily’s replies in this browser.');return;}
 recognitionFactory=SpeechRec;recognition=new SpeechRec();
 $('micBtn').addEventListener('click',()=>{if(captureActive||recognitionRunning||recognitionStarting){endLive('Microphone stopped.');return;}stopSpeech();startListening();});
 $('liveBtn').addEventListener('click',()=>{
  if(live){endLive();stopSpeech();cancelTurn();return;}
  live=true;noSpeech=0;$('liveBtn').textContent='■ End conversation';$('liveBtn').setAttribute('aria-pressed','true');
  clearTimeout(liveTimer);liveTimer=setTimeout(()=>{endLive('Conversation paused after 10 minutes. Tap Start to continue.');stopSpeech();cancelTurn();},600000);
  if(!aiBusy){stopSpeech();startListening();}else status('Emily will listen after this answer.');
 });
}
function init(){
 recordTranscript('emily',$('greetingText').textContent,'greeting');$('downloadTranscriptBtn').addEventListener('click',downloadTranscript);
 displayPoem();switchTab('talk');
 const metadata=window.emilyPoemLibraryMetadata;
 $('poemEditionNote').textContent=metadata?`${poems.length} poems · ${metadata.editionLabel}. ${metadata.scopeNote||''}`:'Selected poems. The expanded collection is unavailable.';
 if(metadata?.sourceURL){const url=new URL(metadata.sourceURL);if(url.protocol==='https:'&&['en.wikisource.org','www.gutenberg.org','gutenberg.org'].includes(url.hostname)){$('poemCollectionSource').href=url.href;$('poemCollectionSource').textContent=(metadata.sourceTitle||'Source edition')+' ↗';}}
 if(window.createEmilyLibrary)libraryUI=window.createEmilyLibrary({poems,onChoose:choosePoem,onRead:index=>{choosePoem(index);readPoem();},current:()=>currentPoem});
 else{$('poemGrid').innerHTML=poems.map((p,i)=>`<button class="poem-tile" data-poem="${p.id}" data-idx="${i}"><strong>${escapeHTML(p.short)}</strong><span>${escapeHTML(p.mood)} →</span></button>`).join('');document.querySelectorAll('.poem-tile').forEach(el=>el.addEventListener('click',()=>choosePoem(Number(el.dataset.idx))));$('poemCount').textContent='Search is unavailable. You can still choose a poem below.';}
 document.querySelectorAll('.tab').forEach(el=>el.addEventListener('click',()=>switchTab(el.dataset.tab)));
 $('playBtn').addEventListener('click',readPoem);$('stopBtn').addEventListener('click',()=>{stopSpeech();status('Reading stopped.');});$('otherPoemsBtn').addEventListener('click',()=>switchTab('library'));$('lifeTalkBtn').addEventListener('click',()=>{switchTab('talk');$('questionInput').focus();});
 $('lifeReadBtn').addEventListener('click',()=>{const text=Array.from(document.querySelectorAll('#lifePanel .biography p')).map(paragraph=>paragraph.textContent).join('\n\n');express(text,'life');});
 $('lifeStopBtn').addEventListener('click',()=>{stopSpeech();status('Reading stopped.');});
 $('chatForm').addEventListener('submit',e=>{e.preventDefault();const q=$('questionInput').value.trim();if(q&&!aiBusy){$('questionInput').value='';answerQuestion(q);}});
 document.querySelectorAll('.chip').forEach(el=>el.addEventListener('click',()=>answerQuestion(el.textContent)));
 $('voiceChoice').addEventListener('change',e=>{chosenVoice=e.target.value;});$('voiceEngine').addEventListener('change',()=>{stopSpeech();maybeListen();});
 $('rateRange').addEventListener('input',e=>{$('rateValue').textContent=Math.round(Number(e.target.value)*100)+'%';if(currentAudio)currentAudio.playbackRate=Number(e.target.value);});
 $('stopAnswerBtn').addEventListener('click',()=>{endLive('Voice stopped. You can type another question.');stopSpeech();cancelTurn();});
 $('spokenReplies').addEventListener('change',()=>{if(!$('spokenReplies').checked){stopSpeech();status(live?'Your turn. Listening…':'Spoken replies off. You can keep typing.');maybeListen();}});
 $('replayAnswerBtn').addEventListener('click',()=>{if(currentAudio&&audioReadyToPlay)playCurrentAudio('chat');else if(lastReply)express(lastReply,'chat');});
 $('retryBtn').addEventListener('click',()=>{aiCheck=connectWorker();});
 if(synth){loadVoices();synth.onvoiceschanged=loadVoices;}setupSpeechRecognition();aiCheck=connectWorker();
 document.addEventListener('visibilitychange',()=>{if(document.hidden){endLive('Conversation paused while this page is hidden.');stopSpeech();cancelTurn();}});
}
init();
