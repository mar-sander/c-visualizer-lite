/* Development-only browser tests. No dependency is added to the product.
   PLAYWRIGHT_MODULE: path to an existing Playwright installation.
   node tests-header-clock.cjs [candidate URL] [baseline URL] [evidence directory] */
'use strict';
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = process.argv[2] || 'http://127.0.0.1:18861';
const baseline = process.argv[3] || 'http://127.0.0.1:18862';
const evidence = process.argv[4] || 'clock-evidence';
fs.mkdirSync(evidence, {recursive:true});
const rows = [];
async function test(name, action){
  try { await action(); rows.push({name,pass:true}); }
  catch(e){ rows.push({name,pass:false,error:e.stack}); }
}
(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tokyo'});
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e=>errors.push(String(e)));
  await page.clock.install({time:new Date('2026-11-11T09:05:59.950+09:00')});
  await page.clock.pauseAt(new Date('2026-11-11T09:05:59.950+09:00'));
  await page.goto(target);
  const clock = page.locator('#header-clock');
  const text = ()=>clock.textContent();
  const color = ()=>clock.evaluate(el=>getComputedStyle(el).color);
  const metrics = ()=>clock.evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return [s.fontSize,s.fontWeight,r.x,r.y,r.width,r.height];});
  const gray = await color();
  await test('PC exact string and 09:05 zero padding',async()=>assert.equal(await page.locator('.header-update-desktop').textContent(),'Beta_Edition UP:2026.11.11 | 09:05'));
  await test('initial gray and accessible toggle',async()=>{assert.equal(await clock.getAttribute('aria-pressed'),'false');assert.equal(gray,'rgb(181, 181, 181)');assert.equal(await clock.getAttribute('type'),'button');assert.ok(await clock.getAttribute('aria-label'));});
  const normalMetrics = await metrics();
  await test('click only time becomes existing accent yellow',async()=>{await clock.click();assert.equal(await color(),'rgb(255, 230, 0)');assert.equal(await page.locator('.header-update-desktop').evaluate(el=>getComputedStyle(el).color),gray);});
  await test('toggle keeps font and geometry',async()=>assert.deepEqual(await metrics(),normalMetrics));
  await test('minute boundary at 50ms preserves highlight',async()=>{await page.clock.runFor(50);assert.equal(await text(),'09:06');assert.equal(await color(),'rgb(255, 230, 0)');});
  await test('second click restores gray',async()=>{await clock.click();assert.equal(await color(),gray);});
  await test('click date or separator does not toggle',async()=>{await page.locator('.header-update-desktop').click({position:{x:10,y:5}});assert.equal(await clock.getAttribute('aria-pressed'),'false');});
  await test('keyboard Enter toggles',async()=>{await clock.focus();await page.keyboard.press('Enter');assert.equal(await clock.getAttribute('aria-pressed'),'true');});
  await test('keyboard Space toggles',async()=>{await page.keyboard.press('Space');assert.equal(await clock.getAttribute('aria-pressed'),'false');});
  await test('keyboard focus visible',async()=>assert.notEqual(await clock.evaluate(el=>getComputedStyle(el).outlineStyle),'none'));
  await test('focus corrects clock and 59 to 00 rollover',async()=>{await page.clock.setSystemTime(new Date('2026-11-11T10:59:59.950+09:00'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await text(),'10:59');await page.clock.runFor(50);assert.equal(await text(),'11:00');});
  await test('visible tab return corrects delayed clock',async()=>{await page.clock.setSystemTime(new Date('2026-11-11T16:42:13+09:00'));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(await text(),'16:42');});
  await test('hidden tab does not refresh on visibility event',async()=>{await page.clock.setSystemTime(new Date('2026-11-11T17:23:13+09:00'));await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await text(),'16:42');await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await text(),'17:23');});
  await test('midnight rollover keeps fixed update date',async()=>{await page.clock.setSystemTime(new Date('2026-11-11T23:59:59.950+09:00'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.clock.runFor(50);assert.equal(await text(),'00:00');assert.equal(await page.locator('.header-update-desktop').textContent(),'Beta_Edition UP:2026.11.11 | 00:00');});
  await test('pageshow corrects restored page',async()=>{await page.clock.setSystemTime(new Date('2026-11-12T08:12:00+09:00'));await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));assert.equal(await text(),'08:12');});
  await test('reload clears highlight',async()=>{await clock.click();await page.reload();assert.equal(await clock.getAttribute('aria-pressed'),'false');assert.equal(await color(),gray);});
  for(const width of [1440,1024,901,900,768,600,390,320]){
    await test('responsive '+width+'px and baseline header geometry',async()=>{
      await page.setViewportSize({width,height:1000});
      await page.waitForTimeout(40);
      assert.equal(await clock.isVisible(),width>=901);
      assert.equal(await page.locator('.header-update-mobile').isVisible(),width<901);
      if(width>=901)assert.match(await text(),/^\d{2}:\d{2}$/);
      else {assert.equal(await page.locator('.header-update-mobile').textContent(),'Beta_Edition UP:2026.11.11');assert.equal(await page.locator('.header-update-desktop').evaluate(el=>el.getClientRects().length),0);}
      const old = await context.newPage();await old.setViewportSize({width,height:1000});await old.goto(baseline);
      const rect = p=>p.locator('.site-header').evaluate(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
      assert.deepEqual(await rect(page),await rect(old));
      const typography=p=>p.locator('.brand small').evaluate(el=>{const s=getComputedStyle(el);return [s.fontSize,s.fontFamily,s.color,s.letterSpacing,s.marginTop];});
      assert.deepEqual(await typography(page),await typography(old));
      const bounds=await page.locator('.header-update-desktop').boundingBox();
      if(bounds)assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width);
      if(width===1440||width===390){await page.screenshot({path:path.join(evidence,`candidate-${width}.png`),fullPage:true});await old.screenshot({path:path.join(evidence,`baseline-${width}.png`),fullPage:true});}
      await old.close();
    });
  }
  await test('mobile to desktop refreshes current time and retains toggle state',async()=>{
    await page.setViewportSize({width:1440,height:1000});await clock.click();await page.setViewportSize({width:390,height:1000});await page.waitForTimeout(40);
    await page.clock.setSystemTime(new Date('2026-11-12T19:03:27+09:00'));await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(40);assert.equal(await text(),'19:03');assert.equal(await clock.getAttribute('aria-pressed'),'true');
  });
  await test('real browser local time without mock',async()=>{const p=await context.newPage();await p.goto(target);assert.equal(await p.locator('#header-clock').textContent(),await p.evaluate(()=>{const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}));await p.close();});
  await test('another PC timezone uses local hours',async()=>{const c=await browser.newContext({viewport:{width:1024,height:800},timezoneId:'America/New_York'});const p=await c.newPage();await p.clock.install({time:new Date('2026-11-11T00:05:00Z')});await p.goto(target);assert.equal(await p.locator('#header-clock').textContent(),'19:05');await c.close();});
  await test('no browser errors',async()=>assert.deepEqual(errors,[]));
  const report={environment:{node:process.version,browser:await browser.version(),timezone:'Asia/Tokyo + America/New_York',target,baseline},total:rows.length,passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length,rows};
  fs.writeFileSync(path.join(evidence,'header-clock.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));await browser.close();process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
