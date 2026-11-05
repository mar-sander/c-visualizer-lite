const FunctionSessionFA1Tests = (() => {
  async function run(createProduct){
    const rows=[];let w;
    const assert=(v,m='condition failed')=>{if(!v)throw Error(m);};
    const eq=(a,b)=>assert(JSON.stringify(a)===JSON.stringify(b),JSON.stringify({actual:a,expected:b}));
    const wait=async fn=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('transition timeout');};
    const record=async(name,fn)=>{try{await fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:String(e.stack||e)});}};
    const textbook=FunctionInputStage5Tests.examples.textbook;
    const input=value=>w.eval(`scanfInput.value=${JSON.stringify(value)};scanfInput.dispatchEvent(new Event('input',{bubbles:true}));`);
    const hist=()=>w.eval('historyEntries');
    const calls=()=>w.__actualCoreCalls||0;
    const start=async(code=textbook,value='2\n5')=>{
      w=await createProduct();
      w.eval(`historyEntries=[];localStorage.removeItem(HISTORY_KEY);
        window.__fa1Feedback={run:0,input:0,reveal:0,save:0,normal:0};
        const oldFa1Run=playRunSuccessFeedback,oldFa1Input=playInputInjection,oldFa1Reveal=revealResult,oldFa1Save=saveHistory,oldFa1Normal=visualizeCode;
        playRunSuccessFeedback=function(...args){window.__fa1Feedback.run++;return oldFa1Run(...args);};
        playInputInjection=function(...args){window.__fa1Feedback.input++;return oldFa1Input(...args);};
        revealResult=function(...args){window.__fa1Feedback.reveal++;return oldFa1Reveal(...args);};
        saveHistory=function(...args){window.__fa1Feedback.save++;return oldFa1Save(...args);};
        visualizeCode=function(...args){window.__fa1Feedback.normal++;return oldFa1Normal(...args);};
        editor.setValue(${JSON.stringify(code)});scanfInput.value=${JSON.stringify(value)};`);
    };
    const run=()=>w.document.getElementById('visualize').click();
    const yes=()=>w.document.querySelector('.function-assist-accept');
    const complete=()=>wait(()=>!!w.document.querySelector('.result-flow-button')&&!w.eval('pendingRunSuccess||pendingInputInjection'));
    const approved=async(code=textbook,value='2\n5')=>{await start(code,value);run();yes().click();await complete();};
    const submit=()=>w.eval("executeCode('input');");
    const resultValue=()=>w.eval('finalState.variables.find(([n])=>n==="sa")?.[1]');
    const settle=()=>new Promise(r=>setTimeout(r,0));
    await record('F01 未承認INPUTはCore0・確認の省略なし',async()=>{await start();run();eq(calls(),0);submit();eq(calls(),0);eq(hist().length,0);assert(w.document.querySelector('.function-assist-diagnostic'));assert(!w.eval('functionAssistAttempt?.approved'));});
    await record('F02 完了後5/2をINPUTのみ・偽分岐と新snapshot',async()=>{
      await approved();const id=w.eval('functionAssistAttempt.runId'),old=w.eval('functionAssistResult'),copy=JSON.stringify(old);
      input('5\n2');submit();await complete();eq(calls(),2);eq(resultValue(),'3');eq(w.eval('functionAssistAttempt.runId'),id);eq(w.eval('currentSteps.find(s=>s.functionEvent==="branch-decision").branchDecision.conditionMet'),false);eq(hist().length,2);eq(JSON.stringify(old),copy);eq(w.__fa1Feedback.run,1);eq(w.__fa1Feedback.input,1);
    });
    await record('F03 RESULT/FLOW/RESULTの閲覧は寿命を変えず5/5へ再INPUT',async()=>{
      await approved();for(let i=0;i<3;i++){w.document.querySelector('.result-flow-button').click();await settle();w.document.getElementById('step-prev').click();await settle();assert(w.eval('canContinueFunctionInput(functionAssistAttempt)'));}
      input('5\n5');submit();await complete();eq(resultValue(),'0');eq(w.eval('currentSteps.length'),15);eq(w.eval('functionAssistAttempt.status'),'RESULT_REUSABLE');
    });
    await record('F04 -2/5をINPUTのみ・main/local独立',async()=>{await approved();input('-2\n5');submit();await complete();eq(resultValue(),'7');const scopes=w.eval('currentSteps.find(s=>s.functionEvent==="arguments").scopesAtStep');eq(scopes.map(s=>s.scopeId),['main','genzan#1']);eq(scopes[0].variables.find(v=>v.name==='a').value,-2);eq(scopes[1].variables.find(v=>v.name==='a').value,-2);eq(w.eval('finalState.variables'),[['a','-2'],['b','5'],['sa','7']]);});
    await record('F05 完了→1入力待機→2入力再完了・非重複',async()=>{
      await approved();const id=w.eval('functionAssistAttempt.runId');input('5');submit();await wait(()=>w.eval('functionAssistAttempt?.status==="WAITING_FUNCTION" && !pendingInputInjection'));
      eq(w.eval('functionAssistAttempt.lastWaiting.inputRequest.ordinal'),2);eq(hist().length,1);input('5\n2');submit();await complete();eq(w.eval('functionAssistAttempt.runId'),id);eq(resultValue(),'3');eq(hist().length,2);eq(w.eval('currentSteps.length'),15);eq(hist()[0].output.split('入力された整数の差 = ').length-1,1);
    });
    await record('F06 完了→空→1個目待機・先取りなし',async()=>{await approved();input('');submit();await wait(()=>w.eval('functionAssistAttempt?.status==="WAITING_FUNCTION"'));eq(w.eval('functionAssistAttempt.lastWaiting.inputRequest.ordinal'),1);eq(w.eval('functionAssistAttempt.lastWaiting.metrics.calls'),0);eq(hist().length,1);input('-2\n5');submit();await complete();eq(resultValue(),'7');});
    await record('F07 FLOW閲覧中の入力編集のみで旧STEP/ジャンプを無効化',async()=>{
      await approved();w.document.querySelector('.result-flow-button').click();w.eval("activeStep=10;renderStep();");const count=calls();input('5\n2');eq(calls(),count);eq(hist().length,1);assert(w.eval('resultInputDirty && !hasCurrentResult() && activeStep===-1 && currentSteps.length===0 && jumpableLines.size===0'));
      assert(w.document.querySelector('.result-flow-button').disabled);assert(w.document.getElementById('step-slider').disabled);assert(w.document.getElementById('feedback').textContent.includes('INPUTで再計算'));
      w.eval("CodeMirror.signal(editor,'gutterClick',editor,16,'CodeMirror-linenumbers',new MouseEvent('click'));");eq(w.eval('activeStep'),-1);
    });
    await record('F08 同一確定INPUT連打はCore/保存/演出ゼロ',async()=>{await approved();const count=calls(),before=JSON.stringify(hist()),feedback={...w.__fa1Feedback};for(let i=0;i<5;i++)submit();eq(calls(),count);eq(JSON.stringify(hist()),before);eq(w.__fa1Feedback,feedback);assert(w.document.querySelector('.result-flow-button'));});
    await record('F08b 編集して元入力へ戻しても明示INPUTまでdirty',async()=>{await approved();input('9\n9');input('2\n5');assert(w.eval('resultInputDirty && !hasCurrentResult()'));const count=calls(),save=w.__fa1Feedback.save;submit();eq(calls(),count);eq(w.__fa1Feedback.save,save);assert(w.eval('hasCurrentResult()'));eq(w.eval('functionAssistAttempt.status'),'RESULT_REUSABLE');});
    await record('F09 INPUT中の再編集は旧callbackを無効化',async()=>{await approved();input('5\n2');submit();const old=w.eval('pendingInputInjection.onComplete');input('5\n5');old();eq(hist().length,1);assert(w.eval('resultInputDirty'));submit();await complete();eq(resultValue(),'0');eq(hist().length,2);});
    for(const action of ['run','edit-undo','sample','reset','pagehide','restore','import','surface','host'])await record('F10 再利用セッションの失効 '+action,async()=>{
      await approved();const count=calls();
      if(action==='run'){run();assert(yes());}
      if(action==='edit-undo'){w.eval('editor.setValue(editor.getValue()+"\\n");');w.eval(`editor.setValue(${JSON.stringify(textbook)});`);}
      if(action==='sample')w.eval("$('sample-select').dispatchEvent(new Event('change'));");
      if(action==='reset')w.eval('resetCode();');
      if(action==='pagehide')w.dispatchEvent(new w.Event('pagehide'));
      if(action==='restore'){w.eval('selectedHistoryId=historyEntries[0].id;renderHistory();historyDialog.showModal();');w.document.querySelector('.history-restore').click();}
      if(action==='import'){
        const transfer=new w.DataTransfer();transfer.items.add(new w.File(['{'],'invalid.json',{type:'application/json'}));const file=w.document.getElementById('history-import-file');file.files=transfer.files;file.dispatchEvent(new w.Event('change'));
      }
      if(action==='surface'){const node=w.document.getElementById('flow-content').firstElementChild;node.remove();w.document.getElementById('flow-content').append(node);}
      if(action==='host'){const node=w.document.getElementById('flow-content'),parent=node.parentNode;node.remove();parent.append(node);}
      await settle();assert(!w.eval('functionAssistAttempt?.approved'),action);input('5\n2');submit();eq(calls(),count,action);
    });
    await record('F10b 完了→待機→キャンセルは承認を破棄',async()=>{await approved();input('5');submit();await wait(()=>w.eval('functionAssistAttempt?.status==="WAITING_FUNCTION" && !pendingInputInjection'));w.document.querySelector('.function-input-cancel').click();const count=calls();input('5\n2');submit();eq(calls(),count);eq(hist().length,1);assert(!w.eval('functionAssistAttempt?.approved'));});
    for(const value of ['oops','2\n9007199254740992','1'.repeat(60001)])await record('F11 入力エラー/安全停止で失効 '+(value.length>100?'limit':value),async()=>{await approved();input(value);submit();assert(w.document.querySelector('.failure-state'));eq(w.eval('functionAssistAttempt.approved'),false);const count=calls();input('2\n5');submit();eq(calls(),count);eq(w.__fa1Feedback.normal,0);eq(hist().length,2);eq(hist()[0].kind,'check');});
    await record('F11b 新入力の関数内0除算で失効・呼出元診断',async()=>{await approved(textbook.replace('return a - b;','return a / 0;'));input('5\n2');submit();assert(w.document.querySelector('.failure-state'));assert(w.document.querySelector('.failure-state').textContent.includes('呼出元：11行目'));eq(w.eval('functionAssistAttempt.approved'),false);const count=calls();input('2\n5');submit();eq(calls(),count);});
    for(const [name,code]of [
      ['入力なしkasan',null],
      ['scanfだけでcallなし',textbook.replace('    sa = genzan(a, b);','    sa = a;')],
      ['main return後の未実行call',textbook.replace('    sa = genzan(a, b);','    sa = a;\n    return 0;\n    sa = genzan(a, b);')]
    ])await record('F12 対象外の成功 '+name,async()=>{const actual=code||'int kasan(int a,int b);\nint main(void){\nint s;\ns=kasan(2,5);\nprintf("%d",s);\nreturn 0;\n}\nint kasan(int a,int b){return a+b;}';await approved(actual);eq(w.eval('functionAssistAttempt.approved'),false);const count=calls();input('5\n2');submit();eq(calls(),count);});
    await record('F13 NORMALのscanf完了後INPUTは旧経路',async()=>{await start('int main(void){\nint a,b;\nscanf("%d",&a);\nscanf("%d",&b);\nprintf("%d %d",a,b);\nreturn 0;\n}');run();await complete();input('5\n2');submit();await complete();eq(w.eval('finalState.output'),'5 2');eq(calls(),0);eq(w.__fa1Feedback.normal,2);});
    await record('F14 ロック履歴と同一INPUTの保存0',async()=>{await approved();w.eval('historyEntries[0].locked=true;persistHistory();');const locked=JSON.stringify(hist()[0]),save=w.__fa1Feedback.save;submit();eq(w.__fa1Feedback.save,save);input('5\n5');submit();await complete();eq(hist().length,2);eq(JSON.stringify(hist()[1]),locked);const after=w.__fa1Feedback.save;submit();eq(w.__fa1Feedback.save,after);eq(hist().length,2);});
    await record('F14c 待機へ戻した後の同一確定入力でもロック記録を複製しない',async()=>{await approved();w.eval('historyEntries[0].locked=true;persistHistory();');const before=JSON.stringify(hist()),save=w.__fa1Feedback.save;input('5');submit();await wait(()=>w.eval('functionAssistAttempt?.status==="WAITING_FUNCTION" && !pendingInputInjection'));input('2\n5');submit();await complete();eq(w.__fa1Feedback.save,save);eq(JSON.stringify(hist()),before);eq(resultValue(),'3');});
    await record('F14b 50件上限とロック保持は既存規則',async()=>{
      await approved();w.eval('historyEntries[0].locked=true;persistHistory();');const locked=hist()[0].id;
      for(let i=10;i<62;i++){input(i+'\n2');submit();w.eval('const pendingForHistoryTest=pendingInputInjection;clearInputInjection();pendingForHistoryTest.onComplete();');}
      eq(hist().filter(x=>!x.locked).length,50);eq(hist().filter(x=>x.locked).length,1);assert(hist().some(x=>x.id===locked&&x.locked));
    });
    for(const action of ['run','edit-undo','pagehide','surface'])await record('F15 再INPUTの古い完了callbackを破棄 '+action,async()=>{await approved();input('5\n2');submit();const old=w.eval('pendingInputInjection.onComplete');if(action==='run')run();if(action==='edit-undo'){w.eval('editor.setValue(editor.getValue()+"\\n");');w.eval(`editor.setValue(${JSON.stringify(textbook)});`);}if(action==='pagehide')w.dispatchEvent(new w.Event('pagehide'));if(action==='surface')w.document.getElementById('flow-content').replaceChildren();old();eq(hist().length,1);assert(!w.document.querySelector('.result-flow-button'));});
    await record('F15b 初回成功のReveal中も入力編集で新解析しない',async()=>{await approved();const count=calls(),save=w.__fa1Feedback.save;input('5\n2');eq(calls(),count);eq(w.__fa1Feedback.save,save);assert(w.eval('resultInputDirty'));submit();await complete();eq(resultValue(),'3');eq(w.__fa1Feedback.save,save+1);});
    return {total:rows.length,passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length,rows};
  }
  return {run};
})();
