// L-FUNC4 Rev.1: pure routing evidence. Never evaluates C or changes source.
const FunctionAssistRouting = (() => {
  'use strict';
  const classifications=new Set(['NONE','DEFINITE','DECLARATION_ONLY','AMBIGUOUS','UNKNOWN_CALL','UNSUPPORTED']);
  const syntaxCalls=new Set(['if','for','while','switch','sizeof','_Alignof','return']);
  const identifier=value=>/^[A-Za-z_]\w*$/.test(value);
  const inside=(offset,range)=>range&&range.start.offset<=offset&&offset<range.end.offset;
  function classifyChecked(source,api){
    const stop=(priority,message,catalog=null,evidence=null)=>({route:'DIAGNOSTIC',priority,message,catalog,evidence});
    if(typeof source!=='string'||!api||typeof api.inspectFunctionStructure!=='function')return stop('P0','関数の事前検査を利用できません。実行していません。');
    let catalog;
    try{catalog=api.inspectFunctionStructure(source);}catch(_error){return stop('P0','関数の事前検査を完了できませんでした。実行していません。');}
    const validRange=range=>range&&range.start&&range.end&&Number.isInteger(range.start.offset)&&Number.isInteger(range.end.offset)&&range.start.offset>=0&&range.end.offset>=range.start.offset&&range.end.offset<=source.length;
    if(!catalog||catalog.schemaVersion!==1||!classifications.has(catalog.classification)||typeof catalog.safeToUseNormalPath!=='boolean'||typeof catalog.canOfferFunctionConfirmation!=='boolean'||catalog.readyForExecution!==false||catalog.sourceLength!==source.length||
      !Array.isArray(catalog.functions)||!Array.isArray(catalog.calls)||!Array.isArray(catalog.diagnostics)||!Array.isArray(catalog.directives)||
      catalog.functions.some(f=>typeof f.name!=='string'||!Array.isArray(f.definitions)||!Array.isArray(f.declarations)||[...f.definitions,...f.declarations].some(d=>!validRange(d.range)||!validRange(d.headerRange)||(d.bodyRange&&!validRange(d.bodyRange))))||
      catalog.calls.some(c=>typeof c.callee!=='string'||!validRange(c.range))||catalog.diagnostics.some(d=>typeof d.code!=='string'||!validRange(d.range))){
      return stop('P0','事前検査の形式を確認できません。実行していません。');
    }
    if(catalog.diagnostics.some(d=>/(?:LIMIT|DEPTH)$/.test(d.code)))return stop('P0','事前検査の安全上限に達しました。実行していません。',catalog);
    // Existing comment masker preserves offsets, including incomplete comments.
    const masked=codeWithoutComments(source),tokens=[];
    for(let i=0;i<masked.length;){
      const ch=masked[i];if(/\s/.test(ch)){i++;continue;}
      if(ch==='"'||ch==="'"){
        const quote=ch;let end=i+1,escaped=false;
        while(end<masked.length){const c=masked[end++];if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote)break;}
        tokens.push({value:'<literal>',start:i,end});i=end;continue;
      }
      const match=/^[A-Za-z_]\w*/.exec(masked.slice(i));
      if(match){tokens.push({value:match[0],start:i,end:i+match[0].length});i+=match[0].length;}
      else{tokens.push({value:ch,start:i,end:i+1});i++;}
    }
    const headers=catalog.functions.flatMap(f=>[...f.definitions,...f.declarations].map(d=>d.headerRange));
    const candidates=[],uncertain=[];
    for(let i=0;i<tokens.length-1;i++){
      const token=tokens[i],next=tokens[i+1];if(next.value!=='(')continue;
      if([')',']'].includes(token.value)){
        // A C scalar cast followed by parentheses is not an indirect call.
        if(token.value===')'&&tokens[i-2]?.value==='('&&['int','float','double','char'].includes(tokens[i-1]?.value))continue;
        uncertain.push({offset:token.start,kind:'indirect-call'});continue;
      }
      if(!identifier(token.value)||syntaxCalls.has(token.value))continue;
      if(headers.some(range=>inside(token.start,range)))continue;
      // A main header is recognized as a header only; its execution boundary is
      // still the unchanged findMainExecutionRange, never this token scan.
      if(token.value==='main'&&tokens[i-1]?.value==='int'&&(!tokens[i-2]||[';','{','}'].includes(tokens[i-2].value)||source.slice(0,tokens[i-1].start).trim().endsWith('>')))continue;
      if(['printf','scanf'].includes(token.value)&&!catalog.functions.some(f=>f.name===token.value))continue;
      candidates.push({name:token.value,offset:token.start,catalogCall:catalog.calls.find(c=>inside(token.start,c.range))||null});
    }
    const evidence={lexicalUserCalls:candidates.map(c=>({name:c.name,offset:c.offset,catalogued:!!c.catalogCall})),uncertain,
      catalogCalls:catalog.calls.map(c=>({caller:c.caller,callee:c.callee,range:c.range})),legacyMain:findMainExecutionRange(masked.split('\n')),
      headerRanges:headers,sourceUnchanged:true};
    const errors=catalog.diagnostics.filter(d=>d.severity==='error');
    if(uncertain.length||candidates.some(c=>!c.catalogCall)||catalog.calls.some(c=>!c.resolved)||
      (catalog.calls.length&&(catalog.classification==='AMBIGUOUS'||catalog.classification==='UNKNOWN_CALL'||catalog.classification==='UNSUPPORTED'||errors.length))){
      return stop('P1','関数呼出の定義・署名・対応範囲を確認できません。実行していません。',catalog,evidence);
    }
    if(['DEFINITE','DECLARATION_ONLY'].includes(catalog.classification)&&catalog.canOfferFunctionConfirmation){
      return {route:'CONFIRM',priority:'P2',catalog,evidence};
    }
    if(catalog.classification==='NONE'&&catalog.safeToUseNormalPath)return {route:'NORMAL',priority:'P3',catalog,evidence};
    if(candidates.length||catalog.calls.length||catalog.directives.some(d=>d.kind!=='include'))return stop('P5','関数呼出がないことを安全に確認できません。実行していません。',catalog,evidence);
    // Positively check the legacy executable interval against every catalogued
    // non-main body. Outside statements remain outside that unchanged engine.
    const legacy=evidence.legacyMain;
    if(legacy){
      const lineStarts=[0];for(let i=0;i<source.length;i++)if(source[i]==='\n')lineStarts.push(i+1);
      const start=lineStarts[legacy.openIndex]||0,end=lineStarts[legacy.endIndex+1]??source.length;
      if(catalog.functions.filter(f=>f.name!=='main').some(f=>f.definitions.some(d=>d.bodyRange.start.offset<end&&d.bodyRange.end.offset>start))){
        return stop('P5','mainと関数本文の実行範囲を安全に区別できません。実行していません。',catalog,evidence);
      }
    }
    return {route:'NORMAL',priority:'P4',catalog,evidence};
  }
  function classify(source,api=typeof FunctionPreflight==='undefined'?null:FunctionPreflight){
    try{return classifyChecked(source,api);}
    catch(_error){return {route:'DIAGNOSTIC',priority:'P0',message:'関数の事前検査を安全に完了できませんでした。実行していません。',catalog:null,evidence:null};}
  }
  return Object.freeze({classify});
})();
if(typeof module==='object'&&module.exports)module.exports=FunctionAssistRouting;
