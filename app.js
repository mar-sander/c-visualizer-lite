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

// 常時表示の選択肢はHTML側に置き、解除対象だけをID単位で追加します。
const UNLOCK_CODES = new Map([['getsample', 'samples']]);
const UNLOCK_KEY = 'c-visualizer-lite-unlocks-v1';
const UNLOCKED_OPTIONS = {
  samples:[
    ['add', '足し算'], ['sub', '引き算'], ['mul', '掛け算'],
    ['div', '割り算'], ['all', '四則演算まとめ'], ['precedence', '括弧と計算順序']
  ]
};
const unlockedIds = loadUnlocks();
const secretCodeDialog = $('secret-code-dialog');
const secretCodeInput = $('secret-code-input');

function loadUnlocks(){
  try{
    const raw = localStorage.getItem(UNLOCK_KEY);
    if(!raw) return new Set();
    const data = JSON.parse(raw);
    if(!data || data.version !== 1 || !Array.isArray(data.unlocked) ||
      !data.unlocked.every(id => typeof id === 'string' && id.length > 0)) return new Set();
    return new Set(data.unlocked);
  }catch(_error){
    return new Set();
  }
}

function persistUnlocks(){
  try{
    localStorage.setItem(UNLOCK_KEY, JSON.stringify({version:1, unlocked:[...unlockedIds]}));
  }catch(_error){
    // 保存できなくても、この画面での解除状態と主要機能は続行します。
  }
}

function renderUnlockedSamples(){
  const select = $('sample-select');
  for(const [id, options] of Object.entries(UNLOCKED_OPTIONS)){
    if(!unlockedIds.has(id)) continue;
    for(const [value, label] of options){
      if(!Array.from(select.options).some(option => option.value === value)){
        select.add(new Option(label, value));
      }
    }
  }
}

renderUnlockedSamples();
$('secret-code-open').addEventListener('click', () => {
  secretCodeInput.value = '';
  $('secret-code-error').hidden = true;
  secretCodeDialog.showModal();
  secretCodeInput.focus();
});
$('secret-code-form').addEventListener('submit', event => {
  event.preventDefault();
  const unlockId = UNLOCK_CODES.get(secretCodeInput.value.trim());
  if(!unlockId){
    $('secret-code-error').hidden = false;
    return;
  }
  unlockedIds.add(unlockId);
  persistUnlocks();
  renderUnlockedSamples();
  secretCodeInput.value = '';
  secretCodeDialog.close();
});
secretCodeDialog.addEventListener('click', event => {
  const rect = secretCodeDialog.getBoundingClientRect();
  const outside = event.clientX < rect.left || event.clientX > rect.right ||
    event.clientY < rect.top || event.clientY > rect.bottom;
  if(outside) secretCodeDialog.close();
});

let currentSteps = [];
let finalState = null;
let resultCode = null;
let activeStep = -1;
let currentCursorLine = -1;
let highlightedLine = -1;
const jumpableLines = new Set();
const errorLines = new Set();
let alignmentCheckPending = false;
let resultRevealPending = false;
let resultReveal = null;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// 表示専用の演出です。解析結果・履歴へ途中の文字列を戻しません。
function cancelResultReveal(){
  if(!resultReveal) return;
  clearTimeout(resultReveal.timer);
  resultReveal.node.replaceChildren(document.createTextNode(resultReveal.output));
  resultReveal = null;
}

function revealResult(node, output){
  if(!output || reducedMotion.matches) return;
  const characters = Array.from(output);
  const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-*/=<>#';
  // 長い出力も約600ms以内。左から最大5組に分け、各組を3回揺らして確定します。
  const groupSize = Math.max(1, Math.ceil(characters.length / 5));
  const finalText = element('span', 'result-reveal-final', output);
  const animatedText = element('span', 'result-reveal-text');
  animatedText.setAttribute('aria-hidden', 'true');
  node.replaceChildren(finalText, animatedText);
  const animation = {node, output, timer:null};
  resultReveal = animation;
  const started = performance.now();

  function update(){
    // 同一演出・同一画面だけを更新します。中断時も必ず正式な値へ戻します。
    if(resultReveal !== animation) return;
    if(!node.isConnected || !hasCurrentResult() || activeStep !== -1 || reducedMotion.matches){
      cancelResultReveal();
      return;
    }
    const fixedCount = Math.floor((performance.now() - started) / 120) * groupSize;
    if(fixedCount >= characters.length){
      cancelResultReveal();
      return;
    }
    const end = Math.min(fixedCount + groupSize, characters.length);
    animatedText.textContent = characters.slice(0, end).map((character, index) => {
      if(index < fixedCount || /\s/u.test(character)) return character;
      return glyphs[Math.floor(Math.random() * glyphs.length)];
    }).join('');
    animation.timer = setTimeout(update, 40);
  }
  update();
}

