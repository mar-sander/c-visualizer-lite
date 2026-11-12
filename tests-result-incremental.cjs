/* Browser verification; no production dependency.
   PLAYWRIGHT_MODULE points to an existing Playwright install.
   node tests-result-incremental.cjs [candidate URL] [base URL] [evidence dir] */
'use strict';
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = process.argv[2] || 'http://127.0.0.1:18961';
const base = process.argv[3] || 'http://127.0.0.1:18962';
const evidence = process.argv[4] || 'result-evidence';
fs.mkdirSync(evidence,{recursive:true});
const rows=[];
async function test(name,fn){try{await fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:e.stack});}}
const main = body => '#include <stdio.h>\nint main(void){\n'+body+'\nreturn 0;\n}';
const sequence = main('int a, b, c;\nprintf("Q1: ");\nscanf("%d", &a);\nprintf("Q2: ");\nscanf("%d", &b);\nprintf("Q3: ");\nscanf("%d", &c);\nprintf("sum=%d\\n", a+b+c);');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tokyo'});
 const page=await context.newPage(), baseline=await context.newPage(), errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.clock.install(); await page.clock.pauseAt(new Date());
 await page.goto(target); await baseline.goto(base);
 const canonical=()=>page.evaluate(()=>{const n=document.querySelector('.result-value');return n?.querySelector('.result-reveal-final')?.textContent??n?.textContent});
 const edit=value=>page.evaluate(value=>{scanfInput.value=value;scanfInput.dispatchEvent(new Event('input',{bubbles:true}));},value);
 async function advanceToDisplay(){
   for(let i=0;i<65;i++){
     if(await page.evaluate(()=>!pendingRunSuccess && !pendingInputInjection)) return;
     await page.clock.runFor(20);
   }
   throw new Error('pending feedback did not finish');
 }
 async function run(code,input=''){
   await page.evaluate(({code,input})=>{editor.setValue(code);scanfInput.value=input;scanfInput.dispatchEvent(new Event('input',{bubbles:true}));runCode();},{code,input});
   await advanceToDisplay();
 }
 async function submit(value){await edit(value);await page.evaluate(()=>submitInput());await advanceToDisplay();}
 const presentation=()=>page.evaluate(()=>({
   text:document.querySelector('.result-reveal-final')?.textContent ?? document.querySelector('.result-value')?.textContent,
   prefix:document.querySelector('.result-reveal-prefix')?.textContent,
   pending:[...document.querySelectorAll('.result-reveal-pending')].map(n=>n.textContent).join(''),
   kinds:[...document.querySelectorAll('.result-segment')].map(n=>[n.dataset.resultKind,n.textContent]),
   animating:resultReveal!==null,start:normalResultDisplay?.start,
   accessibleCopies:document.querySelectorAll('.result-reveal-text[aria-hidden="true"]').length,
   waiting:!!document.querySelector('.waiting-state')
 }));
 const compareCases=[
   ['int','%d','+002','%d'],['int','%d','  7  ','%d'],
   ['int','%d','\n\n7\n8','%d'],['float','%f','2.50','%f'],
   ['double','%lf','-0.50','%f'],['char','%c','A','%c'],
   ['char','%c',' ','%c'],['char','%c','\t','%c'],
   ['char','%c','<','%c'],['char','%c','&','%c'],['char','%c','>','%c']
 ].map(([type,spec,input,format])=>({name:spec+' '+JSON.stringify(input),input,
   code:main(`${type} n;\nprintf("<Q>& ");\nscanf("${spec}", &n);\nprintf("${format}", n);`)}));
 for(const [name,before,after] of [['no newlines','Q: ','END'],['prompt newline','Q:\\n','END'],
   ['printf newline','Q: ','\\nEND'],['blank line','Q: ','\\n\\nEND'],['empty printf','Q: ','']]){
   compareCases.push({name,input:'7',code:main(`int n;\nprintf("${before}");\nscanf("%d", &n);\nprintf("${after}");`)});
 }
 compareCases.push({name:'same input and printf repeated',input:'7\n7\n7',code:sequence.replaceAll('Q1: ','7').replaceAll('Q2: ','7').replaceAll('Q3: ','7')},
   {name:'adjacent scanf',input:'1\n2',code:main('int a,b;\nscanf("%d", &a);\nscanf("%d", &b);')},
   {name:'no scanf',input:'',code:main('printf("  A\\n\\nB ");')});
 for(const item of compareCases) await test('legacy text / structure: '+item.name,async()=>{
   await run(item.code,item.input); await page.clock.runFor(650);
   const expected=await baseline.evaluate(({code,input})=>{editor.setValue(code);scanfInput.value=input;document.getElementById('codeInput').value=code;visualizeCode();return {text:buildResultTranscript(cVisualizerLiteResult),stdout:cVisualizerLiteResult.output};},item);
   assert.equal(await canonical(),expected.text);
   const actual=await page.evaluate(()=>({stdout:cVisualizerLiteResult.output,
     inputNodes:[...document.querySelectorAll('.result-input')].map(n=>n.textContent),
     consumed:cVisualizerLiteResult.steps.filter(s=>s.scanfInput).map(s=>s.scanfInput.specifier==='%c'?s.scanfInput.rawInput:s.scanfInput.inputDisplay),
     unsafeChildren:document.querySelectorAll('.result-input script, .result-input img, .result-input iframe').length,
     mutated:JSON.stringify(cVisualizerLiteResult).includes('result-segment')}));
   assert.equal(actual.stdout,expected.stdout);assert.deepEqual(actual.inputNodes,actual.consumed);
   assert.equal(actual.unsafeChildren,0);assert.equal(actual.mutated,false);
 });
 await test('initial WAITING keeps existing static display',async()=>{await run(sequence);const p=await presentation();assert.equal(p.text,'Q1: ');assert.equal(p.animating,false);assert.equal(p.waiting,true);assert.deepEqual(p.kinds,[['output','Q1: ']]);await page.screenshot({path:path.join(evidence,'waiting-initial.png'),fullPage:true});});
 await test('INPUT 1 reveals only input and next prompt; waits again',async()=>{await submit('12');const p=await presentation();assert.equal(p.prefix,'Q1: ');assert.equal(p.pending,'12\nQ2: ');assert.equal(p.waiting,true);assert.equal(p.animating,true);assert.equal(p.accessibleCopies,1);assert.equal(p.text,'Q1: 12\nQ2: ');});
 await test('prefix is visible while new semantic suffix is hidden',async()=>{assert.deepEqual(await page.evaluate(()=>({prefix:getComputedStyle(document.querySelector('.result-reveal-final')).opacity,new:getComputedStyle(document.querySelector('.result-reveal-pending')).opacity,overlayPrefix:getComputedStyle(document.querySelector('.result-reveal-prefix')).visibility})),{prefix:'1',new:'0',overlayPrefix:'hidden'});});
 await test('visible animation has its own INPUT hook and hidden duplicate text',async()=>{assert.equal(await page.locator('.result-reveal-text .result-input').count(),1);await page.screenshot({path:path.join(evidence,'input1-reveal-start.png'),fullPage:true});await page.clock.runFor(240);assert.equal(await page.locator('.result-reveal-prefix').textContent(),'Q1: ');await page.screenshot({path:path.join(evidence,'input1-reveal-progress.png'),fullPage:true});});
 await test('INPUT editing stops active reveal and keeps complete prior value',async()=>{await edit('12\n34');assert.equal(await canonical(),'Q1: 12\nQ2: ');assert.equal((await presentation()).animating,false);assert.equal(await page.evaluate(()=>hasCurrentResult()),false);});
 await test('INPUT 2 preserves all previous input/output',async()=>{await page.evaluate(()=>submitInput());await advanceToDisplay();const p=await presentation();assert.equal(p.prefix,'Q1: 12\nQ2: ');assert.equal(p.pending,'34\nQ3: ');assert.equal(p.waiting,true);});
 await test('INPUT 3 completes with only final delta',async()=>{await submit('12\n34\n7');const p=await presentation();assert.equal(p.prefix,'Q1: 12\nQ2: 34\nQ3: ');assert.equal(p.pending,'7\nsum=53\n');assert.equal(p.waiting,false);assert.equal(await page.locator('#summary-output').textContent(),'Q1: 12\nQ2: 34\nQ3: 7\nsum=53\n');});
 await test('FLOW interrupts reveal, RESULT return is static and complete',async()=>{await page.locator('.result-flow-button').click();assert.equal((await presentation()).animating,false);await page.evaluate(()=>showResultPage());assert.equal(await canonical(),'Q1: 12\nQ2: 34\nQ3: 7\nsum=53\n');assert.equal((await presentation()).animating,false);});
 await test('same input / no delta does not animate',async()=>{await submit('12\n34\n7');assert.equal((await presentation()).animating,false);});
 await test('same INPUT during active reveal settles previous text without replay',async()=>{await run(sequence);await submit('7');assert.equal((await presentation()).animating,true);await page.evaluate(()=>submitInput());await advanceToDisplay();assert.equal((await presentation()).animating,false);assert.equal(await canonical(),'Q1: 7\nQ2: ');});
 await test('changed code and incompatible prefix are never incremental',async()=>{assert.deepEqual(await page.evaluate(()=>{
   const r={steps:[{lineNo:1,outputAtStep:'ABC'}],output:'ABC'};
   const previous=prepareNormalResultDisplay(r,'old','7','run',null);
   const changedCode=prepareNormalResultDisplay(r,'new','7\n8','input',previous);
   const changedText=prepareNormalResultDisplay({steps:[{lineNo:1,outputAtStep:'XYZ'}],output:'XYZ'},'old','7\n8','input',previous);
   const copy=JSON.stringify(r);buildResultSegments(r);buildResultTranscript(r);
   return [changedCode.start,changedText.start,copy===JSON.stringify(r)];
 }),[0,0,true]);});
 await test('changed consumed input falls back to a fresh reveal',async()=>{await submit('99\n34\n7');const p=await presentation();assert.equal(p.start,0);assert.equal(p.prefix,'');assert.equal(p.pending,p.text);assert.match(p.text,/99/);});
 await test('new RUN restarts initial reveal',async()=>{await page.evaluate(()=>runCode());await advanceToDisplay();const p=await presentation();assert.equal(p.start,0);assert.equal(p.prefix,'');assert.equal(p.animating,true);});
 await test('reduced-motion change cancels and restores structured final text',async()=>{const text=await canonical();await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(50);await page.waitForFunction(()=>reducedMotion.matches && resultReveal===null);assert.equal((await presentation()).animating,false);assert.equal(await canonical(),text);assert.equal(await page.locator('.result-input').count(),3);});
 await test('reduced-motion INPUT still appends correct content without reveal',async()=>{await run(sequence);await submit('7');const p=await presentation();assert.equal(p.text,'Q1: 7\nQ2: ');assert.equal(p.animating,false);});
 await page.emulateMedia({reducedMotion:'no-preference'});
 await test('terminal helper newline remains a prefix when printf supplies newline',async()=>{const code=main('int a,b;\nscanf("%d", &a);\nscanf("%d", &b);\nprintf("\\nEND");');await run(code,'1');assert.equal(await canonical(),'1\n');await submit('1\n2');const p=await presentation();assert.equal(p.prefix,'1\n');assert.equal(p.pending,'2\nEND');});
 await test('segment-prefix comparator handles growth and rejects type/order/value conflicts',async()=>{
   assert.deepEqual(await page.evaluate(()=>{
     const s=(kind,key,text)=>({kind,key,text});const p=[s('output','o','ABC')];
     return [resultSegmentPrefix(p,[s('output','o','ABCDE')]),resultSegmentPrefix(p,p),
       resultSegmentPrefix(p,[s('input','o','ABCDE')]),resultSegmentPrefix(p,[s('output','other','ABCDE')]),
       resultSegmentPrefix(p,[s('output','o','AXC')]),resultSegmentPrefix(p,[])];
   }),[3,3,null,null,null,null]);
 });
 await test('same-tail segment growth reveals appended characters only',async()=>{
   await page.evaluate(()=>{cancelResultReveal();const n=document.querySelector('.result-value');const segments=[{kind:'output',key:'tail',text:'ABCDE'}];renderResultValue(n,'ABCDE',segments);revealResult(n,'ABCDE',{segments,start:resultSegmentPrefix([{kind:'output',key:'tail',text:'ABC'}],segments),isCurrent:()=>true});});
   const p=await presentation();assert.equal(p.prefix,'ABC');assert.equal(p.pending,'DE');
 });
 await test('code edit cancels old reveal and invalidates continuity',async()=>{await page.evaluate(()=>editor.setValue(editor.getValue()+'\n'));await page.clock.runFor(1000);assert.equal(await page.locator('.result-state').count(),0);assert.equal(await page.evaluate(()=>normalResultDisplay),null);});
 await test('RUN during reveal cannot restore stale output',async()=>{await run(sequence,'1\n2\n3');await page.evaluate(()=>{editor.setValue('#include <stdio.h>\nint main(void){\nprintf("NEW");\nreturn 0;\n}');runCode();});await advanceToDisplay();await page.clock.runFor(700);assert.equal(await canonical(),'NEW');});
 await test('display removal cancels timer without losing detached formal text',async()=>{await run(sequence,'1\n2\n3');await page.evaluate(()=>{window.detachedValue=document.querySelector('.result-value');detachedValue.remove();});await page.clock.runFor(80);assert.equal(await page.evaluate(()=>resultReveal),null);assert.equal(await page.evaluate(()=>detachedValue.textContent),'Q1: 1\nQ2: 2\nQ3: 3\nsum=6\n');});
 await test('history contains stdout only and restore does not RUN',async()=>{await run(sequence,'1\n2\n3');await page.clock.runFor(700);const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('c-visualizer-lite-history-v1')));assert.equal(stored.version,1);assert.equal(stored.entries[0].output,'Q1: Q2: Q3: sum=6\n');assert.equal('segments' in stored.entries[0],false);await page.locator('#history-open').click();await page.locator('.history-item-select').first().click();await page.locator('.history-restore').click();assert.equal(await page.evaluate(()=>finalState),null);assert.equal(await page.evaluate(()=>normalResultDisplay),null);});
 await test('rapid INPUT replaces pending transition with latest value',async()=>{await run(sequence);await edit('1');await page.evaluate(()=>submitInput());await edit('1\n2');await page.evaluate(()=>submitInput());await advanceToDisplay();await page.clock.runFor(700);assert.equal(await canonical(),'Q1: 1\nQ2: 2\nQ3: ');assert.equal(await page.evaluate(()=>resultReveal),null);});
 await test('INPUT error discards continuity and never mixes old/new result',async()=>{await run(sequence,'1');await submit('bad');assert.equal(await page.locator('.failure-state').count(),1);assert.equal(await page.locator('.result-value').count(),0);assert.equal(await page.evaluate(()=>normalResultDisplay),null);await submit('1\n2\n3');assert.equal((await presentation()).start,0);assert.equal(await canonical(),'Q1: 1\nQ2: 2\nQ3: 3\nsum=6\n');});
 await test('Function Assist normal confirmation and staged scanf remain legacy rendering',async()=>{
   const code=require('./tests-function-input-stage5.js').examples.textbook;
   await run(code);await page.locator('.function-assist-accept').click();await advanceToDisplay();
   assert.equal(await page.evaluate(()=>functionAssistAttempt.status),'WAITING_FUNCTION');
   await submit('2');assert.equal(await page.evaluate(()=>functionAssistAttempt.status),'WAITING_FUNCTION');
   await submit('2\n5');await page.clock.runFor(700);assert.equal(await page.evaluate(()=>functionAssistAttempt.status),'RESULT_REUSABLE');assert.equal(await page.locator('.result-input').count(),0);assert.equal(await page.evaluate(()=>normalResultDisplay),null);
 });
 for(const width of [1440,768,390]) await test('responsive RESULT and INPUT at '+width,async()=>{
   await page.setViewportSize({width,height:width===390?844:1000});await run(sequence,'12\n34\n7');await page.clock.runFor(700);
   assert.equal(await canonical(),'Q1: 12\nQ2: 34\nQ3: 7\nsum=53\n');assert.equal(await page.locator('.result-input').count(),3);
   await page.screenshot({path:path.join(evidence,'result-'+width+'.png'),fullPage:true});
 });
 await test('no uncaught browser errors',async()=>assert.deepEqual(errors,[]));
 const result={environment:{node:process.version,browser:await browser.version(),platform:process.platform,timezone:'Asia/Tokyo',realDevices:false},target,base,total:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,rows};
 fs.writeFileSync(path.join(evidence,'result-incremental.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));await browser.close();if(result.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
