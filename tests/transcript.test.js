import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function session(){
 const nodes=new Map();
 const make=(tag='div')=>({tag,textContent:'',children:[],disabled:false,value:'',checked:false,
  classList:{add(){},remove(){},toggle(){}},setAttribute(){},
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}},
  querySelector(tag){return this.children.find(child=>child.tag===tag)||make(tag);},
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);},
 });
 const get=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
 const context=vm.createContext({console,Blob,Response,AbortController,AbortSignal,setTimeout,clearTimeout,
  window:{speechSynthesis:null},document:{getElementById:get,createElement:make,querySelectorAll:()=>[]},
  fetch:async()=>Response.json({answer:'Your questions are most welcome.'}),
 });
 vm.runInContext(readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,''),context);
 return {get,context,run:code=>vm.runInContext(code,context)};
}

test('the visible and downloadable transcript retains more than 25 messages',()=>{
 const s=session();
 s.run("for(let i=0;i<35;i++){addBubble('you','Question '+i);addBubble('emily','Reply '+i,'live');}");
 assert.equal(s.get('conversation').children.length,70);
 assert.equal(s.run('transcript.length'),70);
 const text=s.run('transcriptText()');
 assert.ok(text.includes('You: Question 0'));
 assert.ok(text.includes('Emily: Reply 34'));
});

test('long recognized messages reach chat and transcript without the old truncation',async()=>{
 const s=session();let sent;
 s.context.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({answer:'Your questions are most welcome.'});};
 const message='A complete thought, with every recognized word. '.repeat(30).trim();
 s.context.testMessage=message;
 await s.run('aiOnline=true;answerQuestion(testMessage)');
 assert.equal(sent.question,message);
 assert.equal(s.run('transcript[0].text'),message);
 assert.equal(s.run('transcript[1].text'),'Your questions are most welcome.');
});

test('request context stays bounded without trimming the full session transcript',()=>{
 const s=session();
 s.run("for(let i=0;i<24;i++){const content='字'.repeat(11996)+i;conversationHistory.push({role:i%2?'assistant':'user',content});recordTranscript(i%2?'emily':'you',content);}");
 const body=s.run("chatBody('字'.repeat(12000))");
 const request=JSON.parse(body);
 assert.equal(request.question.length,12000);
 assert.ok(new Blob([body]).size<=120000);
 assert.ok(request.history.reduce((n,message)=>n+message.content.length,0)<=48000);
 assert.equal(s.run('transcript.length'),24);
 assert.ok(s.run('transcript[0].text.length')>11996);
});

test('recognized words from a canceled turn remain clearly marked in the transcript',()=>{
 const s=session();
 s.run("preserveUnsentSpeech('The words I had not finished saying')");
 assert.equal(s.run('transcript.length'),1);
 assert.equal(s.run('transcript[0].source'),'unsent');
 assert.ok(s.run('transcriptText()').includes('You (not sent): The words I had not finished saying'));
});
