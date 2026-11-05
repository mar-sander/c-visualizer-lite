const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname,source=__dirname;
const elements=new Map(['codeInput','outputResult','variableState','stepResult','codePreview','hintResult'].map(id=>[id,{value:'',innerHTML:'',textContent:''}]));
const context=vm.createContext({document:{getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[],createElement:()=>({innerHTML:'',textContent:''})},window:{addEventListener(){}}});
for(const file of ['script.js','function-preflight.js','function-assist-routing.js'])vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),context,{filename:file,timeout:10000});
const router=vm.runInContext('FunctionAssistRouting',context),api=vm.runInContext('FunctionPreflight',context),audit={corpus:{blocked:JSON.parse(fs.readFileSync(path.join(root,'tests-function-assist-routing-cases.json'),'utf8'))}};
const rows=[];function record(name,fn){try{const value=fn();rows.push({name,pass:true,...value});}catch(e){rows.push({name,pass:false,error:String(e.stack||e)});}}
for(const t of audit.corpus.blocked)record(t.name,()=>{const r=router.classify(t.code);assert.equal(r.route,'NORMAL',JSON.stringify(r));assert.equal(r.priority,'P4');return {priority:r.priority,evidence:r.evidence};});
const normal='int main(void){\nint x=1;\nprintf("%d",x);\nreturn 0;\n}';
const sum=require('./tests-function-execution-core.js').examples.textbook;
for(const [name,code,route,priority]of [
 ['normal',normal,'NORMAL','P3'],['06(1)',sum,'CONFIRM','P2'],
 ['unknown','int main(void){\nint s;\ns=foo(2,5);\nreturn 0;\n}','DIAGNOSTIC','P1'],
 ['unsupported called',sum.replace(/int kasan/g,'void kasan'),'DIAGNOSTIC','P1'],
 ['signature mismatch',sum.replace('int kasan(int a, int b);','int kasan(int a);'),'DIAGNOSTIC','P1'],
 ['recursion',sum.replace('return wa;','return kasan(a,b);'),'DIAGNOSTIC','P1'],
 ['incomplete call',normal.replace('int x=1;','int x=foo(2,'),'DIAGNOSTIC','P1'],
 ['uncalled supported',sum.replace('    s = kasan(2, 5);','    s = 7;'),'CONFIRM','P2'],
 ['prototype only',normal.replace('int main','int kasan(int a,int b);\nint main'),'CONFIRM','P2'],
 ['macro','#define F(x) x\n'+normal,'DIAGNOSTIC','P1'],
 ['limit',' '.repeat(60001),'DIAGNOSTIC','P0']
])record(name,()=>{const r=router.classify(code);assert.equal(r.route,route);assert.equal(r.priority,priority);return {priority:r.priority};});
record('API absent',()=>assert.equal(router.classify(normal,null).priority,'P0'));
record('API exception',()=>assert.equal(router.classify(normal,{inspectFunctionStructure(){throw Error('test')}}).priority,'P0'));
record('malformed result',()=>assert.equal(router.classify(normal,{inspectFunctionStructure(){return {classification:'NONE'}}}).priority,'P0'));
record('unexpected class',()=>assert.equal(router.classify(normal,{inspectFunctionStructure(code){return {...api.inspectFunctionStructure(code),classification:'OTHER'}}}).priority,'P0'));
record('unexpected schema version',()=>assert.equal(router.classify(normal,{inspectFunctionStructure(code){return {...api.inspectFunctionStructure(code),schemaVersion:2}}}).priority,'P0'));
record('P5 unsupported directive',()=>assert.equal(router.classify('#pragma once\n'+normal).priority,'P5'));

for(const [name,code,priority] of [
 ['multiplication parentheses',normal.replace('int x=1;','int x=2 * (3+4);'),'P3'],
 ['parenthesized arithmetic',normal.replace('int x=1;','int x=(2+3)*(4+5);'),'P3'],
 ['scalar cast is not call',normal.replace('int x=1;','int x=(int)(2.5);'),'P4'],
 ['indirect call',normal.replace('int x=1;','int x=(*foo)(2);'),'P1'],
 ['pointer call',normal.replace('int x=1;','int x=table[0](2);'),'P1'],
 ['comment-hidden unknown',normal.replace('int x=1;','int x=1; /* foo(2) */'),'P3'],
 ['literal-hidden unknown',normal.replace('int x=1;','int x=1; printf("foo(2)");'),'P3'],
 ['called pointer',sum.replace('int kasan(int a, int b)', 'int *kasan(int a, int b)'),'P1'],
 ['called array argument',sum.replace('int kasan(int a, int b)', 'int kasan(int a[], int b)'),'P1'],
 ['malformed lexical call',normal.replace('int x=1;','int x=unknown(2); /*'),'P1']
])record(name,()=>{const r=router.classify(code);assert.equal(r.priority,priority,JSON.stringify(r));});
for(const [name,badApi] of [
 ['getter throws',{get inspectFunctionStructure(){throw Error('test')}}],
 ['malformed functions',{inspectFunctionStructure(code){return {...api.inspectFunctionStructure(code),functions:[null]}}}],
 ['malformed diagnostics',{inspectFunctionStructure(code){return {...api.inspectFunctionStructure(code),diagnostics:[null]}}}]
])record(name,()=>assert.equal(router.classify(normal,badApi).priority,'P0'));
record('routing is pure and source/global state unchanged',()=>{
 const before=Object.keys(context).sort(),input=sum;const a=router.classify(input),b=router.classify(input);
 assert.deepEqual(a,b);assert.equal(input,sum);assert.deepEqual(Object.keys(context).sort(),before);
});

const report={total:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,rows};console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
