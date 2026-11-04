// Run against the actual product, not a mock editor. Does not claim native touch/IME coverage.
(async () => {
  const rows=[], keys=['c-visualizer-lite-unlocks-v1','c-visualizer-lite-history-v1'];
  const saved=keys.map(k=>localStorage.getItem(k));
  const record=(name,pass)=>rows.push({name,pass:!!pass});
  const pause=(ms=170)=>new Promise(r=>setTimeout(r,ms));
  const frame=document.createElement('iframe');
  frame.style.cssText='width:1200px;height:800px;border:0';document.body.append(frame);
  let ui,d,cm;
  async function load(){
    await new Promise(r=>{frame.onload=r;frame.src='index.html?mask-test='+Date.now()});
    ui=frame.contentWindow;d=ui.document;cm=d.querySelector('.CodeMirror').CodeMirror;
  }
  const state=()=>ui.eval('[...codeMasks].map(m=>({revealed:m.revealed,pos:m.mark.find()}))');
  const unlock=async code=>{
    d.getElementById('secret-code-open').click();d.getElementById('secret-code-input').value=code;
    d.getElementById('secret-code-form').dispatchEvent(new ui.Event('submit',{bubbles:true,cancelable:true}));await pause(850);
  };
  const select=async(a,b)=>{cm.setSelection(a,b);cm.getWrapperElement().dispatchEvent(new ui.KeyboardEvent('keyup',{key:'Shift',bubbles:true}));await pause()};
  const tap=async()=>{
    const span=d.querySelector('[data-code-mask]');
    span.dispatchEvent(new ui.PointerEvent('pointerdown',{pointerId:1,clientX:20,clientY:20,bubbles:true}));
    span.dispatchEvent(new ui.PointerEvent('pointerup',{pointerId:1,clientX:20,clientY:20,bubbles:true}));
  };
  try{
    keys.forEach(k=>localStorage.removeItem(k));await load();
    record('U01 未解除DOMなし',!d.getElementById('editor-mask-toggle'));
    await unlock('getsample');record('U02 SAMPLE独立',d.querySelector('option[value="add"]')&&!d.getElementById('editor-mask-toggle'));
    await unlock('getmask');const button=()=>d.getElementById('editor-mask-toggle');
    record('U03 Light直後・初期OFF',button().previousElementSibling.id==='editor-light-toggle'&&button().getAttribute('aria-pressed')==='false');
    await unlock('getmask');record('U04 重複なし',d.querySelectorAll('#editor-mask-toggle').length===1);
    const code='int a = 10;\nint b = 20;\nprintf("%d", a + b);';cm.setValue(code);cm.clearHistory();
    await select({line:0,ch:8},{line:0,ch:10});record('M01 OFFでは生成なし',state().length===0);
    button().click();await select({line:0,ch:8},{line:0,ch:10});
    record('M02 キーボード選択自動生成',state().length===1&&!state()[0].revealed);
    record('E01 本文・Undo不変',cm.getValue()===code&&cm.historySize().undo===0);
    await tap();record('M03 開示・枠残存',state()[0].revealed&&!!d.querySelector('.cm-code-mask-open'));
    await pause(380);await tap();record('M04 再マスク',!state()[0].revealed);
    await pause(380);
    await select({line:1,ch:8},{line:1,ch:10});record('M06 独立複数',state().length===2);
    await select({line:0,ch:7},{line:0,ch:10});record('M07 交差全体拒否',state().length===2);
    await select({line:0,ch:0},{line:1,ch:4});record('M09 複数行拒否',state().length===2);
    await select({line:0,ch:0},{line:0,ch:0});record('M08 空選択拒否',state().length===2);
    await tap();await tap();await pause();record('M05 ダブルタップ対象だけ削除',state().length===1);
    button().click();await select({line:2,ch:0},{line:2,ch:6});record('M10 OFF既存維持',state().length===1);
    await tap();record('M10 OFFでも開示可能',state()[0].revealed);
    cm.replaceRange('xx',{line:0,ch:0});record('E02 前方編集追従',state()[0].pos.from.line===1&&state()[0].pos.from.ch===8);
    cm.replaceRange('x',{line:1,ch:9});record('E03 内部編集だけ解除',state().length===0&&cm.getLine(1).includes('2x0'));
    cm.undo();cm.redo();record('E04 Undo/Redo編集可能',cm.getLine(1).includes('2x0'));
    cm.setValue(code);button().click();
    await select({line:0,ch:8},{line:0,ch:10});await select({line:1,ch:8},{line:1,ch:10});
    cm.replaceRange('x',{line:0,ch:9});record('E03 他マスク保持',state().length===1&&state()[0].pos.from.line===1);
    cm.setValue(code);await select({line:0,ch:8},{line:0,ch:10});
    cm.replaceRange(' ',{line:0,ch:0});record('E02 同一行前方追従',state()[0].pos.from.ch===9);
    cm.setValue(code);record('E05 全置換解除',state().length===0);
    const runCode='#include <stdio.h>\nint main(void){\nint a = 10;\nint b = 20;\nprintf("%d", a + b);\nreturn 0;\n}';
    cm.setValue(runCode);cm.clearHistory();
    d.getElementById('visualize').click();await pause(1300);
    const snap=()=>ui.eval('JSON.stringify([currentSteps,finalState,resultCode,activeStep,historyEntries])');
    let changes=0;cm.on('change',()=>changes++);
    const before=snap(),history=JSON.stringify(cm.historySize());
    await select({line:2,ch:8},{line:2,ch:10});await tap();await pause(380);await tap();
    record('E07 結果・履歴・Undo不変',snap()===before&&JSON.stringify(cm.historySize())===history&&cm.getValue()===runCode);
    record('E01 マスク操作のchangeイベントなし',changes===0);
    d.getElementById('visualize').click();await pause(1300);record('E06 RUN維持',state().length===1&&ui.cVisualizerLiteResult.output==='30');
    d.querySelector('.result-flow-button').click();d.getElementById('step-next').click();record('E06 FLOW/STEP維持',state().length===1);
    for(const size of [12,26]){
      ui.setEditorFontSize(size,false);await pause(50);cm.refresh();
      record('V02 '+size+'px 位置・寸法',ui.getComputedStyle(cm.getWrapperElement()).fontSize===size+'px'&&state().length===1&&d.querySelector('[data-code-mask]').getBoundingClientRect().width>0);
    }
    d.getElementById('editor-light-toggle').click();
    const css=ui.getComputedStyle(d.querySelector('.cm-code-mask-hidden'));
    record('V01 Lightでも不透明・文字透過',css.backgroundColor==='rgb(255, 230, 0)'&&css.color==='rgba(0, 0, 0, 0)');
    cm.setValue('#include <stdio.h>\nint main(void){\nint a;\nscanf("%d", &a);\nprintf("%d", a);\nreturn 0;\n}');
    await select({line:3,ch:0},{line:3,ch:5});
    ui.setScanfAccordionOpen(true);const input=d.getElementById('scanfInput');input.value='7';input.dispatchEvent(new ui.Event('input',{bubbles:true}));
    d.getElementById('input-submit').click();await pause(1300);
    record('E06 INPUTでもマスク維持',state().length===1&&ui.cVisualizerLiteResult.output==='7');
    const n=state().length;
    cm.getWrapperElement().dispatchEvent(new ui.CompositionEvent('compositionstart',{bubbles:true}));
    await select({line:2,ch:0},{line:2,ch:3});
    record('M08 合成中は生成なし（合成イベント模擬）',state().length===n);
    cm.getWrapperElement().dispatchEvent(new ui.CompositionEvent('compositionend',{bubbles:true}));
    cm.setCursor(2,0);await pause();record('M08 カーソルのみ生成なし',state().length===n);
    const sample=d.getElementById('sample-select');sample.value='add';sample.dispatchEvent(new ui.Event('change',{bubbles:true}));record('E05 SAMPLE全解除',state().length===0);
    await load();record('E08 再読込OFF・全解除・解除だけ保持',button().getAttribute('aria-pressed')==='false'&&state().length===0&&d.querySelector('option[value="add"]'));
    localStorage.setItem(keys[0],'{broken');await load();record('U05 破損安全',!button()&&!!cm.getValue());
  }catch(e){record('例外 '+e.stack,false)}finally{
    frame.remove();keys.forEach((k,i)=>saved[i]===null?localStorage.removeItem(k):localStorage.setItem(k,saved[i]));
  }
  window.maskTestResults={total:rows.length,pass:rows.filter(r=>r.pass).length,fail:rows.filter(r=>!r.pass).length,rows};
  document.getElementById('counts').textContent=JSON.stringify({...window.maskTestResults,rows:undefined});
  rows.forEach(r=>{const li=document.createElement('li');li.textContent=(r.pass?'PASS ':'FAIL ')+r.name;document.getElementById('results').append(li)});
})();