reducedMotion.addEventListener('change', event => {
  if(event.matches) cancelResultReveal();
});

const HISTORY_KEY = 'c-visualizer-lite-history-v1';
const HISTORY_LIMIT = 20;
const historyDialog = $('history-dialog');
let historyEntries = loadHistory();
let selectedHistoryId = null;

function loadHistory(){
  try{
    const raw = localStorage.getItem(HISTORY_KEY);
    if(!raw) return [];
    const data = JSON.parse(raw);
    if(data.version !== 1 || !Array.isArray(data.entries)) return [];
    // 壊れたデータを画面やエディタへ渡さないよう、必要な項目だけを検査します。
    return data.entries.filter(entry =>
      entry && typeof entry.id === 'string' && typeof entry.timestamp === 'string' &&
      !Number.isNaN(Date.parse(entry.timestamp)) && typeof entry.code === 'string' &&
      ['result', 'check'].includes(entry.kind) && typeof entry.output === 'string' &&
      Array.isArray(entry.variables) && entry.variables.every(pair =>
        Array.isArray(pair) && pair.length === 2 && pair.every(value => typeof value === 'string')) &&
      Array.isArray(entry.warnings) && entry.warnings.every(value => typeof value === 'string')
    ).slice(0, HISTORY_LIMIT);
  }catch(_error){
    return [];
  }
}

function persistHistory(){
  try{
    localStorage.setItem(HISTORY_KEY, JSON.stringify({version:1, entries:historyEntries}));
  }catch(_error){
    // 保存が使えなくてもRUNや現在の表示は続行します。
  }
}

function saveHistory(code, kind, result, warnings = []){
  try{
    // 解析結果の可変配列を参照せず、保存時点の値だけを独立させます。
    const snapshot = JSON.parse(JSON.stringify({
      code,
      kind,
      output:typeof result?.output === 'string' ? result.output : '',
      variables:Array.isArray(result?.variables) ? result.variables : [],
      warnings
    }));
    const previous = historyEntries[0];
    const same = previous && ['code', 'kind', 'output', 'variables', 'warnings'].every(key =>
      JSON.stringify(previous[key]) === JSON.stringify(snapshot[key]));
    if(same){
      previous.timestamp = new Date().toISOString();
    }else{
      historyEntries.unshift({
        id:crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp:new Date().toISOString(),
        ...snapshot
      });
      historyEntries.length = Math.min(historyEntries.length, HISTORY_LIMIT);
    }
    persistHistory();
  }catch(_error){
    // 履歴用データが想定外でも解析結果へ影響させません。
  }
}

