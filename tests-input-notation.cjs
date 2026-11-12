/* Display notation only. PLAYWRIGHT_MODULE=<installation> node tests-input-notation.cjs URL BASE EVIDENCE */
'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const url=process.argv[2]||'http://127.0.0.1:19361',base=process.argv[3]||'http://127.0.0.1:19362',out=process.argv[4]||'notation-evidence';
fs.mkdirSync(out,{recursive:true});
const main=s=>'#include <stdio.h>\nint main(void){\n'+s+'\nreturn 0;\n}';
const sample=main('int a,b,c;\nprintf("A = ");\nscanf("%d", &a);\nprintf("B = ");\nscanf("%d", &b);\nprintf("C = ");\nscanf("%d", &c);\nprintf("SUM = %d\\n",a+b+c);');
const rows=[],errors=[],frames=[];
async function test(name,fn){try{await fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:e.stack});}console.log(JSON.stringify(rows.at(-1)));}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
 const p=await context.newPage(),q=await context.newPage();p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(url);await q.goto(base);
 async function settle(){await p.waitForFunction(()=>!pendingInputInjection&&!pendingRunSuccess&&!resultReveal);}
 const edit=value=>p.evaluate(value=>{scanfInput.value=value;scanfInput.dispatchEvent(new Event('input',{bubbles:true}));},value);
 async function run(code=sample,input=''){
  await p.evaluate(({code,input})=>{editor.setValue(code);scanfInput.value=input;scanfInput.dispatchEvent(new Event('input',{bubbles:true}));runCode();},{code,input});await settle();
 }
 async function submit(input){await edit(input);await p.evaluate(()=>submitInput());await settle();}
 const values=selector=>p.locator(selector+' .input-notation:not(.input-notation-waiting)').evaluateAll(ns=>ns.map(n=>n.textContent));
 await test('initial waiting has one current frame in RESULT and summary, no future frames',async()=>{
  await run();for(const sel of ['.result-value','#summary-output']){assert.equal(await p.locator(sel+' .input-notation-waiting').count(),1);assert.deepEqual(await values(sel),[]);}
  assert.equal(await p.locator('#output-value .input-notation-waiting').count(),0);
  assert.equal(await p.locator('.result-value').textContent(),'A = ');
 });
 await test('scanf only waiting contains no invented output',async()=>{await run(main('int a;\nscanf("%d", &a);'));assert.equal(await p.locator('.result-value').textContent(),'');assert.equal(await p.locator('#summary-output').textContent(),'');});
 for(const [input,count,waiting]of [['10',1,1],['10\n20',2,1],['10\n20\n30',3,0]])await test('staged '+JSON.stringify(input),async()=>{
  if(count===1)await run();await submit(input);
  for(const sel of ['.result-value','#summary-output']){assert.deepEqual(await values(sel),input.split('\n'));assert.equal(await p.locator(sel+' .input-notation-waiting').count(),waiting);}
 });
 await test('shared fullwidth pseudo brackets and exact optical margin at all font sizes',async()=>{
  await p.evaluate(()=>{activeStep=currentSteps.findIndex(s=>s.scanfInput);renderStep();});
  for(const sel of ['#summary-output','#output-value','.scanf-step-input']){
   const css=await p.locator(sel+' .input-notation').first().evaluate(n=>{const v=n.querySelector('.input-notation-value'),s=getComputedStyle(v);return {before:getComputedStyle(n,'::before').content,after:getComputedStyle(n,'::after').content,gap:parseFloat(s.marginInlineStart)/parseFloat(s.fontSize),gapEnd:parseFloat(s.marginInlineEnd)/parseFloat(s.fontSize),nowrap:getComputedStyle(n).whiteSpace};});
   assert(css.before.includes('［'));assert(css.after.includes('］'));assert(Math.abs(css.gap-.08)<.002);assert(Math.abs(css.gapEnd-.08)<.002);assert.equal(css.nowrap,'pre');
  }
 });
 await test('each FLOW snapshot contains only consumed inputs, cards use same raw display',async()=>{
  const states=await p.evaluate(()=>currentSteps.map((s,i)=>{activeStep=i;renderStep();return {expected:currentSteps.slice(0,i+1).filter(s=>s.scanfInput).map(s=>s.scanfInput.specifier==='%c'?s.scanfInput.rawInput:s.scanfInput.inputDisplay),actual:[...document.querySelectorAll('#output-value .input-notation')].map(n=>n.textContent),card:document.querySelector('.scanf-step-input .input-notation')?.textContent,wanted:s.scanfInput?.inputDisplay,waiting:document.querySelectorAll('#output-value .input-notation-waiting').length};}));
  for(const s of states){assert.deepEqual(s.actual,s.expected);assert.equal(s.card,s.wanted);assert.equal(s.waiting,0);}
  await p.evaluate(()=>showResultPage());assert.deepEqual(await values('.result-value'),['10','20','30']);
 });
 const cases=[['integer','int a;','%d','+002'],['negative','int a;','%d','-2'],['float','float a;','%f','2.50'],['double','double a;','%lf','-2.50'],['char','char a;','%c','A'],['space','char a;','%c',' '],['tab','char a;','%c','\t']];
 for(const [name,decl,spec,input]of cases)await test(name+' semantic engine, history and notation',async()=>{
  const code=main(decl+'\nprintf("［2］ = ");\nscanf("'+spec+'", &a);\nprintf("'+spec+'",a);');
  await run(code,input);
  const r=await p.evaluate(()=>JSON.parse(JSON.stringify(cVisualizerLiteResult)));
  const b=await q.evaluate(({code,input})=>{editor.setValue(code);scanfInput.value=input;document.getElementById('codeInput').value=code;visualizeCode();return cVisualizerLiteResult;},{code,input});assert.deepEqual(r,b);
  const echo=r.steps.find(s=>s.scanfInput).scanfInput;const raw=spec==='%c'?echo.rawInput:echo.inputDisplay;
  for(const sel of ['.result-value','#summary-output']){assert.deepEqual(await values(sel),[raw]);assert.equal(await p.locator(sel+' .input-notation-waiting').count(),0);}
  assert.equal(await p.locator('.result-output .input-notation').count(),0);
  assert.equal(await p.locator('.result-value').textContent(),await p.evaluate(()=>buildResultTranscript(cVisualizerLiteResult)));
  const history=await p.evaluate(()=>JSON.parse(localStorage.getItem('c-visualizer-lite-history-v1')||'null'));
  assert.equal(history.entries[0].output,r.output);
  assert.equal(history.version,1);assert(!JSON.stringify(history).includes('入力済み:'));
  if(name==='space'||name==='tab'){
   const symbol=name==='space'?'␠':'⇥';assert.equal(await p.locator('.result-value .input-notation-value').getAttribute('data-input-symbol'),symbol);
   assert((await p.locator('.result-value').ariaSnapshot()).includes('入力済み: '+symbol));
  }
 });
 await test('no scanf and printf literal brackets never get classified as input',async()=>{await run(main('printf("［2］");'));assert.equal(await p.locator('.input-notation').count(),0);assert.equal(await p.locator('.result-value').textContent(),'［2］');});
 await test('empty char line stays waiting; engine does not accept a newline character',async()=>{await run(main('char a;\nscanf("%c", &a);'),'\n');assert.equal(await p.locator('.result-value .input-notation-waiting').count(),1);assert.deepEqual(await values('.result-value'),[]);});
 await test('accepted whitespace and waiting have distinct accessible names and dimensions',async()=>{await run(main('char a;\nint b;\nscanf("%c", &a);\nscanf("%d", &b);'),' ');const ax=await p.locator('.result-value').ariaSnapshot();fs.writeFileSync(path.join(out,'accessibility.txt'),ax);assert(ax.includes('入力済み: ␠'));assert(ax.includes('入力待ち'));assert.equal((ax.match(/入力済み/g)||[]).length,1);const w=await p.locator('.result-value .input-notation-waiting .input-notation-value').evaluate(n=>n.getBoundingClientRect().width);assert(w>0);});
 await test('Function Assist uses explicit scanf metadata only in its FLOW explanation',async()=>{
  const code=require('./tests-function-input-stage5.js').examples.textbook;
  await run(code);await p.locator('.function-assist-accept').click();await settle();
  await submit('2');assert.equal(await p.evaluate(()=>functionAssistAttempt.status),'WAITING_FUNCTION');
  await submit('2\n5');assert.equal(await p.evaluate(()=>functionAssistAttempt.status),'RESULT_REUSABLE');
  assert.equal(await p.locator('.result-value .input-notation').count(),0);assert.equal(await p.locator('#summary-output .input-notation').count(),0);
  await p.evaluate(()=>{activeStep=currentSteps.findIndex(s=>s.functionEvent==='scanf');renderStep();});
  assert.equal(await p.locator('.function-assist-step .input-notation').textContent(),'2');assert.equal(await p.locator('#output-value .input-notation').count(),0);
  await p.evaluate(()=>showResultPage());await submit('2\n5');assert.equal(await p.evaluate(()=>functionAssistAttempt.status),'RESULT_REUSABLE');
 });
 // Paused clock captures every Reveal frame, including hidden final and visible overlay.
 await context.close();
 const animated=await browser.newContext({viewport:{width:1440,height:1100}});const a=await animated.newPage();await a.clock.install();await a.clock.pauseAt(new Date());await a.goto(url);
 async function tick(){for(let i=0;i<100;i++){if(await a.evaluate(()=>!pendingInputInjection&&!pendingRunSuccess))return;await a.clock.runFor(20);}throw Error('feedback timeout');}
 await test('Reveal masks new brackets with their value and keeps styled old prefix geometry',async()=>{
  await a.evaluate(code=>{editor.setValue(code);scanfInput.value='10';runCode();},sample);await tick();await a.clock.runFor(700);
  await a.evaluate(()=>{window.__oldValue=document.querySelector('.result-value');scanfInput.value='10\n20';scanfInput.dispatchEvent(new Event('input',{bubbles:true}));submitInput();});await tick();
  for(let i=0;i<17;i++){
   const snap=await a.evaluate(()=>{const n=document.querySelector('.result-value'),f=n.querySelector('.result-reveal-final');return {same:n===__oldValue,raw:(f||n).textContent,hidden:[...n.querySelectorAll('.result-reveal-pending.input-notation')].map(x=>({opacity:getComputedStyle(x).opacity,raw:x.textContent})),overlay:[...n.querySelectorAll('.result-reveal-text > .result-input .input-notation')].map(x=>x.textContent),prefix:n.querySelector('.result-reveal-prefix .input-notation')?.getBoundingClientRect().width,final:n.querySelector('.result-reveal-final .input-notation')?.getBoundingClientRect().width,waiting:n.querySelectorAll('.input-notation-waiting').length};});
   frames.push(snap);assert(snap.same);assert.equal(snap.raw,'A = 10\nB = 20\nC = ');for(const h of snap.hidden){assert.equal(h.opacity,'0');assert.equal(h.raw,'20');}if(snap.prefix)assert(Math.abs(snap.prefix-snap.final)<.02);if(snap.hidden.length)assert.equal(snap.waiting,0);await a.clock.runFor(40);
  }
  assert.equal(await a.locator('.result-value .input-notation-waiting').count(),1);
 });
 await test('cancel, edited input, same resubmit and code changes leave no stale overlay',async()=>{
  await a.evaluate(()=>{scanfInput.value='10\n20\n30';scanfInput.dispatchEvent(new Event('input',{bubbles:true}));submitInput();});await tick();await a.clock.runFor(80);await a.evaluate(()=>{scanfInput.value='10\n20\n31';scanfInput.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await a.locator('.result-reveal-text').count(),0);
  await a.evaluate(()=>submitInput());await tick();await a.clock.runFor(700);await a.evaluate(()=>submitInput());await tick();await a.clock.runFor(700);assert.equal(await a.locator('.result-value .input-notation').count(),3);await a.evaluate(()=>editor.setValue('int main(void){\nreturn 0;\n}'));await a.clock.runFor(1000);assert.equal(await a.locator('.result-reveal-text').count(),0);
 });
 await animated.close();
 for(const width of [1440,768,390]){
  const c=await browser.newContext({viewport:{width,height:width===390?844:1100},reducedMotion:'reduce'}),page=await c.newPage();await page.goto(url);
  await test('responsive '+width+' waiting, staged, complete and FLOW',async()=>{
   await page.evaluate(code=>{editor.setValue(code);scanfInput.value='';runCode();},sample);
   for(const [label,input]of [['waiting',''],['staged','10'],['complete','10\n20\n30']]){
    if(input)await page.evaluate(input=>{scanfInput.value=input;scanfInput.dispatchEvent(new Event('input',{bubbles:true}));submitInput();},input);
    await page.waitForFunction(()=>!pendingInputInjection&&!pendingRunSuccess&&!resultReveal);await page.locator('.result-state').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,width+'-'+label+'.png'),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
   await page.evaluate(()=>{activeStep=currentSteps.findLastIndex(s=>s.scanfInput);renderStep();});await page.locator('.scanf-step-input').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,width+'-flow.png'),fullPage:true});
   assert.equal(await page.locator('.scanf-step-input .input-notation').textContent(),'30');
   assert(await page.locator('.scanf-step-input .input-notation-value').evaluate(n=>n.getBoundingClientRect().height<1.6*parseFloat(getComputedStyle(n).fontSize)));
   await page.evaluate(code=>{editor.setValue(code);scanfInput.value='0'.repeat(240)+'7';runCode();},main('int a;\nscanf("%d", &a);'));
   await page.waitForFunction(()=>!pendingInputInjection&&!pendingRunSuccess);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert(await page.locator('.result-value .input-notation').evaluate(n=>n.getBoundingClientRect().height>parseFloat(getComputedStyle(n).lineHeight)));
   await page.screenshot({path:path.join(out,width+'-long-input.png'),fullPage:true});
  });await c.close();
 }
 await browser.close();
 fs.writeFileSync(path.join(out,'frames.json'),JSON.stringify(frames,null,2));
 const report={environment:{node:process.version,browser:'Chrome',emulatedWidths:[1440,768,390]},total:rows.length,passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length,rows,errors,frameChecks:frames.length};
 fs.writeFileSync(path.join(out,'input-notation.json'),JSON.stringify(report,null,2));if(report.failed||errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
