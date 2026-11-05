// L-FUNC3 core, extended by L-FUNC5 with branch return and explicit main input.
// Function boundaries come exclusively from FunctionPreflight; arithmetic and IO
// use script.js helpers. This module never runs user C as JavaScript.
const FunctionExecutionCore = (() => {
  'use strict';
  const limits = Object.freeze({sourceCharacters:60000, statements:2000, calls:100,
    steps:5000, variablesPerFrame:128, identifierCharacters:128,
    expressionCharacters:2048, expressionTokens:256, expressionDepth:32,
    outputCharacters:65536, snapshotCells:50000, outputSnapshotCharacters:2000000});
  class CoreFault extends Error {
    constructor(code, message, statement, phase = 'runtime', safety = false){
      super(message); Object.assign(this, {code, statement, phase, safety});
    }
  }

  function execute(source, options = {}){
    const main = {functionName:'main', scopeId:'main', callId:0, callLineNo:null, state:createMainExecutionState()};
    let active = main, output = '', callCount = 0, statementsExecuted = 0;
    let snapshotCells = 0, outputSnapshotCharacters = 0, catalog = null, lineStarts = [0];
    const steps = [], diagnostics = [];
    let inputLines = [], inputIndex = 0, successfulScanfCount = 0, inputRequest = null;
    const fault = (code, message, statement, phase = 'runtime', safety = false) => {
      throw new CoreFault(code, message, statement, phase, safety);
    };
    const frameSnapshot = frame => ({functionName:frame.functionName, scopeId:frame.scopeId, callId:frame.callId,
      variables:frame.state.variableOrder.map(name => ({name, key:frame.scopeId+':'+name,
        type:executionScalarType(frame.state,name), initialized:frame.state.variables[name] !== UNINITIALIZED,
        value:frame.state.variables[name] === UNINITIALIZED ? null : frame.state.variables[name],
        display:frame.state.variables[name] === UNINITIALIZED ? '未初期化' : displayScalarValue(frame.state.variables[name],executionScalarType(frame.state,name))}))});
    function recordCapacity(statement){
      const frames = active === main ? [main] : [main, active];
      const cells = frames.reduce((n,frame) => n+frame.state.variableOrder.length,0);
      if(steps.length >= limits.steps-1 || snapshotCells+cells > limits.snapshotCells ||
        outputSnapshotCharacters+output.length > limits.outputSnapshotCharacters){
        fault('RECORD_LIMIT','開発用STEP/snapshotの安全予算に達しました。',statement,'runtime',true);
      }
    }
    function emit(functionEvent, statement, extra = {}, terminal = false){
      if(!terminal) recordCapacity(statement);
      const frames = active === main ? [main] : [main, active];
      const cells = frames.reduce((n,frame) => n+frame.state.variableOrder.length,0);
      const range = extra.range || statement?.range;
      snapshotCells += cells; outputSnapshotCharacters += output.length;
      steps.push({step:steps.length+1, functionEvent, lineNo:statement?.lineNo || 1,
        functionName:active.functionName, callId:active.callId,
        scopeId:active.scopeId, activeScopeId:active.scopeId, callLineNo:active.callLineNo,
        scopesAtStep:frames.map(frameSnapshot), outputAtStep:output, ...extra,
        range:range ? {start:{...range.start},end:{...range.end}} : null});
    }
    function checkedName(name, statement){
      if(name.length > limits.identifierCharacters) fault('IDENTIFIER_LIMIT','識別子が開発用の長さ上限を超えています。',statement,'validation',true);
      if(C_SYNTAX_KEYWORDS.has(name) || C_SYNTAX_TYPES.has(name)) fault('RESERVED_IDENTIFIER','Cの予約語は変数名として使えません。',statement,'validation');
    }
    function checkExpression(expr, statement){
      if(expr.length > limits.expressionCharacters) fault('EXPRESSION_LIMIT','式が開発用の長さ上限を超えています。',statement,'validation',true);
      const tokenized = tokenizeExpression(expr);
      if(!tokenized.ok) fault('EXPRESSION_SYNTAX',tokenized.error,statement,'validation');
      if(tokenized.tokens.length > limits.expressionTokens) fault('EXPRESSION_LIMIT','式のトークン数が開発用上限を超えています。',statement,'validation',true);
      let depth = 0;
      for(const token of tokenized.tokens){
        if(token === '(' && ++depth > limits.expressionDepth) fault('EXPRESSION_DEPTH','式の括弧が開発用深さ上限を超えています。',statement,'validation',true);
        if(token === ')') depth--;
        if(C_SYNTAX_KEYWORDS.has(token) || C_SYNTAX_TYPES.has(token)) fault('UNSUPPORTED_EXPRESSION','この式はL-FUNC3の対応範囲外です。',statement,'validation');
      }
    }
    function expressionValue(expr, frame, statement, intOnly){
      const result = evaluateExpression(expr,frame.state.variables,null,frame.state.variableTypes);
      if(!result.ok) fault('EXPRESSION_VALUE',result.error,statement);
      if(intOnly && result.type !== 'int') fault('INT_REQUIRED','この関数処理にはint型の式が必要です。',statement);
      return result;
    }
    function saveValue(frame, name, value, statement){
      const converted = convertScalarValue(value,executionScalarType(frame.state,name));
      if(!converted.ok) fault('VALUE_RANGE',converted.error,statement);
      setExecutionScalarValue(frame.state,name,converted.value);
      return converted.value;
    }
    function declare(frame, statement){
      const state = frame.state;
      if(state.variableOrder.length+statement.declarators.length > limits.variablesPerFrame) fault('VARIABLE_LIMIT','フレームの変数数が開発用上限を超えています。',statement,'runtime',true);
      const staging = { ...state, variables:Object.assign(Object.create(null),state.variables), variableTypes:Object.assign(Object.create(null),state.variableTypes) };
      const pending = [];
      for(const item of statement.declarators){
        if(hasOwnSymbol(staging.variables,item.name)) fault('DUPLICATE_LOCAL','仮引数または局所変数の名前が重複しています。',statement);
        let value = UNINITIALIZED;
        if(item.expr !== undefined){
          const result = expressionValue(item.expr,{state:staging},statement,false);
          const converted = convertScalarValue(result.value,statement.type);
          if(!converted.ok) fault('VALUE_RANGE',converted.error,statement);
          value = converted.value;
        }
        staging.variables[item.name] = value; staging.variableTypes[item.name] = statement.type;
        pending.push({name:item.name,value});
      }
      for(const item of pending){declareExecutionScalar(state,item.name,item.value,statement.type);emit('declare',statement,{target:item.name});}
    }
    function assign(frame, statement){
      if(!hasOwnSymbol(frame.state.variables,statement.name)) fault('UNDECLARED_TARGET','代入先がこのスコープで宣言されていません。',statement);
      const result = expressionValue(statement.expr,frame,statement,false);
      saveValue(frame,statement.name,result.value,statement);emit('assign',statement,{target:statement.name});
    }
    function print(statement){
      const args = evaluatePrintfArguments(statement.parsedFormat,statement.args,main.state);
      if(!args.ok) fault('PRINTF_VALUE',args.error,statement);
      const formatted = formatPrintfString(statement.parsedFormat,args.values);
      if(output.length+formatted.text.length > limits.outputCharacters) fault('OUTPUT_LIMIT','共通出力が開発用の文字数上限を超えます。',statement,'runtime',true);
      output += formatted.text;emit('printf',statement);
    }
    function readInput(statement){
      const name=statement.name;
      if(!hasOwnSymbol(main.state.variables,name)) fault('SCANF_TARGET','scanfの変数が宣言されていません。',statement);
      if(executionScalarType(main.state,name)!=='int') fault('SCANF_TYPE','%d で入力できるのはint型の変数だけです。',statement);
      while(inputIndex<inputLines.length && inputLines[inputIndex].trim()==='')inputIndex++;
      if(inputIndex>=inputLines.length){
        inputRequest={kind:'scanf',lineNo:statement.lineNo,specifier:'%d',target:name,expectedType:'int',ordinal:successfulScanfCount+1};
        emit('input-wait',statement,{inputRequest:{...inputRequest}});
        return false;
      }
      const rawInput=inputLines[inputIndex],inputText=rawInput.trim();
      if(!/^[-+]?\d+$/.test(inputText))fault('SCANF_INTEGER','scanfで整数として読み取れない入力値です。1行に1つ、整数を入力してください。',statement);
      const converted=convertScalarValue(Number(inputText),'int');
      if(!converted.ok)fault('SCANF_VALUE',converted.error,statement);
      setExecutionScalarValue(main.state,name,converted.value);inputIndex++;successfulScanfCount++;
      emit('scanf',statement,{target:name,scanfInput:{specifier:'%d',target:name,targetType:'int',rawInput,inputDisplay:inputText,storedDisplay:displayScalarValue(converted.value,'int')}});
      return true;
    }
    // Split statements only inside the catalog's contentRange. This does not
    // discover functions or synthesize a different C source/main function.
    function parseBody(fn, masked, budget){
      const definition = fn.definitions[0], range = definition.contentRange;
      const nodes = [], names = new Set(fn.name === 'main' ? [] : definition.parameters.map(p => p.name));
      let start = range.start.offset, quote = null, escaped = false, parentheses = 0;
      function position(offset){
        let lo=0,hi=lineStarts.length;
        while(lo+1<hi){const mid=(lo+hi)>>1;if(lineStarts[mid]<=offset)lo=mid;else hi=mid;}
        return {offset,line:lo+1,column:offset-lineStarts[lo]+1};
      }
      function nodeAt(offset,end){
        const begin=position(offset);
        return {lineNo:begin.line,functionName:fn.name,start:offset,end,range:{start:begin,end:position(end)}};
      }
      function balanced(open, opening, closing){
        let depth=0,quote=null,escaped=false;
        for(let i=open;i<range.end.offset;i++){
          const ch=masked[i];
          if(escaped){escaped=false;continue;}
          if(quote){if(ch==='\\')escaped=true;else if(ch===quote)quote=null;continue;}
          if(ch==='"'||ch==="'"){quote=ch;continue;}
          if(ch===opening)depth++;
          if(ch===closing && --depth===0)return i;
        }
        fault('BRANCH_BOUNDARY','if/elseの括弧・本文境界を確認できません。',nodeAt(open,open+1),'validation');
      }
      const skipSpace=offset=>{while(offset<range.end.offset&&/\s/.test(masked[offset]))offset++;return offset;};
      function branchReturn(open){
        if(masked[open]!=='{')fault('BRANCH_FORM','if/elseは波かっこ付きのreturn本文だけに対応しています。',nodeAt(open,open+1),'validation');
        const close=balanced(open,'{','}'),begin=skipSpace(open+1),text=masked.slice(begin,close).trim(),node=nodeAt(begin,close);
        const match=/^return\s+([\s\S]+);$/.exec(text);
        if(!match)fault('BRANCH_RETURN','分岐の各本文にはreturn 整数式;が必要です。入れ子・複合本文は現在の対応範囲外です。',node,'validation');
        node.kind='return';node.expr=match[1].trim();
        checkExpression(node.expr,node);
        if(!inspectConditionalExpressionSyntax(node.expr))fault('RETURN_SYNTAX','return式の構文を確認してください。',node,'validation');
        if(++budget.count>limits.statements)fault('STATEMENT_LIMIT','本文の文数が開発用上限を超えています。',node,'validation',true);
        // range excludes whitespace after the return statement.
        node.end=begin+text.length;node.range.end=position(node.end);
        return {node,close};
      }
      function parseBranch(begin){
        const marker=nodeAt(begin,begin+2);
        if(fn.name==='main')fault('BRANCH_CONTEXT','FUNCTIONの分岐returnはサブ関数直下だけに対応しています。',marker,'validation');
        let open=skipSpace(begin+2);
        if(masked[open]!=='(')fault('BRANCH_FORM','ifの条件を括弧で囲んでください。',marker,'validation');
        const conditionEnd=balanced(open,'(',')'),condition=masked.slice(open+1,conditionEnd).trim();
        if(condition.length>limits.expressionCharacters)fault('EXPRESSION_LIMIT','条件式が開発用の長さ上限を超えています。',marker,'validation',true);
        let conditionDepth=0,conditionQuote=false,conditionEscaped=false;
        for(const ch of condition){
          if(conditionEscaped){conditionEscaped=false;continue;}
          if(conditionQuote){if(ch==='\\')conditionEscaped=true;else if(ch==="'")conditionQuote=false;continue;}
          if(ch==="'"){conditionQuote=true;continue;}
          if(ch==='(' && ++conditionDepth>limits.expressionDepth)fault('EXPRESSION_DEPTH','条件式の括弧が開発用深さ上限を超えています。',marker,'validation',true);
          if(ch===')')conditionDepth--;
        }
        const normalized=stripWrappingParentheses(condition),comparison=findComparison(normalized);
        if(!comparison.ok)fault('CONDITION_SYNTAX',comparison.error,marker,'validation');
        const operands=comparison.comparison ? [normalized.slice(0,comparison.comparison.index),normalized.slice(comparison.comparison.index+comparison.comparison.operator.length)] : [normalized];
        for(const operand of operands)checkExpression(operand.trim(),marker);
        if(operands.reduce((n,expr)=>n+tokenizeExpression(expr).tokens.length,0)>limits.expressionTokens)fault('EXPRESSION_LIMIT','条件式のトークン数が開発用上限を超えています。',marker,'validation',true);
        if(!inspectConditionalExpressionSyntax(condition))fault('CONDITION_SYNTAX','if条件の構文を確認してください。',marker,'validation');
        const yes=branchReturn(skipSpace(conditionEnd+1));
        const elseStart=skipSpace(yes.close+1);
        if(!/^else\b/.test(masked.slice(elseStart)))fault('BRANCH_ELSE','このStageの分岐returnはif/elseの両側が必要です。',nodeAt(elseStart,elseStart+1),'validation');
        const no=branchReturn(skipSpace(elseStart+4)),node=nodeAt(begin,no.close+1);
        if(++budget.count>limits.statements)fault('STATEMENT_LIMIT','本文の文数が開発用上限を超えています。',node,'validation',true);
        node.kind='branch';node.condition=condition;node.operands=operands;node.ifReturn=yes.node;node.elseReturn=no.node;
        nodes.push(node);start=no.close+1;
        return no.close;
      }
      function parse(end){
        const raw = masked.slice(start,end), leading = raw.search(/\S/);
        if(leading < 0){start=end;return;}
        const node = nodeAt(start+leading,end), text = raw.trim();start=end;
        if(++budget.count > limits.statements) fault('STATEMENT_LIMIT','本文の文数が開発用上限を超えています。',node,'validation',true);
        const calls = catalog.calls.filter(c => c.range.start.offset >= node.start && c.range.end.offset <= node.end);
        if(calls.length){
          const call = calls[0];
          if(fn.name !== 'main' || calls.length !== 1 || !call.directMainAssignment) fault('CALL_CONTEXT','main直下のint変数への単純な呼出代入だけを扱います。',node,'validation');
          const callee = catalog.functions.find(f => f.name === call.callee);
          node.kind='call';node.call=call;node.callee=callee;
          node.arguments=call.arguments.map(arg => masked.slice(arg.range.start.offset,arg.range.end.offset).trim());
          for(const expr of node.arguments) checkExpression(expr,node);
          nodes.push(node);return;
        }
        const multiple = parseMultipleScalarDeclaration(text), single = matchScalarDeclaration(text);
        if(multiple.matched || single){
          if(multiple.matched && !multiple.ok) fault('DECLARATION_SYNTAX',multiple.message,node,'validation');
          node.kind='declare';node.type=multiple.matched ? multiple.type : single[1];
          node.declarators=multiple.matched ? multiple.declarators : [{name:single[2],expr:single[3]}];
          if(fn.name !== 'main' && node.type !== 'int') fault('LOCAL_TYPE','サブ関数の局所宣言はintだけです。',node,'validation');
          for(const item of node.declarators){checkedName(item.name,node);if(names.has(item.name)) fault('DUPLICATE_LOCAL','仮引数または局所変数の名前が重複しています。',node,'validation');names.add(item.name);if(item.expr !== undefined) checkExpression(item.expr,node);}
        }else if(/^return\b/.test(text)){
          const match=text.match(/^return\s+([\s\S]+);$/);
          if(!match) fault('RETURN_SYNTAX','returnには整数式とセミコロンが必要です。',node,'validation');
          node.kind='return';node.expr=match[1].trim();checkExpression(node.expr,node);
          if(fn.name === 'main' && !/^0$/.test(node.expr)) fault('MAIN_RETURN','mainは従来のreturn 0;だけを扱います。',node,'validation');
        }else if(fn.name === 'main' && /^scanf\b/.test(text)){
          const match=/^scanf\s*\(\s*"%d"\s*,\s*&\s*([A-Za-z_]\w*)\s*\)\s*;$/.exec(text);
          if(!match)fault('SCANF_FORMAT','FUNCTIONではmain直下のscanf("%d", &int変数);だけに対応しています。',node,'validation');
          node.kind='scanf';node.name=match[1];checkedName(node.name,node);
        }else if(fn.name === 'main' && matchSimplePrintfStatement(text)){
          const match=matchSimplePrintfStatement(text);node.kind='printf';
          if(match[1].includes('%%')) fault('PRINTF_FORMAT','printfの%%は現在未対応です。',node,'validation');
          node.parsedFormat=parsePrintfFormat(match[1]);if(!node.parsedFormat.ok) fault('PRINTF_FORMAT',node.parsedFormat.error,node,'validation');
          node.args=match[2] ? splitArgs(match[2]) : [];for(const expr of node.args) checkExpression(expr,node);
        }else{
          const match=text.match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]+);$/);
          if(!match) fault('UNSUPPORTED_STATEMENT','この本文はL-FUNC3の直線的な宣言・代入・return対応範囲外です。',node,'validation');
          node.kind='assign';node.name=match[1];node.expr=match[2];checkedName(node.name,node);checkExpression(node.expr,node);
        }
        nodes.push(node);
      }
      for(let i=start;i<range.end.offset;i++){
        const ch=masked[i];
        if(escaped){escaped=false;continue;}
        if(quote){if(ch==='\\')escaped=true;else if(ch===quote)quote=null;continue;}
        if(ch==='"'||ch==="'"){quote=ch;continue;}
        if(parentheses===0 && /^if\b/.test(masked.slice(i)) && !masked.slice(start,i).trim()){
          i=parseBranch(i);continue;
        }
        if(ch==='{'||ch==='}') fault('NESTED_BODY','関数コアでは入れ子の本文や分岐を実行しません。',nodeAt(i,i+1),'validation');
        if(ch==='(')parentheses++;if(ch===')')parentheses--;
        if(ch===';'&&parentheses===0)parse(i+1);
      }
      if(masked.slice(start,range.end.offset).trim()) fault('STATEMENT_SYNTAX','文末のセミコロンまたは対応する本文がありません。',nodeAt(start,range.end.offset),'validation');
      if(fn.name !== 'main' && !nodes.some(n => n.kind==='return'||n.kind==='branch')) fault('MISSING_RETURN','サブ関数にreturnがありません。',nodeAt(range.start.offset,range.end.offset),'validation');
      return nodes;
    }
    function tick(statement){
      if(++statementsExecuted > limits.steps) fault('EXECUTION_LIMIT','実行文数が開発用上限を超えています。',statement,'runtime',true);
    }
    function call(statement, bodies){
      const target=statement.call.assignmentTarget,fn=statement.callee;
      if(!hasOwnSymbol(main.state.variables,target)||executionScalarType(main.state,target)!=='int') fault('CALL_TARGET','戻り値の代入先は宣言済みintスカラーが必要です。',statement);
      const values=statement.arguments.map(expr => {
        if(!/^[A-Za-z_]\w*$/.test(expr)&&!/^(?:[+-]\s*)?\d+$/.test(expr)) fault('ARGUMENT_FORM','実引数はintスカラーまたは符号付き整数リテラルだけです。',statement);
        return expressionValue(expr,main,statement,true).value;
      });
      if(values.length!==2) fault('ARGUMENT_COUNT','実引数は2個必要です。',statement);
      if(callCount>=limits.calls) fault('CALL_LIMIT','関数呼出数が開発用上限に達しました。',statement,'runtime',true);
      const callId=++callCount;
      emit('call',statement,{callId,calleeName:fn.name});
      active={functionName:fn.name,scopeId:fn.name+'#'+callId,callId,callLineNo:statement.lineNo,state:createMainExecutionState()};
      fn.definitions[0].parameters.forEach((param,i)=>declareExecutionScalar(active.state,param.name,values[i],'int'));
      emit('arguments',statement,{lineNo:fn.definitions[0].headerRange.start.line,range:fn.definitions[0].headerRange});
      let control={kind:'normal'};
      for(let node of bodies.get(fn.name)){
        tick(node);
        if(node.kind==='branch'){
          for(const operand of node.operands)expressionValue(operand,active,node,true);
          const evaluated=expressionValue(node.condition,active,node,true),conditionMet=evaluated.value!==0;
          emit('branch-decision',node,{branchDecision:{condition:node.condition,conditionMet,selectedBranch:conditionMet?'if':'else',comparison:evaluated.comparison ? {...evaluated.comparison} : null}});
          node=conditionMet?node.ifReturn:node.elseReturn;tick(node);
        }
        if(node.kind==='declare')declare(active,node);
        else if(node.kind==='assign')assign(active,node);
        else if(node.kind==='return'){
          const result=expressionValue(node.expr,active,node,true),converted=convertScalarValue(result.value,'int');
          if(!converted.ok)fault('RETURN_VALUE',converted.error,node);
          control={kind:'return',value:converted.value};emit('return',node,{returnValue:control.value});break;
        }
      }
      if(control.kind!=='return')fault('MISSING_RETURN','戻り値が確定しませんでした。',statement);
      active=main;recordCapacity(statement);saveValue(main,target,control.value,statement);
      emit('return-assign',statement,{callId,calleeName:fn.name,target,returnValue:control.value});
    }
    let status='completed';
    try{
      if(typeof source!=='string')fault('SOURCE_TYPE','Cソースは文字列で渡してください。',null,'validation');
      if(source.length>limits.sourceCharacters)fault('SOURCE_LIMIT','ソースが開発用文字数上限を超えています。',null,'validation',true);
      if(!options||typeof options!=='object'||(options.input!==undefined&&typeof options.input!=='string'))fault('INPUT_TYPE','入力は文字列で明示してください。',null,'validation');
      const input=options.input===undefined?'':options.input;
      if(input.length>limits.sourceCharacters)fault('INPUT_LIMIT','入力が開発用文字数上限を超えています。',null,'validation',true);
      inputLines=input.replace(/\r\n/g,'\n').split('\n');
      for(let i=0;i<source.length;i++)if(source[i]==='\n')lineStarts.push(i+1);
      catalog=FunctionPreflight.inspectFunctionStructure(source);
      const blocked=catalog.diagnostics.filter(d=>d.severity!=='info');
      if(blocked.length || !['DEFINITE','DECLARATION_ONLY','NONE'].includes(catalog.classification)){
        const d=blocked[0],contains=range=>d?.range&&range.start.offset<=d.range.start.offset&&range.end.offset>=d.range.end.offset;
        const owner=catalog.functions.find(f=>[...f.definitions,...f.declarations].some(item=>contains(item.range)));
        const callSite=catalog.calls.find(c=>contains(c.range));
        fault(d?.code||'PREFLIGHT_REJECTED',d?.message||'構造検査で安全な実行範囲を確認できません。',{lineNo:d?.line||1,range:d?.range||null,functionName:owner?.name||'main',callLineNo:callSite?.line||null},'preflight');
      }
      const masked=codeWithoutComments(source),bodies=new Map(),budget={count:0};
      for(const fn of catalog.functions){
        checkedName(fn.name,{lineNo:fn.definitions[0]?.headerRange.start.line||1,functionName:fn.name});
        if(!fn.definitions.length)continue;
        for(const param of fn.definitions[0].parameters)checkedName(param.name,{lineNo:param.range.start.line,functionName:fn.name});
        bodies.set(fn.name,parseBody(fn,masked,budget));
      }
      if(!bodies.has('main'))fault('MISSING_MAIN','実行可能なmainの本文がありません。',null,'validation');
      for(const node of bodies.get('main')){
        tick(node);
        if(node.kind==='declare')declare(main,node);
        else if(node.kind==='assign')assign(main,node);
        else if(node.kind==='call')call(node,bodies);
        else if(node.kind==='printf')print(node);
        else if(node.kind==='scanf'){if(!readInput(node)){status='waiting-input';break;}}
        else if(node.kind==='return'){emit('program-end',node);break;}
      }
    }catch(error){
      status=error.safety?'safety-stop':'error';
      const s=error.statement;
      const callSite=active.callLineNo||s?.callLineNo||(s?.kind==='call'?s.lineNo:null)||catalog?.calls.find(c=>c.callee===s?.functionName)?.line||null;
      diagnostics.push({code:error.code||'CORE_INTERNAL_ERROR',message:String(error.message),phase:error.phase||'runtime',lineNo:s?.lineNo||1,range:s?.range||null,callLineNo:callSite,functionName:s?.functionName||active.functionName});
      emit(status==='safety-stop'?'safety-stop':'error',s,{callLineNo:callSite,diagnosticCode:diagnostics[0].code},true);
    }
    return {schemaVersion:1,developmentOnly:true,ok:status==='completed',status,output,
      ...(status==='waiting-input'?{inputRequired:true,inputRequest:{...inputRequest}}:{}),
      variables:frameSnapshot(main).variables,steps,diagnostics,
      metrics:{calls:callCount,statementsExecuted,steps:steps.length,snapshotCells,outputSnapshotCharacters},limits:{...limits}};
  }
  return Object.freeze({execute,limits});
})();
if(typeof module==='object'&&module.exports)module.exports=FunctionExecutionCore;
