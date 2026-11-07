// Independent product integration tests. No test hooks are installed by index.html.
const FunctionAssistTests = (() => {
  const textbook = '#include <stdio.h>\nint kasan(int a, int b);\n\nint main(void){\n    int s;\n    s = kasan(2, 5);\n    printf("s = %d\\n", s);\n    return 0;\n}\n\nint kasan(int a, int b){\n    int wa;\n    wa = a + b;\n    return wa;\n}';
  const normal = 'int main(void){\nint x=1;\nprintf("%d",x);\nreturn 0;\n}';
  const wait = async predicate => {
    for(let n=0;n<300;n++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}
    throw Error('product transition timeout');
  };
  async function run(createProduct){
    const rows=[];
    const record=async(name,fn)=>{try{await fn();if(w && '__actualCoreCalls' in w)eq(w.__actualCoreCalls,w.__assistCounts.confirmed);rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:String(e.stack||e)});}};
    const assert=(value,message='assertion failed')=>{if(!value)throw Error(message);};
    const eq=(a,b)=>assert(JSON.stringify(a)===JSON.stringify(b),JSON.stringify({actual:a,expected:b}));
    let w;
    const start=async code=>{
      w=await createProduct();
      w.eval(`window.__assistCounts={normal:0,confirmed:0};
        const originalVisualizeForTest=visualizeCode;
        visualizeCode=function(){window.__assistCounts.normal++;return originalVisualizeForTest();};
        const originalConfirmedForTest=executeConfirmedFunctionAssist;
        executeConfirmedFunctionAssist=function(...args){window.__assistCounts.confirmed++;return originalConfirmedForTest(...args);};`);
      w.eval('historyEntries=[];');
      if(code!==undefined)w.eval(`editor.setValue(${JSON.stringify(code)});`);
      return w;
    };
    const run=()=>w.document.getElementById('visualize').click();
    const yes=()=>w.document.querySelector('.function-assist-accept');
    const cancel=()=>w.document.querySelector('.function-assist-cancel');
    const history=()=>w.eval('historyEntries');
    const idle=()=>!w.document.querySelector('.result-state')&&!yes()&&w.eval('currentSteps.length')===0;
    const accept=async()=>{yes().click();await wait(()=>!!w.document.querySelector('.result-state')||!!w.document.querySelector('.failure-state'));};
    await record('初期化・INPUT以外の操作は関数を実行しない',async()=>{await start();eq(w.__assistCounts,{normal:0,confirmed:0});assert(!yes());});
    await record('P3 NORMALは確認なしで既存実行',async()=>{await start(normal);run();await wait(()=>!!w.document.querySelector('.result-state'));eq(w.__assistCounts,{normal:1,confirmed:0});eq(history()[0].output,'1');});
    await record('確認文言・旧RESULT/STEP/OUTPUT消去・実行ゼロ・履歴ゼロ',async()=>{
      await start(textbook);w.eval('currentSteps=[{lineNo:1}];finalState={output:"old"};waitingCode="old";');run();
      assert(yes()&&cancel());eq(w.document.querySelector('.function-assist-confirm h3').textContent,'サブ関数を検出しました');
      eq(yes().textContent,'可視化する →');eq(cancel().textContent,'キャンセル');eq(w.__assistCounts,{normal:0,confirmed:0});eq(history().length,0);
      assert(w.eval('finalState===null && waitingCode===null && currentSteps.length===0 && jumpableLines.size===0'));
      assert(w.document.getElementById('step-controls').hidden);assert(!w.eval('pendingRunSuccess || pendingInputInjection || resultReveal'));
    });
    await record('キャンセルは中立・実行ゼロ・履歴ゼロ・RUNへフォーカス',async()=>{await start(textbook);run();cancel().click();assert(idle());eq(w.__assistCounts,{normal:0,confirmed:0});eq(history().length,0);assert(w.document.getElementById('flow-content').textContent.includes('実行をキャンセルしました'));eq(w.document.activeElement.id,'visualize');});
    await record('YESは一回・06(1)の出力/最終main/9STEP・NORMAL契約保持・履歴v1',async()=>{
      await start(textbook);w.cVisualizerLiteResult={sentinel:'normal'};run();const button=yes();button.click();button.dispatchEvent(new w.MouseEvent('click'));await wait(()=>!!w.document.querySelector('.result-state'));
      eq(w.__assistCounts,{normal:0,confirmed:1});eq(w.eval('functionAssistResult.output'),'s = 7\n');eq(w.eval('currentSteps.length'),9);
      eq(w.eval('finalState.variables'),[['s','7']]);eq(w.cVisualizerLiteResult,{sentinel:'normal'});eq(history().length,1);eq(history()[0].variables,[['s','7']]);
      eq(Object.keys(history()[0]).sort(),['id','timestamp','locked','code','kind','output','variables','warnings'].sort());
      assert(!JSON.stringify(history()).includes('scopesAtStep'));assert(!JSON.stringify(history()).includes('approval'));
    });
    await record('全9STEPの前後・スライダー・出力snapshot・関数名/呼出通番',async()=>{
      await start(textbook);run();await accept();const before=w.eval('JSON.stringify(currentSteps)');w.document.querySelector('.result-flow-button').click();
      for(let i=0;i<9;i++){
        w.eval(`$('step-slider').value='${i+1}';$('step-slider').dispatchEvent(new Event('input',{bubbles:true}));`);
        eq(w.eval('activeStep'),i);eq(w.document.querySelector('.function-assist-step').dataset.event,w.eval(`currentSteps[${i}].functionEvent`));
        eq(w.document.getElementById('output-value').textContent,w.eval(`currentSteps[${i}].outputAtStep`)||'—');
        assert(w.document.querySelector('.function-assist-step small').textContent.includes(w.eval(`currentSteps[${i}].functionName`)));
      }
      w.document.getElementById('step-prev').click();eq(w.eval('activeStep'),7);w.document.getElementById('step-next').click();eq(w.eval('activeStep'),8);w.document.getElementById('step-next').click();assert(w.document.querySelector('.result-state'));
      eq(w.eval('JSON.stringify(currentSteps)'),before);
    });
    await record('元行ジャンプは同じ行の先頭STEP',async()=>{await start(textbook);run();await accept();w.eval("editor.triggerOnKeyDown");w.eval("CodeMirror.signal(editor,'gutterClick',editor,5,'CodeMirror-linenumbers',new MouseEvent('click'));");eq(w.eval('activeStep'),1);});
    await record('main.aと関数aの箱・差分キーを分離',async()=>{
      await start(textbook.replace('int s;','int a=99;\n    int s;'));run();await accept();w.eval('activeStep=3;renderStep();');
      const keys=[...w.document.querySelectorAll('[data-variable-key]')].map(e=>e.dataset.variableKey);assert(keys.includes('main:a'));assert(keys.includes('kasan#1:a'));
      eq(w.document.querySelector('[data-variable-key="main:a"] .scalar-variable-value').textContent,'99');
      eq(w.document.querySelector('[data-variable-key="kasan#1:a"] .scalar-variable-value').textContent,'2');
    });
    await record('同じ関数2回のscope・過去snapshot不変',async()=>{
      await start(textbook.replace('printf("s = %d\\n", s);','s = kasan(s, 1);\n    printf("s = %d\\n", s);'));run();await accept();eq(w.eval('functionAssistResult.output'),'s = 8\n');
      const ids=w.eval('[...new Set(currentSteps.flatMap(s=>s.scopesAtStep.map(f=>f.scopeId)))]');eq(ids,['main','kasan#1','kasan#2']);
      const copy=w.eval('JSON.stringify(currentSteps[2])');w.eval('activeStep=currentSteps.length-2;renderStep();activeStep=2;renderStep();');eq(w.eval('JSON.stringify(currentSteps[2])'),copy);
    });
    await record('サブ関数return 0の後もmain継続',async()=>{await start(textbook.replace('return wa;','return 0;'));run();await accept();eq(w.eval('functionAssistResult.output'),'s = 0\n');eq(w.eval('currentSteps.at(-1).functionName'),'main');});
    for(const operation of ['edit','edit-back','input','sample','reset','rerun','dispose','history']){
      await record(`古い承認失効：${operation}`,async()=>{
        await start(textbook);run();const old=yes(),oldCancel=cancel();
        if(operation==='edit'||operation==='edit-back'){w.eval('editor.setValue(editor.getValue()+"\\n");');if(operation==='edit-back')w.eval(`editor.setValue(${JSON.stringify(textbook)});`);}
        if(operation==='input')w.eval("scanfInput.value='2';scanfInput.dispatchEvent(new Event('input',{bubbles:true}));");
        if(operation==='sample')w.eval("$('sample-select').dispatchEvent(new Event('change',{bubbles:true}));");
        if(operation==='reset')w.eval('resetCode();');
        if(operation==='rerun')run();
        if(operation==='dispose')w.document.getElementById('flow-content').replaceChildren();
        if(operation==='history')w.eval(`editor.setValue(${JSON.stringify(normal)});invalidateResult();`);
        old.dispatchEvent(new w.MouseEvent('click'));oldCancel.dispatchEvent(new w.MouseEvent('click'));eq(w.__assistCounts,{normal:0,confirmed:0});eq(history().length,0);
        if(operation==='rerun'){assert(yes());yes().click();await wait(()=>!!w.document.querySelector('.result-state'));eq(w.__assistCounts.confirmed,1);}
      });
    }
    await record('YES後の旧演出callbackは編集戻しで確定・履歴保存しない',async()=>{
      await start(textbook);run();yes().click();const callback=w.eval('pendingRunSuccess.onComplete');
      w.eval('editor.setValue(editor.getValue()+"\\n");');w.eval(`editor.setValue(${JSON.stringify(textbook)});`);callback();eq(history().length,0);assert(idle());
    });
    await record('同一コードの再RUNでも旧演出callbackは無効',async()=>{await start(textbook);run();yes().click();const callback=w.eval('pendingRunSuccess.onComplete');run();callback();assert(yes());eq(history().length,0);eq(w.__assistCounts.confirmed,1);});
    await record('実際の履歴復元ボタンは旧承認を破棄・自動RUNなし・再確認',async()=>{
      await start(textbook);run();await accept();run();const old=yes();
      w.eval('selectedHistoryId=historyEntries[0].id;renderHistory();historyDialog.showModal();');
      w.document.querySelector('.history-restore').click();old.dispatchEvent(new w.MouseEvent('click'));
      assert(!yes());eq(w.__assistCounts,{normal:0,confirmed:1});eq(history().length,1);run();assert(yes());
    });
    await record('FUNCTION候補INPUTは確認・実行なし',async()=>{await start(textbook);w.eval("executeCode('input');");assert(!yes());eq(w.__assistCounts,{normal:0,confirmed:0});eq(history().length,0);assert(w.document.querySelector('.function-assist-diagnostic'));});
    await record('確認中INPUTは承認を破棄・実行なし',async()=>{await start(textbook);run();const old=yes();w.eval("executeCode('input');");old.dispatchEvent(new w.MouseEvent('click'));eq(w.__assistCounts,{normal:0,confirmed:0});eq(history().length,0);assert(!yes());});
    await record('宣言のみの確度・未使用の対応可能定義も確認',async()=>{await start('int kasan(int a,int b);\n'+normal);run();eq(w.document.querySelector('h3').textContent,'サブ関数の宣言を検出しました');eq(w.__assistCounts.confirmed,0);await start(normal+'\nint kasan(int a,int b){return a+b;}');run();assert(yes());});
    for(const [name,code]of [
      ['未知呼出',normal.replace('int x=1;','int x=1;\nx=foo(1,2);')],
      ['呼出されるvoid',normal.replace('int x=1;','int x=1;\nfoo();')+'\nvoid foo(void){return;}'],
      ['不完全署名',textbook.replace('int kasan(int a, int b){','int kasan(int a, ){')],
      ['引数個数不一致',textbook.replace('kasan(2, 5)','kasan(2)')],
      ['再帰',textbook.replace('wa = a + b;','wa = kasan(a,b);')]
    ])await record(`事前安全停止・実行/履歴ゼロ：${name}`,async()=>{await start(code);run();assert(!yes());eq(w.__assistCounts,{normal:0,confirmed:0});eq(history().length,0);assert(w.document.querySelector('.function-assist-diagnostic'));assert(w.eval('errorLines.size>0'));});
    for(const [name,code]of [
      ['未初期化',textbook.replace('wa = a + b;','')],
      ['0除算',textbook.replace('wa = a + b;','wa = a / (b-b);')],
      ['実行上限',textbook.replace('wa = a + b;','wa = '+'1+'.repeat(300)+'1;')]
    ])await record(`YES後は診断・NORMAL再試行なし：${name}`,async()=>{
      await start(code);run();assert(yes(),'must offer confirmation');yes().click();assert(!w.document.querySelector('.result-state'));eq(w.__assistCounts,{normal:0,confirmed:1});
      eq(history().length,1);eq(history()[0].kind,'check');assert(w.eval('errorLines.size>0'));assert(!w.eval('pendingRunSuccess'));assert(w.document.getElementById('flow-content').textContent.includes('行目'));
    });
    await record('失敗の原因行と呼出元・赤強調一致',async()=>{await start(textbook.replace('wa = a + b;','wa = a / (b-b);'));run();yes().click();assert(w.document.getElementById('flow-content').textContent.includes('呼出元：6行目'));assert(w.eval('errorLines.has(12)'));});
    await record('Stage5: 対応if/else returnは成功',async()=>{
      await start(textbook.replace('return wa;','if(a>b){return a;}else{return b;}'));run();await accept();
      eq(w.eval('finalState.output'),'s = 5\n');eq(history()[0].kind,'result');
      assert(w.eval('currentSteps.some(s=>s.functionEvent==="branch-decision")'));
    });
    await record('Stage5: main scanfはYES後待機・INPUTで完了',async()=>{
      await start(textbook.replace('int s;','int s;\n    scanf("%d", &s);'));run();yes().click();
      eq(w.eval('functionAssistAttempt.status'),'WAITING_FUNCTION');eq(history().length,0);
      w.eval("scanfInput.value='9';scanfInput.dispatchEvent(new Event('input'));executeCode('input');");
      await wait(()=>!!w.document.querySelector('.result-flow-button'));eq(w.eval('finalState.output'),'s = 7\n');eq(history().length,1);
    });
    await record('Stage5: 教材06(2)は0/1/2入力・同一承認RUNで完了',async()=>{
      await start(FunctionInputStage5Tests.examples.textbook);run();yes().click();
      const id=w.eval('functionAssistAttempt.runId');eq(w.eval('functionAssistAttempt.status'),'WAITING_FUNCTION');eq(history().length,0);
      for(const input of ['2','2\n5']){
        w.eval(`scanfInput.value=${JSON.stringify(input)};scanfInput.dispatchEvent(new Event('input'));executeCode('input');`);
        await wait(()=>!w.eval('pendingInputInjection'));eq(w.eval('functionAssistAttempt.runId'),id);
        if(input==='2'){eq(w.eval('functionAssistAttempt.status'),'WAITING_FUNCTION');eq(history().length,0);}
      }
      eq(w.eval('finalState.variables'),[['a','2'],['b','5'],['sa','3']]);eq(history().length,1);
      eq(w.eval('finalState.output'),FunctionInputStage5Tests.prefix+'入力された整数の差 = 3\n');
    });
    await record('コード表示はtextContent・HTMLを実行しない',async()=>{await start(textbook.replace('s = %d','<img src=x onerror=alert(1)>%d'));run();await accept();assert(!w.document.getElementById('flow-content').querySelector('img'));assert(w.eval('finalState.output').includes('<img'));});
    await record('NORMAL複数scanf RUN→WAITING→INPUTを維持',async()=>{
      await start('int main(void){\nint a,b;\nscanf("%d",&a);\nscanf("%d",&b);\nprintf("%d %d",a,b);\nreturn 0;\n}');run();assert(w.eval('waitingCode!==null'));eq(history().length,0);
      w.eval("scanfInput.value='2';scanfInput.dispatchEvent(new Event('input'));executeCode('input');");await wait(()=>w.eval('waitingCode!==null'));
      w.eval("scanfInput.value='2\\n5';scanfInput.dispatchEvent(new Event('input'));executeCode('input');");await wait(()=>!!w.document.querySelector('.result-state'));eq(history()[0].output,'2 5');eq(w.__assistCounts.confirmed,0);
    });
    const inputProgram = FunctionInputStage5Tests.examples.textbook;
    const changeInput = input => w.eval(`scanfInput.value=${JSON.stringify(input)};scanfInput.dispatchEvent(new Event('input',{bubbles:true}));`);
    const waitInput = () => wait(()=>w.eval('functionAssistAttempt?.status==="WAITING_FUNCTION" && !pendingInputInjection'));
    const startWaiting = async () => {
      await start(inputProgram);
      w.eval(`window.__inputFeedback={success:0,injection:0,reveal:0};
        const oldSuccessForInput=playRunSuccessFeedback,oldInjectionForInput=playInputInjection,oldRevealForInput=revealResult;
        playRunSuccessFeedback=function(...a){window.__inputFeedback.success++;return oldSuccessForInput(...a);};
        playInputInjection=function(...a){window.__inputFeedback.injection++;return oldInjectionForInput(...a);};
        revealResult=function(...a){window.__inputFeedback.reveal++;return oldRevealForInput(...a);};`);
      run();yes().click();await waitInput();
    };
    await record('Stage5: 初回待機は成功/Reveal/履歴ゼロ・scanfへフォーカス',async()=>{
      await startWaiting();eq(w.__inputFeedback,{success:0,injection:0,reveal:0});eq(history().length,0);
      eq(w.document.activeElement.id,'scanfInput');eq(w.eval('functionAssistAttempt.lastWaiting.inputRequest.ordinal'),1);
      assert(!w.document.querySelector('.result-flow-button'));assert(w.document.querySelector('.waiting-state').textContent.includes('a'));
      eq(w.document.querySelector('.result-value').textContent,'整数を２つ入力\n１つ目');
    });
    for(const [input,expected]of [['2\n5','3'],['5\n2','3'],['5\n5','0'],['-2\n5','7']])await record('Stage5: 製品段階入力 '+JSON.stringify(input),async()=>{
      await startWaiting();const id=w.eval('functionAssistAttempt.runId');const [first]=input.split('\n');
      changeInput(first);eq(w.__assistCounts.confirmed,1);w.document.getElementById('input-submit').click();await waitInput();
      eq(history().length,0);eq(w.eval('functionAssistAttempt.lastWaiting.inputRequest.ordinal'),2);eq(w.__inputFeedback.success,0);eq(w.__inputFeedback.reveal,0);
      changeInput(input);w.document.getElementById('input-submit').click();await wait(()=>!!w.document.querySelector('.result-flow-button'));
      eq(w.eval('functionAssistAttempt.runId'),id);eq(w.eval('functionAssistAttempt.approved'),true);eq(w.eval('functionAssistAttempt.status'),'RESULT_REUSABLE');
      assert(w.eval('canContinueFunctionInput(functionAssistAttempt)'));eq(history().length,1);
      eq(history()[0].output,FunctionInputStage5Tests.prefix+'入力された整数の差 = '+expected+'\n');
      eq(history()[0].variables,[['a',input.split('\n')[0]],['b',input.split('\n')[1]],['sa',expected]]);
      eq(w.__inputFeedback,{success:0,injection:2,reveal:1});eq(w.__assistCounts.normal,0);
      eq(history()[0].output.split('入力された整数の差 = ').length-1,1);
      // Reuse must actually recompute, and editing must invalidate the old approval.
      changeInput('8\n3');w.document.getElementById('input-submit').click();
      await wait(()=>!!w.document.querySelector('.result-flow-button') && !w.eval('pendingInputInjection'));
      eq(w.eval('functionAssistAttempt.runId'),id);eq(w.eval('functionAssistAttempt.status'),'RESULT_REUSABLE');
      eq(w.eval('finalState.variables'),[['a','8'],['b','3'],['sa','5']]);eq(history().length,2);
      eq(history()[0].output,FunctionInputStage5Tests.prefix+'入力された整数の差 = 5\n');
      const old=w.eval('functionAssistAttempt'),count=w.__assistCounts.confirmed;
      w.eval('editor.setValue(editor.getValue()+" ");');assert(old.cancelled);
      assert(w.eval('functionAssistAttempt===null'));
      assert(!w.eval('canContinueFunctionInput(functionAssistAttempt)'));w.eval("executeCode('input');");
      eq(w.__assistCounts.confirmed,count);eq(history().length,2);
    });
    await record('Stage5: 入力上書きは全文再解析・古いsnapshot不変',async()=>{
      await startWaiting();changeInput('2');w.eval("executeCode('input');");await waitInput();const snapshot=w.eval('functionAssistAttempt.lastWaiting'),before=JSON.stringify(snapshot);
      changeInput('5');eq(w.__assistCounts.confirmed,2);w.eval("executeCode('input');");await waitInput();eq(w.eval('functionAssistAttempt.lastWaiting.variables[0].value'),5);
      changeInput('5\n2');w.eval("executeCode('input');");await wait(()=>!!w.document.querySelector('.result-flow-button'));eq(w.eval('finalState.variables'),[['a','5'],['b','2'],['sa','3']]);eq(JSON.stringify(snapshot),before);eq(history().length,1);
    });
    await record('Stage5: 同じINPUT連打は二重解析/確定/履歴なし',async()=>{
      await startWaiting();changeInput('2\n5');w.eval("executeCode('input');");const count=w.__assistCounts.confirmed;
      for(let i=0;i<5;i++)w.eval("executeCode('input');");eq(w.__assistCounts.confirmed,count);await wait(()=>!!w.document.querySelector('.result-flow-button'));eq(history().length,1);
      eq(w.__inputFeedback.injection,1);
    });
    await record('Stage5: 外された待機キャンセルから新しい処理を取り消さない',async()=>{
      await startWaiting();const oldCancel=w.document.querySelector('.function-input-cancel');changeInput('2\n5');w.eval("executeCode('input');");
      oldCancel.dispatchEvent(new w.MouseEvent('click'));await wait(()=>!!w.document.querySelector('.result-flow-button'));eq(history().length,1);
    });
    await record('Stage5: 待機DOMを外して再挿入しても承認は復活しない',async()=>{
      await startWaiting();w.eval('const surfaceForRemovalTest=functionAssistAttempt.surface;surfaceForRemovalTest.remove();flow.append(surfaceForRemovalTest);');
      await new Promise(resolve=>setTimeout(resolve,0));assert(!w.eval('functionAssistAttempt?.approved'));
      const calls=w.__assistCounts.confirmed;changeInput('2\n5');w.eval("executeCode('input');");eq(w.__assistCounts.confirmed,calls);eq(history().length,0);
    });
    await record('Stage5: INPUT中の入力変更は旧callbackを失効・明示INPUT必須',async()=>{
      await startWaiting();changeInput('2\n5');w.eval("executeCode('input');");const old=w.eval('pendingInputInjection.onComplete');
      changeInput('2\n9');old();eq(history().length,0);eq(w.eval('functionAssistAttempt.status'),'WAITING_FUNCTION');
      eq(w.__assistCounts.confirmed,2);w.eval("executeCode('input');");await wait(()=>!!w.document.querySelector('.result-flow-button'));eq(history()[0].variables,[['a','2'],['b','9'],['sa','7']]);eq(history().length,1);
    });
    await record('Stage5: 待機演出の古いcallbackは新INPUTを上書きしない',async()=>{
      await startWaiting();changeInput('2');w.eval("executeCode('input');");const old=w.eval('pendingInputInjection.onComplete');
      changeInput('5\n2');w.eval("executeCode('input');");old();await wait(()=>!!w.document.querySelector('.result-flow-button'));eq(history().length,1);eq(w.eval('finalState.variables[0]'),['a','5']);
    });
    for(const operation of ['edit','edit-back','sample','reset','pagehide','rerun','cancel','dispose','history','import'])await record('Stage5: 待機承認失効 '+operation,async()=>{
      await startWaiting();const oldRun=w.eval('functionAssistAttempt'),calls=w.__assistCounts.confirmed;
      if(operation==='edit'||operation==='edit-back'){w.eval('editor.setValue(editor.getValue()+"\\n");');if(operation==='edit-back')w.eval(`editor.setValue(${JSON.stringify(inputProgram)});`);}
      if(operation==='sample')w.eval("$('sample-select').dispatchEvent(new Event('change',{bubbles:true}));");
      if(operation==='reset')w.eval('resetCode();');
      if(operation==='pagehide')w.dispatchEvent(new w.Event('pagehide'));
      if(operation==='rerun'){run();assert(yes());}
      if(operation==='cancel')w.document.querySelector('.function-input-cancel').click();
      if(operation==='dispose')w.document.getElementById('flow-content').replaceChildren();
      if(operation==='history'){
        w.eval(`historyEntries=[{id:'test',timestamp:new Date().toISOString(),locked:false,code:${JSON.stringify(inputProgram)},kind:'result',output:'',variables:[],warnings:[]}];selectedHistoryId='test';renderHistory();historyDialog.showModal();`);
        w.document.querySelector('.history-restore').click();
      }
      if(operation==='import'){
        const archive=w.eval(`JSON.stringify({format:HISTORY_FILE_FORMAT,version:1,exportedAt:new Date().toISOString(),entries:[{id:'imported',timestamp:new Date().toISOString(),code:editor.getValue(),kind:'result',output:'',variables:[],warnings:[]}]})`);
        const transfer=new w.DataTransfer();transfer.items.add(new w.File([archive],'history.json',{type:'application/json'}));
        w.document.getElementById('history-import-file').files=transfer.files;w.document.getElementById('history-import-file').dispatchEvent(new w.Event('change'));
        await wait(()=>w.document.getElementById('history-transfer-status').textContent.includes('読み込み完了'));
      }
      eq(w.__assistCounts.confirmed,calls);assert(!w.eval('functionAssistAttempt?.approved')||operation==='dispose');
      changeInput('2\n5');w.eval("executeCode('input');");eq(w.__assistCounts.confirmed,calls);assert(!w.eval('functionAssistAttempt?.approved'));
    });
    for(const operation of ['rerun','edit','cancel','dispose','pagehide'])await record('Stage5: INPUT完了前の失効 '+operation,async()=>{
      await startWaiting();changeInput('2\n5');w.eval("executeCode('input');");const old=w.eval('pendingInputInjection.onComplete');
      if(operation==='rerun')run();
      if(operation==='edit')w.eval('editor.setValue(editor.getValue()+"\\n");');
      if(operation==='cancel')w.eval("discardFunctionAssist();clearFunctionAssistDisplay();showIdle('実行をキャンセルしました','');");
      if(operation==='dispose')w.document.getElementById('flow-content').replaceChildren();
      if(operation==='pagehide')w.dispatchEvent(new w.Event('pagehide'));
      old();eq(history().length,0);assert(!w.document.querySelector('.result-flow-button'));
    });
    for(const input of ['oops','2 5','2\n1.2','9007199254740992'])await record('Stage5: 不正INPUTは失敗・承認破棄 '+input,async()=>{
      await startWaiting();changeInput(input);w.eval("executeCode('input');");assert(w.document.querySelector('.failure-state'));eq(history().length,1);eq(history()[0].kind,'check');eq(w.eval('functionAssistAttempt.approved'),false);
      const calls=w.__assistCounts.confirmed;changeInput('2\n5');w.eval("executeCode('input');");eq(w.__assistCounts.confirmed,calls);eq(history().length,1);eq(w.__assistCounts.normal,0);
    });
    await record('Stage5: 完了後INPUTに承認は残らない',async()=>{
      await startWaiting();changeInput('2\n5');w.eval("executeCode('input');");await wait(()=>!!w.document.querySelector('.result-flow-button'));const calls=w.__assistCounts.confirmed;
      w.eval("executeCode('input');");eq(w.__assistCounts.confirmed,calls);eq(history().length,1);assert(!yes());
    });
    await record('Stage5: NORMALの成功演出中のImportは旧callbackを変更しない',async()=>{
      await start(normal);run();
      const transfer=new w.DataTransfer();transfer.items.add(new w.File(['{'],'invalid.json',{type:'application/json'}));
      const file=w.document.getElementById('history-import-file');file.files=transfer.files;file.dispatchEvent(new w.Event('change'));
      await wait(()=>!!w.document.querySelector('.result-flow-button'));eq(history().length,1);eq(history()[0].output,'1');eq(w.__assistCounts.normal,1);eq(w.__assistCounts.confirmed,0);
    });
    await record('Stage5: 全STEPの日本語・選択return・scope/出力/行ジャンプ',async()=>{
      await startWaiting();changeInput('5\n2');w.eval("executeCode('input');");await wait(()=>!!w.document.querySelector('.result-flow-button'));
      const before=w.eval('JSON.stringify(currentSteps)'),steps=w.eval('currentSteps');w.document.querySelector('.result-flow-button').click();
      for(let i=0;i<steps.length;i++){
        w.eval(`$('step-slider').value='${i+1}';$('step-slider').dispatchEvent(new Event('input'));`);
        const explanation=w.document.querySelector('.function-assist-step p').textContent;
        assert(explanation&&!['scanf','branch-decision','input-wait'].includes(explanation));eq(w.eval('highlightedLine'),steps[i].lineNo-1);
        if(steps[i].functionEvent==='branch-decision'){assert(explanation.includes('偽')&&explanation.includes('else側'));assert(w.document.querySelector('.function-assist-step').textContent.includes('比較する値：5 < 2'));}
      }
      eq(steps.filter(s=>s.functionEvent==='return').map(s=>s.lineNo),[20]);eq(w.eval('JSON.stringify(currentSteps)'),before);
      w.eval("CodeMirror.signal(editor,'gutterClick',editor,16,'CodeMirror-linenumbers',new MouseEvent('click'));");eq(w.eval('currentSteps[activeStep].functionEvent'),'branch-decision');
    });

    return {total:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,rows};
  }
  return {run,examples:{textbook,normal}};
})();
if(typeof module==='object'&&module.exports)module.exports=FunctionAssistTests;