function historyDate(timestamp){
  const date = new Date(timestamp);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderHistory(){
  const empty = !historyEntries.length;
  $('history-empty').hidden = !empty;
  $('history-content').hidden = empty;
  if(empty) selectedHistoryId = null;
  else if(!historyEntries.some(entry => entry.id === selectedHistoryId)){
    selectedHistoryId = historyEntries[0].id;
  }

  const list = $('history-list');
  list.replaceChildren();
  for(const entry of historyEntries){
    const button = element('button', 'challenge-history-item');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(entry.id === selectedHistoryId));
    const preview = entry.code.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 2).join(' / ');
    button.append(
      element('span', 'history-item-meta', `${historyDate(entry.timestamp)} · ${entry.kind === 'result' ? 'RESULT' : '確認あり'}`),
      element('span', 'history-preview', preview || '（空のコード）')
    );
    button.addEventListener('click', () => { selectedHistoryId = entry.id; renderHistory(); });
    list.append(button);
  }

  const detail = $('history-detail');
  detail.replaceChildren();
  if(empty) return;
  const entry = historyEntries.find(item => item.id === selectedHistoryId);
  detail.append(element('h3', '', `${entry.kind === 'result' ? 'RESULT' : '確認あり'} · ${historyDate(entry.timestamp)}`));
  detail.append(element('h4', '', 'コード'), element('pre', 'history-code', entry.code));
  if(entry.kind === 'check'){
    detail.append(element('h4', '', '確認メッセージ'));
    for(const warning of entry.warnings) detail.append(element('p', 'history-warning', warning));
  }
  if(entry.kind === 'result' || entry.output){
    detail.append(element('h4', '', '出力'), element('pre', 'history-output', entry.output || '出力はありません'));
  }
  if(entry.kind === 'result' || entry.variables.length){
    detail.append(element('h4', '', '最終変数状態'));
    const values = element('div', 'history-variables');
    values.textContent = entry.variables.length ? '' : '変数はありません';
    for(const [name, value] of entry.variables){
      values.append(element('span', 'history-variable', `${name} = ${value}`));
    }
    detail.append(values);
  }
  const actions = element('div', 'history-detail-actions');
  const restore = element('button', 'history-action history-restore', 'このコードに戻す');
  restore.type = 'button';
  restore.addEventListener('click', () => {
    editor.setValue(entry.code);
    $('sample-select').value = '';
    invalidateResult();
    $('feedback').textContent = 'コードを戻しました。RUNで確認してください。';
    historyDialog.close();
    editor.focus();
  });
  const remove = element('button', 'history-action', '1件削除');
  remove.type = 'button';
  remove.addEventListener('click', () => {
    historyEntries = historyEntries.filter(item => item.id !== entry.id);
    selectedHistoryId = null;
    persistHistory();
    renderHistory();
    (historyEntries.length ? $('history-list').firstElementChild : $('history-close')).focus();
  });
  actions.append(restore, remove);
  detail.append(actions);
}

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
  cancelResultReveal();
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
  cancelResultReveal();
  resultRevealPending = false;
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
  cancelResultReveal();
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
  code.append(element('code', '', editor.getLine(step.lineNo - 1)));
  const explanation = element('div', 'flow-detail');
  explanation.append(
    element('small', '', 'コードは何をしてる？'),
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
  cancelResultReveal();
  const shouldReveal = resultRevealPending;
  resultRevealPending = false;
  activeStep = -1;
  showExecutionLine(null);
  const result = element('div', 'result-state');
  result.append(element('span', 'result-label', 'RESULT'));
  const resultValue = element('output', 'result-value', finalState.output || '出力はまだありません');
  result.append(resultValue);
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
  if(shouldReveal) revealResult(resultValue, finalState.output);
}

function showFailure(result){
  cancelResultReveal();
  const warnings = (result.warningText || []).filter(Boolean);
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
  return warnings;
}

function runCode(){
  cancelResultReveal();
  resultRevealPending = false;
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
      const failed = result || { warningText:[], output:'' };
      const warnings = showFailure(failed);
      saveHistory(code, 'check', failed, warnings);
      return;
    }
    currentSteps = result.steps;
    finalState = {output:result.output, variables:result.variables};
    resultCode = code;
    showFinalSummary(finalState);
    markJumpableLines();
    resultRevealPending = true;
    showResultPage();
    saveHistory(code, 'result', result);
  }catch(error){
    currentSteps = [];
    const failed = { warningText:['処理を表示できませんでした。コードを確認して、再RUNしてください。'], output:'' };
    const warnings = showFailure(failed);
    saveHistory(code, 'check', failed, warnings);
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
$('history-open').addEventListener('click', () => {
  renderHistory();
  historyDialog.showModal();
});
$('history-close').addEventListener('click', () => historyDialog.close());
historyDialog.addEventListener('click', event => {
  const rect = historyDialog.getBoundingClientRect();
  const outside = event.clientX < rect.left || event.clientX > rect.right ||
    event.clientY < rect.top || event.clientY > rect.bottom;
  if(outside) historyDialog.close();
});
$('history-clear').addEventListener('click', () => {
  if(!window.confirm('すべての履歴を削除しますか？')) return;
  historyEntries = [];
  selectedHistoryId = null;
  persistHistory();
  renderHistory();
  $('history-close').focus();
});
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
