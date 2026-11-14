/* Integration checks for the single-file app. No real keys, requests, or packages. */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const file = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(file, 'utf8');
const source = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=/.test(match[1])).map(match => match[2]).join('\n');
new vm.Script(source, {filename:file});
const decode = value => String(value).replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, x => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&nbsp;':' '}[x]));

class Element {
  constructor(tag='div', doc) {
    this.tagName=tag.toUpperCase(); this.nodeType=1; this.ownerDocument=doc;
    this.attributes={}; this.dataset={}; this.style={setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}};
    this.childNodes=[]; this.listeners=new Map(); this.parentNode=null;
    this.value='';this.disabled=false;this.hidden=false;this.open=false;this.checked=false;
    this.classList={
      add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');},
      remove:(...names)=>{this.className=this.className.split(/\s+/).filter(x=>!names.includes(x)).join(' ');},
      contains:name=>this.className.split(/\s+/).includes(name),
      toggle:(name,force)=>{const has=this.classList.contains(name),want=force===undefined?!has:!!force;want?this.classList.add(name):this.classList.remove(name);return want;}
    };
  }
  get id(){return this.attributes.id||'';} set id(v){this.setAttribute('id',v);}
  get className(){return this.attributes.class||'';} set className(v){this.attributes.class=String(v);}
  get children(){return this.childNodes.filter(n=>n.nodeType===1);}
  get parentElement(){return this.parentNode;}
  get textContent(){return this.childNodes.map(n=>n.textContent).join('');}
  set textContent(v){this.childNodes=[];this.append(this.ownerDocument.createTextNode(String(v??'')));}
  get innerText(){return this.textContent;} set innerText(v){this.textContent=v;}
  get innerHTML(){return this._innerHTML||this.textContent;}
  set innerHTML(v){this._innerHTML=String(v);this.childNodes=[];parseInto(this,String(v),this.ownerDocument);}
  setAttribute(name,value){
    value=String(value);this.attributes[name]=value;
    if(name==='id')this.ownerDocument.nodes.set(value,this);
    if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
    if(name==='value')this.value=value;
    if(['hidden','disabled','open','checked'].includes(name))this[name]=true;
    if(name==='type')this.type=value;
  }
  getAttribute(name){return Object.hasOwn(this.attributes,name)?this.attributes[name]:null;}
  hasAttribute(name){return Object.hasOwn(this.attributes,name);}
  removeAttribute(name){delete this.attributes[name];if(['hidden','disabled','open','checked'].includes(name))this[name]=false;}
  toggleAttribute(name,force){const on=force===undefined?!this.hasAttribute(name):!!force;on?this.setAttribute(name,''):this.removeAttribute(name);return on;}
  append(...items){for(let item of items){if(typeof item==='string')item=this.ownerDocument.createTextNode(item);if(item.nodeType===11){this.append(...item.childNodes);continue;}item.parentNode=this;this.childNodes.push(item);}}
  appendChild(node){this.append(node);return node;}
  prepend(...items){const rest=this.childNodes;this.childNodes=[];this.append(...items,...rest);}
  replaceChildren(...nodes){this.childNodes=[];this.append(...nodes);}
  remove(){if(this.parentNode)this.parentNode.childNodes=this.parentNode.childNodes.filter(n=>n!==this);}
  replaceWith(...items){const parent=this.parentNode;if(!parent)return;const index=parent.childNodes.indexOf(this);parent.childNodes.splice(index,1,...items);for(const item of items)item.parentNode=parent;this.parentNode=null;}
  insertAdjacentHTML(where,content){const holder=new Element('div',this.ownerDocument);holder.innerHTML=content;if(where==='afterbegin')this.prepend(...holder.childNodes);else this.append(...holder.childNodes);}
  matches(selector){
    selector=selector.trim();
    if(selector.includes(','))return selector.split(',').some(x=>this.matches(x));
    if(selector==='*')return true;
    if(selector.includes(' ')){const parts=selector.split(/\s+/),tail=parts.pop();if(!this.matches(tail))return false;let p=this.parentNode;while(p){if(p.matches(parts.join(' ')))return true;p=p.parentNode;}return false;}
    const attrs=[...selector.matchAll(/\[([\w-]+)(?:\s*=\s*["']?([^\]"']*)["']?)?\]/g)];
    for(const [,key,value]of attrs)if(!this.hasAttribute(key)||(value!==undefined&&this.getAttribute(key)!==value))return false;
    selector=selector.replace(/\[[^\]]+\]/g,'');
    const id=selector.match(/#([\w-]+)/);if(id&&this.id!==id[1])return false;
    for(const [,name]of selector.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(name))return false;
    const tag=selector.match(/^[\w-]+/);return !tag||this.tagName===tag[0].toUpperCase();
  }
  querySelectorAll(selector){const out=[];function walk(n){for(const child of n.children){if(child.matches(selector))out.push(child);walk(child);}}walk(this);return out;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){let n=this;while(n){if(n.matches(selector))return n;n=n.parentNode;}return null;}
  contains(node){let n=node;while(n){if(n===this)return true;n=n.parentNode;}return false;}
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
  removeEventListener(name,fn){this.listeners.set(name,(this.listeners.get(name)||[]).filter(x=>x!==fn));}
  dispatchEvent(event){event.target||=this;event.currentTarget=this;event.preventDefault||=()=>{event.defaultPrevented=true;};event.stopPropagation||=()=>{event.cancelBubble=true;};for(const fn of this.listeners.get(event.type)||[])fn.call(this,event);if(typeof this['on'+event.type]==='function')this['on'+event.type](event);if(event.bubbles&&!event.cancelBubble&&this.parentNode)this.parentNode.dispatchEvent(event);return !event.defaultPrevented;}
  click(){if(!this.disabled)this.dispatchEvent({type:'click',bubbles:true});}
  focus(){this.ownerDocument.activeElement=this;}
  select(){} setSelectionRange(){} scrollIntoView(){} scrollTo(){} getBoundingClientRect(){return {x:0,y:0,width:500,height:200};}
  showModal(){this.open=true;} close(){this.open=false;this.dispatchEvent({type:'close'});}
  requestSubmit(){this.dispatchEvent({type:'submit',bubbles:true});}
}
class TextNode {constructor(value){this.nodeType=3;this.textContent=value;}}
function parseInto(root,markup,doc){
  const stack=[root];
  const stripped=markup.replace(/<!--[\s\S]*?-->/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  for(const token of stripped.match(/<[^>]+>|[^<]+/g)||[]){
    if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}
    if(token.startsWith('<!'))continue;
    if(token.startsWith('<')){
      const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;
      const element=doc.createElement(tag);const attr=token.slice(tag.length+1).replace(/\/?\s*>$/,'');
      for(const [,name,a,b,c]of attr.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))element.setAttribute(name,decode(a??b??c??''));
      stack.at(-1).append(element);
      if(!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag)&&!token.endsWith('/>'))stack.push(element);
    }else stack.at(-1).append(doc.createTextNode(decode(token)));
  }
}
class Document extends Element {
  constructor(markup){super('document',null);this.ownerDocument=this;this.nodeType=9;this.nodes=new Map();this.body=this.createElement('body');this.append(this.body);this.activeElement=this.body;parseInto(this.body,markup,this);}
  createElement(tag){return new Element(tag,this);}
  createTextNode(text){return new TextNode(String(text));}
  createDocumentFragment(){const n=new Element('fragment',this);n.nodeType=11;return n;}
  getElementById(id){return this.nodes.get(id)||null;}
  execCommand(){return true;}
}
const KEYS={gemini:'FAKE_GEMINI_7d8de14',grok:'FAKE_GROK_826f6a2',gpt:'FAKE_GPT_90c531b'};
function response(content,status=200){return {ok:status>=200&&status<300,status,text:async()=>status===200?JSON.stringify({choices:[{message:{content}}]}):JSON.stringify({error:{message:content}})};}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,message){for(let i=0;i<100;i++){if(fn())return;await delay(2);}throw new Error('Timed out: '+message);}
function setup(options={}){
  const document=new Document(html),calls=[],stored=new Map();let parallel=0,maxParallel=0,geminiCount=0;
  if(options.stored)stored.set('nexus.ai.config.v1',JSON.stringify(options.stored));
  const localStorage={getItem:key=>{if(options.storageUnavailable)throw Error('storage unavailable');return stored.get(key)||null;},setItem:(key,v)=>{if(options.storageUnavailable)throw Error('storage unavailable');stored.set(key,v);},removeItem:key=>stored.delete(key)};
  const window=new Element('window',document);window.innerWidth=options.mobile?375:1440;window.matchMedia=()=>({matches:!!options.mobile,addEventListener(){}});
  const timers=new Set();
  const context={document,window,localStorage,sessionStorage:localStorage,navigator:{clipboard:{writeText:async()=>{}}},console,URL,AbortController,DOMException,Blob,TextEncoder,TextDecoder,Event:class{constructor(type,opts={}){this.type=type;Object.assign(this,opts);}},matchMedia:window.matchMedia,performance:{now:()=>Date.now()},requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,getComputedStyle:()=>({}),setTimeout,clearTimeout,setInterval:(fn,ms)=>{const t=setInterval(fn,ms);timers.add(t);return t;},clearInterval:t=>{clearInterval(t);timers.delete(t);}};
  context.fetch=async(url,request)=>{
    assert.equal(request.method,'POST');assert.equal(request.headers['Content-Type'],'application/json');assert.match(request.headers.Authorization,/^Bearer FAKE_/);
    const body=JSON.parse(request.body),gemini=url.includes('generativelanguage.googleapis.com'),kind=gemini?(++geminiCount===1?'plan':'final'):url.includes('x.ai')?'grok':'gpt';
    const call={url,body,kind,signal:request.signal};calls.push(call);
    if(options.fetch)return options.fetch(call,{response,delay});
    if(kind==='plan')return response(options.badPlan?'not valid JSON':JSON.stringify({grok_task:options.skip?'':'查证资料',gpt_task:options.skip?'':'生成计划'}));
    if(kind==='final')return response('# 最终成果\n\n测试内容');
    parallel++;maxParallel=Math.max(parallel,maxParallel);
    try{
      await new Promise((resolve,reject)=>{const t=setTimeout(resolve,30);if(!options.ignoreAbort)request.signal.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('aborted','AbortError'));},{once:true});});
      return options.failGrok&&kind==='grok'?response('bad '+KEYS.grok,401):response(kind+' 原始汇报');
    }finally{parallel--;}
  };
  vm.createContext(context);vm.runInContext(source,context,{filename:file});
  const get=id=>{const element=document.getElementById(id);assert(element,'Missing DOM id '+id);return element;};
  for(const id of Object.keys(KEYS))get(id+'Key').value=KEYS[id];
  get('task').value='测试任务：给出产品方案';
  window.dispatchEvent({type:'DOMContentLoaded'});document.dispatchEvent({type:'DOMContentLoaded'});
  return {context,get,calls,stored,document,parallel:()=>maxParallel,eval:code=>vm.runInContext(code,context),run:()=>vm.runInContext('start({preventDefault(){}})',context),dispose:()=>{for(const t of timers)clearInterval(t);}};
}
async function caseTest(name,fn){await fn();console.log('PASS '+name);}

