/* Node標準ライブラリだけを使う検証ランナー。製品エンジンは隔離VMで検証し、製品ファイルは変更しません。 */
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
record('QA1: 正式依存順とFUNCTION接続・入力伝達', () => {
  // L-QA1: one copy per standalone verifier; no production test dependency.
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/g)].map(m=>m[1]);
  const order=['script.js','function-preflight.js','function-execution-core.js','function-assist-routing.js','app.js'];
  if(!order.every((name,i)=>scripts.filter(s=>s===name).length===1 && (!i||scripts.indexOf(name)>scripts.indexOf(order[i-1]))))return false;
  const elements=new Map(['codeInput','outputResult','variableState','stepResult','codePreview','hintResult'].map(id=>[id,{value:'',innerHTML:'',textContent:''}]));
  const engine=vm.createContext({document:{getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[],createElement:()=>({innerHTML:'',textContent:''})},window:{addEventListener(){}}});
  for(const file of order.slice(0,-1))vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),engine,{filename:file,timeout:10000});
  const router=vm.runInContext('FunctionAssistRouting',engine),core=vm.runInContext('FunctionExecutionCore',engine);
  const code='int genzan(int a,int b);\nint main(void){\nint a,b,s;\nscanf("%d",&a);\nscanf("%d",&b);\ns=genzan(a,b);\nprintf("%d",s);\nreturn 0;\n}\nint genzan(int a,int b){\nif(a<b){return b-a;}else{return a-b;}\n}';
  if(router.classify(code).route!=='CONFIRM' || router.classify('int main(void){return 0;}').route!=='NORMAL')return false;
  const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const gateway=app.match(/^let executeConfirmedFunctionAssist = function[\s\S]*?^};/m);
  if(!gateway)return false;
  let checks=0,calls=0,result,received;
  const context=vm.createContext({scanfInput:{value:'2\n5'},functionAssistInputGeneration:0,
    isFunctionAssistAttemptCurrent:()=>++checks===1,
    FunctionExecutionCore:{execute(source,options){calls++;received=options;result=core.execute(source,options);return result;}}});
  // Stop after dispatch via the second current-attempt guard. Real UI is tested
  // in tests-function-assist / Stage5 / FA1, not simulated by this gateway check.
  vm.runInContext(gateway[0]+'\nexecuteConfirmedFunctionAssist('+JSON.stringify({approved:true,status:'CONFIRM',operationToken:0,code})+');',context,{timeout:10000});
  return calls===1 && received?.input==='2\n5' && result.ok && result.status==='completed' && result.output==='3' &&
    result.variables.find(v=>v.name==='s')?.value===3;

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
