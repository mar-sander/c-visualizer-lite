/* L-QA1: observable persistence/export/import contracts; no production test hooks. */
'use strict';
(async () => {
  const rows = [], frame = document.getElementById('product');
  const storageKey = 'c-visualizer-lite-history-v1', saved = localStorage.getItem(storageKey);
  const target = new URLSearchParams(location.search).get('target') || 'index.html';
  let w;
  const assert = (value, message = '期待結果と一致しません') => { if(!value) throw Error(message); };
  const canonical = value => Array.isArray(value) ? Array.from(value,canonical) :
    value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
  const equal = (a, b) => assert(JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)), '保存内容または状態が変わりました');
  const record = async (name, fn) => {
    try { await fn(); rows.push({name, pass:true}); }
    catch(error) { rows.push({name, pass:false, error:String(error.stack || error)}); }
  };
  const load = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('製品読み込みtimeout')), 10000);
    frame.onload = () => { clearTimeout(timer); resolve(frame.contentWindow); };
    frame.src = target + (target.includes('?') ? '&' : '?') + 'history-test=' + Date.now();
  });
  const state = () => w.eval('JSON.stringify({entries:historyEntries,stored:localStorage.getItem(HISTORY_KEY),result:finalState})');
  const seed = () => w.eval(`historyEntries=[];localStorage.removeItem(HISTORY_KEY);
    saveHistory('protected', 'result', {output:'keep',variables:[['old','7']]});
    historyEntries[0].locked=true;persistHistory();`);
  const sample = (array, output = '') => ({output, variables:[['x','7']], ...(array ? {
    arrays:[{name:'a',type:'int',length:2,values:[0,7],initialized:[true,true]}]
  } : {})});
  async function saveCase(name, {array=false, kind='result', code='code', result=sample(array), warnings=[], accepted}) {
    await record(name, async () => {
      seed(); const before = state(), protectedEntry = JSON.stringify(w.eval('historyEntries[0]'));
      const ok = w.saveHistory(code, kind, result, warnings);
      assert(ok === accepted, '保存可否が契約と異なります');
      if(accepted) {
        const entries = w.eval('historyEntries');
        equal(w.parseHistoryImport(JSON.stringify({version:1,entries})), entries);
        assert(JSON.stringify(entries[1]) === protectedEntry, '保護履歴を上書きしました');
        equal(w.loadHistory(), entries);
      } else {
        equal(state(), before);
        assert(w.document.getElementById('feedback').textContent.includes('保存できません'));
      }
    });
  }
  async function exportArchive() {
    let blob = null, clicks = 0;
    const create = w.URL.createObjectURL, click = w.HTMLAnchorElement.prototype.click;
    try {
      w.URL.createObjectURL = function(value) { blob = value; return create.call(this, value); };
      w.HTMLAnchorElement.prototype.click = function() { if(this.download) clicks++; else click.call(this); };
      w.renderHistory(); w.document.getElementById('history-export').click();
    } finally { w.URL.createObjectURL = create; w.HTMLAnchorElement.prototype.click = click; }
    return {clicks, text:blob ? await blob.text() : null};
  }
  try {
    w = await load();
    for(const array of [false,true]) for(const kind of ['result','check']) {
      for(const length of [59999,60000,60001]) await saveCase(
        `${array?'配列混在':'scalarのみ'} ${kind} output=${length}`,
        {array,kind,result:sample(array,'x'.repeat(length)),accepted:length<=60000});
    }
    for(const length of [59999,60000,60001]) await saveCase('code文字数='+length,
      {code:'x'.repeat(length),accepted:length<=60000});
    for(const kind of ['result','check']) for(const count of [200,201]) await saveCase(`${kind} variables=${count}`,
      {kind,result:{output:'',variables:Array.from({length:count},(_,i)=>['x'+i,'7'])},accepted:count<=200});
    for(const count of [100,101]) await saveCase('warnings='+count,
      {kind:'check',warnings:Array(count).fill('warning'),accepted:count<=100});
    for(const length of [10000,10001]) {
      await saveCase('変数文字列長='+length,{result:{output:'',variables:[['x','7'.repeat(length)]]},accepted:length<=10000});
      await saveCase('警告文字列長='+length,{kind:'check',warnings:['w'.repeat(length)],accepted:length<=10000});
    }
    await record('60200文字の実RUN：結果を保持し履歴だけ拒否', async () => {
      seed(); const before = w.eval('JSON.stringify(historyEntries)'), stored = w.localStorage.getItem(storageKey);
      const code = 'int main(void){\nint i;\nfor(i=0;i<301;i++){\nprintf("'+'x'.repeat(200)+'");\n}\nreturn 0;\n}';
      w.eval(`editor.setValue(${JSON.stringify(code)});scanfInput.value='';executeCode('input');`);
      assert(!w.cVisualizerLiteResult.hasWarnings && w.cVisualizerLiteResult.output.length === 60200);
      assert(w.document.querySelector('.result-state'), '実行結果が消えました');
      equal(w.eval('JSON.stringify(historyEntries)'),before); equal(w.localStorage.getItem(storageKey),stored);
      assert(w.document.getElementById('feedback').textContent.includes('保存できません'));
    });
    await record('正常履歴のexport→import・値とlockを保持', async () => {
      seed(); w.saveHistory('new','result',sample(true,'OK'));
      const before = JSON.parse(JSON.stringify(w.eval('historyEntries'))), archive = await exportArchive();
      assert(archive.clicks === 1 && archive.text);
      equal(w.parseHistoryImport(archive.text),before);
    });
    await record('export不適合entryを拒否・旧データを保持', async () => {
      seed(); w.eval(`historyEntries[0].output='x'.repeat(60001);persistHistory();`);
      const before = state(), archive = await exportArchive();
      assert(archive.clicks === 0 && archive.text === null, '読み込み不能なファイルを書き出しました');
      equal(state(),before);
      assert(w.document.getElementById('history-transfer-status').dataset.state === 'error');
    });
    await record('旧上限超過entryは再読み込みでも削除しない', async () => {
      seed(); w.eval(`historyEntries[0].output='x'.repeat(60001);persistHistory();`);
      const before = w.localStorage.getItem(storageKey); w = await load();
      assert(w.eval('historyEntries[0].output.length') === 60001 && w.eval('historyEntries[0].locked'));
      const archive = await exportArchive(); assert(archive.clicks === 0);
      equal(w.localStorage.getItem(storageKey),before);
    });
    for(const id of ['', 'x'.repeat(201)]) await record('旧不適合IDの同一履歴を更新しない（長さ'+id.length+'）', async () => {
      seed(); w.eval(`historyEntries[0].id=${JSON.stringify(id)};historyEntries[0].locked=false;persistHistory()`);
      const before=state();
      assert(!w.saveHistory('protected','result',{output:'keep',variables:[['old','7']]}));
      equal(state(),before);
    });
    await record('JSON v1鍵属性なし・重複import・保護優先', async () => {
      seed(); const entry = JSON.parse(JSON.stringify(w.eval('historyEntries[0]'))); delete entry.locked;
      const imported = w.parseHistoryImport(JSON.stringify({version:1,entries:[entry]}));
      assert(imported[0].locked === false);
      const merged = w.mergeHistoryImport(imported); assert(merged.added === 0 && merged.kept[0].locked);
    });
    await record('同一RUNの通常履歴は重複せず、保護済みは上書きしない', async () => {
      seed(); w.saveHistory('same','result',sample(false,'OK')); const count=w.eval('historyEntries.length');
      w.saveHistory('same','result',sample(false,'OK')); assert(w.eval('historyEntries.length')===count);
      w.eval('historyEntries[0].locked=true;persistHistory()'); const protectedEntry=w.eval('JSON.stringify(historyEntries[0])');
      w.saveHistory('same','result',sample(false,'OK'));
      assert(w.eval('historyEntries.length')===count+1); equal(w.eval('JSON.stringify(historyEntries[1])'),protectedEntry);
    });
    await record('通常50件＋保護別枠を維持', async () => {
      seed(); for(let i=0;i<52;i++) assert(w.saveHistory('code'+i,'result',sample(false,String(i))));
      const entries=w.eval('historyEntries'); assert(entries.filter(e=>!e.locked).length===50 && entries.filter(e=>e.locked).length===1);
    });
    await record('容量例外で保護履歴・既存保存内容を維持', async () => {
      seed(); const before=state(), setItem=w.Storage.prototype.setItem;
      try { w.Storage.prototype.setItem=function(){throw new w.DOMException('full','QuotaExceededError');};
        assert(!w.saveHistory('new','result',sample(false,'new'))); equal(state(),before);
      } finally { w.Storage.prototype.setItem=setItem; }
    });
    await record('壊れたJSONから復帰後も正常履歴を往復できる', async () => {
      w.localStorage.setItem(storageKey,'{broken'); w=await load(); assert(w.eval('historyEntries.length')===0);
      assert(w.saveHistory('recovered','result',sample(false,'OK')));
      const archive=await exportArchive(); assert(w.parseHistoryImport(archive.text).length===1);
    });
  } catch(error) { rows.push({name:'検証の準備・継続',pass:false,error:String(error.stack||error)}); }
  finally { if(saved===null)localStorage.removeItem(storageKey);else localStorage.setItem(storageKey,saved); }
  const report={total:rows.length,passed:rows.filter(row=>row.pass).length,failed:rows.filter(row=>!row.pass).length,rows};
  window.historyContractResults=report;
  document.getElementById('report').textContent=`${report.passed}/${report.total} PASS、${report.failed} FAIL`;
  for(const row of rows){const node=document.createElement('pre');node.textContent=(row.pass?'PASS ':'FAIL ')+row.name+(row.error?'\n'+row.error:'');if(!row.pass)node.className='fail';document.getElementById('results').append(node);}
})();
