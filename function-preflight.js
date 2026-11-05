/* L-FUNC1: 製品から未参照の構造検査。実行・DOM操作・製品状態の参照はしません。 */
'use strict';

const FunctionPreflight = (() => {
  // クラウド単体検証用の暫定防護値。Androidでの正式値の確定は後続Stageです。
  const LIMITS = Object.freeze({ sourceCharacters:60000, tokens:20000, depth:256, definitions:128, calls:512 });
  const TYPES = new Set(['int', 'float', 'double', 'char', 'void', 'long', 'short', 'unsigned', 'signed', 'const', 'static', 'extern', 'struct', 'union', 'enum', 'typedef', 'volatile']);
  const NON_CALLS = new Set([...TYPES, 'if', 'else', 'for', 'while', 'switch', 'return', 'sizeof', '_Alignof', 'do', 'case']);
  const BUILTINS = new Set(['printf', 'scanf']);
  const PRIORITY = ['AMBIGUOUS', 'UNKNOWN_CALL', 'UNSUPPORTED'];

  function inspectFunctionStructure(source){
    const diagnostics = [];
    const functions = [];
    const calls = [];
    const directives = [];
    const tokens = [];
    const pairs = new Map();
    const parents = [];
    const byName = new Map();
    const globals = new Set();
    let offset = 0;
    let line = 1;
    let column = 1;
    let lineHasCode = false;

    const point = () => ({ offset, line, column });
    const range = (start, end) => ({ start:{...start}, end:{...end} });
    const tokenRange = (start, end) => range(tokens[start].range.start, tokens[end - 1].range.end);
    const raw = (start, end) => start < end ? source.slice(tokens[start].range.start.offset, tokens[end - 1].range.end.offset) : '';
    const value = index => tokens[index]?.value;
    const identifier = index => tokens[index]?.kind === 'identifier';
    function diagnose(code, message, at, category = 'AMBIGUOUS', severity = 'error'){
      const location = at?.start ? at : range(at || point(), at || point());
      diagnostics.push({ code, message, category, severity, line:location.start.line, range:location });
    }
    function finish(){
      const blocked = diagnostics.filter(item => item.severity === 'error');
      const classification = PRIORITY.find(category => blocked.some(item => item.category === category)) ||
        (functions.some(item => item.name !== 'main' && item.definitions.length) ? 'DEFINITE' :
          functions.some(item => item.name !== 'main') ? 'DECLARATION_ONLY' : 'NONE');
      return {
        schemaVersion:1, classification, functions, calls, directives, diagnostics,
        safeToUseNormalPath:classification === 'NONE' && blocked.length === 0,
        canOfferFunctionConfirmation:['DEFINITE', 'DECLARATION_ONLY'].includes(classification) && blocked.length === 0,
        validationLevel:'structure-and-call-shape-only', readyForExecution:false,
        deferredChecks:['body-statement-validation', 'argument-types-and-initialization', 'argument-values', 'return-values'],
        sourceLength:typeof source === 'string' ? source.length : null,
        limits:{...LIMITS}, limitPolicy:'provisional-development-guard'
      };
    }
    if(typeof source !== 'string'){
      diagnose('SOURCE_TYPE', 'ソースは文字列で指定してください。', null);
      return finish();
    }
    if(source.length > LIMITS.sourceCharacters){
      diagnose('SOURCE_LIMIT', '構造検査の暫定文字数上限を超えています。切り詰めて判定しません。', null, 'UNSUPPORTED');
      return finish();
    }

    function advance(){
      const ch = source[offset++];
      if(ch === '\n'){ line++; column = 1; lineHasCode = false; }
      else column++;
      return ch;
    }
    function addToken(kind, start){
      tokens.push({ kind, value:source.slice(start.offset, offset), range:range(start, point()) });
      lineHasCode = true;
    }

    // 引用符・コメント・前処理を字句状態で分離し、元ソースのoffsetを保持します。
    while(offset < source.length){
      if(tokens.length >= LIMITS.tokens){
        diagnose('TOKEN_LIMIT', '構造検査の暫定トークン数上限を超えています。', null, 'UNSUPPORTED');
        return finish();
      }
      const ch = source[offset];
      const next = source[offset + 1];
      const start = point();
      if(/\s/.test(ch)){ advance(); continue; }
      if(ch === '/' && next === '/'){
        while(offset < source.length && source[offset] !== '\n') advance();
        if(source.slice(start.offset, offset).replace(/\r$/, '').endsWith('\\')){
          diagnose('LINE_SPLICE_UNSUPPORTED', '行継続を含むコメントは、前処理後の範囲を保証できないため対応外です。', range(start, point()), 'UNSUPPORTED');
        }
        continue;
      }
      if(ch === '/' && next === '*'){
        advance(); advance();
        while(offset < source.length && !(source[offset] === '*' && source[offset + 1] === '/')) advance();
        if(offset === source.length){ diagnose('UNCLOSED_COMMENT', 'ブロックコメントの終わりを確認できません。', range(start, point())); break; }
        advance(); advance(); continue;
      }
      if(ch === '#' && !lineHasCode){
        let continued;
        do{
          while(offset < source.length && source[offset] !== '\n') advance();
          const end = source.slice(start.offset, offset).replace(/\r$/, '');
          continued = end.endsWith('\\');
          if(offset < source.length) advance();
        }while(continued && offset < source.length);
        const text = source.slice(start.offset, offset).trim();
        const include = /^#\s*include\s*(?:<[^>\r\n]+>|"[^"\r\n]+")\s*(?:(?:\/\/[^\n]*)|(?:\/\*[^]*?\*\/))?$/.test(text);
        directives.push({ text, kind:include ? 'include' : 'unsupported', range:range(start, point()) });
        if(!include) diagnose('PREPROCESSOR_UNSUPPORTED', 'include以外または範囲を確定できない前処理は対応外です。マクロ展開は行いません。', range(start, point()), 'UNSUPPORTED');
        continue;
      }
      if(ch === '"' || ch === "'"){
        const quote = advance();
        let closed = false;
        while(offset < source.length){
          if(source[offset] === '\n' || source[offset] === '\r') break;
          if(source[offset] === '\\'){
            advance();
            if(offset < source.length && source[offset] !== '\n' && source[offset] !== '\r') advance();
            continue;
          }
          if(advance() === quote){ closed = true; break; }
        }
        addToken(quote === '"' ? 'string' : 'character', start);
        if(!closed) diagnose('UNCLOSED_LITERAL', '文字列または文字定数の終わりを確認できません。', range(start, point()));
        continue;
      }
      if(/[A-Za-z_]/.test(ch)){
        advance();
        while(offset < source.length && /[A-Za-z_0-9]/.test(source[offset])) advance();
        addToken('identifier', start); continue;
      }
      if(/[0-9]/.test(ch)){
        advance();
        while(offset < source.length && /[A-Za-z_0-9.]/.test(source[offset])) advance();
        addToken('number', start); continue;
      }
      advance();
      addToken('punctuation', start);
      if(!'(){}[];,+-*/%=<>!&|^~?:.'.includes(ch)){
        diagnose('LEXICAL_UNSUPPORTED', '構造検査で扱えない記号があります。ソースは補正しません。', range(start, point()), 'UNSUPPORTED');
      }
    }

    // 非再帰の括弧対応。異種括弧の交差も安全判定しません。
    const stack = [];
    for(let index = 0; index < tokens.length; index++){
      parents[index] = stack.at(-1) ?? -1;
      const ch = value(index);
      if('({['.includes(ch)){
        stack.push(index);
        if(stack.length > LIMITS.depth){
          diagnose('DEPTH_LIMIT', '構造検査の暫定入れ子上限を超えています。', tokens[index].range, 'UNSUPPORTED');
          return finish();
        }
      }else if(')}]'.includes(ch)){
        const open = stack.pop();
        if(open === undefined || value(open) !== {')':'(', '}':'{', ']':'['}[ch]){
          diagnose('MISMATCHED_DELIMITER', '括弧の対応を確認できません。', tokens[index].range);
          return finish();
        }
        pairs.set(open, index); pairs.set(index, open);
      }
    }
    if(stack.length){
      for(const index of stack) diagnose('UNCLOSED_DELIMITER', '閉じ括弧が不足し、範囲を確定できません。', tokens[index].range);
    }
    if(diagnostics.some(item => item.category === 'AMBIGUOUS')) return finish();

    function split(start, end){
      if(start === end) return [];
      const parts = [];
      let first = start;
      for(let index = start; index < end; index++){
        if('([{'.includes(value(index))){ index = pairs.get(index); continue; }
        if(value(index) === ','){ parts.push([first, index]); first = index + 1; }
      }
      parts.push([first, end]);
      return parts;
    }
    function header(start, end){
      let open = -1;
      for(let index = start; index < end; index++){
        if(value(index) === '=') return null;
        if(value(index) === '('){ open = index; break; }
        if(value(index) === '[') return null;
      }
      if(open < 0 || !identifier(open - 1) || NON_CALLS.has(value(open - 1))) return null;
      if(pairs.get(open) !== end - 1) return null;
      return { name:value(open - 1), nameIndex:open - 1, open, close:end - 1, returnType:raw(start, open - 1).replace(/\s+/g, ' ').trim() };
    }
    function parameters(h){
      const parts = split(h.open + 1, h.close);
      if(parts.length === 1 && raw(...parts[0]) === 'void') return [];
      return parts.map(([start, end]) => {
        const values = tokens.slice(start, end).map(item => item.value);
        const simple = value(start) === 'int' && (end - start === 1 || (end - start === 2 && identifier(start + 1)));
        const name = simple && end - start === 2 ? value(start + 1) : null;
        return { type:simple ? 'int' : values.join(' '), name, range:start < end ? tokenRange(start, end) : tokens[h.close].range, supported:simple };
      });
    }
    function register(start, end, h, bodyOpen = null, bodyClose = null){
      const params = parameters(h);
      const definition = bodyOpen !== null;
      const item = {
        range:tokenRange(start, definition ? bodyClose + 1 : end + 1),
        headerRange:tokenRange(start, end), parameters:params,
        returnType:h.returnType,
        bodyRange:definition ? tokenRange(bodyOpen, bodyClose + 1) : null,
        contentRange:definition ? range(tokens[bodyOpen].range.end, tokens[bodyClose].range.start) : null
      };
      let fn = byName.get(h.name);
      const signature = h.returnType + '(' + params.map(param => param.type).join(',') + ')';
      if(!fn){
        fn = { name:h.name, returnType:h.returnType, parameters:params, signature, declarations:[], definitions:[], structures:[] };
        functions.push(fn); byName.set(h.name, fn);
      }else if(fn.signature !== signature){
        diagnose('SIGNATURE_MISMATCH', '同じ関数名の宣言と定義で、戻り型または引数の型・個数が一致しません。', item.headerRange);
      }
      item.signature = signature;
      item.matchesCatalogSignature = fn.signature === signature;
      // 宣言の仮引数名ではなく、最初の定義にある実際の局所名を代表値にします。
      if(definition && fn.definitions.length === 0){ fn.parameters = params; fn.returnType = h.returnType; }
      (definition ? fn.definitions : fn.declarations).push(item);
      if(definition && fn.definitions.length > 1) diagnose('DUPLICATE_DEFINITION', '同じ関数の定義が複数あります。', item.headerRange);
      const names = params.map(param => param.name).filter(Boolean);
      if(new Set(names).size !== names.length) diagnose('DUPLICATE_PARAMETER', '仮引数名が重複しています。', item.headerRange);
      if(h.name === 'main'){
        if(h.returnType !== 'int' || params.length) diagnose('MAIN_SIGNATURE_UNSUPPORTED', 'mainはint main(void)またはint main()の構造だけを扱います。', item.headerRange, 'UNSUPPORTED');
      }else{
        if(BUILTINS.has(h.name)) diagnose('RESERVED_IO_NAME', 'printf・scanfをユーザー関数として宣言・定義する形は対応外です。', item.headerRange, 'UNSUPPORTED');
        if(h.returnType !== 'int' || params.length !== 2 || params.some(param => !param.supported || (definition && !param.name))){
          diagnose('FUNCTION_SIGNATURE_UNSUPPORTED', '初期範囲は戻り型int・名前付きint仮引数2個の定義です。その他の署名はLiteの対応外です。', item.headerRange, 'UNSUPPORTED');
        }
      }
      return fn;
    }

    // トップレベルだけを列挙。initializerの{}は関数本文と区別します。
    const bodies = [];
    let definitionCount = 0;
    for(let start = 0; start < tokens.length;){
      let terminal = start;
      for(; terminal < tokens.length; terminal++){
        const ch = value(terminal);
        if(ch === '(' || ch === '['){ terminal = pairs.get(terminal); continue; }
        if(ch === ';' || ch === '{') break;
      }
      if(terminal === tokens.length){
        diagnose('INCOMPLETE_TOP_LEVEL', 'トップレベルの宣言または関数ヘッダが未完成です。', tokens[start].range); break;
      }
      const h = header(start, terminal);
      if(h && h.returnType){
        if(value(terminal) === '{'){
          const close = pairs.get(terminal);
          const fn = register(start, terminal, h, terminal, close);
          bodies.push({ fn, open:terminal, close });
          start = close + 1;
          if(++definitionCount > LIMITS.definitions){ diagnose('DEFINITION_LIMIT', '構造検査の暫定定義数上限を超えています。', tokens[terminal].range, 'UNSUPPORTED'); break; }
        }else{ register(start, terminal, h); start = terminal + 1; }
      }else{
        const hasEquals = tokens.slice(start, terminal).some(item => item.value === '=');
        const complex = tokens.slice(start, terminal).some(item => item.value === '(');
        if(value(terminal) === '{' && !hasEquals){
          diagnose('UNRECOGNIZED_TOP_LEVEL_BLOCK', '関数定義らしいブロックのヘッダを確定できません。', tokenRange(start, terminal + 1));
          start = pairs.get(terminal) + 1;
        }else{
          diagnose(complex ? 'COMPLEX_DECLARATION' : 'GLOBAL_DECLARATION', complex ? '関数ポインタ等の複雑な宣言は対応外です。' : 'main外の変数等の宣言は初期FUNCTION範囲外です。', tokenRange(start, terminal + 1), 'UNSUPPORTED');
          if(identifier(start + 1)) globals.add(value(start + 1));
          while(terminal < tokens.length && value(terminal) !== ';'){
            if(value(terminal) === '{') terminal = pairs.get(terminal);
            terminal++;
          }
          start = terminal + 1;
        }
      }
    }
    const main = byName.get('main');
    if(!main || main.definitions.length !== 1) diagnose('MAIN_NOT_UNIQUE', 'トップレベルに一意なmain定義を確認できません。', main?.definitions[1]?.headerRange || tokens[0]?.range);
    for(const name of globals){
      if(byName.has(name)) diagnose('GLOBAL_NAME_COLLISION', '関数とmain外の変数等の名前が重複しています。', byName.get(name).definitions[0]?.headerRange || byName.get(name).declarations[0]?.headerRange);
    }

    // 本文を実行せず、宣言・呼出の形と、後続が参照する構造位置だけを記録します。
    for(const body of bodies){
      const { fn, open, close } = body;
      const statementStarts = new Map([[open, open + 1]]);
      const locals = [];
      const nestedHeaders = new Set();
      function enclosingCurly(index){
        let parent = parents[index];
        while(parent >= 0 && value(parent) !== '{') parent = parents[parent];
        return parent;
      }
      for(let index = open + 1; index < close; index++){
        const curly = enclosingCurly(index);
        const start = statementStarts.get(curly) ?? curly + 1;
        const ch = value(index);
        if(ch === '{'){
          const h = header(start, index);
          if(h && h.returnType){
            diagnose('NESTED_FUNCTION', '関数内に関数定義らしい構造があります。トップレベル定義として扱いません。', tokenRange(start, index + 1));
            nestedHeaders.add(h.nameIndex);
          }
          statementStarts.set(index, index + 1);
        }
        if(ch === '}') statementStarts.set(parents[parents[index]], index + 1);
        if(index === start && TYPES.has(ch)){
          let end = index;
          while(end < close && value(end) !== ';' && value(end) !== '{'){
            if(value(end) === '(' || value(end) === '[') end = pairs.get(end);
            end++;
          }
          const h = header(index, end);
          if(h){
            nestedHeaders.add(h.nameIndex);
            diagnose(value(end) === '{' ? 'NESTED_FUNCTION' : 'LOCAL_PROTOTYPE_UNSUPPORTED', '関数内の関数宣言・定義は初期範囲外です。', tokenRange(index, end), value(end) === '{' ? 'AMBIGUOUS' : 'UNSUPPORTED');
          }else{
            for(const [a, b] of split(index + 1, end)){
              if(a < b && identifier(a)) locals.push({ name:value(a), type:ch, scalar:value(a + 1) !== '[', position:a, scope:curly });
              if(fn.name !== 'main' && value(a + 1) === '[') diagnose('SUBFUNCTION_ARRAY_UNSUPPORTED', 'サブ関数内の配列宣言は初期実行範囲外です。', tokens[a].range, 'UNSUPPORTED');
            }
            if(value(index + 1) === '*' || value(index + 1) === '(') diagnose('LOCAL_POINTER_UNSUPPORTED', 'ポインタまたは複雑な局所宣言は初期範囲外です。', tokens[index].range, 'UNSUPPORTED');
            if(fn.name !== 'main' && ch !== 'int') diagnose('SUBFUNCTION_DECLARATION_UNSUPPORTED', 'サブ関数の局所宣言はintスカラーを初期対象とします。修飾子等を含む宣言は対応外です。', tokens[index].range, 'UNSUPPORTED');
          }
        }
        if(['if', 'else', 'return', 'for', 'while', 'switch', 'do'].includes(ch)){
          let end = index + 1;
          let block = null;
          if(value(end) === '(') end = pairs.get(end) + 1;
          if(value(end) === '{'){
            block = tokenRange(end, pairs.get(end) + 1);
            end = pairs.get(end) + 1;
          }else if(ch === 'return'){
            while(end < close && value(end) !== ';' && value(end) !== '}'){
              if(['(', '['].includes(value(end))) end = pairs.get(end);
              end++;
            }
            if(value(end) === ';') end++;
          }
          fn.structures.push({ kind:ch, keywordRange:tokens[index].range, range:tokenRange(index, end), bodyRange:block });
          if(fn.name !== 'main' && ['for', 'while', 'switch', 'do'].includes(ch)) diagnose('FUNCTION_CONTROL_UNSUPPORTED', 'サブ関数内のループ等は初期実行範囲外です。', tokens[index].range, 'UNSUPPORTED');
        }
        if(ch === ';' && parents[index] === curly) statementStarts.set(curly, index + 1);
      }

      for(let index = open + 1; index < close; index++){
        if(value(index) === '(' && [')', ']'].includes(value(index - 1))){
          diagnose('INDIRECT_CALL_UNSUPPORTED', '間接的な関数呼出らしい構造は対応外です。', tokens[index].range, 'UNSUPPORTED');
        }
        if(!identifier(index) || value(index + 1) !== '(' || NON_CALLS.has(value(index)) || nestedHeaders.has(index)) continue;
        const callee = value(index);
        const callEnd = pairs.get(index + 1);
        if(BUILTINS.has(callee) && !byName.has(callee)){
          if(fn.name !== 'main' && callee === 'scanf') diagnose('SUBFUNCTION_INPUT_UNSUPPORTED', 'サブ関数内scanfは初期実行範囲外です。', tokenRange(index, callEnd + 1), 'UNSUPPORTED');
          continue;
        }
        if(calls.length >= LIMITS.calls){ diagnose('CALL_LIMIT', '構造検査の暫定呼出数上限を超えています。', tokens[index].range, 'UNSUPPORTED'); break; }
        const args = split(index + 2, callEnd);
        const call = {
          caller:fn.name, callee, line:tokens[index].range.start.line,
          range:tokenRange(index, callEnd + 1),
          arguments:args.map(([a, b]) => ({ text:raw(a, b), range:a < b ? tokenRange(a, b) : tokens[callEnd].range })),
          argumentCount:args.length, directMainAssignment:false, assignmentTarget:null,
          resolved:byName.has(callee), requiresRuntimeArgumentValidation:true
        };
        calls.push(call);
        if(callee === 'main') diagnose('MAIN_CALL_UNSUPPORTED', 'mainへの呼出・再帰は初期範囲外です。', call.range, 'UNSUPPORTED');
        if(args.some(([a, b]) => a === b)) diagnose('EMPTY_ARGUMENT', '呼出引数に空欄があります。', call.range);
        const target = byName.get(callee);
        if(!target){ diagnose('UNKNOWN_FUNCTION_CALL', '呼出先の宣言・定義を確認できません。', call.range, 'UNKNOWN_CALL'); }
        else{
          if(args.length !== target.parameters.length) diagnose('ARGUMENT_COUNT_MISMATCH', '呼出引数の個数が宣言・定義と一致しません。', call.range);
          if(!target.definitions.length) diagnose('MISSING_FUNCTION_DEFINITION', '呼び出された関数の定義がありません。戻り値は推測しません。', call.range);
          const prior = [...target.declarations, ...target.definitions].some(item => item.headerRange.start.offset < call.range.start.offset);
          if(!prior) diagnose('FUNCTION_NOT_VISIBLE', '呼出より前に関数の宣言または定義がありません。', call.range);
        }
        const ancestors = new Set();
        for(let parent = parents[index]; parent >= 0; parent = parents[parent]) ancestors.add(parent);
        if(locals.some(local => local.name === callee && local.position < index && ancestors.has(local.scope))){
          diagnose('CALLEE_SHADOWED', '関数名が局所変数で隠れているため、関数呼出と確定できません。', call.range, 'UNSUPPORTED');
        }
        let start = index - 1;
        while(start > open && !([';', '{', '}'].includes(value(start)) && (parents[start] === open || (value(start) === '}' && parents[parents[start]] === open)))) start--;
        start++;
        const simple = fn.name === 'main' && parents[index] === open &&
          index === start + 2 && identifier(start) && value(start + 1) === '=' && value(callEnd + 1) === ';';
        if(simple){
          call.assignmentTarget = value(start);
          const declared = locals.findLast(local => local.name === call.assignmentTarget && local.position < start && local.scope === open);
          if(!declared || declared.type !== 'int' || !declared.scalar) diagnose('ASSIGNMENT_TARGET_UNSUPPORTED', '呼出結果の代入先は、main直下で先に宣言されたintスカラーに限定します。', call.range, 'UNSUPPORTED');
          else call.directMainAssignment = true;
        }else diagnose(fn.name === callee ? 'RECURSION_UNSUPPORTED' : fn.name !== 'main' ? 'SUBFUNCTION_CALL_UNSUPPORTED' : 'CALL_CONTEXT_UNSUPPORTED', '呼出はmain直下の既存int変数への単純な戻り値代入だけを初期対象にします。', call.range, 'UNSUPPORTED');
        for(const [a, b] of args){
          const integerLiteral = index => tokens[index]?.kind === 'number' && /^\d+$/.test(value(index));
          if(!(b - a === 1 && (identifier(a) || integerLiteral(a))) &&
             !(b - a === 2 && ['+', '-'].includes(value(a)) && integerLiteral(a + 1))){
            diagnose('ARGUMENT_FORM_UNSUPPORTED', '初期の実引数はスカラー名または整数リテラルの形を対象とし、配列・アドレス・入れ子呼出等は実行しません。', call.range, 'UNSUPPORTED');
          }
        }
      }
    }
    for(const fn of functions){
      if(fn.name !== 'main' && !fn.definitions.length && !calls.some(call => call.callee === fn.name)){
        diagnose('UNUSED_DECLARATION', '宣言だけがあり、呼出はありません。定義がないことだけでCの誤りとは判定しません。', fn.declarations[0].headerRange, 'DECLARATION_ONLY', 'info');
      }
    }
    return finish();
  }

  return Object.freeze({ inspectFunctionStructure, limits:LIMITS });
})();

// Nodeではmoduleだけへ出力。通常scriptとして読み込む開発ページには同名のlexical bindingを提供します。
if(typeof module === 'object' && module.exports) module.exports = FunctionPreflight;
