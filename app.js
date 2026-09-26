// UI LABの操作を、正式版の解析結果へ接続するLite専用画面です。
const $ = id => document.getElementById(id);
const flow = $('flow-content');
const outputCard = document.querySelector('.output-card');
const editor = CodeMirror.fromTextArea($('code-input'), {
  mode:'text/x-csrc',
  inputStyle:'textarea',
  lineNumbers:true,
  matchBrackets:true,
  tabSize:4,
  indentUnit:4,
  gutters:['CodeMirror-linenumbers']
});
const editorLightToggle = $('editor-light-toggle');
editorLightToggle.addEventListener('click', () => {
  const isLight = document.querySelector('.editor-frame').classList.toggle('is-light');
  editorLightToggle.setAttribute('aria-checked', String(isLight));
});

const sampleBody = {
  add:['int a = 10;', 'int b = 3;', 'int c = a + b;', 'printf("%d\\n", c);'],
  sub:['int a = 10;', 'int b = 3;', 'int c = a - b;', 'printf("%d\\n", c);'],
  mul:['int a = 10;', 'int b = 3;', 'int c = a * b;', 'printf("%d\\n", c);'],
  div:['int a = 7;', 'int b = 2;', 'int c = a / b;', 'printf("%d\\n", c);'],
  all:['int a = 10;', 'int b = 3;', 'int add = a + b;', 'int sub = a - b;', 'int mul = a * b;', 'int div = a / b;', 'printf("%d %d %d %d\\n", add, sub, mul, div);'],
  precedence:['int x = 2 + 3 * 4;', 'int y = (2 + 3) * 4;', 'printf("%d %d\\n", x, y);']
};

let currentSteps = [];
let finalState = null;
let resultCode = null;
let activeStep = -1;
let currentCursorLine = -1;
let highlightedLine = -1;
const jumpableLines = new Set();
const errorLines = new Set();
let alignmentCheckPending = false;

// UI LAB UI-C3：ガター、本文、行番号の実座標がずれた場合だけ再計算します。
function checkEditorAlignment(){
  if(alignmentCheckPending) return;
  alignmentCheckPending = true;
  requestAnimationFrame(() => {
    alignmentCheckPending = false;
    const wrapper = editor.getWrapperElement();
    const gutters = wrapper.querySelector('.CodeMirror-gutters');
    const sizer = wrapper.querySelector('.CodeMirror-sizer');
    const scroll = wrapper.querySelector('.CodeMirror-scroll');
    const gutterRect = gutters.getBoundingClientRect();
    const numberRects = wrapper.querySelectorAll('.CodeMirror-code .CodeMirror-gutter-wrapper .CodeMirror-linenumber');
    const displacedNumber = Array.from(numberRects).some(number => {
      const rect = number.getBoundingClientRect();
      return Math.abs(rect.left - gutterRect.left) > 1 || rect.right > gutterRect.right + 1;
    });
    if(Math.abs(sizer.getBoundingClientRect().left + scroll.scrollLeft - gutterRect.right) > 1 || displacedNumber){
      editor.refresh();
    }
  });
}

function element(tag, className, value){
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(value !== undefined) node.textContent = value;
  return node;
}

function showIdle(title, message){
  const box = element('div', 'idle-state');
  box.append(element('h3', '', title), element('p', '', message));
  flow.replaceChildren(box);
  $('step-controls').hidden = false;
  $('step-prev').disabled = true;
  $('step-next').disabled = true;
  $('step-count').textContent = '— / —';
  outputCard.hidden = false;
}

function setOutput(value){
  const hasOutput = value.length > 0;
  $('output-state').textContent = hasOutput ? 'このSTEPまでの出力' : 'まだ出力されていません';
  $('output-value').textContent = hasOutput ? value : '—';
  outputCard.classList.toggle('has-output', hasOutput);
}

function showFinalSummary(state){
  $('summary-output').textContent = state ? state.output || '—' : '—';
  const values = $('summary-variables');
  values.replaceChildren();
  if(!state){ values.textContent = '—'; return; }
  if(!state.variables.length){ values.textContent = '—'; return; }
  values.append(...state.variables.map(([name, value]) =>
    element('span', 'summary-variable', `${name} = ${value}`)
  ));
}

function updateCursor(){
  const line = editor.getCursor().line;
  if(line === currentCursorLine) return;
  if(currentCursorLine >= 0 && currentCursorLine < editor.lineCount()){
    editor.removeLineClass(currentCursorLine, 'gutter', 'CodeMirror-activeline-gutter');
    editor.removeLineClass(currentCursorLine, 'background', 'CodeMirror-cursor-line');
  }
  currentCursorLine = line;
  editor.addLineClass(line, 'gutter', 'CodeMirror-activeline-gutter');
  if(line !== highlightedLine) editor.addLineClass(line, 'background', 'CodeMirror-cursor-line');
}

