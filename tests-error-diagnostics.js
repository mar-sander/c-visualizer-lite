'use strict';
(async function(){
  const rows = [];
  function record(name, pass, detail = ''){
    rows.push({ name, pass:!!pass, detail });
    const tr = document.createElement('tr');
    for(const text of [pass ? 'PASS' : 'FAIL', name, detail]){
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    }
    tr.className = pass ? 'pass' : 'fail'; document.getElementById('results').append(tr);
    document.getElementById('summary').textContent = rows.length + ' checks…';
  }
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const main = body => '#include <stdio.h>\n\nint main(void){\n' + body + '\nreturn 0;\n}';
  // @error marks the independently specified expected source line; it is removed before RUN.
  const bad = [];
  function add(name, body, text, extra = {}){ bad.push({ name, marked:main(body), text, ...extra }); }
  add('未宣言への代入', '@error x=1;', '宣言');
  add('未宣言の式', 'int x;\n@error x=missing+1;', '宣言');
  add('未初期化', 'int x;\n@error printf("%d",x);', 'まだ値');
  add('0除算', 'int x=1;\n@error x=1/0;', '0で割');
  add('型と書式', 'double x=1.0;\n@error printf("%d",x);', '%d');
  add('単一宣言の再宣言', 'int x=1;\n@error int x=2;', 'すでに', { variables:[['x','1']] });
  add('複数宣言の再宣言', 'int x=1;\n@error int y=2,x=3;', 'すでに', { variables:[['x','1']] });
  add('同じ文内の重複宣言', '@error int x=1,x=2;', '重複');
  add('配列と変数名の衝突', 'int x[1]={1};\n@error int x=2;', '配列');
  add('配列の範囲外', 'int a[2]={1,2};\n@error printf("%d",a[2]);', '存在しません');
  add('配列の未初期化', 'int a[2];\n@error printf("%d",a[1]);', 'まだ値');
  add('配列の添字の型', 'int a[2]={1,2};\nfloat k=1.0f;\n@error printf("%d",a[k]);', 'int型');
  add('配列の添字の式は未対応', 'int a[2]={1,2};\n@error printf("%d",a[0+1]);', '未対応');
  add('他型配列は未対応', '@error double a[2]={1,2};', 'int');
  add('printfの引数不足', '@error printf("%d");', '引数');
  add('printfの書式未対応', '@error printf("%s","ok");', '未対応');
  add('printfの空引数', '@error printf("%d",,1);', '未対応');
  add('printfの末尾カンマ', '@error printf("ok",);', '未対応');
  add('scanfの参照先', 'int x;\n@error scanf("%d",x);', 'scanf');
  add('scanfの型不一致', 'double x;\n@error scanf("%d",&x);', '型', { input:'2' });
  add('scanfの入力不正', 'int x;\n@error scanf("%d",&x);', '整数', { input:'oops' });
  add('代入のセミコロン不足', 'int x=0;\n@error x=2', 'セミコロン');
  add('宣言のセミコロン不足', '@error int x=2', 'セミコロン');
  add('printfのセミコロン不足', '@error printf("ok")', 'セミコロン');
  // No automatic trailing return in this fixture.
  bad.push({ name:'returnのセミコロン不足', marked:'#include <stdio.h>\n\nint main(void){\n@error return 0\n}', text:'セミコロン' });
  add('式の閉じ丸括弧不足', 'int x=0;\n@error x=(2+3;', 'かっこ');
  bad.push({name:'mainの閉じ波括弧不足',marked:'#include <stdio.h>\n\n@error int main(void){\nint x=1;\nreturn 0;',text:'main関数の終わり'});
  bad.push({name:'余分な閉じ波括弧',marked:main('int x=1;')+'\n@error }',text:'波かっこ'});
  bad.push({name:'次行mainの閉じ波括弧不足',marked:'#include <stdio.h>\nint main(void)\n@error {\nreturn 0;',text:'波かっこ'});
  add('分岐内宣言', 'int x=0;\nif(x==0){\n@error int y=1;\n}', '宣言');
  add('入れ子ifの本文', 'int x=0;\nif(x==0){\nif(x==0){\n@error scanf("%d",&x);\n}\n}', 'scanf');
  add('入れ子ifのヘッダ', 'int x=0;\nif(x==0){\n@error if(x==0)\nx=1;\n}', '波かっこ');
  add('3階層ifの限界', 'int x=0;\nif(x==0){\nif(x==0){\n@error if(x==0){\nx=1;\n}\n}\n}', '3階層');
  add('未選択else側の未対応文', 'int x=0;\nif(x==0){\nx=1;\n}else{\n@error scanf("%d",&x);\n}', 'scanf', {variables:[['x','0']]});
  add('else ifヘッダの構文', 'int x=0;\nif(x==1){\nx=1;\n@error }else if(x+){\nx=2;\n}', '構文', {variables:[['x','0']]});
  add('else if本文の構文', 'int x=0;\nif(x==1){\nx=1;\n}else if(x==0){\n@error x=2+;\n}', '構文');
  add('未選択の先頭if条件の構文', 'int x=0;\n@error if(x+){\nx=1;\n}else if(x==0){\nx=2;\n}', '構文');
  add('else if内の入れ子条件の構文', 'int x=0;\nif(x==1){\nx=1;\n}else if(x==0){\n@error if(x+){\nx=2;\n}\n}', '構文');
  add('else if内のprintf書式', 'int x=0;\nif(x==1){\nx=1;\n}else if(x==0){\n@error printf("%d");\n}', '構文');
  add('else ifでの配列条件は未対応', 'int x=0,a[1]={1};\nif(x==1){\nx=1;\n@error }else if(a[0]>0){\nx=2;\n}', '未対応');
  add('elseの形', 'int x=0;\nif(x==1){\nx=1;\n@error }else\nx=2;', 'else');
  add('対応しないelse', 'int x=0;\n@error else{\nx=1;\n}', '対応するif');
  add('二つ目のelse', 'int x=0;\nif(x==1){\nx=1;\n}else{\nx=2;\n}\n@error else{\nx=3;\n}', 'else');
  add('制御構文switchは未対応', 'int x=0;\n@error switch(x){\ncase 0:\nx=1;\n}', '未対応');
  add('forヘッダ区切りの不足', 'int i=0;\n@error for(i=0;i<2){\nprintf("%d",i);\n}', '3つ');
  add('forヘッダ宣言は有効なCだがLite未対応', '@error for(int i=0;i<2;i++){\nprintf("%d",i);\n}', '未対応');
  add('whileヘッダの閉じ丸括弧不足', 'int i=0;\n@error while(i<2{\ni++;\n}', '閉じ丸かっこ');
  add('whileの波括弧省略は有効なCだがLite未対応', 'int i=0;\n@error while(i<2)\ni++;', '未対応');
  for(const loop of ['for','while']){
    const header = loop==='for' ? 'for(i=0;i<1;i++){' : 'while(i<1){';
    const opts = { variables:[['i','9']], noExecutionFrom:5, stopLine:5 };
    const wrap = body => 'int i=9;\n'+header+'\n'+body+'\n}\nprintf("WRONG");';
    for(const [label,body,text] of [
      ['scanf','@error scanf("%d",&i);','scanf'],
      ['宣言','@error int k=1;','宣言'],
      ['break','@error break;','未対応'],
      ['複数文','@error i=1;i=2;','改行'],
      ['本文のセミコロン不足','@error i=1','未対応'],
      ['returnのセミコロン不足','@error return 0','未対応'],
      ['入れ子ifのscanf','if(i==0){\n@error scanf("%d",&i);\n}','scanf'],
      ['入れ子ifの更新','if(i==0){\n@error i++;\n}','更新'],
      ['printfの形','@error printf("ok",);','printf']
    ]) add(loop+'内 '+label,wrap(body),text,opts);
    add(loop+'の実行時条件', 'int i=0;\n@error '+header.replace('i<1','missing<1')+'\nprintf("WRONG");\n}', '宣言');
  }
  add('子forヘッダ', 'int i=9,j=8;\nfor(i=0;i<1;i++){\n@error for(int j=0;j<1;j++){\nprintf("%d",j);\n}\n}', '初期化部', {variables:[['i','9'],['j','8']],noExecutionFrom:5,stopLine:5});
  add('孫forヘッダ', 'int i=9,j=8,k=7;\nfor(i=0;i<1;i++){\nfor(j=0;j<1;j++){\n@error for(k=0;k<1;){\nprintf("%d",k);\n}\n}\n}', '省略', {variables:[['i','9'],['j','8'],['k','7']],noExecutionFrom:5,stopLine:5});
  add('4階層forの限界', 'int i=9,j=8,k=7,m=6;\nfor(i=0;i<1;i++){\nfor(j=0;j<1;j++){\nfor(k=0;k<1;k++){\n@error for(m=0;m<1;m++){\nprintf("%d",m);\n}\n}\n}\n}', '最大3階層');
  add('子for内の配列添字式', 'int i=9,j=8,a[2]={1,2};\nfor(i=0;i<1;i++){\nfor(j=0;j<1;j++){\n@error a[j+1]=3;\n}\n}', '未対応');
  add('構造拒否を本文実行時エラーより先に診断', 'int i=9;\nfor(i=0;i<1;i++){\ni=1/0;\n@error scanf("%d",&i);\nbreak;\n}', 'scanf', {variables:[['i','9']],noExecutionFrom:5,stopLine:5});
  add('停止後の独立エラーを実行しない', 'int i=9;\nfor(i=0;i<1;i++){\n@error scanf("%d",&i);\nbreak;\n}\nprintf("%d",missing);', 'scanf');
  add('子for実行時の配列範囲外', 'int i=0,j=0,a[1]={8};\nfor(i=0;i<1;i++){\nfor(j=0;j<1;j++){\n@error a[0]=a[1];\n}\n}', '存在しません');
  add('forの更新時エラーはヘッダ行', 'int i=0;\n@error for(i=0;i<1;i+=missing){\nprintf("%d",i);\n}', '宣言');
  bad.push({name:'複数の独立したエラーを行順に表示',marked:main('int x=0;\n@error x=1/0;\nprintf("%d",missing);'),text:'0で割',lineSet:[5,6]});
  const focus = '#include <stdio.h>\n\nint main(void){\n    int i, j, d, kokugo[5] = {75, 26, 93, 49, 100};\n    for(i=0;i<5;i++){\n        for(j=i+1;j<5;j++){\n            if(kokugo[i] < kokugo[j]){\n                d=kokugo[i];\n                kokugo[i]=kokugo[j];\n                kokugo[j]=d;\n            }\n        }\n    }\n    return 0;\n}';
  const good = [
    {name:'正式重点ケース降順',code:focus,array:[100,93,75,49,26]},
    {name:'重点ケースを比較変更で昇順',code:focus.replace('kokugo[i] < kokugo[j]','kokugo[i] > kokugo[j]'),array:[26,49,75,93,100]},
    {name:'型とprintf',code:main('char c=\'A\';\nfloat f=1.5f;\ndouble d=2.5;\nprintf("%c %.1f %.1lf",c,f,d);'),output:'A 1.5 2.5'},
    {name:'printfの文字定数内の区切りを無視',code:main('printf("%c%c%c",\',\',\')\',\'(\');'),output:',)('},
    {name:'混合宣言と配列の部分初期化',code:main('int x=1,a[3]={2},y=3;\nprintf("%d %d %d %d",x,a[0],a[2],y);'),output:'1 2 0 3'},
    {name:'if else if else',code:main('int x=0;\nif(x==1){\nx=1;\n}else if(x==0){\nx=2;\n}else{\nx=3;\n}\nprintf("%d",x);'),output:'2'},
    {name:'whileとif',code:main('int i=0;\nwhile(i<2){\nif(i==1){\nprintf("%d",i);\n}\ni++;\n}'),output:'1'},
    {name:'scanfとprintf',code:main('int x;\nscanf("%d",&x);\nprintf("%d",x);'),input:'42',output:'42'},
    {name:'文字列とコメント内の括弧を無視',code:main('int x=1;\n/* } { if(for(\n} */\nprintf("{}; if( %d",x);'),output:'{}; if( 1'},
    {name:'次行mainの波括弧',code:'#include <stdio.h>\nint main(void)\n{\nprintf("ok");\nreturn 0;\n}',output:'ok'},
    {name:'Cで有効なreturn省略は学習ヒントだけ',code:'#include <stdio.h>\nint main(void){\nprintf("ok");\n}',output:'ok',advisory:true}
  ];
  const frame = document.createElement('iframe');frame.src='index.html';
  const loaded = new Promise(resolve => frame.onload=resolve);document.body.append(frame);await loaded;
  const ui=frame.contentWindow,doc=ui.document,cm=doc.querySelector('.CodeMirror').CodeMirror;
  function run(code,input=''){
    cm.setValue(code);doc.getElementById('scanfInput').value=input;
    doc.getElementById('visualize').click();return ui.cVisualizerLiteResult;
  }
  const redLines=()=>Array.from({length:cm.lineCount()},(_,i)=>i).filter(i=>(cm.lineInfo(i).bgClass||'').includes('CodeMirror-error-line')).map(i=>i+1);
  try{
    for(const fixture of bad) for(const shift of [0,2]){
      const marked='\n'.repeat(shift)+fixture.marked;
      const sourceLine=marked.split('\n').findIndex(line=>line.includes('@error'))+1;
      const expected=(fixture.lineSet||[sourceLine-shift]).map(line=>line+shift);
      const code=marked.replace('@error ',''),label=fixture.name+' [+'+shift+'行]';
      const r=run(shift ? code.replace(/\n/g,'\r\n') : code,fixture.input);
      const actual=[...new Set((r.diagnostics||[]).map(d=>d.lineNo).filter(Number.isInteger))];
      record(label+' 原因行',r.hasWarnings&&same(actual,expected),JSON.stringify({expected,actual,warnings:r.warningText}));
      record(label+' 説明',r.warningText.some(text=>text.includes(fixture.text)),r.warningText.join('\n'));
      record(label+' メッセージと構造化データ一致',Array.isArray(r.diagnostics)&&r.diagnostics.every((d,i)=>r.warningText[i]===(d.lineNo?d.lineNo+'行目：':'')+d.title+'：'+d.message));
      record(label+' 赤いエディタ行',same(redLines(),expected),JSON.stringify(redLines()));
      const previewLines=[...doc.querySelectorAll('#codePreview .warning-highlight')].map(el=>Number(el.querySelector('.code-line-number').textContent));
      record(label+' 解析器の強調行',same(previewLines,[...expected].sort((a,b)=>a-b)),JSON.stringify(previewLines));
      record(label+' 失敗表示',!!doc.querySelector('.failure-state')&&!doc.querySelector('.result-flow-button'));
      if(fixture.variables) record(label+' 拒否前の値保持',fixture.variables.every(([name,value])=>new Map(r.variables).get(name)===value),JSON.stringify(r.variables));
      if(fixture.noExecutionFrom) record(label+' 外側全体の実行前停止',!r.steps.some(step=>step.lineNo>=fixture.noExecutionFrom+shift&&!step.text.includes('実行を停止')),JSON.stringify(r.steps.map(s=>({line:s.lineNo,text:s.text}))));
      if(fixture.stopLine) record(label+' 停止位置と原因位置の分離',r.steps.some(step=>step.lineNo===fixture.stopLine+shift&&step.text.includes('実行を停止')));
      cm.replaceRange(' ',{line:0,ch:0});record(label+' 編集で赤表示を解除',redLines().length===0);
    }
    for(const f of good){
      const r=run(f.code,f.input);
      record(f.name+' 正常実行',!r.hasWarnings&&!r.inputRequired,JSON.stringify(r.warningText));
      record(f.name+' 赤表示なし',redLines().length===0);
      if(f.output!==undefined)record(f.name+' 出力',r.output===f.output,JSON.stringify(r.output));
      if(f.array)record(f.name+' 最終配列',same(r.arrays[0]?.values,f.array),JSON.stringify(r.arrays));
      if(f.advisory)record(f.name+' 位置不明の学習ヒント',r.diagnostics.length===1&&r.diagnostics[0].lineNo===null);
    }
    // A localized message or a number inside detail must not control the red source line.
    ui.showFailure({warningText:['任意の説明：99行目という文字を含みます'],diagnostics:[{lineNo:2,title:'任意',message:'説明'}]});
    record('強調表示は説明文を解析せず位置データを使用',same(redLines(),[2]));
    ui.showFailure({warningText:['3行目：旧結果の説明']});record('従来の結果形式も表示',same(redLines(),[3]));
    ui.showFailure({warningText:['1行目：任意'],diagnostics:[{lineNo:0},{lineNo:-1},{lineNo:99999},{lineNo:null},{lineNo:'2'}]});
    record('不正・範囲外位置を強調しない',redLines().length===0);
    ui.showFailure({warningText:['1行目：任意'],diagnostics:[{lineNo:2},{lineNo:2}]});record('同じ行の診断を重複強調しない',same(redLines(),[2]));
    record('診断データはJSONで移送可能',same(JSON.parse(JSON.stringify(ui.cVisualizerLiteResult)),ui.cVisualizerLiteResult));
  }catch(error){record('例外',false,String(error.stack||error));}
  finally{
    frame.remove();const pass=rows.filter(r=>r.pass).length;
    window.errorDiagnosticsTestResults={total:rows.length,pass,fail:rows.length-pass,cases:bad.length,normalCases:good.length,rows};
    document.getElementById('summary').textContent=pass+'/'+rows.length+' PASS, '+(rows.length-pass)+' FAIL';
  }
})();
