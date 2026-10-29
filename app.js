// UI LABの操作を、正式版の解析結果へ接続するLite専用画面です。
const $ = id => document.getElementById(id);
const flow = $('flow-content');
const outputCard = document.querySelector('.output-card');
const editorFrame = document.querySelector('.editor-frame');
const runErrorFlash = $('run-error-flash');
const editor = CodeMirror.fromTextArea($('code-input'), {
  mode:'text/x-csrc',
  inputStyle:'textarea',
  lineNumbers:true,
  matchBrackets:true,
  tabSize:4,
  indentUnit:4,
  gutters:['CodeMirror-linenumbers']
});

// textarea方式の選択文字は通常のDOM選択では着色できないため、
// 選択範囲だけを表示用マークで覆います。値やundo履歴は変更しません。
let selectionTextMarks = [];
editor.on('cursorActivity', () => {
  editor.operation(() => {
    selectionTextMarks.forEach(mark => mark.clear());
    selectionTextMarks = editor.listSelections()
      .filter(range => !range.empty())
      .map(range => editor.markText(range.from(), range.to(), {
        className:'cm-selection-text',
        addToHistory:false
      }));
  });
});

// CODE欄だけを拡大する。解析結果・FLOW・入力データ・undo履歴は変更しない。
// 未設定ならPC 14px／小画面 12pxの既存CSSをそのまま使用する。
const EDITOR_FONT_STORAGE_KEY = 'c-visualizer-lite:editor-font-size:v1';
const EDITOR_FONT_MIN = 12;
const EDITOR_FONT_MAX = 26;
const EDITOR_FONT_STEP = 2;
const editorFontDecrease = $('editor-font-decrease');
const editorFontReset = $('editor-font-reset');
const editorFontIncrease = $('editor-font-increase');
const editorFontWrapper = editor.getWrapperElement();

function readEditorFontSize(){
  return Math.round(Number.parseFloat(window.getComputedStyle(editorFontWrapper).fontSize));
}

function updateEditorFontControls(){
  const size = readEditorFontSize();
  editorFontReset.textContent = `${size}px`;
  editorFontDecrease.disabled = size <= EDITOR_FONT_MIN;
  editorFontIncrease.disabled = size >= EDITOR_FONT_MAX;
}

function setEditorFontSize(size, persist = true){
  if(size === null){
    editorFontWrapper.style.removeProperty('font-size');
  }else{
    editorFontWrapper.style.fontSize = `${size}px`;
  }
  // サイズ変更後にCodeMirrorの行高・ガター・カーソル位置を再測定。
  editor.refresh();
  updateEditorFontControls();
  if(persist){
    try{
      if(size === null) window.localStorage.removeItem(EDITOR_FONT_STORAGE_KEY);
      else window.localStorage.setItem(EDITOR_FONT_STORAGE_KEY, String(size));
    }catch(_error){ /* 保存を許可しないブラウザでも調整機能は利用できる。 */ }
  }
}

function adjustEditorFontSize(delta){
  const current = readEditorFontSize();
  const next = Math.max(EDITOR_FONT_MIN, Math.min(EDITOR_FONT_MAX, current + delta));
  if(next !== current) setEditorFontSize(next);
}

editorFontDecrease.addEventListener('click', () => adjustEditorFontSize(-EDITOR_FONT_STEP));
editorFontIncrease.addEventListener('click', () => adjustEditorFontSize(EDITOR_FONT_STEP));
editorFontReset.addEventListener('click', () => setEditorFontSize(null));
try{
  const stored = window.localStorage.getItem(EDITOR_FONT_STORAGE_KEY);
  if(stored !== null){
    const value = Number(stored);
    if(Number.isInteger(value) && value >= EDITOR_FONT_MIN && value <= EDITOR_FONT_MAX && value % 2 === 0){
      setEditorFontSize(value, false);
    }
  }
}catch(_error){ /* localStorageが利用できなければ既存CSSの初期サイズを使う。 */ }
updateEditorFontControls();

// 標準サイズは画面幅に応じて変わるため、表示とCodeMirror計測も追従する。
window.matchMedia('(max-width: 600px)').addEventListener('change', () => {
  editor.refresh();
  updateEditorFontControls();
});

const editorLightToggle = $('editor-light-toggle');
editorLightToggle.addEventListener('click', () => {
  const isLight = editorFrame.classList.toggle('is-light');
  editorLightToggle.setAttribute('aria-checked', String(isLight));
});

