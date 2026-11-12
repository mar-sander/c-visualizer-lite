/* Final Adjustment 1: inspect painted prefix throughout Injection and Reveal.
   PLAYWRIGHT_MODULE=<existing Playwright> node tests-result-continuity.cjs
     [candidate URL] [previous candidate URL] [evidence directory] */
'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const target=process.argv[2]||'http://127.0.0.1:19061',prior=process.argv[3]||'http://127.0.0.1:18961',evidence=process.argv[4]||'continuity-evidence';
fs.mkdirSync(evidence,{recursive:true});
const code='#include <stdio.h>\n\nint main(void){\n    int a, b, c;\n\n    printf("A = ");\n    scanf("%d", &a);\n\n    printf("B = ");\n    scanf("%d", &b);\n\n    printf("C = ");\n    scanf("%d", &c);\n\n    printf("SUM = %d\\n", a + b + c);\n\n    return 0;\n}';
const rows=[],samples=[],frames=[];
async function test(name,fn){try{await fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:e.stack});}}
const formal=p=>p.evaluate(()=>{const n=document.querySelector('.result-value');return n?.querySelector('.result-reveal-final')?.textContent??n?.textContent});
const edit=(p,value)=>p.evaluate(value=>{scanfInput.value=value;scanfInput.dispatchEvent(new Event('input',{bubbles:true}));},value);
async function settle(p){for(let i=0;i<100;i++){if(await p.evaluate(()=>!pendingRunSuccess&&!pendingInputInjection))return;await p.clock.runFor(20);}throw Error('feedback timeout');}
async function run(p,input=''){await p.evaluate(({code,input})=>{editor.setValue(code);scanfInput.value=input;scanfInput.dispatchEvent(new Event('input',{bubbles:true}));runCode();},{code,input});await settle(p);await p.clock.runFor(650);}
// A glyph must have painted geometry, visible ancestors, a nontransparent color,
// lie inside the viewport, and be unobstructed at its center (not just in DOM).
async function snapshot(p,prefix,label){
 const s=await p.evaluate(({prefix,label})=>{
   const value=document.querySelector('.result-value');
   const semantic=value?.querySelector('.result-reveal-final')||value;
   const actual=semantic?.textContent||'';
   const glyphs=[];let consumed=0;
   if(semantic){
     const walk=document.createTreeWalker(semantic,NodeFilter.SHOW_TEXT);
     for(let node;(node=walk.nextNode())&&consumed<prefix.length;){
       for(let i=0;i<node.textContent.length&&consumed<prefix.length;i++,consumed++){
         const ch=node.textContent[i];if(/\s/u.test(ch))continue;
         const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
         const r=range.getBoundingClientRect();let visible=r.width>0&&r.height>0;
         for(let el=node.parentElement;el;el=el.parentElement){const css=getComputedStyle(el);if(css.display==='none'||css.visibility!=='visible'||Number(css.opacity)===0)visible=false;}
         const color=getComputedStyle(node.parentElement).color;
         if(color==='transparent'||/rgba\([^)]*,\s*0\)$/.test(color))visible=false;
         const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
         const unobstructed=!!hit&&value.contains(hit);
         const inViewport=x>=0&&x<innerWidth&&y>=0&&y<innerHeight;
         glyphs.push({ch,x:r.x,y:r.y,width:r.width,height:r.height,visible,inViewport,unobstructed,color});
       }
     }
   }
   return {label,time:performance.now(),actual,prefixPresent:actual.startsWith(prefix),
     sameValue:value===window.continuityValue,connected:!!value?.isConnected,
     injection:!!pendingInputInjection,injectionClass:editorFrame.classList.contains('is-input-injecting'),
     injectionSurface:!!document.querySelector('.input-injection-surface'),
     idle:!!document.querySelector('.idle-state'),reveal:resultReveal!==null,
     revealPrefix:document.querySelector('.result-reveal-prefix')?.textContent,
     glyphs};
 },{prefix,label});
 assert.equal(s.connected,true,label);assert.equal(s.prefixPresent,true,label+': '+s.actual);
 assert.equal(s.idle,false,label);assert.equal(s.sameValue,true,label+': replaced value');
 assert.ok(s.glyphs.length,label+': no painted glyphs');
 assert.ok(s.glyphs.every(g=>g.visible&&g.inViewport&&g.unobstructed),label+': hidden/occluded prefix');
 samples.push(s);return s;
}
function samePositions(a,b){assert.deepEqual(a.glyphs.map(g=>[g.ch,g.x,g.y,g.width,g.height]),b.glyphs.map(g=>[g.ch,g.x,g.y,g.width,g.height]));}
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tokyo'});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.clock.install();await p.clock.pauseAt(new Date());await p.goto(target);
 await test('prior candidate reproduces visible RESULT replacement (negative control)',async()=>{
   const q=await context.newPage();await q.clock.install();await q.clock.pauseAt(new Date());await q.goto(prior);await run(q);
   assert.equal(await formal(q),'A = ');await edit(q,'10');await q.evaluate(()=>submitInput());
   assert.equal(await q.locator('.result-value').count(),0);assert.match(await q.locator('.idle-state').textContent(),/解析中です/);
   await q.screenshot({path:path.join(evidence,'prior-input-gap.png'),fullPage:true});await q.close();
 });
 for(const width of [1440,768,390]){
   await p.setViewportSize({width,height:width===1440?1000:1800});await run(p);await p.locator('.result-value').scrollIntoViewIfNeeded();
   for(const [index,input,before,after] of [
     [1,'10','A = ','A = 10\nB = '],
     [2,'10\n20','A = 10\nB = ','A = 10\nB = 20\nC = '],
     [3,'10\n20\n30','A = 10\nB = 20\nC = ','A = 10\nB = 20\nC = 30\nSUM = 60\n']
   ]) await test('painted continuity at '+width+'px INPUT '+index+' (six checkpoints + every timer/frame)',async()=>{
     await edit(p,input);await p.evaluate(()=>{window.continuityValue=document.querySelector('.result-value');});
     const start=await snapshot(p,before,'before-'+width+'-'+index);
     await p.evaluate(()=>submitInput());
     const immediate=await snapshot(p,before,'immediate-'+width+'-'+index);assert.equal(immediate.injection,true);assert.equal(immediate.injectionClass,true);assert.equal(immediate.injectionSurface,true);samePositions(start,immediate);
     const durations=await p.evaluate(()=>editorFrame.style.getPropertyValue('--input-injection-delay'));
     const duration=durations==='400ms'?900:540;
     await p.clock.runFor(duration/2);
     const during=await snapshot(p,before,'injection-'+width+'-'+index);assert.equal(during.injection,true);samePositions(start,during);
     if(index===1)await p.screenshot({path:path.join(evidence,'injection-'+width+'.png'),fullPage:true});
     await p.clock.runFor(duration/2-1);
     const last=await snapshot(p,before,'before-commit-'+width+'-'+index);assert.equal(last.injection,true);samePositions(start,last);
     await p.clock.runFor(1);
     const revealed=await snapshot(p,before,'reveal-'+width+'-'+index);assert.equal(revealed.injection,false);assert.equal(revealed.reveal,true);assert.equal(revealed.revealPrefix,before);assert.equal(revealed.actual,after);
     if(index===1)await p.screenshot({path:path.join(evidence,'reveal-'+width+'.png'),fullPage:true});
     // Check all animation timer intervals, not just the final state.
     for(let time=0;time<640;time+=16){await p.clock.runFor(16);const frame=await snapshot(p,before,'frame-'+width+'-'+index+'-'+time);samePositions(revealed,frame);frames.push({width,input:index,time:frame.time,visible:true});}
     const complete=await snapshot(p,before,'complete-'+width+'-'+index);assert.equal(complete.reveal,false);assert.equal(complete.actual,after);samePositions(revealed,complete);
     assert.equal(await p.locator('.result-input').count(),index);assert.equal(await p.locator('.result-reveal-text').count(),0);
     if(index===3)await p.screenshot({path:path.join(evidence,'complete-'+width+'.png'),fullPage:true});
   });
 }
 await p.setViewportSize({width:1440,height:1000});
 await test('Injection edit cancellation keeps old body; stale callback cannot commit',async()=>{
   await run(p);await edit(p,'10');await p.evaluate(()=>{window.continuityValue=document.querySelector('.result-value');submitInput();window.staleCommit=pendingInputInjection.onComplete;});await p.clock.runFor(100);
   await edit(p,'10\n20');await p.evaluate(()=>staleCommit());await p.clock.runFor(1200);assert.equal(await formal(p),'A = ');assert.equal(await p.evaluate(()=>pendingInputInjection),null);
   await p.evaluate(()=>submitInput());await settle(p);const s=await snapshot(p,'A = ','resubmit-after-edit');assert.equal(s.revealPrefix,'A = ');await p.clock.runFor(650);assert.equal(await formal(p),'A = 10\nB = 20\nC = ');
 });
 await test('new RUN interrupts Injection and keeps its original pending/Feedback path',async()=>{
   await run(p);await edit(p,'10');await p.evaluate(()=>{submitInput();window.staleCommit=pendingInputInjection.onComplete;runCode();staleCommit();});
   assert.equal(await p.locator('.waiting-state').count(),1);assert.equal(await p.evaluate(()=>pendingInputInjection),null);assert.equal(await p.evaluate(()=>!!pendingRunSuccess),false); // This RUN waits for input, as before.
   assert.equal(await formal(p),'A = 10\nB = ');
 });
 await test('complete new RUN still uses pending display and RUN Feedback',async()=>{
   await run(p);await edit(p,'10\n20\n30');await p.evaluate(()=>runCode());assert.match(await p.locator('.idle-state').textContent(),/解析中です/);assert.equal(await p.evaluate(()=>!!pendingRunSuccess),true);await settle(p);assert.equal(await p.evaluate(()=>resultReveal!==null),true);await p.clock.runFor(650);
 });
 await test('code edit interrupts Injection and rejects late completion',async()=>{
   await run(p);await edit(p,'10');await p.evaluate(()=>{submitInput();window.staleCommit=pendingInputInjection.onComplete;editor.setValue(editor.getValue()+'\n');staleCommit();});await p.clock.runFor(1200);assert.equal(await p.locator('.result-state').count(),0);assert.equal(await p.evaluate(()=>normalResultDisplay),null);
 });
 await test('changed consumed value uses safe ordinary pending/reveal path',async()=>{
   await run(p,'10');await edit(p,'99\n20');await p.evaluate(()=>submitInput());assert.match(await p.locator('.idle-state').textContent(),/解析中です/);await settle(p);assert.equal(await p.evaluate(()=>normalResultDisplay.continuous),false);assert.equal(await p.locator('.result-reveal-prefix').textContent(),'');await p.clock.runFor(650);assert.equal(await formal(p),'A = 99\nB = 20\nC = ');
 });
 await test('input error replaces old RESULT with the existing error UI',async()=>{await run(p,'10');await edit(p,'bad');await p.evaluate(()=>submitInput());assert.equal(await p.locator('.failure-state').count(),1);assert.equal(await p.locator('.result-state').count(),0);});
 await test('rapid INPUT editing retains last shown prefix through the new Injection',async()=>{
   await run(p);await edit(p,'10');await p.evaluate(()=>{window.continuityValue=document.querySelector('.result-value');submitInput();});await edit(p,'10\n20');await p.evaluate(()=>submitInput());await snapshot(p,'A = ','rapid-pending');await settle(p);assert.equal(await p.locator('.result-reveal-prefix').textContent(),'A = ');await p.clock.runFor(650);assert.equal(await formal(p),'A = 10\nB = 20\nC = ');
 });
 await test('FLOW is disabled while stale, then RESULT return remains static',async()=>{
   await run(p,'10\n20\n30');await edit(p,'10\n20\n30\n40');await p.evaluate(()=>{window.continuityValue=document.querySelector('.result-value');submitInput();});assert.equal(await p.locator('.result-flow-button').isDisabled(),true);await snapshot(p,'A = 10\nB = 20\nC = 30\nSUM = 60\n','flow-pending');await settle(p);assert.equal(await p.evaluate(()=>resultReveal),null);await p.locator('.result-flow-button').click();await p.evaluate(()=>showResultPage());assert.equal(await p.evaluate(()=>resultReveal),null);assert.equal(await formal(p),'A = 10\nB = 20\nC = 30\nSUM = 60\n');
 });
 await test('reduced-motion continuity retains Injection duration and correct body',async()=>{
   await p.emulateMedia({reducedMotion:'reduce'});await p.clock.runFor(50);await run(p);await edit(p,'10');await p.evaluate(()=>{window.continuityValue=document.querySelector('.result-value');submitInput();});await snapshot(p,'A = ','reduced-immediate');await p.clock.runFor(239);assert.equal(await p.evaluate(()=>!!pendingInputInjection),true);await snapshot(p,'A = ','reduced-before-commit');await p.clock.runFor(1);await snapshot(p,'A = ','reduced-complete');assert.equal(await p.evaluate(()=>resultReveal),null);assert.equal(await formal(p),'A = 10\nB = ');
 });
 await test('reduced-motion change during Injection cannot revive stale content',async()=>{
   await p.emulateMedia({reducedMotion:'no-preference'});await p.clock.runFor(50);await run(p);await edit(p,'10');await p.evaluate(()=>{window.continuityValue=document.querySelector('.result-value');submitInput();});await p.clock.runFor(100);await p.emulateMedia({reducedMotion:'reduce'});await p.clock.runFor(50);await snapshot(p,'A = ','motion-change');await settle(p);await p.clock.runFor(650);assert.equal(await formal(p),'A = 10\nB = ');assert.equal(await p.evaluate(()=>resultReveal),null);
 });
 await test('no uncaught browser errors',async()=>assert.deepEqual(errors,[]));
 const report={environment:{node:process.version,browser:await browser.version(),platform:process.platform,realDevices:false},target,prior,total:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,frameChecks:frames.length,rows,samples,frames};
 fs.writeFileSync(path.join(evidence,'result-continuity.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed,frameChecks:report.frameChecks,failures:rows.filter(r=>!r.pass)},null,2));await browser.close();if(report.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
