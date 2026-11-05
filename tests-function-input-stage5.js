const FunctionInputStage5Tests = (() => {
  const textbook='#include <stdio.h>\nint genzan(int a, int b);\n\nint main(void){\n    int a, b, sa;\n    printf("整数を２つ入力\\n");\n    printf("１つ目");\n    scanf("%d", &a);\n    printf("２つ目");\n    scanf("%d", &b);\n    sa = genzan(a, b);\n    printf("入力された整数の差 = %d\\n", sa);\n    return 0;\n}\n\nint genzan(int a, int b){\n    if(a < b){\n        return b - a;\n    }else{\n        return a - b;\n    }\n}';
  const prefix='整数を２つ入力\n１つ目２つ目';
  const direct=(body='if(a<b){return b-a;}else{return a-b;}',args='2,5')=>'int genzan(int a,int b);\nint main(void){\nint s=99;\ns=genzan('+args+');\nprintf("%d",s);\nreturn 0;\n}\nint genzan(int a,int b){\n'+body+'\n}';
  function run(core){
    const rows=[],assert=(v,m='condition failed')=>{if(!v)throw Error(m);},equal=(a,b)=>assert(JSON.stringify(a)===JSON.stringify(b),JSON.stringify({actual:a,expected:b}));
    const record=(name,fn)=>{try{fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:String(e.stack||e)});}};
    const execute=(source,input='')=>core.execute(source,{input});
    const value=(r,name)=>r.variables.find(v=>v.name===name)?.value;
    for(const [input,expected,condition]of [['2\n5',3,true],['5\n2',3,false],['5\n5',0,false],['-2\n5',7,true]])record('06(2) '+JSON.stringify(input),()=>{
      const r=execute(textbook,input);assert(r.ok,JSON.stringify(r.diagnostics));equal(value(r,'sa'),expected);equal(r.output,prefix+'入力された整数の差 = '+expected+'\n');
      const b=r.steps.find(s=>s.functionEvent==='branch-decision');assert(b,'branch event missing');equal(b.branchDecision.conditionMet,condition);equal(b.branchDecision.selectedBranch,condition?'if':'else');
      equal(r.steps.filter(s=>s.functionEvent==='return').length,1);equal(r.steps.filter(s=>s.functionEvent==='scanf').length,2);equal(r.variables.map(v=>v.name),['a','b','sa']);
    });
    for(const [input,ordinal,output]of [['',1,'整数を２つ入力\n１つ目'],['2',2,prefix],['\n\r\n',1,'整数を２つ入力\n１つ目']])record('待機 '+JSON.stringify(input),()=>{
      const r=execute(textbook,input);equal(r.status,'waiting-input');equal(r.ok,false);equal(r.diagnostics,[]);assert(r.inputRequired);equal(r.inputRequest.ordinal,ordinal);equal(r.inputRequest.target,ordinal===1?'a':'b');equal(r.output,output);equal(r.metrics.calls,0);equal(r.steps.at(-1).functionEvent,'input-wait');assert(!r.steps.some(s=>s.functionEvent==='program-end'));equal(value(r,'sa'),null);
    });
    for(const input of ['2 5','1.2','NaN','Infinity','0x10','2\nx','9007199254740992','2\n9007199254740992'])record('不正整数 '+input,()=>{const r=execute(textbook,input);assert(!r.ok&&r.status!=='waiting-input');assert(r.diagnostics.length);equal(r.metrics.calls,0);assert(!r.diagnostics.some(d=>d.code==='CORE_INTERNAL_ERROR'));});
    for(const input of ['\n +2 \r\n\n 5 \n','002\n+5','2\n5\nUNUSED'])record('NORMAL同形式 '+JSON.stringify(input),()=>{const r=execute(textbook,input);assert(r.ok);equal(value(r,'sa'),3);});
    for(const [name,body,args,expected]of [
      ['未選択0除算','if(a<b){return b-a;}else{return 1/0;}','2,5',3],
      ['未選択未初期化','int x; if(a<b){return b-a;}else{return x;}','2,5',3],
      ['未選択値エラー逆側','if(a<b){return 1/0;}else{return a-b;}','5,2',3],
      ['return後不実行','if(a<b){return b-a;}else{return a-b;}\na=1/0;\nreturn 999;','2,5',3],
      ['先行局所','int x=a,y=b;\nif(x<y){return y-x;}else{return x-y;}','2,5',3],
      ['別行else','if (a < b)\n{\n return b-a;\n}\nelse\n{\n return a-b;\n}','2,5',3],
      ['コメント構造','if(a/* } */<b){ /* { */ return b-a; } /* else */ else { return a-b; }','5,2',3],
      ['括弧条件','if((a<b)){return b-a;}else{return a-b;}','2,5',3],
      ['return0','if(a<b){return 0;}else{return 1;}','2,5',0]
    ])record(name,()=>{const r=execute(direct(body,args));assert(r.ok,JSON.stringify(r.diagnostics));equal(r.output,String(expected));equal(value(r,'s'),expected);equal(r.steps.filter(s=>s.functionEvent==='return').length,1);});
    for(const [name,body]of [
      ['else if未対応','if(a<b){return b-a;}else if(a>b){return a-b;}else{return 0;}'],
      ['入れ子if未対応','if(a<b){if(a>0){return b-a;}else{return b;}}else{return a-b;}'],
      ['波括弧省略未対応','if(a<b)return b-a;else return a-b;'],
      ['未選択側構文不備','if(a<b){return b-a;}else{return a+;}'],
      ['戻り値なし側','if(a<b){return b-a;}else{a=a-b;}'],
      ['比較構文不備','if(a<){return b-a;}else{return a-b;}'],
      ['サブ関数scanf未対応','scanf("%d",&a); return a-b;'],
      ['ループ未対応','while(a<b){a=a+1;}return a;'],
      ['配列未対応','int x[2];return a-b;'],
      ['論理複合未対応','if(a<b && b>0){return b-a;}else{return a-b;}'],
      ['選択側0除算','if(a<b){return 1/0;}else{return a-b;}'],
      ['選択側未初期化','int x; if(a<b){return x;}else{return a-b;}']
    ])record(name,()=>{const r=execute(direct(body));assert(!r.ok&&r.status!=='waiting-input');assert(value(r,'s')===99||!r.variables.some(v=>v.name==='s'),'failed return committed');assert(!r.diagnostics.some(d=>d.code==='CORE_INTERNAL_ERROR'));});
    record('差の安全整数超過',()=>{const r=execute(direct(undefined,'-9007199254740991,9007199254740991'));assert(!r.ok);equal(value(r,'s'),99);});
    record('scanf型不一致',()=>{const r=execute(textbook.replace('int a, b, sa;','float a; int b,sa;'),'2\n5');assert(!r.ok);assert(r.diagnostics.length);});
    record('scanf %fは未対応',()=>{const r=execute(textbook.replace('scanf("%d", &a);','scanf("%f", &a);'),'2\n5');assert(!r.ok);});
    record('不正入力API型',()=>{const r=core.execute(textbook,{input:42});assert(!r.ok&&r.status==='error');});
    record('source/入力/snapshot非共有・先頭から新規再解析',()=>{
      const a=execute(textbook,''),copy=JSON.stringify(a);const b=execute(textbook,'2'),c=execute(textbook,'5\n2');equal(JSON.stringify(a),copy);equal(c.output,prefix+'入力された整数の差 = 3\n');equal(value(b,'a'),2);equal(value(c,'a'),5);equal(value(c,'b'),2);equal(c.steps.filter(s=>s.functionEvent==='printf').length,4);
      const scopes=c.steps.find(s=>s.functionEvent==='arguments').scopesAtStep;equal(scopes.map(s=>s.scopeId),['main','genzan#1']);equal(scopes[0].variables[0].key,'main:a');equal(scopes[1].variables[0].key,'genzan#1:a');
      const branch=c.steps.find(s=>s.functionEvent==='branch-decision');assert(branch.lineNo===17);const returned=c.steps.find(s=>s.functionEvent==='return');equal(returned.lineNo,20);equal(returned.callLineNo,11);
    });
    record('複数回呼出とscope独立',()=>{const code=textbook.replace('    printf("入力された整数の差 = %d\\n", sa);','    sa=genzan(b,a);\n    printf("入力された整数の差 = %d\\n", sa);'),r=execute(code,'2\n5');assert(r.ok);equal(r.metrics.calls,2);equal(r.steps.filter(s=>s.functionEvent==='branch-decision').map(s=>s.scopeId),['genzan#1','genzan#2']);});
    record('位置CRLF',()=>{const r=execute(textbook.replace(/\n/g,'\r\n'),'2\r\n5');assert(r.ok);equal(r.steps.find(s=>s.functionEvent==='branch-decision').lineNo,17);});
    record('条件の深さ上限は外側括弧にも適用',()=>{const r=execute(direct('if('+'('.repeat(33)+'a<b'+')'.repeat(33)+'){return b-a;}else{return a-b;}'));equal(r.status,'safety-stop');assert(r.diagnostics[0].code==='EXPRESSION_DEPTH');});
    record('入力長の明示安全上限',()=>{const r=execute(textbook,'2\n5\n'+' '.repeat(60000));equal(r.status,'safety-stop');equal(r.diagnostics[0].code,'INPUT_LIMIT');});
    record('空行入力の再試行は出力/STEPを増殖しない',()=>{const a=execute(textbook,'\n'),b=execute(textbook,'\n');equal(a,b);equal(a.status,'waiting-input');});
    for(const operator of ['<','<=','>','>=','==','!='])record('比較演算 '+operator,()=>{const r=execute(direct('if(a'+operator+'b){return 1;}else{return 0;}'));assert(r.ok);const expected=['<','<=','!='].includes(operator);equal(value(r,'s'),expected?1:0);equal(r.steps.find(s=>s.functionEvent==='branch-decision').branchDecision.comparison.operator,operator);});
    return {total:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,rows};
  }
  return {run,examples:{textbook,direct},prefix};
})();
if(typeof module==='object'&&module.exports)module.exports=FunctionInputStage5Tests;