const sampleBody = {
  add:['int a = 10;', 'int b = 3;', 'int c = a + b;', 'printf("%d\\n", c);'],
  sub:['int a = 10;', 'int b = 3;', 'int c = a - b;', 'printf("%d\\n", c);'],
  mul:['int a = 10;', 'int b = 3;', 'int c = a * b;', 'printf("%d\\n", c);'],
  div:['int a = 7;', 'int b = 2;', 'int c = a / b;', 'printf("%d\\n", c);'],
  all:['int a = 10;', 'int b = 3;', 'int add = a + b;', 'int sub = a - b;', 'int mul = a * b;', 'int div = a / b;', 'printf("%d %d %d %d\\n", add, sub, mul, div);'],
  precedence:['int x = 2 + 3 * 4;', 'int y = (2 + 3) * 4;', 'printf("%d %d\\n", x, y);'],
  scanfTwo:[
    'int a, b;',
    'int sum;',
    '',
    'printf("1つ目の数は？ ");',
    'scanf("%d", &a);',
    'printf("2つ目の数は？ ");',
    'scanf("%d", &b);',
    '',
    'sum = a + b;',
    'printf("合計は%dです\\n", sum);',
    ''
  ],
  ifBasic:[
    'int x = 8;',
    '',
    'if(x > 5){',
    '    printf("5より大きいです\\n");',
    '}',
    '',
    'printf("判定終了\\n");'
  ],
  ifElse:[
    'int score = 75;',
    '',
    'if(score >= 60){',
    '    printf("合格です\\n");',
    '}else{',
    '    printf("不合格です\\n");',
    '}',
    ''
  ],
  scanfIf:[
    'int score;',
    '',
    'printf("点数を入力してください: ");',
    'scanf("%d", &score);',
    '',
    'if(score >= 60){',
    '    printf("合格です\\n");',
    '}else{',
    '    printf("不合格です\\n");',
    '}',
    ''
  ]
};

// 常時表示の選択肢はHTML側に置き、解除対象だけをID単位で追加します。
const UNLOCK_CODES = new Map([['getsample', 'samples']]);
const UNLOCK_KEY = 'c-visualizer-lite-unlocks-v1';
const UNLOCKED_OPTIONS = {
  samples:[
    ['add', '足し算'], ['sub', '引き算'], ['mul', '掛け算'],
    ['div', '割り算'], ['all', '四則演算まとめ'], ['precedence', '括弧と計算順序'],
    ['scanfTwo', '2つの数を入力する'], ['ifBasic', 'if文の基本'],
    ['ifElse', 'if〜else文'], ['scanfIf', '入力して条件判定']
  ]
};
const UNLOCK_LABELS = {
  samples:'SAMPLE UNLOCKED'
};
const unlockedIds = loadUnlocks();
const secretCodeDialog = $('secret-code-dialog');
const secretCodeInput = $('secret-code-input');
const secretCodeSuccess = $('secret-code-success');
let unlockFeedbackTimer = 0;

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

function resetUnlockFeedback(){
  clearTimeout(unlockFeedbackTimer);
  unlockFeedbackTimer = 0;
  secretCodeDialog.classList.remove('is-unlocking');
  secretCodeSuccess.hidden = true;
  $('secret-code-form').removeAttribute('aria-hidden');
}

function showUnlockFeedback(unlockId){
  $('secret-code-success-text').textContent = UNLOCK_LABELS[unlockId] || 'UNLOCKED';
  secretCodeSuccess.hidden = false;
  $('secret-code-form').setAttribute('aria-hidden', 'true');
  secretCodeDialog.classList.add('is-unlocking');
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 350 : 800;
  unlockFeedbackTimer = window.setTimeout(() => {
    secretCodeDialog.close();
  }, duration);
}

renderUnlockedSamples();
$('secret-code-open').addEventListener('click', () => {
  resetUnlockFeedback();
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
  // 正しいSECRET CODEなら、解放済みでも成功演出を毎回再生する。
  showUnlockFeedback(unlockId);
});
secretCodeDialog.addEventListener('click', event => {
  // Enterキーの送信クリックを背景タップと誤判定しないようにします。
  if(event.target !== secretCodeDialog) return;
  const rect = secretCodeDialog.getBoundingClientRect();
  const outside = event.clientX < rect.left || event.clientX > rect.right ||
    event.clientY < rect.top || event.clientY > rect.bottom;
  if(outside) secretCodeDialog.close();
});
secretCodeDialog.addEventListener('close', resetUnlockFeedback);

let currentSteps = [];
let finalState = null;
let resultCode = null;
let resultScanfInput = null;
let resultInputDirty = false;
let waitingCode = null;
let activeStep = -1;
let currentCursorLine = -1;
let highlightedLine = -1;
const jumpableLines = new Set();
const errorLines = new Set();
let alignmentCheckPending = false;
let resultRevealPending = false;
let resultReveal = null;
let runSuccessFeedbackTimer = 0;
let pendingRunSuccess = null;
let runErrorFeedbackTimer = 0;
let inputInjectionTimer = 0;
let pendingInputInjection = null;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const scanfInput = $('scanfInput');
const inputSubmit = $('input-submit');
const scanfAccordion = $('scanf-accordion');
const scanfAccordionToggle = $('scanf-accordion-toggle');
const scanfAccordionBody = $('scanf-accordion-body');

function setScanfAccordionOpen(expanded, prompt = false){
  const wasOpen = scanfAccordion.classList.contains('is-open');
  scanfAccordion.classList.toggle('is-open', expanded);
  scanfAccordionToggle.setAttribute('aria-expanded', String(expanded));
  scanfAccordionBody.setAttribute('aria-hidden', String(!expanded));
  scanfAccordionBody.toggleAttribute('inert', !expanded);
  if(!expanded) scanfAccordion.classList.remove('is-prompted');
  if(prompt && expanded && !wasOpen && !reducedMotion.matches){
    scanfAccordion.classList.add('is-prompted');
  }
}

scanfAccordionToggle.addEventListener('click', () => {
  setScanfAccordionOpen(!scanfAccordion.classList.contains('is-open'));
});
scanfAccordion.addEventListener('animationend', () => {
  scanfAccordion.classList.remove('is-prompted');
});

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