async function main(){
 await caseTest('static HTML has unique IDs and valid SVG and accessibility targets',async()=>{
  const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'duplicate static IDs');const known=new Set(ids);
  for(const [,ref]of markup.matchAll(/<use\b[^>]*href="#([^"]+)"/g))assert(known.has(ref),'missing SVG symbol '+ref);
  for(const [,values]of markup.matchAll(/\baria-(?:controls|labelledby)="([^"]+)"/g))for(const id of values.split(/\s+/))assert(known.has(id),'missing aria target '+id);
 });
 await caseTest('two workers execute concurrently; Gemini receives both reports',async()=>{
  const s=setup();try{await s.run();assert.equal(s.parallel(),2);assert.deepEqual(s.calls.map(x=>x.kind),['plan','grok','gpt','final']);const payload=JSON.parse(s.calls.at(-1).body.messages.at(-1).content);assert.equal(payload.execution_reports.length,2);assert(payload.execution_reports.every(x=>x.status==='success'));assert.equal(s.get('run').disabled,false);assert.match(s.get('report').textContent,/最终成果/);}finally{s.dispose();}
 });
 await caseTest('empty sub-tasks skip both workers',async()=>{
  const s=setup({skip:true});try{await s.run();assert.deepEqual(s.calls.map(x=>x.kind),['plan','final']);assert.match(s.get('grokBadge').textContent,/跳过|无需/);assert.match(s.get('gptBadge').textContent,/跳过|无需/);}finally{s.dispose();}
 });
 await caseTest('worker failure preserves successful report; API keys redacted',async()=>{
  const s=setup({failGrok:true});try{await s.run();const payload=JSON.parse(s.calls.at(-1).body.messages.at(-1).content);assert.equal(payload.execution_reports[0].status,'failed');assert.equal(payload.execution_reports[1].status,'success');assert.match(s.get('gptRaw').textContent,/原始汇报/);assert(!s.get('grokRaw').textContent.includes(KEYS.grok));assert(!JSON.stringify(payload).includes(KEYS.grok));assert.match(s.get('report').textContent,/最终成果/);}finally{s.dispose();}
 });
 await caseTest('malformed plan prevents worker and final calls',async()=>{
  const s=setup({badPlan:true});try{await s.run();assert.equal(s.calls.length,1);assert.match(s.get('planBadge').textContent,/失败/);assert.equal(s.get('run').disabled,false);assert(!s.get('alert').hidden);}finally{s.dispose();}
 });
 await caseTest('cancelling active workers prevents final call',async()=>{
  const s=setup();try{const running=s.run();await until(()=>s.calls.length===3,'workers start');s.get('cancel').click();await running;assert.equal(s.calls.length,3);assert.match(s.get('globalStatus').textContent,/停止|取消/);assert.equal(s.get('run').disabled,false);}finally{s.dispose();}
 });
 await caseTest('late worker responses after cancellation cannot publish results',async()=>{
  const s=setup({ignoreAbort:true});try{const running=s.run();await until(()=>s.calls.length===3,'workers start');s.get('cancel').click();await running;assert.equal(s.calls.length,3);assert.match(s.get('globalStatus').textContent,/停止|取消/);assert(!/已完成/.test(s.get('grokBadge').textContent));assert(!/已完成/.test(s.get('gptBadge').textContent));assert.equal(s.eval('finalText'),'');}finally{s.dispose();}
 });
 await caseTest('late planner response cannot launch workers after cancellation',async()=>{
  const s=setup({fetch:async(call,{response,delay})=>{await delay(25);return response(JSON.stringify({grok_task:'情报',gpt_task:'执行'}));}});try{const running=s.run();await until(()=>s.calls.length===1,'planner starts');s.get('cancel').click();await running;assert.equal(s.calls.length,1);assert.match(s.get('globalStatus').textContent,/停止|取消/);}finally{s.dispose();}
 });
 await caseTest('old cancelled worker cannot overwrite a later successful run',async()=>{
  const s=setup({fetch:async(call,{response,delay})=>{
   const isPlanner=call.body.messages[0].content.includes('严格只返回 JSON');
   if(isPlanner)return response(JSON.stringify({grok_task:'情报',gpt_task:'执行'}));
   if(call.url.includes('googleapis'))return response('# NEW 最终成果');
   const task=JSON.parse(call.body.messages.at(-1).content).original_task;
   if(task==='OLD TASK'){
    if(call.url.includes('x.ai'))return new Promise((resolve,reject)=>call.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
    await delay(80);return response('OLD GPT RESULT');
   }
   return response('NEW WORKER RESULT');
  }});try{
   s.get('task').value='OLD TASK';const old=s.run();await until(()=>s.calls.length===3,'old workers start');s.get('cancel').click();await old;
   s.get('task').value='NEW TASK';await s.run();assert.equal(s.get('gptBadge').textContent,'已完成');
   await delay(100);assert.equal(s.get('gptBadge').textContent,'已完成');assert.equal(s.get('gptRaw').textContent,'NEW WORKER RESULT');assert.match(s.get('report').textContent,/NEW 最终成果/);
  }finally{s.dispose();}
 });
 await caseTest('URL normalization and unsafe endpoint rejection',async()=>{
  const s=setup();try{assert.equal(s.eval("endpoint('https://proxy.example/v1/')"),'https://proxy.example/v1/chat/completions');assert.equal(s.eval("endpoint('https://api.openai.com/v1/chat/completions')"),'https://api.openai.com/v1/chat/completions');for(const url of ['javascript:alert(1)','http://remote.example/v1','https://name:password@proxy.example/v1','https://proxy.example/v1?key=x'])assert.throws(()=>s.eval('endpoint('+JSON.stringify(url)+')'));assert.equal(s.eval("endpoint('http://127.0.0.1:9000/v1')"),'http://127.0.0.1:9000/v1/chat/completions');}finally{s.dispose();}
 });
 await caseTest('plan schema is strict and accepts fenced JSON',async()=>{
  const s=setup();try{for(const raw of ['null','[]','{}','{"grok_task":1,"gpt_task":""}'])assert.throws(()=>s.eval('parsePlan('+JSON.stringify(raw)+')'));assert.equal(s.eval('parsePlan('+JSON.stringify('```json\n{"grok_task":"  x ","gpt_task":""}\n```')+').grok_task'),'x');}finally{s.dispose();}
 });
 await caseTest('unavailable storage does not prevent a task run',async()=>{
  const s=setup({storageUnavailable:true});try{await s.run();assert.equal(s.calls.length,4);assert.equal(s.get('run').disabled,false);assert.match(s.get('report').textContent,/最终成果/);}finally{s.dispose();}
 });
 await caseTest('missing Commander key prevents all network calls',async()=>{
  const s=setup();try{s.get('geminiKey').value='';await s.run();assert.equal(s.calls.length,0);assert(!s.get('alert').hidden);assert.match(s.get('alert').textContent,/Gemini|总指挥/);}finally{s.dispose();}
 });
 await caseTest('configuration state distinguishes filled fields from verified connection',async()=>{
  const s=setup();try{
   assert.equal(s.calls.length,0,'app initialization must not issue API requests');
   s.eval('updateConfigStatus()');assert.equal(s.get('configCount').textContent,'3 / 3');
   assert.match(s.get('geminiConfigStatus').textContent,/已填写.*未验证/);
   assert(!/连接已验证/.test(s.get('globalStatus').textContent));
   s.get('grokKey').value='';s.eval('updateConfigStatus()');assert.equal(s.get('configCount').textContent,'2 / 3');assert.match(s.get('grokConfigStatus').textContent,/未配置/);
  }finally{s.dispose();}
 });
 await caseTest('explicit connection test makes one request and verifies only that model',async()=>{
  const s=setup({fetch:async()=>response('OK')});try{
   await s.eval("testConnection('gemini')");assert.equal(s.calls.length,1);assert.equal(s.calls[0].body.messages[0].role,'user');
   assert.match(s.get('geminiConfigStatus').textContent,/连接已验证/);assert.match(s.get('grokConfigStatus').textContent,/未验证/);
   assert.equal(s.eval('testing'),false);assert.equal(s.get('run').disabled,false);
   s.get('geminiModel').value='changed-model';s.get('geminiModel').dispatchEvent({type:'input',bubbles:true});
   assert.match(s.get('geminiConfigStatus').textContent,/未验证/,'editing model invalidates previous verification');
  }finally{s.dispose();}
 });
 await caseTest('connection errors redact fake keys and release controls',async()=>{
  const s=setup({fetch:async()=>response('invalid '+KEYS.gemini,401)});try{
   await s.eval("testConnection('gemini')");assert.equal(s.calls.length,1);assert.match(s.get('geminiTestResult').textContent,/401/);
   assert(!s.get('geminiTestResult').textContent.includes(KEYS.gemini));assert(!/连接已验证/.test(s.get('geminiConfigStatus').textContent));assert.equal(s.get('run').disabled,false);
  }finally{s.dispose();}
 });
 await caseTest('connection test cancellation releases controls without verifying model',async()=>{
  const s=setup({fetch:async(call)=>new Promise((resolve,reject)=>call.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}))});try{
   const running=s.eval("testConnection('gemini')");await until(()=>s.calls.length===1,'connection test starts');assert.equal(s.get('cancel').hidden,false);assert.match(s.get('cancel').textContent,/测试/);s.get('cancel').click();await running;
   assert.match(s.get('geminiTestResult').textContent,/已停止/);assert.equal(s.eval('testing'),false);assert.equal(s.get('run').disabled,false);assert.equal(s.get('cancel').hidden,true);assert(!/连接已验证/.test(s.get('geminiConfigStatus').textContent));
  }finally{s.dispose();}
 });
 await caseTest('mobile sidebar dismisses through close button, backdrop, and workspace nav',async()=>{
  const s=setup({mobile:true});try{
   assert.equal(s.get('sidebar').hidden,true);s.get('toggleSidebar').click();assert.equal(s.get('sidebar').hidden,false);assert.equal(s.get('sidebarBackdrop').hidden,false);s.get('closeSidebar').click();assert.equal(s.get('sidebar').hidden,true);assert.equal(s.get('sidebarBackdrop').hidden,true);assert.equal(s.document.activeElement,s.get('toggleSidebar'));
   s.get('toggleSidebar').click();s.get('sidebarBackdrop').click();assert.equal(s.get('sidebar').hidden,true);
   s.get('toggleSidebar').click();s.get('workspaceNav').click();assert.equal(s.get('sidebar').hidden,true);
  }finally{s.dispose();}
 });
 await caseTest('Markdown renderer strips executable markup and unsafe links; code remains copyable',async()=>{
  const s=setup();try{
   const parsed=new Document('<p onclick="execute()" style="color:red">Safe text</p><a href="javascript:execute()" onclick="execute()">bad link</a><a href="https://example.com/report" onclick="execute()" style="color:red">good link</a><pre><code class="language-js" onclick="execute()">const value = 1;</code></pre><img src="https://untrusted.example/pixel.png">');
   for(const tag of ['script','style','iframe','svg']){const node=parsed.createElement(tag);node.textContent='untrusted active content';parsed.body.append(node);}
   let rendererChecked=false;
   s.context.window.marked={Renderer:class{},parse(text,options){assert.equal(options.renderer.html('<img>'),'');assert.equal(options.renderer.image({href:'https://untrusted.example/pixel.png'}),'');rendererChecked=true;return 'STUB_RENDERED_HTML';}};
   s.context.DOMParser=class{parseFromString(value,mime){assert.equal(value,'STUB_RENDERED_HTML');assert.equal(mime,'text/html');return parsed;}};
   const copied=[];s.context.navigator.clipboard.writeText=async text=>copied.push(text);
   s.eval("renderMarkdown('test markdown')");assert(rendererChecked);const report=s.get('report');assert(report.classList.contains('markdown'));
   assert.equal(report.querySelectorAll('script,style,iframe,svg,img').filter(n=>n.tagName!=='SVG'||!n.closest('.code-header')).length,0);
   const links=report.querySelectorAll('a');assert.equal(links.length,2);assert.equal(links[0].getAttribute('href'),null);assert.equal(links[1].getAttribute('href'),'https://example.com/report');assert.equal(links[1].getAttribute('rel'),'noopener noreferrer');
   for(const node of report.querySelectorAll('*'))for(const name of Object.keys(node.attributes))assert(!/^on|^style$/i.test(name));
   const code=report.querySelector('code');assert.equal(code.textContent,'const value = 1;');assert.equal(code.dataset.language,'js');const button=report.querySelector('.code-header button');assert(button);await button.onclick();assert.deepEqual(copied,['const value = 1;']);
  }finally{s.dispose();}
 });
 await caseTest('tabs support visibility, aria state, and keyboard navigation',async()=>{
  const s=setup();try{
   s.eval("switchTab('records')");assert.equal(s.get('paneRecords').hidden,false);assert.equal(s.get('paneResult').hidden,true);assert.equal(s.get('tabRecords').getAttribute('aria-selected'),'true');assert.equal(s.get('tabRecords').tabIndex,0);assert.equal(s.get('tabResult').tabIndex,-1);
   s.get('tabRecords').dispatchEvent({type:'keydown',key:'Home'});assert.equal(s.get('paneResult').hidden,false);assert.equal(s.document.activeElement,s.get('tabResult'));
  }finally{s.dispose();}
 });
 await caseTest('reset clears workspace but preserves credentials and in-session history',async()=>{
  const s=setup();try{
   await s.run();assert.equal(s.eval('sessionHistory.length'),1);s.eval('resetWorkspace()');
   assert.equal(s.eval('finalText'),'');assert.equal(s.get('task').value,'');assert.equal(s.get('copy').disabled,true);assert.equal(s.get('export').disabled,true);assert.equal(s.get('recordCount').textContent,'0');assert.equal(s.get('progressFill').style.width,'0%');assert.equal(s.eval('sessionHistory.length'),1);assert.equal(s.get('geminiKey').value,KEYS.gemini);assert.equal(s.get('paneResult').hidden,false);
   s.get('history').querySelector('button').click();assert.match(s.get('report').textContent,/最终成果/);assert.equal(s.get('task').value,'测试任务：给出产品方案');assert.equal(s.get('grokBadge').textContent,'已完成');assert.equal(s.get('copy').disabled,false);assert.equal(s.get('recordCount').textContent,'3');
   const historyJSON=s.eval('JSON.stringify(sessionHistory)');for(const key of Object.values(KEYS))assert(!historyJSON.includes(key),'history must not contain any API key');
  }finally{s.dispose();}
 });
 await caseTest('new task exits focused reading and reveals live activity',async()=>{
  const s=setup();try{s.get('reading').click();assert(s.document.body.classList.contains('reading'));s.eval('resetWorkspace()');assert(!s.document.body.classList.contains('reading'));assert.equal(s.get('reading').getAttribute('aria-pressed'),'false');}finally{s.dispose();}
 });
 await caseTest('clear-key action is disabled while work is in progress',async()=>{
  const s=setup();try{const running=s.run();await until(()=>s.calls.length===3,'workers start');assert.equal(s.get('clearKeys').disabled,true);s.get('clearKeys').click();assert.equal(s.get('geminiKey').value,KEYS.gemini);s.get('cancel').click();await running;assert.equal(s.get('clearKeys').disabled,false);}finally{s.dispose();}
 });
 await caseTest('template buttons populate editor without starting network requests',async()=>{
  const s=setup();try{
   const button=s.document.querySelector('[data-template="code"]');assert(button);button.click();assert.match(s.get('task').value,/知识库/);assert.match(s.get('taskCount').textContent,/字/);assert.equal(s.calls.length,0);
  }finally{s.dispose();}
 });
 await caseTest('local demo completes without API keys or fetch calls',async()=>{
  const s=setup();try{
   for(const id of Object.keys(KEYS))s.get(id+'Key').value='';
   await s.eval('start({preventDefault(){}},true)');assert.equal(s.calls.length,0);assert.equal(s.get('demoNotice').hidden,false);assert.match(s.get('reportState').textContent,/预置内容/);assert.match(s.get('report').textContent,/自由职业者/);assert.equal(s.get('recordCount').textContent,'3');assert.equal(s.eval('sessionHistory[0].demo'),true);assert.equal(s.get('copy').disabled,false);
   s.eval('resetWorkspace()');assert.equal(s.get('demoNotice').hidden,true);s.get('history').querySelector('button').click();assert.equal(s.get('demoNotice').hidden,false);assert.match(s.get('reportState').textContent,/预置内容/);
  }finally{s.dispose();}
 });
 await caseTest('local demo can be cancelled without making network requests',async()=>{
  const s=setup();try{
   const running=s.eval('start({preventDefault(){}},true)');s.get('cancel').click();await running;assert.equal(s.calls.length,0);assert.match(s.get('globalStatus').textContent,/停止/);assert.equal(s.eval('finalText'),'');assert.equal(s.get('run').disabled,false);
  }finally{s.dispose();}
 });
 console.log('All integration checks passed. No real API requests were made.');
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
module.exports={setup,main};

