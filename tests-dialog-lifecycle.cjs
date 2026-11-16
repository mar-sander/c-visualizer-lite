/* Real-clock dialog lifecycle regression. No production hooks or fake close events.
   Same URL/URL/evidence interface as the current-main integrated runner. */
'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const target=process.argv[2]||'http://127.0.0.1:18863/index.html';
const out=path.resolve(process.argv[4]||'dialog-evidence');fs.mkdirSync(out,{recursive:true});
const rows=[],errors=[];
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 try{for(const motion of ['no-preference','reduce']){
 const context=await browser.newContext({reducedMotion:motion,viewport:{width:1440,height:1000}});
 const duration=motion==='reduce'?350:800;
 async function test(name,action){const page=await context.newPage(),start=Date.now();
 page.on('pageerror',e=>errors.push({name,error:e.message}));
 try{await page.goto(target);await page.waitForFunction(()=>document.querySelector('.CodeMirror')?.CodeMirror);
 const actual=await action(page);rows.push({name:motion+' '+name,pass:true,elapsedMs:Date.now()-start,actual});
 }catch(e){rows.push({name:motion+' '+name,pass:false,elapsedMs:Date.now()-start,error:e.stack});await page.screenshot({path:path.join(out,'failure-'+rows.length+'.png')});}
 finally{await page.close();}}
 // All operations use production event handlers and native HTMLDialogElement.close().
 for(const interval of [0,5,25,100])await test('secret close/reopen/new unlock interval='+interval+'ms',async p=>{
 const s=await p.evaluate(async({interval,duration})=>{
 const $=id=>document.getElementById(id),d=$('secret-code-dialog'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const open=()=>$('secret-code-open').click(),submit=code=>{$('secret-code-input').value=code;$('secret-code-form').requestSubmit();};
 open();submit('getsample');const event=new Promise(r=>d.addEventListener('close',r,{once:true}));
 const closeAt=performance.now();d.close();if(interval)await sleep(interval);open();submit('getmovie');const reopenedAt=performance.now();
 await event;await sleep(40);
 const feedback={open:d.open,unlocking:d.classList.contains('is-unlocking'),hidden:$('secret-code-success').hidden,form:$('secret-code-form').getAttribute('aria-hidden'),label:$('secret-code-success-text').textContent};
 await sleep(duration+80);return {feedback,closedAfterDuration:!d.open,clean:!d.classList.contains('is-unlocking')&&$('secret-code-success').hidden,actualGapMs:reopenedAt-closeAt};
 },{interval,duration});
 assert.deepEqual(s.feedback,{open:true,unlocking:true,hidden:false,form:'true',label:'MOVIE UNLOCKED'});assert.equal(s.closedAfterDuration,true);assert.equal(s.clean,true);return s;
 });
 await test('secret duplicate submit retains latest feedback duration',async p=>{
 const s=await p.evaluate(async duration=>{const $=id=>document.getElementById(id),d=$('secret-code-dialog'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 $('secret-code-open').click();const submit=code=>{$('secret-code-input').value=code;$('secret-code-form').requestSubmit();};
 submit('getsample');await sleep(duration/2);submit('getmask');await sleep(duration/2+50);
 const latestAlive=d.open&&d.classList.contains('is-unlocking')&&!$('secret-code-success').hidden&&$('secret-code-success-text').textContent==='MASK UNLOCKED';
 await sleep(duration/2+80);return {latestAlive,closed:!d.open};},duration);
 assert.equal(s.latestAlive,true);assert.equal(s.closed,true);return s;
 });
 await test('secret close/reopen without submit cancels old timer',async p=>{
 const s=await p.evaluate(async duration=>{const $=id=>document.getElementById(id),d=$('secret-code-dialog');$('secret-code-open').click();$('secret-code-input').value='getsample';$('secret-code-form').requestSubmit();d.close();$('secret-code-open').click();await new Promise(r=>setTimeout(r,duration+100));return {open:d.open,hidden:$('secret-code-success').hidden,unlocking:d.classList.contains('is-unlocking'),form:$('secret-code-form').getAttribute('aria-hidden'),focus:document.activeElement.id};},duration);
 assert.deepEqual(s,{open:true,hidden:true,unlocking:false,form:null,focus:'secret-code-input'});return s;
 });
 await test('secret close/reopen/close/reopen burst preserves newest unlock',async p=>{
 const s=await p.evaluate(async()=>{const $=id=>document.getElementById(id),d=$('secret-code-dialog');for(let n=0;n<5;n++){$('secret-code-open').click();$('secret-code-input').value='getmovie';$('secret-code-form').requestSubmit();d.close();}$('secret-code-open').click();$('secret-code-input').value='getmask';$('secret-code-form').requestSubmit();await new Promise(r=>setTimeout(r,50));return {open:d.open,unlocking:d.classList.contains('is-unlocking'),visible:!$('secret-code-success').hidden,label:$('secret-code-success-text').textContent};});
 assert.deepEqual(s,{open:true,unlocking:true,visible:true,label:'MASK UNLOCKED'});return s;
 });
 for(const route of ['escape','backdrop','native'])await test('secret mid-animation '+route+' close then ordinary reopen',async p=>{
 await p.locator('#secret-code-open').click();await p.locator('#secret-code-input').fill('getmask');await p.locator('#secret-code-form button').click();await p.waitForTimeout(duration/3);
 if(route==='escape')await p.keyboard.press('Escape');else if(route==='backdrop')await p.mouse.click(1,1);else await p.locator('#secret-code-dialog').evaluate(d=>d.close());
 await p.waitForFunction(()=>!document.getElementById('secret-code-dialog').open);
 await p.locator('#secret-code-open').click();await p.waitForTimeout(duration+50);
 const s=await p.evaluate(()=>({open:document.getElementById('secret-code-dialog').open,hidden:document.getElementById('secret-code-success').hidden,form:document.getElementById('secret-code-form').getAttribute('aria-hidden')}));assert.deepEqual(s,{open:true,hidden:true,form:null});return s;
 });
 await test('secret normal invalid Enter/unlock auto-close and repeated unlock',async p=>{
 for(const code of ['invalid','getsample','getsample']){await p.locator('#secret-code-open').click();await p.locator('#secret-code-input').fill(code);await p.keyboard.press('Enter');if(code==='invalid'){await p.waitForFunction(()=>!document.getElementById('secret-code-error').hidden);await p.keyboard.press('Escape');}
 else{const s=await p.locator('#secret-code-dialog').evaluate(d=>({open:d.open,animation:getComputedStyle(d).animationName,duration:getComputedStyle(d).animationDuration,success:!document.getElementById('secret-code-success').hidden}));assert.equal(s.open,true);assert.equal(s.success,true);assert.equal(s.animation,motion==='reduce'?'none':'unlock-frame-pulse');if(motion!=='reduce')assert.equal(s.duration,'0.8s');await p.waitForFunction(()=>!document.getElementById('secret-code-dialog').open);}}
 });
 for(const changed of [false,true])await test('tips native close/reopen preserves new playback/focus changedSource='+changed,async p=>{
 const s=await p.evaluate(async changed=>{
 const $=id=>document.getElementById(id),d=$('tips-dialog'),v=$('tips-video'),open=n=>{$('tips-open').click();document.querySelectorAll('.tips-menu-item')[n].click();};
 open(0);await new Promise((resolve,reject)=>{if(v.readyState>=1)return resolve();v.addEventListener('loadedmetadata',resolve,{once:true});v.addEventListener('error',()=>reject(Error('video load')),{once:true});});
 let events=0;d.addEventListener('close',()=>events++);const event=new Promise(r=>d.addEventListener('close',r,{once:true}));d.close();open(changed?2:0);
 if(v.readyState<1)await new Promise(r=>v.addEventListener('loadedmetadata',r,{once:true}));
 v.muted=true;v.currentTime=3;const play=v.play();await event;await play;await new Promise(r=>setTimeout(r,80));
 return {open:d.open,paused:v.paused,time:v.currentTime,focus:document.activeElement.id,events,source:v.querySelector('source').getAttribute('src')};},changed);
 assert.equal(s.open,true);assert.equal(s.paused,false);assert.ok(s.time>=3);assert.equal(s.focus,'tips-dialog-close');assert.equal(s.events,1);return s;
 });
 for(const route of ['button','escape','backdrop','native'])await test('tips normal '+route+' closes/stops/rewinds/restores focus',async p=>{
 await p.evaluate(async()=>{document.getElementById('tips-open').click();document.querySelector('.tips-menu-item').click();const v=document.getElementById('tips-video');if(v.readyState<1)await new Promise(r=>v.addEventListener('loadedmetadata',r,{once:true}));v.muted=true;v.currentTime=4;await v.play();});
 if(route==='button')await p.locator('#tips-dialog-close').click();else if(route==='escape')await p.keyboard.press('Escape');else if(route==='backdrop')await p.mouse.click(1,1);else await p.locator('#tips-dialog').evaluate(d=>d.close());
 await p.waitForFunction(()=>{const d=document.getElementById('tips-dialog'),v=document.getElementById('tips-video');return !d.open&&v.paused&&v.currentTime===0&&document.activeElement.id==='tips-open';});
 });
 await test('history rapid close/reopen and all normal close paths',async p=>{
 await p.evaluate(async()=>{const $=id=>document.getElementById(id),d=$('history-dialog');$('history-open').click();d.close();$('history-open').click();await new Promise(r=>setTimeout(r,40));if(!d.open)throw Error('history reopened state lost');});
 for(const route of ['button','escape','backdrop']){if(route==='button')await p.locator('#history-close').click();else if(route==='escape')await p.keyboard.press('Escape');else await p.mouse.click(1,1);await p.waitForFunction(()=>!document.getElementById('history-dialog').open);if(route!=='backdrop')await p.locator('#history-open').click();}
 });
 await context.close();}
 }finally{await browser.close();}
 const report={target,node:process.version,browser:browser.version(),clock:'real timers; native queued close events',realDevice:false,total:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,errors,rows};
 fs.writeFileSync(path.join(out,'dialog-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed,errors}));process.exitCode=report.failed||errors.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
