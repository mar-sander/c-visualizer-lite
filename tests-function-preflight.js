/* 独立テスト。06の完成コードは教材の空欄を補った想定例です。製品は読み込みません。 */
'use strict';

const FunctionPreflightTests = (() => {
  const main = body => `int main(void){\n${body}\nreturn 0;\n}`;
  const definition = 'int kasan(int a,int b){\nint wa;\nwa=a+b;\nreturn wa;\n}';
  const prototype = 'int kasan(int a,int b);';
  const sum = `#include <stdio.h>\n${prototype}\n${main('int s;\ns=kasan(2,5);\nprintf("s = %d\\n",s);')}\n${definition}`;
  const difference = `#include <stdio.h>\nint genzan(int a,int b);\n${main('int a,b,sa;\nscanf("%d",&a);\nscanf("%d",&b);\nsa=genzan(a,b);\nprintf("%d",sa);')}\nint genzan(int a,int b){\nif(a<b){\nreturn b-a;\n}else{\nreturn a-b;\n}\n}`;
  const cases = [];
  const add = (name, source, classification, code = null, extra = null) => cases.push({name, source, classification, code, extra});
  const withCall = (call, def = definition, proto = prototype) => `${proto}\n${main(`int s;\n${call}`)}\n${def}`;

  add('通常main', main(''), 'NONE');
  add('通常の型付き宣言と代入', main('int a=1,b=2;\nfloat f=1.2;\ndouble d=2.3;\nchar c=\'x\';\na=b+3;'), 'NONE');
  add('printf・scanf', main('int a;\nscanf("%d",&a);\nprintf("%d",a);'), 'NONE');
  add('if・else if・else', main('int a=1;\nif(a){\na=2;\n}else if(a<2){\na=3;\n}else{\na=4;\n}'), 'NONE');
  add('for・while', main('int i=0;\nfor(i=0;i<2;i++){\nprintf("%d",i);\n}\nwhile(i<4){\ni++;\n}'), 'NONE');
  add('main内配列initializer', main('int data[3]={1,2,3};\nint i=0;\ndata[i]=data[1];'), 'NONE');
  add('演算の括弧', main('int a;\na=(2+3)*(4-1);'), 'NONE');
  add('include角括弧', '#include <stdio.h>\n'+main(''), 'NONE');
  add('include二重引用符', '#include "local.h"\n'+main(''), 'NONE');
  add('文字列の擬似ヘッダ', main('printf("int kasan(int a,int b){ }");'), 'NONE');
  add('行コメントの擬似ヘッダ', '// int kasan(int a,int b){\n'+main(''), 'NONE');
  add('複数行コメントの擬似ヘッダ', '/*\nint kasan(int a,int b){ }\n*/\n'+main(''), 'NONE');
  add('文字定数の括弧', main("char a='{';\nchar b=')';\nchar c='[';"), 'NONE');
  add('escape引用符とコメント記号', main('printf("\\\"int f( // /* { \\\\");'), 'NONE');
  add('文字定数のescape', main("char a='\\'';\nchar b='\\\\';"), 'NONE');
  add('名前が似た変数', main('int kasan2=1,genzan_value=2;'), 'NONE');
  add('sizeofは呼出にしない', main('int a;\na=sizeof(a);'), 'NONE');
  add('CRLF保持', main('int a;').replace(/\n/g,'\r\n'), 'NONE');
  add('mainの独立行brace', 'int main(void)\n{\nreturn 0;\n}', 'NONE');
  add('int main空引数', 'int main(){return 0;}', 'NONE');
  add('ゼロ件の関数宣言', main('int a=0;'), 'NONE', null, result => result.functions.length === 1 && result.calls.length === 0);

  add('06(1)想定完成コード', sum, 'DEFINITE', null, result => {
    const f = result.functions.find(item=>item.name==='kasan');
    const call = result.calls[0];
    return f.declarations.length===1 && f.definitions.length===1 && f.parameters.map(p=>p.name).join(',')==='a,b' &&
      f.definitions[0].bodyRange.start.line===9 && f.definitions[0].bodyRange.end.line===13 &&
      call.line===5 && call.argumentCount===2 && call.directMainAssignment && call.assignmentTarget==='s';
  });
  add('06(2)想定完成コード', difference, 'DEFINITE', null, result => result.calls[0].callee==='genzan' && result.functions.find(f=>f.name==='genzan').structures.filter(s=>s.kind==='return').length===2);
  add('main前置定義・宣言なし', definition+'\n'+main('int s;\ns=kasan(2,5);'), 'DEFINITE');
  add('後置定義・未呼出', main('')+'\n'+definition, 'DEFINITE');
  add('前置定義・未呼出', definition+'\n'+main(''), 'DEFINITE');
  add('プロトタイプのみ・未呼出', prototype+'\n'+main(''), 'DECLARATION_ONLY', 'UNUSED_DECLARATION');
  add('プロトタイプのみ・呼出あり', withCall('s=kasan(2,5);',''), 'AMBIGUOUS', 'MISSING_FUNCTION_DEFINITION');
  add('未定義foo呼出', main('int s;\ns=foo(2,5);'), 'UNKNOWN_CALL', 'UNKNOWN_FUNCTION_CALL');
  add('同じ署名の重複宣言', prototype+'\n'+sum, 'DEFINITE');
  add('仮引数名だけ違う宣言', 'int kasan(int x,int y);\n'+sum, 'DEFINITE', null, result=>result.functions.find(f=>f.name==='kasan').parameters.map(p=>p.name).join(',')==='a,b');
  add('名前省略プロトタイプ', withCall('s=kasan(2,5);',definition,'int kasan(int,int);'), 'DEFINITE');
  add('異なる戻り型の宣言', 'float kasan(int a,int b);\n'+sum, 'AMBIGUOUS','SIGNATURE_MISMATCH');
  add('異なる引数型の宣言', 'int kasan(float a,int b);\n'+sum, 'AMBIGUOUS','SIGNATURE_MISMATCH');
  add('異なる引数個数の宣言', 'int kasan(int a);\n'+sum, 'AMBIGUOUS','SIGNATURE_MISMATCH');
  add('重複関数定義', sum+'\n'+definition, 'AMBIGUOUS','DUPLICATE_DEFINITION');
  add('重複main', main('')+'\n'+main(''), 'AMBIGUOUS','MAIN_NOT_UNIQUE');
  add('重複仮引数名', main('')+'\nint kasan(int a,int a){return a;}', 'AMBIGUOUS','DUPLICATE_PARAMETER');
  add('後置定義の宣言欠落', withCall('s=kasan(2,5);',definition,''), 'AMBIGUOUS','FUNCTION_NOT_VISIBLE');
  add('関数定義の独立行brace', sum.replace('int kasan(int a,int b){','int kasan(int a,int b)\n{'), 'DEFINITE');
  add('ヘッダ内のコメントと改行', sum.replace('int kasan(int a,int b){','int /* comment */ kasan(\nint a,\nint b)\n{'), 'DEFINITE');
  add('2つのサブ関数', sum+'\nint genzan(int a,int b){return a-b;}', 'DEFINITE', null, result=>result.functions.length===3);
  add('複数回呼出の位置', sum.replace('s=kasan(2,5);','s=kasan(2,5);\ns=kasan(3,7);'), 'DEFINITE', null, result=>result.calls.length===2 && result.calls[0].line+1===result.calls[1].line);
  add('局所変数名と未使用関数が同名', main('int kasan=1;')+'\n'+definition, 'DEFINITE');
  add('__proto__の関数名', withCall('s=__proto__(2,5);',definition.replaceAll('kasan','__proto__'),prototype.replaceAll('kasan','__proto__')), 'DEFINITE');
  add('constructorの関数名', withCall('s=constructor(2,5);',definition.replaceAll('kasan','constructor'),prototype.replaceAll('kasan','constructor')), 'DEFINITE');

  for(const [label,source] of [
    ['閉じないブロックコメント',main('')+'/*'], ['閉じない文字列',main('printf("broken);')],
    ['閉じない文字定数',main("char c='x;")], ['不足波かっこ','int main(void){'],
    ['不足丸かっこ','int main(void {\n}'], ['不足角かっこ',main('int a[3;')],
    ['余分な閉じかっこ',main('')+'}'], ['交差する括弧',main('int a;\na=([)];')],
    ['未完成関数ヘッダ',main('')+'\nint kasan(int a,'],
    ['終端なしヘッダ',main('')+'\nint kasan(int a,int b)'],
    ['戻り型なし定義','kasan(int a,int b){return a+b;}\n'+main('')],
    ['mainなし',definition], ['空文字列',''],
    ['関数内main','int kasan(int a,int b){\nint main(void){return 0;}\nreturn a+b;\n}'],
    ['main内関数定義',main('int kasan(int a,int b){return a+b;}')],
  ]) add(label,source,'AMBIGUOUS');
  add('引数0個',withCall('s=kasan();'),'AMBIGUOUS','ARGUMENT_COUNT_MISMATCH');
  add('引数1個',withCall('s=kasan(2);'),'AMBIGUOUS','ARGUMENT_COUNT_MISMATCH');
  add('引数3個',withCall('s=kasan(2,5,7);'),'AMBIGUOUS','ARGUMENT_COUNT_MISMATCH');
  add('引数末尾カンマ',withCall('s=kasan(2,);'),'AMBIGUOUS','EMPTY_ARGUMENT');
  add('引数先頭カンマ',withCall('s=kasan(,5);'),'AMBIGUOUS','EMPTY_ARGUMENT');
  add('複合診断の優先順位', '#define F(a) (a)\n'+main('int s;\ns=foo(1,2);')+'\n'+definition+'\n}', 'AMBIGUOUS');

  for(const [label,proto,def] of [
    ['void戻り値','void kasan(int a,int b);','void kasan(int a,int b){return;}'],
    ['float戻り値','float kasan(int a,int b);','float kasan(int a,int b){return 1.2;}'],
    ['ポインタ戻り値','int *kasan(int a,int b);','int *kasan(int a,int b){return 0;}'],
    ['ポインタ引数','int kasan(int *a,int b);','int kasan(int *a,int b){return b;}'],
    ['配列引数','int kasan(int a[],int b);','int kasan(int a[],int b){return b;}'],
    ['void仮引数','int kasan(void);','int kasan(void){return 0;}'],
    ['引数なし旧形式','int kasan();','int kasan(){return 0;}'],
    ['無名の定義引数','int kasan(int,int);','int kasan(int,int){return 0;}'],
    ['可変長引数','int kasan(int a,...);','int kasan(int a,...){return a;}']
  ]) add(label,proto+'\n'+main('')+'\n'+def,'UNSUPPORTED','FUNCTION_SIGNATURE_UNSUPPORTED');
  for(const [label,body,code] of [
    ['式中呼出','s=1+kasan(2,5);','CALL_CONTEXT_UNSUPPORTED'],
    ['printf引数内呼出','printf("%d",kasan(2,5));','CALL_CONTEXT_UNSUPPORTED'],
    ['宣言時呼出','int x=kasan(2,5);','CALL_CONTEXT_UNSUPPORTED'],
    ['if内呼出','if(1){\ns=kasan(2,5);\n}','CALL_CONTEXT_UNSUPPORTED'],
    ['for内呼出','for(s=0;s<1;s++){\ns=kasan(2,5);\n}','CALL_CONTEXT_UNSUPPORTED'],
    ['波かっこなしif呼出','if(1) s=kasan(2,5);','CALL_CONTEXT_UNSUPPORTED'],
    ['returnの呼出','return kasan(2,5);','CALL_CONTEXT_UNSUPPORTED'],
    ['引数の入れ子呼出','s=kasan(kasan(1,2),5);','ARGUMENT_FORM_UNSUPPORTED'],
    ['アドレス引数','s=kasan(&s,5);','ARGUMENT_FORM_UNSUPPORTED'],
    ['配列要素引数','int a[2];\ns=kasan(a[0],5);','ARGUMENT_FORM_UNSUPPORTED'],
    ['実引数の副作用','s=kasan(s++,5);','ARGUMENT_FORM_UNSUPPORTED'],
    ['未宣言の代入先','x=kasan(2,5);','ASSIGNMENT_TARGET_UNSUPPORTED'],
    ['配列の代入先','int a[2];\na=kasan(2,5);','ASSIGNMENT_TARGET_UNSUPPORTED'],
    ['floatの代入先','float x;\nx=kasan(2,5);','ASSIGNMENT_TARGET_UNSUPPORTED'],
    ['関数名の変数による隠蔽','int kasan;\ns=kasan(2,5);','CALLEE_SHADOWED'],
  ]) add(label,withCall(body),'UNSUPPORTED',code);
  add('再帰',main('')+'\nint kasan(int a,int b){\nint s;\ns=kasan(a,b);\nreturn s;\n}','UNSUPPORTED','RECURSION_UNSUPPORTED');
  add('サブ関数から他関数',sum.replace('wa=a+b;','wa=genzan(a,b);')+'\nint genzan(int a,int b){return a-b;}','AMBIGUOUS','SUBFUNCTION_CALL_UNSUPPORTED');
  add('可視な他関数へのサブ関数内呼出','int genzan(int a,int b){return a-b;}\n'+sum.replace('wa=a+b;','wa=genzan(a,b);'),'UNSUPPORTED','SUBFUNCTION_CALL_UNSUPPORTED');
  add('グローバル変数','int g;\n'+main(''),'UNSUPPORTED','GLOBAL_DECLARATION');
  add('グローバル配列initializer','int g[2]={1,2};\n'+main(''),'UNSUPPORTED','GLOBAL_DECLARATION');
  add('グローバル関数ポインタ','int (*fp)(int,int);\n'+main(''),'UNSUPPORTED','COMPLEX_DECLARATION');
  add('局所関数ポインタ',main('int (*fp)(int,int);'),'UNSUPPORTED','LOCAL_POINTER_UNSUPPORTED');
  add('間接呼出',main('int a;\na=(*fp)(1,2);'),'UNSUPPORTED','INDIRECT_CALL_UNSUPPORTED');
  add('関数形式マクロ','#define F(a,b) ((a)+(b))\n'+main(''),'UNSUPPORTED','PREPROCESSOR_UNSUPPORTED');
  add('オブジェクト形式マクロ','#define N 3\n'+main(''),'UNSUPPORTED','PREPROCESSOR_UNSUPPORTED');
  add('条件付き前処理','#if 0\n'+definition+'\n#endif\n'+main(''),'UNSUPPORTED','PREPROCESSOR_UNSUPPORTED');
  add('継続行マクロ','#define F(a) \\\n (a)\n'+main(''),'UNSUPPORTED','PREPROCESSOR_UNSUPPORTED');
  add('局所プロトタイプ',main('int kasan(int a,int b);'),'UNSUPPORTED','LOCAL_PROTOTYPE_UNSUPPORTED');
  add('ユーザーprintf定義',main('')+'\nint printf(int a,int b){return a+b;}','UNSUPPORTED','RESERVED_IO_NAME');
  add('mainの引数付き定義','int main(int argc){return 0;}','UNSUPPORTED','MAIN_SIGNATURE_UNSUPPORTED');
  add('サブ関数のループ',main('')+'\n'+definition.replace('wa=a+b;','while(a){\na=a-1;\n}'),'UNSUPPORTED','FUNCTION_CONTROL_UNSUPPORTED');
  add('値を評価しない',withCall('s=kasan(a,b);'),'DEFINITE',null,result=>result.readyForExecution===false&&result.calls[0].requiresRuntimeArgumentValidation);
  add('到達しない0除算も評価しない',main('')+'\n'+definition.replace('wa=a+b;','if(0){\nwa=1/0;\n}\nwa=a+b;'),'DEFINITE');
  add('文字数超過で切詰めNONEにしない', main('')+' '.repeat(60001),'UNSUPPORTED','SOURCE_LIMIT');
  add('トークン上限',main(';'.repeat(20001)),'UNSUPPORTED','TOKEN_LIMIT');
  add('括弧深さ上限',main('('.repeat(257)+')'.repeat(257)+';'),'UNSUPPORTED','DEPTH_LIMIT');
  add('定義数上限',main('')+Array.from({length:129},(_,i)=>`\nint f${i}(int a,int b){return a+b;}`).join(''),'UNSUPPORTED','DEFINITION_LIMIT');
  add('呼出数上限',withCall('s=kasan(2,5);\n'.repeat(513)),'UNSUPPORTED','CALL_LIMIT');

  add('未知の単独呼出',main('foo(1,2);'),'UNKNOWN_CALL','UNKNOWN_FUNCTION_CALL');
  add('main自身への直接呼出',main('int s;\ns=main();'),'UNSUPPORTED','MAIN_CALL_UNSUPPORTED');
  add('行コメントの前処理行継続','// comment \\\n'+main(''),'UNSUPPORTED','LINE_SPLICE_UNSUPPORTED');
  add('既存配列readで初期化したスカラー',withCall('int a[1]={0};\nint x=a[0];\nx=kasan(2,5);'),'DEFINITE');
  add('符号付きリテラル引数',withCall('s=kasan(-2,+5);'),'DEFINITE');
  add('floatリテラルは整数形にしない',withCall('s=kasan(1.5,2);'),'UNSUPPORTED','ARGUMENT_FORM_UNSUPPORTED');
  add('未定義呼出と未対応の優先順位','#define X 1\n'+main('foo(1,2);'),'UNKNOWN_CALL','PREPROCESSOR_UNSUPPORTED');
  add('コメント付きinclude','#include <stdio.h> // comment\n'+main(''),'NONE');
  add('関数名の途中にコメント',sum.replaceAll('kasan(', 'kasan /* comment */ ('),'DEFINITE');
  add('ブロック閉じ後の呼出',withCall('if(1){\ns=1;\n}\ns=kasan(2,5);'),'DEFINITE');
  add('while後の呼出',withCall('while(0){\ns=1;\n}\ns=kasan(2,5);'),'DEFINITE');
  add('SAMPLE相当の整数配列とfor',main('int a[3]={3,2,1};\nint i,j,d;\nfor(i=0;i<2;i++){\nfor(j=i+1;j<3;j++){\nif(a[i]<a[j]){\nd=a[i];\na[i]=a[j];\na[j]=d;\n}\n}\n}'),'NONE');
  add('mainの文字列だけではmain定義なし','char *s="int main(void){ }";','AMBIGUOUS','MAIN_NOT_UNIQUE');
  add('異なる名前の複数宣言','int kasan(int a,int b);\nint genzan(int a,int b);\n'+main(''),'DECLARATION_ONLY');
  add('mainの前方宣言', 'int main(void);\n'+main(''),'NONE');
  add('宣言にだけvoid・定義int', 'void kasan(int a,int b);\n'+sum,'AMBIGUOUS','SIGNATURE_MISMATCH');
  add('サブ関数名に似た未知名',withCall('s=kasan2(2,5);'),'UNKNOWN_CALL','UNKNOWN_FUNCTION_CALL');
  add('関数とグローバル名衝突','int kasan;\n'+sum,'AMBIGUOUS','GLOBAL_NAME_COLLISION');
  add('多次元配列引数',main('')+'\nint f(int a[2][2],int b){return b;}','UNSUPPORTED','FUNCTION_SIGNATURE_UNSUPPORTED');
  add('深い本文括弧は非再帰で制限',main('')+'\nint f(int a,int b){return '+'('.repeat(260)+'a'+')'.repeat(260)+';}','UNSUPPORTED','DEPTH_LIMIT');
  add('includeの不閉鎖ヘッダ','#include <stdio.h\n'+main(''),'UNSUPPORTED','PREPROCESSOR_UNSUPPORTED');
  add('式の関数ポインタキャスト相当',main('int s;\ns=((fp))(1,2);'),'UNSUPPORTED','INDIRECT_CALL_UNSUPPORTED');
  add('サブ関数内の配列宣言',main('')+'\n'+definition.replace('int wa;','int wa[2];'),'UNSUPPORTED','SUBFUNCTION_ARRAY_UNSUPPORTED');
  add('サブ関数内のstatic宣言',main('')+'\n'+definition.replace('int wa;','static int wa;'),'UNSUPPORTED','SUBFUNCTION_DECLARATION_UNSUPPORTED');
  add('サブ関数内の入力',main('')+'\n'+definition.replace('wa=a+b;','scanf("%d",&wa);'),'UNSUPPORTED','SUBFUNCTION_INPUT_UNSUPPORTED');

  function run(inspect){
    const rows = [];
    function check(name, callback){
      try{ if(!callback()) throw new Error('期待結果と一致しません'); rows.push({name,pass:true}); }
      catch(error){ rows.push({name,pass:false,error:String(error.message || error)}); }
    }
    for(const test of cases){
      let actual;
      check(test.name,()=>{
        const result=inspect(test.source); actual=result;
        if(result.classification!==test.classification) throw new Error(`expected ${test.classification}, actual ${result.classification}: ${result.diagnostics.map(d=>d.code).join(',')}`);
        if(test.code&&!result.diagnostics.some(d=>d.code===test.code)) throw new Error(`診断不足 ${test.code}: ${result.diagnostics.map(d=>d.code).join(',')}`);
        if(test.extra&&!test.extra(result)) throw new Error('位置・構造・経路の期待値不一致');
        const blocked=result.diagnostics.some(d=>d.severity==='error');
        if(result.safeToUseNormalPath!==(test.classification==='NONE'&&!blocked)) throw new Error('NORMAL経路判定不整合');
        if(result.canOfferFunctionConfirmation!==(['DEFINITE','DECLARATION_ONLY'].includes(test.classification)&&!blocked)) throw new Error('確認候補判定不整合');
        return result.readyForExecution===false;
      });
      Object.assign(rows.at(-1), { expected:test.classification, actual:actual?.classification ?? null,
        diagnosticCodes:actual?.diagnostics.map(item=>item.code) ?? [],
        safeToUseNormalPath:actual?.safeToUseNormalPath ?? false,
        canOfferFunctionConfirmation:actual?.canOfferFunctionConfirmation ?? false });
    }
    check('結果決定性とJSON互換',()=>JSON.stringify(inspect(sum))===JSON.stringify(inspect(sum)) && JSON.stringify(inspect(sum))===JSON.stringify(JSON.parse(JSON.stringify(inspect(sum)))));
    check('外部変更後も状態非共有',()=>{const first=inspect(sum);first.functions[0].name='polluted';first.functions[1].definitions[0].bodyRange.start.line=999;first.limits.calls=1;return inspect(sum).functions[0].name==='kasan'&&inspect(sum).limits.calls===512;});
    check('非文字列入力',()=>inspect(null).classification==='AMBIGUOUS'&&inspect({}).diagnostics[0].code==='SOURCE_TYPE');
    check('元ソース位置は切取りで一致',()=>{
      const result=inspect(sum);return result.calls.every(c=>sum.slice(c.range.start.offset,c.range.end.offset)==='kasan(2,5)')&&result.functions.every(f=>f.definitions.every(d=>sum.slice(d.bodyRange.start.offset,d.bodyRange.end.offset).startsWith('{')));
    });
    check('コメントとUnicode後の位置',()=>{const source='/* 日本語\nコメント */\n'+sum;const result=inspect(source);return result.calls[0].line===7&&source.slice(result.calls[0].range.start.offset,result.calls[0].range.end.offset)==='kasan(2,5)';});
    check('多数関数・上限以内',()=>{const source=main('')+Array.from({length:100},(_,i)=>`\nint f${i}(int a,int b){return a+b;}`).join('');return inspect(source).classification==='DEFINITE';});
    check('大きいコメントも偽陽性なし',()=>inspect('/*'+'x'.repeat(50000)+'*/\n'+main('')).classification==='NONE');
    check('returnとifの全文範囲',()=>{
      const result=inspect(difference);const f=result.functions.find(item=>item.name==='genzan');
      return f.structures.filter(item=>item.kind==='return').map(item=>difference.slice(item.range.start.offset,item.range.end.offset)).join('|')==='return b-a;|return a-b;'&&f.structures.find(item=>item.kind==='if').bodyRange!==null;
    });
    return {total:rows.length,passed:rows.filter(row=>row.pass).length,failed:rows.filter(row=>!row.pass).length,rows};
  }
  return { run, cases, examples:{sum,difference} };
})();

if(typeof module === 'object' && module.exports){
  module.exports=FunctionPreflightTests;
  if(require.main===module){
    const api=require('./function-preflight.js');
    const report=FunctionPreflightTests.run(api.inspectFunctionStructure);
    console.log(JSON.stringify(report,null,2));
    process.exitCode=report.failed?1:0;
  }
}