// RUN成功時の視覚演出だけを担当します。解析結果や履歴データには影響させません。
function clearRunSuccessFeedback(){
  clearTimeout(runSuccessFeedbackTimer);
  runSuccessFeedbackTimer = 0;
  pendingRunSuccess = null;
  editorFrame.classList.remove('is-run-success');
}

function playRunSuccessFeedback(onComplete){
  clearRunSuccessFeedback();
  const pending = {onComplete};
  pendingRunSuccess = pending;
  // 同じコードを連続RUNした場合も、reduced-motionの静的通知も毎回再表示します。
  void editorFrame.offsetWidth;
  editorFrame.classList.add('is-run-success');
  runSuccessFeedbackTimer = window.setTimeout(() => {
    // 編集や次のRUNで破棄された演出から、古いRESULTを表示しません。
    if(pendingRunSuccess !== pending) return;
    clearRunSuccessFeedback();
    onComplete();
  }, reducedMotion.matches ? 240 : 700);
}

// INPUT専用の表示処理です。解析値は持たず、終了時の画面反映だけを予約します。
function clearInputInjection(){
  clearTimeout(inputInjectionTimer);
  inputInjectionTimer = 0;
  if(pendingInputInjection){
    pendingInputInjection.packet?.remove();
    pendingInputInjection.surface?.remove();
  }
  pendingInputInjection = null;
  inputSubmit.disabled = false;
  inputSubmit.removeAttribute('aria-busy');
  inputSubmit.classList.remove('is-input-igniting');
  editorFrame.classList.remove('is-input-injecting', 'is-input-reduced');
  editorFrame.style.removeProperty('--input-injection-delay');
}

function hideInputTransfer(){
  // スクロールやリサイズ後に、以前の画面座標を使った光を残しません。
  pendingInputInjection?.packet?.remove();
}
window.addEventListener('scroll', hideInputTransfer, {capture:true, passive:true});
window.addEventListener('resize', hideInputTransfer);

function playInputInjection(onComplete){
  clearInputInjection();
  const pending = {onComplete, packet:null, surface:null};
  pendingInputInjection = pending;
  inputSubmit.disabled = true;
  inputSubmit.setAttribute('aria-busy', 'true');
  const source = inputSubmit.getBoundingClientRect();
  const target = editorFrame.getBoundingClientRect();
  const startX = source.left + source.width / 2;
  const startY = source.top - 3;
  const endX = Math.min(target.right - 12, Math.max(target.left + 12, startX));
  const endY = target.bottom - 3;
  const centerY = target.top + target.height / 2;
  const canTransfer = source.width > 0 && target.width > 24 && target.height > 0 &&
    startX >= 0 && startX <= window.innerWidth && startY >= 0 && startY <= window.innerHeight &&
    endX >= 0 && endX <= window.innerWidth && endY >= 0 && endY <= window.innerHeight &&
    centerY >= 0 && centerY <= window.innerHeight &&
    Math.hypot(endX - startX, endY - startY) < window.innerHeight * .8;
  const duration = reducedMotion.matches ? 240 : canTransfer ? 900 : 540;
  editorFrame.style.setProperty('--input-injection-delay', canTransfer ? '400ms' : '60ms');

  if(!reducedMotion.matches){
    const surface = element('div', 'input-injection-surface');
    surface.setAttribute('aria-hidden', 'true');
    surface.style.setProperty('--input-half-width', `${target.width / 2}px`);
    surface.style.setProperty('--input-half-height', `${target.height / 2}px`);
    for(const side of ['top', 'right', 'bottom', 'left']){
      surface.append(element('span', `input-injection-ray input-injection-${side}`));
    }
    editorFrame.append(surface);
    pending.surface = surface;
    if(canTransfer){
      const packet = element('div', 'input-transfer');
      packet.setAttribute('aria-hidden', 'true');
      packet.style.left = `${startX}px`;
      packet.style.top = `${startY}px`;
      packet.style.setProperty('--input-dx', `${endX - startX}px`);
      packet.style.setProperty('--input-dy', `${endY - startY}px`);
      packet.style.setProperty('--input-angle', `${Math.atan2(endY - startY, endX - startX)}rad`);
      document.body.append(packet);
      pending.packet = packet;
    }
  }
  void inputSubmit.offsetWidth;
  inputSubmit.classList.add('is-input-igniting');
  editorFrame.classList.add('is-input-injecting');
  editorFrame.classList.toggle('is-input-reduced', reducedMotion.matches);
  inputInjectionTimer = window.setTimeout(() => {
    if(pendingInputInjection !== pending) return;
    clearInputInjection();
    onComplete();
  }, duration);
}

function clearRunErrorFeedback(){
  clearTimeout(runErrorFeedbackTimer);
  runErrorFeedbackTimer = 0;
  runErrorFlash.classList.remove('is-visible');
}

function playRunErrorFeedback(){
  clearRunErrorFeedback();
  // reduced-motionでも「ERROR」という状態通知自体は残し、動きだけ止めます。
  void runErrorFlash.offsetWidth;
  runErrorFlash.classList.add('is-visible');
  runErrorFeedbackTimer = window.setTimeout(
    clearRunErrorFeedback,
    reducedMotion.matches ? 420 : 720
  );
}