// 同じ行では実行位置の黄色を優先します。
function showExecutionLine(lineNumber){
  if(highlightedLine >= 0 && highlightedLine < editor.lineCount()){
    editor.removeLineClass(highlightedLine, 'background', 'CodeMirror-execution-line');
    editor.removeLineClass(highlightedLine, 'gutter', 'CodeMirror-execution-gutter');
    if(highlightedLine === currentCursorLine){
      editor.addLineClass(highlightedLine, 'background', 'CodeMirror-cursor-line');
    }
  }
  highlightedLine = lineNumber === null ? -1 : lineNumber - 1;
  if(highlightedLine < 0 || highlightedLine >= editor.lineCount()) return;
  if(highlightedLine === currentCursorLine){
    editor.removeLineClass(highlightedLine, 'background', 'CodeMirror-cursor-line');
  }
  editor.addLineClass(highlightedLine, 'background', 'CodeMirror-execution-line');
  editor.addLineClass(highlightedLine, 'gutter', 'CodeMirror-execution-gutter');
  editor.scrollIntoView({line:highlightedLine, ch:0}, 50);
}

function clearJumpableLines(){
  for(const line of jumpableLines){
    if(line < editor.lineCount()) editor.removeLineClass(line, 'gutter', 'CodeMirror-step-jump');
  }
  jumpableLines.clear();
}

function clearErrorLines(){
  for(const line of errorLines){
    if(line < editor.lineCount()) editor.removeLineClass(line, 'gutter', 'CodeMirror-error-gutter');
  }
  errorLines.clear();
}

function markErrorLines(warnings){
  clearErrorLines();
  for(const warning of warnings){
    const match = /^(\d+)行目：/.exec(warning);
    if(!match) continue;
    const line = Number(match[1]) - 1;
    if(line < 0 || line >= editor.lineCount() || errorLines.has(line)) continue;
    errorLines.add(line);
    editor.addLineClass(line, 'gutter', 'CodeMirror-error-gutter');
  }
}

function markJumpableLines(){
  clearJumpableLines();
  for(const step of currentSteps){
    const line = step.lineNo - 1;
    if(line < 0 || line >= editor.lineCount() || jumpableLines.has(line)) continue;
    jumpableLines.add(line);
    editor.addLineClass(line, 'gutter', 'CodeMirror-step-jump');
  }
}

function hasCurrentResult(){
  return finalState !== null && resultCode === editor.getValue();
}

function invalidateResult(){
  clearJumpableLines();
  clearErrorLines();
  currentSteps = [];
  finalState = null;
  resultCode = null;
  activeStep = -1;
  showFinalSummary(null);
  showExecutionLine(null);
  setOutput('');
  showIdle('更新を待っています', 'コードが変更されました。RUNで新しい結果を確認してください。');
  $('feedback').textContent = '再RUNが必要です。';
}

function decodeEngineExplanation(html){
  const node = document.createElement('div');
  node.innerHTML = html.replace(/<br\s*\/?\s*>/gi, '\n');
  return node.textContent.trim();
}

function renderValueChange(index){
  const change = element('div', 'value-card');
  change.append(element('strong', '', '値の変化'));
  const now = new Map(currentSteps[index].variablesAtStep);
  const before = new Map(index > 0 ? currentSteps[index - 1].variablesAtStep : []);
  const changes = [...now].filter(([name, value]) => before.get(name) !== value);
  if(!changes.length){
    change.append(element('span', 'value-card-empty', '変数の変化なし'));
    return change;
  }

  const boxes = element('div', 'scalar-boxes');
  for(const [name, value] of changes){
    const currentValue = value === '未初期化' ? '—' : value;
    const previousValue = before.has(name) && before.get(name) !== '未初期化'
      ? before.get(name) : '—';
    const variable = element('div', 'scalar-variable');
    variable.append(
      element('span', 'scalar-variable-name', name),
      element('span', 'scalar-variable-value', currentValue)
    );
    // 未代入の宣言だけは「— → —」と重複表示しません。
    if(before.has(name) || value !== '未初期化'){
      variable.append(element('span', 'scalar-variable-history', `${previousValue} → ${currentValue}`));
    }
    boxes.append(variable);
  }
  change.append(boxes);
  return change;
}

function renderStep(){
  if(!hasCurrentResult() || activeStep < 0) return;
  const step = currentSteps[activeStep];
  showExecutionLine(step.lineNo);
  const top = element('div', 'step-top');
  top.append(
    element('span', '', `STEP ${String(activeStep + 1).padStart(2, '0')} / ${currentSteps.length}`),
    element('span', '', `${step.lineNo} 行目`)
  );
  const track = element('div', 'step-track');
  const fill = element('span');
  fill.style.width = `${(activeStep + 1) / currentSteps.length * 100}%`;
  track.append(fill);
  const code = element('div', 'step-code');
  code.append(element('small', '', 'いま実行している行'), element('code', '', editor.getLine(step.lineNo - 1)));
  const explanation = element('div', 'flow-detail');
  explanation.append(
    element('small', '', 'コンピュータはいま何をしている？'),
    element('p', '', decodeEngineExplanation(step.text))
  );
  const change = renderValueChange(activeStep);
  const nextStep = currentSteps[activeStep + 1];
  const next = element('div', 'next-line');
  next.append(
    element('span', '', '次： '),
    element('strong', '', nextStep ? `${nextStep.lineNo}行目` : 'RESULT')
  );
  flow.replaceChildren(top, track, code, explanation, change, next);
  $('step-controls').hidden = false;
  $('step-prev').disabled = false;
  $('step-next').disabled = false;
  $('step-count').textContent = `${activeStep + 1} / ${currentSteps.length}`;
  outputCard.hidden = false;
  setOutput(step.outputAtStep);
  $('feedback').textContent = '';
}

