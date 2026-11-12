'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PNG}=require(require('path').join(process.env.PLAYWRIGHT_MODULE||'playwright','../pngjs'));
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const target=process.argv[2]||'http://127.0.0.1:19261',base=process.argv[3]||'http://127.0.0.1:19262',out=process.argv[4]||'layout-evidence';
fs.mkdirSync(out,{recursive:true});const rows=[];
async function test(name,fn){try{await fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:e.stack});}console.log(JSON.stringify(rows.at(-1)));}
const code='#include <stdio.h>\nint main(void){\nint a,b,c;\nscanf("%d", &a);\nscanf("%d", &b);\nscanf("%d", &c);\nreturn 0;\n}';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({reducedMotion:'reduce'}),p=await context.newPage(),q=await context.newPage();
 const run=async(page,input)=>{await page.evaluate(({code,input})=>{editor.setValue(code);scanfInput.value=input;runCode();},{code,input});await page.waitForFunction(()=>!pendingRunSuccess&&!pendingInputInjection);await page.evaluate(()=>setScanfAccordionOpen(true));await page.waitForTimeout(80);};
 const box=page=>page.locator('#scanfInput').evaluate(i=>{const s=getComputedStyle(i),r=i.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,font:s.font,lineHeight:s.lineHeight,padding:s.padding,border:s.border,resize:s.resize,button:i.nextElementSibling.id};});
 for(const width of [1440,768,390]){
  await p.setViewportSize({width,height:1100});await q.setViewportSize({width,height:1100});await p.goto(target);await q.goto(base);
  await test('native geometry and text metrics match remote main at '+width,async()=>{await run(p,'10\n20\n30\n40');await run(q,'10\n20\n30\n40');assert.deepEqual(await box(p),await box(q));});
  await test('noncontiguous physical blank rows are visibly pending at '+width,async()=>{
   await run(p,'\n10\n \n20\n\t\n30\n40');await p.evaluate(()=>{scanfInput.style.height='180px';scanfInput.scrollTop=0;inputConsumption.paint();});await p.waitForTimeout(50);
   const png=PNG.sync.read(await p.locator('#scanfInput').screenshot({path:path.join(out,'blank-skip-'+width+'.png')}));
   for(let row=0;row<7;row++){const offset=(Math.floor(11+21*row+10)*png.width+5)*4;const gray=[...png.data.subarray(offset,offset+3)].every(v=>v===56);assert.equal(gray,[1,3,5].includes(row),'row '+row);}
  });
  await test('native resize handle changes height and preserves editing at '+width,async()=>{
   const input=p.locator('#scanfInput');await input.scrollIntoViewIfNeeded();const r=await input.boundingBox();await p.mouse.move(r.x+r.width-4,r.y+r.height-4);await p.mouse.down();await p.mouse.move(r.x+r.width-4,r.y+r.height+46,{steps:6});await p.mouse.up();
   const after=await input.boundingBox();assert.ok(after.height>r.height+20,JSON.stringify({r,after}));assert.equal(await input.inputValue(),'\n10\n \n20\n\t\n30\n40');assert.deepEqual(await p.evaluate(()=>[...inputConsumption.rows]),[1,3,5]);
   await p.screenshot({path:path.join(out,'complete-'+width+'.png'),fullPage:true});
  });
 }
 const report={environment:{node:process.version,browser:await browser.version(),realDevice:false},total:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,rows};fs.writeFileSync(path.join(out,'input-layout.json'),JSON.stringify(report,null,2));await browser.close();process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