reducedMotion.addEventListener('change', event => {
  if(event.matches) cancelResultReveal();
  if(pendingRunSuccess) playRunSuccessFeedback(pendingRunSuccess.onComplete);
  if(pendingInputInjection) playInputInjection(pendingInputInjection.onComplete);
});

const HISTORY_KEY = 'c-visualizer-lite-history-v1';
const HISTORY_LIMIT = 50;
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

function persistHistory(entries = historyEntries){
  try{
    localStorage.setItem(HISTORY_KEY, JSON.stringify({version:1, entries}));
    return true;
  }catch(_error){
    // 保存が使えなくてもRUNや現在の表示は続行します。
    return false;
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

// L-HISTORY-IO1: 外部ファイルは値を実行せず、検証した履歴項目だけを取り込む。
const HISTORY_FILE_FORMAT = 'c-code-visualizer-lite-history';
const HISTORY_FILE_VERSION = 1;
const HISTORY_MAX_FILE_BYTES = 1024 * 1024;
const historyExport = $('history-export');
const historyImport = $('history-import');
const historyImportFile = $('history-import-file');
const historyTransferStatus = $('history-transfer-status');

function historyTransferMessage(message, isError = false){
  historyTransferStatus.hidden = !message;
  historyTransferStatus.textContent = message;
  historyTransferStatus.dataset.state = isError ? 'error' : 'ok';
}

function isValidImportedHistoryEntry(entry){
  return entry && typeof entry === 'object' && !Array.isArray(entry) &&
    typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 200 &&
    typeof entry.timestamp === 'string' && !Number.isNaN(Date.parse(entry.timestamp)) &&
    typeof entry.code === 'string' && entry.code.length <= 60000 &&
    ['result', 'check'].includes(entry.kind) &&
    typeof entry.output === 'string' && entry.output.length <= 60000 &&
    Array.isArray(entry.variables) && entry.variables.length <= 200 && entry.variables.every(pair =>
      Array.isArray(pair) && pair.length === 2 && pair.every(value =>
        typeof value === 'string' && value.length <= 10000)) &&
    Array.isArray(entry.warnings) && entry.warnings.length <= 100 && entry.warnings.every(value =>
      typeof value === 'string' && value.length <= 10000);
}

function parseHistoryImport(text){
  const data = JSON.parse(text);
  const isArchive = data && data.format === HISTORY_FILE_FORMAT;
  const isLegacy = data && data.format === undefined;
  if(!data || typeof data !== 'object' || Array.isArray(data) ||
    (!isArchive && !isLegacy) || data.version !== HISTORY_FILE_VERSION ||
    !Array.isArray(data.entries) || data.entries.length > 100 ||
    !data.entries.every(isValidImportedHistoryEntry)){
    throw new Error('対応していない履歴形式、または不正なデータです。');
  }
  // prototypeを含む未知のプロパティは捨て、表示対象の文字列と配列だけを複製する。
  return data.entries.map(entry => ({
    id:entry.id, timestamp:entry.timestamp, code:entry.code,
    kind:entry.kind, output:entry.output,
    variables:entry.variables.map(pair => [pair[0],pair[1]]),
    warnings:[...entry.warnings]
  }));
}

function historyEntriesEqual(a, b){
  return a.timestamp === b.timestamp &&
    ['code','kind','output','variables','warnings'].every(key =>
      JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

function mergeHistoryImport(imported){
  const combined = [...historyEntries];
  let added = 0;
  for(const entry of imported){
    if(combined.some(existing => historyEntriesEqual(existing, entry))) continue;
    const copy = {...entry};
    if(combined.some(existing => existing.id === copy.id)){
      copy.id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    combined.push(copy);
    added++;
  }
  // RUN日時順にする。既存と同時刻なら既存の並びを保つ（安定ソート）。
  combined.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return {all:combined, kept:combined.slice(0,HISTORY_LIMIT),
    omitted:Math.max(0,combined.length - HISTORY_LIMIT), added};
}

historyExport.addEventListener('click', () => {
  if(!historyEntries.length) return;
  try{
    const archive = {
      format:HISTORY_FILE_FORMAT, version:HISTORY_FILE_VERSION,
      exportedAt:new Date().toISOString(), entries:historyEntries
    };
    const blob = new Blob([JSON.stringify(archive,null,2)],{type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const date = new Date();
    const pad = n => String(n).padStart(2,'0');
    const filename = `C_Code_Visualizer_Lite_History_${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.json`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url),2000);
    historyTransferMessage(`${historyEntries.length}件の履歴を書き出しました。初期化されない保存先へ移してください。`);
  }catch(_error){
    historyTransferMessage('ファイルを書き出せませんでした。ブラウザのダウンロード設定を確認してください。',true);
  }
});

historyImport.addEventListener('click', () => historyImportFile.click());
historyImportFile.addEventListener('change', async () => {
  const file = historyImportFile.files?.[0];
  historyImportFile.value = ''; // 同じファイルの再選択も可能にする。
  if(!file) return;
  if(file.size > HISTORY_MAX_FILE_BYTES){
    historyTransferMessage('ファイルが大きすぎます（上限1MB）。読み込みを中止しました。',true);
    return;
  }
  try{
    const imported = parseHistoryImport(await file.text());
    if(!imported.length){
      historyTransferMessage('履歴0件のファイルです。現在の履歴は変更していません。');
      return;
    }
    const merged = mergeHistoryImport(imported);
    if(!merged.added){
      historyTransferMessage('すべて読み込み済みです。履歴は変更していません。');
      return;
    }
    if(merged.omitted && !window.confirm(
      `履歴は最大${HISTORY_LIMIT}件です。統合後、古い${merged.omitted}件が一覧から外れます。続けますか？`)){
      historyTransferMessage('読み込みを取り消しました。履歴は変更していません。');
      return;
    }
    // 保存が失敗した場合、現在の履歴は変更しない（部分読み込み禁止）。
    if(!persistHistory(merged.kept)){
      historyTransferMessage('ブラウザへ履歴を保存できませんでした。現在の履歴は変更していません。',true);
      return;
    }
    historyEntries = merged.kept;
    selectedHistoryId = null;
    renderHistory();
    historyTransferMessage(`読み込み完了：新規${merged.added}件、現在${historyEntries.length}件${merged.omitted ? `（古い${merged.omitted}件を整理）` : ''}。コードは自動実行されません。`);
  }catch(error){
    historyTransferMessage(error instanceof SyntaxError ?
      'JSONの形式が正しくありません。履歴は変更していません。' :
      '履歴を読み込めませんでした。ファイルの形式を確認してください。既存履歴は変更していません。',true);
  }
});

function historyDate(timestamp){
  const date = new Date(timestamp);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderHistory(){
  const empty = !historyEntries.length;
  $('history-empty').hidden = !empty;
  $('history-content').hidden = empty;
  historyExport.disabled = empty;
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
    scanfInput.value = '';
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
    if(line >= editor.lineCount()) continue;
    editor.removeLineClass(line, 'gutter', 'CodeMirror-error-gutter');
    editor.removeLineClass(line, 'background', 'CodeMirror-error-line');
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
    editor.addLineClass(line, 'background', 'CodeMirror-error-line');
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
  return !resultInputDirty && finalState !== null && resultCode === editor.getValue() &&
    resultScanfInput === scanfInput.value;
}

function invalidateResult(message = 'コードが変更されました。RUNで新しい結果を確認してください。'){
  cancelResultReveal();
  clearRunSuccessFeedback();
  clearInputInjection();
  resultRevealPending = false;
  clearJumpableLines();
  clearErrorLines();
  currentSteps = [];
  finalState = null;
  resultCode = null;
  resultScanfInput = null;
  resultInputDirty = false;
  waitingCode = null;
  activeStep = -1;
  showFinalSummary(null);
  showExecutionLine(null);
  setOutput('');
  showIdle('更新を待っています', message);
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

function renderDecisionStep(decision){
  const card = element('div', 'decision-card');
  if(decision.depth === 2){
    card.append(element('div', 'decision-context', 'NESTED IF · 2段目'));
  }
  const evaluation = element('div', 'decision-evaluation');
  const values = decision.comparison
    ? `${decision.comparison.left.display} ${decision.comparison.operator} ${decision.comparison.right.display}`
    : `${decision.condition} → ${decision.evaluatedDisplay}`;
  const outcome = element('span', 'decision-outcome', decision.result ? '成立' : '不成立');
  outcome.append(element('small', '', decision.result ? 'TRUE' : 'FALSE'));
  evaluation.append(element('span', 'decision-values', values), outcome);

  const paths = element('div', 'decision-paths');
  if(decision.chainIndex !== undefined){
    const label = decision.branchKind === 'else-if' ? 'ELSE IF' : 'IF';
    paths.append(element('span', decision.result ? 'decision-path is-selected' : 'decision-path is-skipped',
      `${label} · ${decision.result ? '選択' : '通らない'}`));
    if(decision.selected === 'next'){
      paths.append(element('span', 'decision-path', '次の条件へ進む'));
    }else if(decision.selected === 'else'){
      paths.append(element('span', 'decision-path is-selected', 'ELSE · 選択'));
    }else if(!decision.result){
      paths.append(element('span', 'decision-path', '分岐を選択せず次へ'));
    }else{
      paths.append(element('span', 'decision-path', 'この分岐を選択・残りの条件は評価しない'));
    }
    card.append(evaluation, paths);
    return card;
  }
  paths.append(element('span', decision.selected === 'if' ? 'decision-path is-selected' : 'decision-path is-skipped',
    `IF · ${decision.selected === 'if' ? '選択' : '通らない'}`));
  if(decision.selected === 'else' || decision.skipped === 'else'){
    paths.append(element('span', decision.selected === 'else' ? 'decision-path is-selected' : 'decision-path is-skipped',
      `ELSE · ${decision.selected === 'else' ? '選択' : '通らない'}`));
  }
  card.append(evaluation, paths);
  return card;
}

// forの条件をLite固有のFLOWカードで表示。値はエンジンの判定済みmetadataだけを使用します。
function renderForDecisionStep(decision){
  const card = element('div', 'decision-card for-decision-card');
  const heading = decision.depth > 1 ? `${decision.label} · ${decision.iteration}回目の条件` : `FOR · ${decision.iteration}回目の条件`;
  card.append(element('div', 'decision-context', heading));
  const evaluation = element('div', 'decision-evaluation');
  const display = decision.comparison
    ? `${decision.comparison.left.display} ${decision.comparison.operator} ${decision.comparison.right.display}`
    : `${decision.condition} → ${decision.evaluatedDisplay}`;
  const outcome = element('span', 'decision-outcome', decision.result ? '成立' : '不成立');
  outcome.append(element('small', '', decision.result ? 'TRUE' : 'FALSE'));
  evaluation.append(element('span', 'decision-values', display), outcome);
  const paths = element('div', 'decision-paths');
  const next = decision.nextAction === 'limit' ? '安全上限で停止'
    : decision.result ? '本体へ進む' : 'ループを終了';
  paths.append(element('span', 'decision-path is-selected', next));
  card.append(evaluation, paths);
  return card;
}

// whileの値・序数・進行先は、実行器が記録した判定をそのまま表示します。
function renderWhileDecisionStep(decision){
  const card = element('div', 'decision-card while-decision-card');
  card.append(element('div', 'decision-context', `WHILE CONDITION · ${decision.iteration}回目の条件 · ${decision.headerLineNo}行目`));
  const evaluation = element('div', 'decision-evaluation');
  const display = decision.comparison
    ? `${decision.comparison.left.display} ${decision.comparison.operator} ${decision.comparison.right.display}`
    : `${decision.condition} → ${decision.evaluatedDisplay}`;
  const outcome = element('span', 'decision-outcome', decision.result ? '成立' : '不成立');
  outcome.append(element('small', '', decision.result ? 'TRUE' : 'FALSE'));
  evaluation.append(element('span', 'decision-values', display), outcome);
  const paths = element('div', 'decision-paths');
  const next = decision.nextAction === 'limit' ? '安全上限に達したため停止'
    : decision.result ? '条件が成立→本文へ' : '不成立→ループ終了';
  paths.append(element('span', 'decision-path is-selected', next));
  card.append(evaluation, paths);
  return card;
}

function describeDecisionPurpose(decision){
  const variableName = /^[A-Za-z_]\w*$/;
  const context = decision.depth === 2 ? '外側の分岐の中で、' : '';
  const action = decision.depth === 2 ? 'さらに調べ' : '調べ';
  if(!decision.comparison){
    const condition = decision.condition.trim();
    const subject = variableName.test(condition) ? `${condition} の値` : `条件式 ${condition}`;
    return `${context}${subject}が0ではないかを${action}、進む処理を決めています。`;
  }

  const {left, operator, right} = decision.comparison;
  const meanings = {
    '<':'より小さいか', '<=':'以下か', '>':'より大きいか',
    '>=':'以上か', '==':'等しいか', '!=':'等しくないか'
  };
  const subject = variableName.test(left.source)
    ? `${left.source} の値` : `${left.source} を計算した結果`;
  return `${context}${subject}が ${right.source} ${meanings[operator]}を${action}、進む処理を決めています。`;
}

function describeScanfPurpose(input){
  const kind = input.targetType === 'char' ? '1文字' : input.targetType === 'int' ? '整数' : '数値';
  return `入力された${kind}を${input.targetType}型として受け取り、${input.target} に保存しています。`;
}

function renderStep(){
  if(!hasCurrentResult() || activeStep < 0) return;
  cancelResultReveal();
  const step = currentSteps[activeStep];
  const isOmission = step.stepKind === 'loop-omission';
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
    element('small', '', isOmission ? '反復説明の省略' : 'コードは何をしてる？'),
    element('p', '', step.branchDecision
      ? describeDecisionPurpose(step.branchDecision)
      : step.scanfInput
        ? describeScanfPurpose(step.scanfInput)
      : decodeEngineExplanation(step.text))
  );
  const decision = step.branchDecision ? renderDecisionStep(step.branchDecision)
    : step.loopDecision?.kind === 'for' ? renderForDecisionStep(step.loopDecision)
    : step.loopDecision?.kind === 'while' ? renderWhileDecisionStep(step.loopDecision) : null;
  const input = step.scanfInput ? element('div', 'scanf-step-input') : null;
  if(input){
    input.append(element('small', '', 'INPUT'), element('span', '', step.scanfInput.inputDisplay));
  }
  // 判定では値が変わらないので、空の変化カードを重ねません。
  const change = (isOmission || step.branchDecision || step.loopDecision?.kind === 'for' || step.loopDecision?.kind === 'while') ? null : renderValueChange(activeStep);
  const nextStep = currentSteps[activeStep + 1];
  const next = element('div', 'next-line');
  next.append(
    element('span', '', '次： '),
    element('strong', '', nextStep ? `${nextStep.lineNo}行目` : 'RESULT')
  );
  flow.replaceChildren(top, track, code, explanation, ...(decision ? [decision] : []),
    ...(input ? [input] : []), ...(change ? [change] : []), next);
  $('step-controls').hidden = false;
  $('step-prev').disabled = false;
  $('step-next').disabled = false;
  $('step-count').textContent = `${activeStep + 1} / ${currentSteps.length}`;
  outputCard.hidden = false;
  setOutput(step.outputAtStep);
  $('feedback').textContent = '';
}

// STEPの到達済みsnapshotだけから表示を組み立てます。標準出力やSTEPは変更しません。
function buildResultTranscript(result){
  let transcript = '';
  let previousOutput = '';
  let afterInput = false;

  function appendOutput(text){
    if(!text) return;
    // 入力後の表示補助改行は、printf自身の先頭改行があれば重ねません。
    if(afterInput && !text.startsWith('\n')) transcript += '\n';
    transcript += text;
    afterInput = false;
  }

  for(const step of result.steps){
    // 省略STEPも、省略区間末尾に到達した時点のsnapshotから出力を取り込みます。
    const output = step.outputAtStep;
    appendOutput(output.slice(previousOutput.length));
    previousOutput = output;
    if(step.scanfInput){
      if(afterInput) transcript += '\n';
      const input = step.scanfInput;
      // %cは引用符・文字コードの補足を付けず、消費した文字そのものを表示します。
      transcript += input.specifier === '%c' ? input.rawInput : input.inputDisplay;
      afterInput = true;
    }
  }
  appendOutput(result.output.slice(previousOutput.length));
  if(afterInput) transcript += '\n';
  return transcript;
}

// 完了時と入力待ち時で、同じRESULTとVARIABLESの見た目を使います。
function createResultState(state, displayOutput){
  const result = element('div', 'result-state');
  result.append(element('span', 'result-label', 'RESULT'));
  result.append(element('output', 'result-value', displayOutput || '出力はまだありません'));
  const variables = element('div', 'result-variables');
  variables.append(element('span', 'result-variables-label', 'VARIABLES'));
  const values = element('div', 'result-variable-values');
  values.append(...state.variables.map(([name, value]) =>
    element('span', 'result-variable', `${name} = ${value}`)
  ));
  if(!state.variables.length) values.textContent = '変数はありません';
  variables.append(values);
  result.append(variables);
  return result;
}

function showResultPage(allowPrevious = false){
  // 入力編集中は前回snapshotの描画だけを許可し、FLOWの有効性とは分けます。
  if(!hasCurrentResult() &&
     !(allowPrevious && finalState && resultCode === editor.getValue())) return;
  cancelResultReveal();
  const shouldReveal = resultRevealPending;
  resultRevealPending = false;
  activeStep = -1;
  showExecutionLine(null);
  const result = createResultState(finalState, finalState.displayOutput);
  const resultValue = result.querySelector('.result-value');
  if(finalState.learningHints?.missingReturnZero){
    const hint = element('aside', 'result-learning-hint');
    hint.setAttribute('role', 'note');
    const message = element('p');
    message.append(
      element('code', '', 'return 0;'),
      document.createTextNode(' がありません。main関数の最後に書く基本形も確認してみましょう。')
    );
    hint.append(element('strong', '', '学習のヒント'), message);
    result.append(hint);
  }
  const viewFlow = element('button', 'result-flow-button', '流れを見る →');
  viewFlow.type = 'button';
  viewFlow.disabled = !hasCurrentResult();
  viewFlow.addEventListener('click', () => {
    if(!hasCurrentResult()) return;
    activeStep = 0;
    renderStep();
  });
  result.append(viewFlow);
  flow.replaceChildren(result);
  $('step-controls').hidden = true;
  outputCard.hidden = true;
  $('feedback').textContent = '';
  if(shouldReveal) revealResult(resultValue, finalState.displayOutput);
}

function showFailure(result){
  cancelResultReveal();
  playRunErrorFeedback();
  const warnings = (result.warningText || []).filter(Boolean);
  markErrorLines(warnings);
  if(!warnings.length) warnings.push('対応範囲で処理の流れを確認できませんでした。入力を見直してください。');
  const box = element('div', 'failure-state');
  box.append(element('h3', '', '確認が必要です'));
  for(const warning of warnings) box.append(element('p', '', warning));
  // 安全上限の実際のTRUE判定を失敗画面で示します。通常STEPや成功RESULTには進めません。
  const limitStep = result.steps?.findLast(step => step.loopDecision?.kind === 'while' && step.loopDecision.nextAction === 'limit');
  if(limitStep) box.append(renderWhileDecisionStep(limitStep.loopDecision));
  if(result.output) box.append(element('p', 'partial-output', `农止までの出力：${result.output}`));
  flow.replaceChildren(box);
  $('step-controls').hidden = true;
  outputCard.hidden = true;
  $('feedback').textContent = 'コードを修正して、もう一度RUNしてください。';
  return warnings;
}

function showWaiting(state){
  const request = state.inputRequest;
  const result = createResultState(state, buildResultTranscript(state));
  const box = element('div', 'waiting-state');
  box.append(element('h3', '', 'WAITING FOR INPUT'));
  box.append(element('p', '', `scanfで使用する値を入力し、INPUTを押してください。RUNでも実行できます。`));
  box.append(element('small', '', `${request.lineNo}行目 · ${request.specifier} · ${request.target}`));
  result.append(box);
  flow.replaceChildren(result);
  $('step-controls').hidden = true;
  outputCard.hidden = true;
  $('feedback').textContent = '';
  setScanfAccordionOpen(true, true);
  scanfInput.focus();
}

function showAnalysisPending(){
  setOutput('');
  showIdle('解析中です', '解析結果を準備しています。');
  $('step-controls').hidden = true;
  outputCard.hidden = true;
  $('feedback').textContent = '';
}

function runCode(){
  executeCode('run');
}

function submitInput(){
  if(inputSubmit.disabled || !scanfAccordion.classList.contains('is-open')) return;
  executeCode('input');
}

// 解析と結果の確定は共通です。起点の操作に応じて表示専用の演出だけを選びます。
function executeCode(action){
  cancelResultReveal();
  clearRunSuccessFeedback();
  clearRunErrorFeedback();
  clearInputInjection();
  resultRevealPending = false;
  clearJumpableLines();
  clearErrorLines();
  finalState = null;
  resultCode = null;
  resultScanfInput = null;
  resultInputDirty = false;
  waitingCode = null;
  activeStep = -1;
  showExecutionLine(null);
  showFinalSummary(null);
  setOutput('');
  const code = editor.getValue();
  $('codeInput').value = code;
  try{
    visualizeCode();
    const result = window.cVisualizerLiteResult;
    const input = scanfInput.value;
    const isSameInput = () => editor.getValue() === code && scanfInput.value === input;
    const consumedInput = result?.steps.some(step => step.scanfInput);
    if(result?.inputRequired && !result.hasWarnings){
      currentSteps = [];
      const showPartialResult = () => {
        if(!isSameInput()) return;
        waitingCode = code;
        showWaiting(result);
      };
      if(action === 'input' && consumedInput){
        showAnalysisPending();
        playInputInjection(showPartialResult);
      }else showPartialResult();
      return;
    }
    if(!result || result.hasWarnings || !result.steps.length){
      currentSteps = [];
      const failed = result || { warningText:[], output:'' };
      const warnings = showFailure(failed);
      saveHistory(code, 'check', failed, warnings);
      return;
    }
    const showCompleteResult = () => {
      if(!isSameInput()) return;
      currentSteps = result.steps;
      finalState = {
        output:result.output,
        displayOutput:buildResultTranscript(result),
        variables:result.variables,
        learningHints:{ ...result.learningHints }
      };
      resultCode = code;
      resultScanfInput = input;
      showFinalSummary(finalState);
      markJumpableLines();
      resultRevealPending = true;
      showResultPage();
      saveHistory(code, 'result', result);
    };
    if(action === 'run'){
      showAnalysisPending();
      playRunSuccessFeedback(showCompleteResult);
    }else if(consumedInput){
      showAnalysisPending();
      playInputInjection(showCompleteResult);
    }else showCompleteResult();
  }catch(error){
    clearInputInjection();
    currentSteps = [];
    const failed = { warningText:['処理を表示できませんでした。コードを確認して、再RUNしてください。'], output:'' };
    const warnings = showFailure(failed);
    saveHistory(code, 'check', failed, warnings);
    console.error('Visualizer Lite RUN failed', error);
  }
}

editor.on('cursorActivity', updateCursor);
editor.on('change', () => {
  if(resultCode !== null || errorLines.size || waitingCode !== null || pendingRunSuccess || pendingInputInjection) invalidateResult();
  // 手入力に戻ったことだけを選択欄に反映します。
  if($('sample-select').value) $('sample-select').value = '';
});
scanfInput.addEventListener('input', () => {
  const message = '入力値が変更されました。INPUTまたはRUNで結果を更新してください。';
  const hasPreviousDisplay = flow.querySelector('.result-state') !== null || finalState !== null;
  if(hasPreviousDisplay){
    // 表示は最後のRUN時点で固定し、入力を元に戻しても再RUNまでは無効です。
    cancelResultReveal();
    clearRunSuccessFeedback();
    clearInputInjection();
    resultRevealPending = false;
    resultInputDirty = true;
    clearJumpableLines();
    showExecutionLine(null);
    // STEP閲覧中なら、前回RUNのRESULTへ戻してから操作を止めます。
    if(activeStep >= 0) showResultPage(true);
    currentSteps = [];
    activeStep = -1;
    const viewFlow = flow.querySelector('.result-flow-button');
    if(viewFlow) viewFlow.disabled = true;
    $('step-controls').hidden = true;
    outputCard.hidden = true;
    $('feedback').textContent = message;
  }else if(resultCode !== null || errorLines.size || waitingCode !== null || pendingRunSuccess || pendingInputInjection){
    // まだ表示されていないSweepの結果やERRORには、従来の無効化を適用します。
    invalidateResult(message);
    $('feedback').textContent = message;
  }
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
  const code = ['#include <stdio.h>', '', 'int main(void){', ...body.map(line => line ? `    ${line}` : ''), '    return 0;', '}'].join('\n');
  // 入力教材は毎回、最初のscanfで待機する状態から始めます。
  if(event.target.value === 'scanfTwo' || event.target.value === 'scanfIf'){
    scanfInput.value = '';
  }
  editor.setValue(code);
  event.target.value = Object.keys(sampleBody).find(key => sampleBody[key] === body);
});
$('visualize').addEventListener('click', runCode);
inputSubmit.addEventListener('click', submitInput);
$('history-open').addEventListener('click', () => {
  renderHistory();
  historyDialog.showModal();
});
$('history-close').addEventListener('click', () => historyDialog.close());
historyDialog.addEventListener('click', event => {
  // ファイル選択inputの合成click（座標0,0）を背景クリックと誤判定しない。
  if(event.target !== historyDialog) return;
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