function showResultPage(){
  if(!hasCurrentResult()) return;
  activeStep = -1;
  showExecutionLine(null);
  const result = element('div', 'result-state');
  result.append(element('span', 'result-label', 'RESULT'));
  result.append(element('output', 'result-value', finalState.output || '出力はまだありません'));
  const variables = element('div', 'result-variables');
  variables.append(element('span', 'result-variables-label', 'VARIABLES'));
  const values = element('div', 'result-variable-values');
  values.append(...finalState.variables.map(([name, value]) =>
    element('span', 'result-variable', `${name} = ${value}`)
  ));
  if(!finalState.variables.length) values.textContent = '変数はありません';
  variables.append(values);
  result.append(variables);
  const viewFlow = element('button', 'result-flow-button', '流れを見る →');
  viewFlow.type = 'button';
  viewFlow.addEventListener('click', () => { activeStep = 0; renderStep(); });
  result.append(viewFlow);
  flow.replaceChildren(result);
  $('step-controls').hidden = true;
  outputCard.hidden = true;
  $('feedback').textContent = '';
  flow.scrollIntoView({behavior:'auto', block:'start'});
}

function showFailure(result){
  const warnings = result.warningText.filter(Boolean);
  markErrorLines(warnings);
  if(!warnings.length) warnings.push('対応範囲で処理の流れを確認できませんでした。入力を見直してください。');
  const box = element('div', 'failure-state');
  box.append(element('h3', '', '確認が必要です'));
  for(const warning of warnings) box.append(element('p', '', warning));
  if(result.output) box.append(element('p', 'partial-output', `农止までの出力：${result.output}`));
  flow.replaceChildren(box);
  $('step-controls').hidden = true;
  outputCard.hidden = true;
  $('feedback').textContent = 'コードを修正して、もう一度RUNしてください。';
  flow.scrollIntoView({behavior:'auto', block:'start'});
}

function runCode(){
  clearJumpableLines();
  clearErrorLines();
  finalState = null;
  resultCode = null;
  activeStep = -1;
  showExecutionLine(null);
  showFinalSummary(null);
  const code = editor.getValue();
  $('codeInput').value = code;
  $('scanfInput').value = '';
  try{
    visualizeCode();
    const result = window.cVisualizerLiteResult;
    if(!result || result.hasWarnings || !result.steps.length){
      currentSteps = [];
      showFailure(result || { warningText:[], output:'' });
      return;
    }
    currentSteps = result.steps;
    finalState = {output:result.output, variables:result.variables};
    resultCode = code;
    showFinalSummary(finalState);
    markJumpableLines();
    showResultPage();
  }catch(error){
    currentSteps = [];
    showFailure({ warningText:['処理を表示できませんでした。コードを確認して、再RUNしてください。'], output:'' });
    console.error('Visualizer Lite RUN failed', error);
  }
}

editor.on('cursorActivity', updateCursor);
editor.on('change', () => {
  if(resultCode !== null || errorLines.size) invalidateResult();
  // 手入力に戻ったことだけを選択欄に反映します。
  if($('sample-select').value) $('sample-select').value = '';
});
editor.on('gutterClick', (_editor, line, gutter) => {
  if(gutter !== 'CodeMirror-linenumbers' || !hasCurrentResult()) return;
  const index = currentSteps.findIndex(step => step.lineNo === line + 1);
  if(index < 0) return;
  activeStep = index;
  renderStep();
});
$('sample-select').addEventListener('change', event => {
  const body = sampleBody[event.target.value];
  if(!body) return;
  const code = ['#include <stdio.h>', '', 'int main(void){', ...body.map(line => `    ${line}`), '    return 0;', '}'].join('\n');
  editor.setValue(code);
  event.target.value = Object.keys(sampleBody).find(key => sampleBody[key] === body);
});
$('visualize').addEventListener('click', runCode);
$('step-next').addEventListener('click', () => {
  if(!hasCurrentResult() || activeStep < 0) return;
  if(activeStep === currentSteps.length - 1) showResultPage();
  else { activeStep++; renderStep(); }
});
$('step-prev').addEventListener('click', () => {
  if(!hasCurrentResult() || activeStep < 0) return;
  if(activeStep === 0) showResultPage();
  else { activeStep--; renderStep(); }
});
updateCursor();
setOutput('');
showIdle('準備ができました', '左でCコードを書き、RUNで処理を確認してください。');
checkEditorAlignment();
window.addEventListener('load', checkEditorAlignment);
window.addEventListener('resize', checkEditorAlignment);
window.visualViewport?.addEventListener('resize', checkEditorAlignment);
document.fonts?.ready.then(checkEditorAlignment, checkEditorAlignment);
