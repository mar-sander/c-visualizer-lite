/* PLAYWRIGHT_MODULE=<existing installation> node tests-input-consumption.cjs URL BASE EVIDENCE */
'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PNG}=require(path.join(process.env.PLAYWRIGHT_MODULE||'playwright','../pngjs'));
const target=process.argv[2]||'http://127.0.0.1:19261',base=process.argv[3]||'http://127.0.0.1:19262',out=process.argv[4]||'consumption-evidence';
fs.mkdirSync(out,{recursive:true});
const main=body=>'#include <stdio.h>\nint main(void){\n'+body+'\nreturn 0;\n}';
const code=main('int a,b,c;\nprintf("A = ");\nscanf("%d", &a);\nprintf("B = ");\nscanf("%d", &b);\nprintf("C = ");\nscanf("%d", &c);\nprintf("SUM = %d\\n", a+b+c);');
const rows=[],errors=[],geometry=[];
async function test(name,fn){console.log('START '+name);try{await fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:e.stack});}console.log(JSON.stringify(rows.at(-1)));}
function pixel(buffer,x,y){const p=PNG.sync.read(buffer),i=(Math.floor(y)*p.width+Math.floor(x))*4;return [...p.data.subarray(i,i+3)];}
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'Asia/Tokyo',reducedMotion:'reduce'});
 context.setDefaultTimeout(8000);
 const p=await context.newPage(),q=await context.newPage();p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(target);await q.goto(base);
 const input=p.locator('#scanfInput');
 const marks=()=>p.evaluate(()=>[...inputConsumption.rows]);
 const settle=()=>p.waitForFunction(()=>!pendingInputInjection&&!pendingRunSuccess);
 const edit=value=>p.evaluate(value=>{scanfInput.value=value;scanfInput.dispatchEvent(new Event('input',{bubbles:true}));},value);
 async function run(c=code,value=''){
  await p.evaluate(({c,value})=>{editor.setValue(c);scanfInput.value=value;scanfInput.dispatchEvent(new Event('input',{bubbles:true}));runCode();},{c,value});
  await settle();return p.evaluate(()=>cVisualizerLiteResult);
 }
 async function submit(){await p.evaluate(()=>submitInput());await settle();}
 await test('initial text is pending before first RUN',async()=>{await edit('10\n20\n30');assert.deepEqual(await marks(),[]);});
 await test('empty RUN waits with no consumed rows',async()=>{await run();assert.deepEqual(await marks(),[]);assert.equal(await p.evaluate(()=>cVisualizerLiteResult.inputRequired),true);});
 for(const [value,expected]of [['10',[0]],['10\n20',[0,1]],['10\n20\n30',[0,1,2]]])await test('staged INPUT '+JSON.stringify(value),async()=>{await edit(value);await submit();assert.deepEqual(await marks(),expected);});
 await test('required SUM = 60 and ECHO preserved',async()=>{assert.equal(await p.locator('.result-value').textContent(),'A = 10\nB = 20\nC = 30\nSUM = 60\n');assert.equal(await p.locator('#summary-output .execution-input-echo').count(),3);});
 const cases=[
  ['unused extra row',code,'10\n20\n30\n40',[0,1,2]],
  ['repeated integers',code,'10\n10\n10\n10',[0,1,2]],
  ['short repeated integers',code,'10\n10',[0,1]],
  ['numeric blank skip',code,'\n10\n \n20\n\t\n30\n40',[1,3,5]],
  ['negative integers',code,'-1\n-2\n-3',[0,1,2]],
  ['float',main('float a;\nscanf("%f", &a);'),'\n-2.50\n99',[1]],
  ['double',main('double a;\nscanf("%lf", &a);'),'+.25\n88',[0]],
  ['char',main('char a;\nscanf("%c", &a);'),'A\nB',[0]],
  ['char space',main('char a;\nscanf("%c", &a);'),' \nB',[0]],
  ['char tab',main('char a;\nscanf("%c", &a);'),'\t\nB',[0]],
  ['char empty waits',main('char a;\nscanf("%c", &a);'),'\nB',[]],
  ['invalid integer',code,'invalid\n10',[]],
  ['successful row before failure',code,'10\ninvalid\n30',[0]],
  ['invalid char',main('char a;\nscanf("%c", &a);'),'AB',[]],
  ['overflow conversion',code,'9'.repeat(400),[]],
  ['no scanf',main('printf("OK");'),'10\n20',[]],
  ['branch not entered',main('int a;\nif(0){\nscanf("%d", &a);\n}'),'10',[]],
  ['existing unsupported loop scanf stays pending',main('int i,a;\nfor(i=0;i<2;i++){\nscanf("%d", &a);\n}'),'7\n7\n7',[]]
 ];
 for(const [name,c,value,expected]of cases)await test(name+'; physical row and engine equivalence',async()=>{
  const result=await run(c,value);assert.deepEqual(await marks(),expected);
  assert.deepEqual(result.steps.flatMap(s=>s.scanfInput?[s.scanfInput.inputLineIndex]:[]),expected);
  const prior=await q.evaluate(({c,value})=>{editor.setValue(c);scanfInput.value=value;document.getElementById('codeInput').value=c;visualizeCode();return cVisualizerLiteResult;},{c,value});
  const copy=JSON.parse(JSON.stringify(result));for(const s of copy.steps||[])if(s.scanfInput)delete s.scanfInput.inputLineIndex;
  assert.deepEqual(copy,prior);
 });
 for(const [name,value,expected]of [
  ['append','10\n20\n30\n40',[0,1,2]],['modify first','11\n20\n30',[]],
  ['modify middle','10\n21\n30',[0]],['delete middle','10\n30',[0]],
  ['insert middle','10\n99\n20\n30',[0]],['delete all','',[]],['append newline','10\n20\n30\n',[0,1,2]]
 ])await test('editing '+name,async()=>{await run(code,'10\n20\n30');await edit(value);assert.deepEqual(await marks(),expected);});
 await test('reverting an edited line never resurrects a mark',async()=>{await run(code,'10\n20\n30');await edit('10\n99\n30');await edit('10\n20\n30');assert.deepEqual(await marks(),[0]);});
 await test('code changes reset even when there is no RESULT',async()=>{await run(code,'10\ninvalid');await p.evaluate(()=>editor.setValue(editor.getValue()+'\n'));assert.deepEqual(await marks(),[]);});
 await test('reset clears input and marks',async()=>{await run(code,'10\n20\n30');await p.evaluate(()=>resetCode());assert.equal(await input.inputValue(),'');assert.deepEqual(await marks(),[]);});
 await test('sample switch resets marks',async()=>{await run(code,'10\n20\n30');await p.evaluate(()=>{unlockedIds.add('samples');renderUnlockedSamples();});await p.selectOption('#sample-select','scanfTwo');assert.deepEqual(await marks(),[]);assert.equal(await input.inputValue(),'');});
 await test('history restore never marks or auto-RUNs',async()=>{await run(code,'10\n20\n30');await p.locator('#history-open').click();await p.locator('.history-item-select').first().click();await p.locator('.history-restore').click();assert.deepEqual(await marks(),[]);assert.equal(await p.evaluate(()=>finalState),null);assert.equal(await input.inputValue(),'');});
 await test('native clipboard copy/paste keeps editing and prefix state',async()=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);await run(code,'10\n20\n30');await input.focus();await input.evaluate(el=>el.setSelectionRange(0,2));await p.keyboard.press('Control+c');assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),'10');
  await p.evaluate(()=>navigator.clipboard.writeText('99'));await p.keyboard.press('Control+v');assert.equal(await input.inputValue(),'99\n20\n30');assert.deepEqual(await marks(),[]);
 });
 await test('new RUN starts pending during feedback',async()=>{await run(code,'10\n20\n30');await p.emulateMedia({reducedMotion:'no-preference'});await p.evaluate(()=>runCode());assert.deepEqual(await marks(),[]);await settle();assert.deepEqual(await marks(),[0,1,2]);});
 await test('Injection does not commit early; edited/reverted values cancel stale result',async()=>{
  await run(code,'10');await edit('10\n20');await p.evaluate(()=>submitInput());
  assert.equal(await p.evaluate(()=>!!pendingInputInjection),true);assert.deepEqual(await marks(),[0]);
  await edit('10\n99');await edit('10\n20');await p.waitForTimeout(900);assert.deepEqual(await marks(),[0]);
 });
 await test('code edit during Injection prevents commit',async()=>{await run(code,'10');await edit('10\n20');await p.evaluate(()=>submitInput());await p.evaluate(()=>editor.setValue(editor.getValue()+'\n'));await p.waitForTimeout(900);assert.deepEqual(await marks(),[]);});
 await p.emulateMedia({reducedMotion:'reduce'});
 await test('Function Assist confirmation uses original pending display',async()=>{await run(code,'10\n20\n30');await run('#include <stdio.h>\nint twice(int n){\nreturn n*2;\n}\nint main(void){\nint a;\nscanf("%d", &a);\nprintf("%d", twice(a));\nreturn 0;\n}','7');assert.deepEqual(await marks(),[]);assert.equal(await input.evaluate(el=>getComputedStyle(el).backgroundImage),'none');});
 for(const width of [1440,768,390]){
  await p.setViewportSize({width,height:1100});
  await test('painted backgrounds and native hit target '+width,async()=>{
   await run(code,'10\n20\n30\n40');await p.evaluate(()=>{setScanfAccordionOpen(true);scanfInput.style.height='125px';scanfInput.scrollTop=0;inputConsumption.paint();});await p.waitForTimeout(100);
   const b=await input.screenshot({path:path.join(out,'input-'+width+'.png')});
   assert.deepEqual(pixel(b,5,21),[56,56,56]);assert.notDeepEqual(pixel(b,5,84),[56,56,56]);
   assert.equal(await input.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+8,r.y+20)===el;}),true);
  });
  await test('wrapped numeric line / scroll / resize '+width,async()=>{
   const long='0'.repeat(240)+'7';await run(main('int a;\nscanf("%d", &a);'),long+'\n40\n50\n60');
   const check=async()=>{
    const g=await p.evaluate(()=>{inputConsumption.paint();const i=scanfInput,m=inputConsumption.mirror,s=getComputedStyle(i);return {native:i.scrollHeight,mirror:m.getBoundingClientRect().height+parseFloat(s.paddingTop)+parseFloat(s.paddingBottom),client:i.clientHeight,lineHeight:parseFloat(s.lineHeight),firstHeight:m.children[0].getBoundingClientRect().height};});
    geometry.push({width,...g});assert.ok(g.firstHeight>g.lineHeight);assert.ok(Math.abs(g.native-Math.max(g.mirror,g.client))<=1,JSON.stringify(g));
   };
   await check();await p.evaluate(()=>{scanfInput.style.height='68px';scanfInput.scrollTop=scanfInput.scrollHeight;});await p.waitForTimeout(60);await check();
   const b=await input.screenshot({path:path.join(out,'scrolled-'+width+'.png')});assert.notDeepEqual(pixel(b,5,45),[56,56,56]);
   await p.evaluate(()=>{scanfInput.scrollTop=21;});await p.waitForTimeout(40);
   const c=await input.screenshot();assert.deepEqual(pixel(c,5,20),[56,56,56]);
   await p.evaluate(()=>{scanfInput.style.height='180px';scanfInput.scrollTop=0;});await p.waitForTimeout(40);await check();
  });
  await test('selection, editing, keyboard and simulated IME '+width,async()=>{
   await run(code,'10\n20\n30');await input.focus();await input.evaluate(el=>el.setSelectionRange(0,2));assert.deepEqual(await input.evaluate(el=>[el.selectionStart,el.selectionEnd]),[0,2]);
   await p.keyboard.press('ArrowRight');await p.keyboard.press('End');await p.keyboard.press('Enter');await p.keyboard.insertText('日本語');
   await input.dispatchEvent('compositionstart',{data:''});await input.dispatchEvent('compositionupdate',{data:'入力'});await p.keyboard.insertText('入力');await input.dispatchEvent('compositionend',{data:'入力'});
   assert.match(await input.inputValue(),/日本語入力/);assert.deepEqual(await marks(),[0]);
   await p.keyboard.press('Backspace');await p.keyboard.press('Delete');assert.equal(await input.evaluate(el=>document.activeElement===el),true);
  });
  await test('accordion close/reopen keeps marks '+width,async()=>{await run(code,'10\n20\n30\n40');await p.evaluate(()=>setScanfAccordionOpen(false));await p.evaluate(()=>setScanfAccordionOpen(true));await p.waitForTimeout(100);assert.deepEqual(await marks(),[0,1,2]);assert.notEqual(await input.evaluate(el=>getComputedStyle(el).backgroundImage),'none');});
 }
 await test('Android Chrome emulation: touch, scroll and edit',async()=>{
  const mobile=await browser.newContext({viewport:{width:393,height:851},deviceScaleFactor:2.75,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36',reducedMotion:'reduce'}),m=await mobile.newPage();
  await m.goto(target);await m.evaluate(code=>{editor.setValue(code);scanfInput.value='10\n20\n30\n40';runCode();},code);await m.waitForFunction(()=>!pendingRunSuccess&&!pendingInputInjection);await m.evaluate(()=>setScanfAccordionOpen(true));
  await m.locator('#scanfInput').tap();assert.equal(await m.evaluate(()=>document.activeElement===scanfInput),true);await m.evaluate(()=>scanfInput.setSelectionRange(scanfInput.value.length,scanfInput.value.length));await m.keyboard.insertText('\n50');
  assert.deepEqual(await m.evaluate(()=>[...inputConsumption.rows]),[0,1,2]);await m.screenshot({path:path.join(out,'android-emulated.png'),fullPage:true});await mobile.close();
 });
 await test('no browser errors',async()=>assert.deepEqual(errors,[]));
 const report={environment:{node:process.version,browser:await browser.version(),timezone:'Asia/Tokyo',realAndroid:false,IME:'synthetic composition only'},target,base,total:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,rows,geometry};
 fs.writeFileSync(path.join(out,'input-consumption.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
