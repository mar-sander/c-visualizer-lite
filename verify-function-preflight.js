/* Node標準ライブラリだけを使う検証ランナー。製品エンジンは実行・変更しません。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const api = require('./function-preflight.js');
const suite = require('./tests-function-preflight.js');
const sourcePath = path.join(__dirname, 'function-preflight.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const report = suite.run(api.inspectFunctionStructure);

function record(name, callback){
  try{ if(!callback()) throw new Error('期待結果と一致しません'); report.rows.push({name,pass:true}); }
  catch(error){ report.rows.push({name,pass:false,error:String(error.message || error)}); }
}
record('禁止された製品状態に触れないVM検証', () => {
  const sandbox = { module:{exports:{}} };
  let touched = 0;
  for(const name of ['document','window','localStorage','CodeMirror','cVisualizerLiteResult','RUN','INPUT','history']){
    Object.defineProperty(sandbox, name, { configurable:false, get(){ touched++; throw new Error('禁止参照 '+name); }, set(){ touched++; throw new Error('禁止変更 '+name); } });
  }
  vm.createContext(sandbox);
  const originalKeys = Object.keys(sandbox).join(',');
  vm.runInContext(source, sandbox, { timeout:1000 });
  const inspect = sandbox.module.exports.inspectFunctionStructure;
  const result = inspect(suite.examples.sum);
  return result.classification==='DEFINITE' && touched===0 && Object.keys(sandbox).join(',')===originalKeys;
});
record('結果を破棄しても製品sentinelは不変', () => {
  const result = { steps:[{lineNo:3}], output:'keep', variables:[['x','7']] };
  const sandbox = { module:{exports:{}}, window:{cVisualizerLiteResult:result}, localStorage:{history:'keep'}, document:{codeInput:'keep'}, CodeMirror:{editor:'keep'} };
  const before = JSON.stringify(sandbox);
  vm.createContext(sandbox); vm.runInContext(source,sandbox,{timeout:1000});
  const inspect = sandbox.module.exports.inspectFunctionStructure;
  inspect(suite.examples.difference); inspect('int main(void){');
  const after = JSON.stringify({...sandbox,module:{exports:{}}});
  return before===after && sandbox.window.cVisualizerLiteResult===result;
});
record('全ケースの再実行・位置範囲・入力不変', () => {
  for(const test of suite.cases){
    const before = test.source;
    const a = api.inspectFunctionStructure(test.source);
    const b = api.inspectFunctionStructure(test.source);
    if(before!==test.source || JSON.stringify(a)!==JSON.stringify(b)) return false;
    for(const call of a.calls){
      if(call.range.start.offset<0 || call.range.end.offset>test.source.length || call.range.start.offset>call.range.end.offset) return false;
    }
  }
  return true;
});
record('決定的な不完全入力1000件・例外や経路矛盾なし', () => {
  let seed = 0x4c465531;
  const fragments = ['int ', 'main', 'f', '(', ')', '{', '}', '[', ']', ';', ',', '=', '/*', '*/', '"', "'", '\\', '\n', 'return ', '1'];
  for(let i=0;i<1000;i++){
    let text='';
    for(let j=0;j<24;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;text+=fragments[seed%fragments.length];}
    const result=api.inspectFunctionStructure(text);
    if(result.safeToUseNormalPath&&result.canOfferFunctionConfirmation) return false;
    if(result.classification==='AMBIGUOUS'&&(result.safeToUseNormalPath||result.canOfferFunctionConfirmation)) return false;
    JSON.stringify(result);
  }
  return true;
});
record('読み込み先を限定・製品から参照されていない', () => {
  const paths=['index.html','app.js','script.js','workspace.js','tips.js','style.css','tests.html'];
  // 元製品ファイルがない場所で、空集合の検査をPASSとしないでください。
  return paths.every(name=>fs.existsSync(path.join(__dirname,name))) &&
    paths.every(name=>!fs.readFileSync(path.join(__dirname,name),'utf8').includes('function-preflight'));
});

// 時間はこのNode環境での観測値です。端末の正式上限や合否閾値には使いません。
const benchmarks = [
  ['教材06(1)', suite.examples.sum],
  ['50,000文字コメント', '/*'+'x'.repeat(50000)+'*/\nint main(void){return 0;}'],
  ['100サブ関数', 'int main(void){return 0;}'+Array.from({length:100},(_,i)=>`\nint f${i}(int a,int b){return a+b;}`).join('')]
].map(([name,text])=>{
  const times=[];
  for(let i=0;i<20;i++){const start=performance.now();api.inspectFunctionStructure(text);times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);
  return {name,sourceCharacters:text.length,repetitions:20,medianMs:Number(times[10].toFixed(3)),maxMs:Number(times.at(-1).toFixed(3))};
});
report.total=report.rows.length;
report.passed=report.rows.filter(row=>row.pass).length;
report.failed=report.total-report.passed;
report.environment={node:process.version,platform:process.platform,architecture:process.arch};
report.target={sourceSha256:sha256(fs.readFileSync(sourcePath)),testSha256:sha256(fs.readFileSync(path.join(__dirname,'tests-function-preflight.js'))),runnerSha256:sha256(fs.readFileSync(__filename))};
report.benchmarks=benchmarks;
console.log(JSON.stringify(report,null,2));
process.exitCode=report.failed?1:0;
