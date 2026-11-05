const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const elements=new Map(['codeInput','outputResult','variableState','stepResult','codePreview','hintResult'].map(id=>[id,{value:'',innerHTML:'',textContent:''}]));
const context=vm.createContext({document:{getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[],createElement:()=>({innerHTML:'',textContent:''})},window:{addEventListener(){}}});
for(const file of ['script.js','function-preflight.js','function-execution-core.js','tests-function-input-stage5.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context,{filename:file,timeout:10000});
const core=vm.runInContext('FunctionExecutionCore',context),suite=vm.runInContext('FunctionInputStage5Tests',context);
const forbidden=()=>{throw Error('core touched product state')};context.document=new Proxy({},{get:forbidden});context.window=new Proxy({},{get:forbidden,set:forbidden});
const report=suite.run(core);report.environment={node:process.version,platform:process.platform};
report.hashes=Object.fromEntries(['script.js','function-preflight.js','function-execution-core.js','tests-function-input-stage5.js'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex')]));
console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
