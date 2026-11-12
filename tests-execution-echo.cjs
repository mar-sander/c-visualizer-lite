/* Display-only scanf echo verification. No production dependencies.
   PLAYWRIGHT_MODULE=<existing Playwright> node tests-execution-echo.cjs
     [FA2 URL] [FA1 URL] [evidence directory] */
'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const target=process.argv[2]||'http://127.0.0.1:19161',prior=process.argv[3]||'http://127.0.0.1:19061',evidence=process.argv[4]||'echo-evidence';
fs.mkdirSync(evidence,{recursive:true});
const main=body=>'#include <stdio.h>\nint main(void){\n'+body+'\nreturn 0;\n}';
const sample=main('int a,b,c;\nprintf("A = ");\nscanf("%d", &a);\nprintf("B = ");\nscanf("%d", &b);\nprintf("C = ");\nscanf("%d", &c);\nprintf("SUM = %d\\n", a+b+c);');
const rows=[];
async function test(name,fn){try{await fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:e.stack});}}
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tokyo',reducedMotion:'reduce'});
 const p=await context.newPage(),q=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(target);await q.goto(prior);
 async function run(code,input=''){
   await p.evaluate(({code,input})=>{editor.setValue(code);scanfInput.value=input;scanfInput.dispatchEvent(new Event('input',{bubbles:true}));runCode();},{code,input});
   await p.waitForFunction(()=>!pendingRunSuccess&&!pendingInputInjection);return p.evaluate(()=>cVisualizerLiteResult);
 }
 const summary=()=>p.locator('#summary-output').textContent();
 const oldTranscript=result=>q.evaluate(r=>buildResultTranscript(r),result);
 async function checkInputOutput(result){
   const expected=await oldTranscript(result);assert.equal(await summary(),expected||'—');
   const consumed=result.steps.filter(s=>s.scanfInput).map(s=>s.scanfInput.specifier==='%c'?s.scanfInput.rawInput:s.scanfInput.inputDisplay);
   assert.deepEqual(await p.locator('#summary-output .execution-input-echo').allTextContents(),consumed);
   const state=await p.evaluate(()=>({engine:cVisualizerLiteResult,stored:JSON.parse(localStorage.getItem('c-visualizer-lite-history-v1'))}));
   assert.deepEqual(state.engine,result);assert.equal(state.stored.entries[0].output,result.output);assert.equal('segments' in state.stored.entries[0],false);
 }
 await test('FA1 negative control: execution summary omits inputs but RESULT includes them',async()=>{
   await q.evaluate(code=>{editor.setValue(code);scanfInput.value='10\n20\n30';runCode();},sample);await q.waitForFunction(()=>hasCurrentResult());
   assert.equal(await q.locator('#summary-output').textContent(),'A = B = C = SUM = 60\n');assert.equal(await q.locator('.result-value').textContent(),'A = 10\nB = 20\nC = 30\nSUM = 60\n');
 });
 const cases=[['int','%d','10','%d'],['int','%d','-10','%d'],['int','%d',' +002 ','%d'],['int','%d','\n\n 7 \n999','%d'],
   ['float','%f','2.50','%f'],['float','%f','-0.50','%f'],['double','%lf','+2.25','%f'],
   ['char','%c','A','%c'],['char','%c',' ','%c'],['char','%c','\t','%c'],['char','%c','<','%c'],['char','%c','&','%c']];
 for(const [type,spec,input,format]of cases)await test('echo '+spec+' '+JSON.stringify(input)+' safely; stdout/history unchanged',async()=>{
   const result=await run(main(`${type} n;\nprintf("<Q>& ");\nscanf("${spec}", &n);\nprintf("${format}", n);`),input);
   assert.equal(result.hasWarnings,false);await checkInputOutput(result);
   assert.equal(await p.locator('#summary-output img, #summary-output script, #summary-output b').count(),0);
 });
 for(const [name,before,after]of [['prompt newline','Q:\\n','END'],['printf newline','Q: ','\\nEND'],['printf blank line','Q: ','\\n\\nEND'],['empty printf','Q: ','']])await test('newline compatibility: '+name,async()=>{const result=await run(main(`int n;\nprintf("${before}");\nscanf("%d", &n);\nprintf("${after}");`),'7');await checkInputOutput(result);});
 await test('scanf-only still shows echo when C stdout is empty',async()=>{const result=await run(main('int a,b;\nscanf("%d", &a);\nscanf("%d", &b);'),'7\n7');assert.equal(result.output,'');assert.equal(await summary(),'7\n7\n');await checkInputOutput(result);});
 await test('identical input/output values keep occurrence order',async()=>{const result=await run(main('int a,b;\nprintf("7");\nscanf("%d", &a);\nprintf("7");\nscanf("%d", &b);\nprintf("7");'),'7\n7');await checkInputOutput(result);assert.deepEqual(await p.locator('#summary-output > span').evaluateAll(es=>es.map(e=>[e.className,e.textContent])),[['execution-output','7'],['execution-input-echo','7'],['execution-separator','\n'],['execution-output','7'],['execution-input-echo','7'],['execution-separator','\n'],['execution-output','7']]);});
 await test('sample WAITING/three INPUTs show only consumed values',async()=>{
   await run(sample);assert.equal(await summary(),'A = ');
   for(const [input,expected,count]of [['10','A = 10\nB = ',1],['10\n20','A = 10\nB = 20\nC = ',2],['10\n20\n30','A = 10\nB = 20\nC = 30\nSUM = 60\n',3]]){
     await p.locator('#scanfInput').fill(input);await p.locator('#input-submit').click();await p.waitForFunction(input=>!pendingInputInjection&&normalResultDisplay?.input===input,input);
     assert.equal(await summary(),expected);assert.equal(await p.locator('#summary-output .execution-input-echo').count(),count);
   }
 });
 await test('every STEP forward/back shows only reached printf/scanf; RESULT restore is full',async()=>{
   const result=await run(sample,'10\n20\n30\n999'),snapshot=JSON.stringify(result);await p.locator('.result-flow-button').click();
   const order=[...result.steps.keys(),...[...result.steps.keys()].reverse()];
   for(const index of order){
     await p.evaluate(index=>{activeStep=index;renderStep();},index);
     const prefix={steps:result.steps.slice(0,index+1),output:result.steps[index].outputAtStep},expected=await oldTranscript(prefix);
     assert.equal(await p.locator('#output-value').textContent(),expected||'—','STEP '+index);
     assert.equal(await summary(),expected||'—','summary STEP '+index);
     assert.equal(await p.locator('#output-value .execution-input-echo').count(),prefix.steps.filter(s=>s.scanfInput).length);
   }
   await p.evaluate(()=>showResultPage());assert.equal(await summary(),'A = 10\nB = 20\nC = 30\nSUM = 60\n');
   assert.equal(await p.evaluate(()=>JSON.stringify(cVisualizerLiteResult)),snapshot);assert.equal(await p.evaluate(()=>resultReveal),null);
 });
 await test('printf and echo yellow, same font and line metrics; RESULT input is yellow',async()=>{
   await run(sample,'10\n20\n30');
   const styles=await p.evaluate(()=>{const parent=document.getElementById('summary-output'),out=parent.querySelector('.execution-output'),echo=parent.querySelector('.execution-input-echo'),a=getComputedStyle(out),b=getComputedStyle(echo);return {out:a.color,echo:b.color,font:[a.fontFamily,a.fontSize,a.lineHeight,a.fontWeight],echoFont:[b.fontFamily,b.fontSize,b.lineHeight,b.fontWeight],whiteSpace:getComputedStyle(parent).whiteSpace,resultInput:getComputedStyle(document.querySelector('.result-input')).color};});
   assert.equal(styles.out,'rgb(255, 230, 0)');assert.equal(styles.echo,'rgb(255, 230, 0)');assert.deepEqual(styles.font,styles.echoFont);assert.equal(styles.whiteSpace,'pre-wrap');assert.equal(styles.resultInput,'rgb(255, 230, 0)');
 });
 await test('INPUT edit keeps previous echo snapshot until explicit execution; error clears it',async()=>{
   await run(sample,'10\n20\n30');const old=await summary();await p.locator('#scanfInput').fill('bad');assert.equal(await summary(),old);assert.equal(await p.evaluate(()=>hasCurrentResult()),false);await p.locator('#input-submit').click();await p.waitForSelector('.failure-state');assert.equal(await summary(),'—');assert.equal(await p.locator('#summary-output .execution-input-echo').count(),0);
 });
 await test('no-scanf program keeps FA1 output text and default styling',async()=>{
   const code=main('printf("  A\\n\\nB ");');await run(code);
   await q.evaluate(code=>{editor.setValue(code);scanfInput.value='';runCode();},code);await q.waitForFunction(()=>hasCurrentResult());
   assert.equal(await summary(),await q.locator('#summary-output').textContent());assert.equal(await p.locator('#summary-output .execution-input-echo').count(),0);assert.equal(await p.locator('#summary-output').evaluate(n=>getComputedStyle(n).color),'rgb(255, 230, 0)');
   await p.locator('.result-flow-button').click();await q.locator('.result-flow-button').click();
   assert.equal(await summary(),await q.locator('#summary-output').textContent());assert.equal(await p.locator('#output-value').textContent(),await q.locator('#output-value').textContent());
 });
 await test('Function Assist retains stdout-only summary and STEP behavior',async()=>{
   const code=require('./tests-function-input-stage5.js').examples.textbook;
   await p.evaluate(code=>{editor.setValue(code);scanfInput.value='2\n5';runCode();},code);await p.locator('.function-assist-accept').click();await p.waitForFunction(()=>hasCurrentResult());
   const output=await p.evaluate(()=>functionAssistResult.output);assert.equal(await summary(),output);assert.equal(await p.locator('#summary-output .execution-input-echo').count(),0);
   await p.locator('.result-flow-button').click();assert.equal(await p.locator('#output-value').textContent(),await p.evaluate(()=>currentSteps[activeStep].outputAtStep||'—'));
 });
 for(const width of [1440,768,390])await test('echo fits existing cards at '+width+'px',async()=>{
   await p.setViewportSize({width,height:width===390?844:1000});await run(sample,'10\n20\n30');assert.equal(await summary(),'A = 10\nB = 20\nC = 30\nSUM = 60\n');
   await p.screenshot({path:path.join(evidence,'echo-'+width+'.png'),fullPage:true});await p.locator('.result-flow-button').click();await p.evaluate(()=>{activeStep=currentSteps.findIndex(s=>s.scanfInput);renderStep();});assert.equal(await p.locator('#output-value').textContent(),'A = 10\n');await p.screenshot({path:path.join(evidence,'echo-step-'+width+'.png'),fullPage:true});
 });
 await test('no uncaught browser errors',async()=>assert.deepEqual(errors,[]));
 const report={environment:{node:process.version,browser:await browser.version(),platform:process.platform,realDevices:false},target,prior,total:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,rows};
 fs.writeFileSync(path.join(evidence,'execution-echo.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();if(report.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
