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

// L-MASK1: marks belong only to this editor session; never persist or replace code.
const codeMasks = new Set();
let maskEnabled = false;
let maskButton = null;
let maskComposing = false;
let maskPointer = null;
let maskCommitTimer = 0;
let maskLastTap = null;
let maskSuppressUntil = 0;
const maskWrapper = editor.getWrapperElement();
const maskCompare = CodeMirror.cmpPos;

function renderUnlockedMask(){
  if(!unlockedIds.has('mask') || maskButton) return;
  maskButton = document.createElement('button');
  maskButton.id = 'editor-mask-toggle';
  maskButton.type = 'button';
  maskButton.className = 'editor-light-toggle editor-mask-toggle';
  maskButton.textContent = 'MASK';
  maskButton.setAttribute('aria-pressed', 'false');
  maskButton.title = '選択した同一行の文字を隠す。クリックで開示、ダブルクリックで解除';
  editorLightToggle.after(maskButton);
  maskButton.addEventListener('click', () => {
    maskEnabled = !maskEnabled;
    maskButton.setAttribute('aria-pressed', String(maskEnabled));
    clearTimeout(maskCommitTimer);
  });
}

function removeCodeMask(item){
  item.mark.clear();
  codeMasks.delete(item);
  if(maskLastTap?.item === item) maskLastTap = null;
}

function paintCodeMask(item, from, to){
  item.mark = editor.markText(from, to, {
    className:'cm-code-mask ' + (item.revealed ? 'cm-code-mask-open' : 'cm-code-mask-hidden'),
    startStyle:item.revealed ? 'cm-code-mask-start' : '',
    endStyle:item.revealed ? 'cm-code-mask-end' : '',
    attributes:{'data-code-mask':String(item.id)},
    inclusiveLeft:false, inclusiveRight:false, addToHistory:false
  });
}
let nextCodeMaskId = 0;
function commitCodeMask(){
  if(!maskEnabled || maskComposing || maskPointer || performance.now() < maskSuppressUntil) return;
  const ranges = editor.listSelections();
  if(ranges.length !== 1 || ranges[0].empty()) return;
  const from = ranges[0].from(), to = ranges[0].to();
  if(from.line !== to.line) return;
  for(const item of codeMasks){
    const pos = item.mark.find();
    if(pos && maskCompare(from, pos.to) < 0 && maskCompare(to, pos.from) > 0) return;
  }
  const item = {id:++nextCodeMaskId, revealed:false};
  editor.operation(() => {
    paintCodeMask(item, from, to);
    codeMasks.add(item);
    editor.setSelection(to, to);
  });
}
function scheduleCodeMask(){
  clearTimeout(maskCommitTimer);
  maskCommitTimer = setTimeout(commitCodeMask, 120);
}
function maskAtEvent(event){
  const span = event.target.closest?.('[data-code-mask]');
  return span && [...codeMasks].find(item => String(item.id) === span.dataset.codeMask);
}
// Track the whole gesture: cursorActivity during a drag must never create a mark.
maskWrapper.addEventListener('pointerdown', event => {
  clearTimeout(maskCommitTimer);
  maskPointer = {id:event.pointerId, x:event.clientX, y:event.clientY, item:maskAtEvent(event)};
}, true);
document.addEventListener('pointerup', event => {
  if(!maskPointer || maskPointer.id !== event.pointerId) return;
  const down = maskPointer;
  maskPointer = null;
  if(down.item && codeMasks.has(down.item) && Math.hypot(event.clientX-down.x,event.clientY-down.y)<6){
    clearTimeout(maskCommitTimer);
    const item = down.item, now = performance.now();
    if(maskLastTap?.item === item && now-maskLastTap.time < 350){
      maskSuppressUntil = now + 500;
      removeCodeMask(item);
    }else{
      maskLastTap = {item,time:now};
      const pos = item.mark.find();
      if(pos) editor.operation(() => {
        item.mark.clear(); item.revealed = !item.revealed;
        paintCodeMask(item, pos.from, pos.to);
      });
    }
    // Avoid leaving native word selection after double click/tap.
    editor.setSelection(editor.getCursor(), editor.getCursor());
  }else{
    scheduleCodeMask();
  }
}, true);
document.addEventListener('pointercancel', () => { maskPointer=null; clearTimeout(maskCommitTimer); });
maskWrapper.addEventListener('dblclick', event => {
  if(maskAtEvent(event) || (maskLastTap && performance.now()-maskLastTap.time < 350) || performance.now() < maskSuppressUntil){
    event.preventDefault(); event.stopPropagation();
    clearTimeout(maskCommitTimer);
  }
}, true);
maskWrapper.addEventListener('keyup', event => {
  // Only an explicit keyboard selection gesture commits. Editing/IME never does.
  if(event.key === 'Shift' || (event.shiftKey && /^(Arrow|Home|End)/.test(event.key))) scheduleCodeMask();
});
maskWrapper.addEventListener('compositionstart', () => {maskComposing=true; clearTimeout(maskCommitTimer);});
maskWrapper.addEventListener('compositionend', () => {maskComposing=false;});
// Touch selection handles can finish after the touchend's last editor poll.
maskWrapper.addEventListener('touchend', () => {
  clearTimeout(maskCommitTimer); maskCommitTimer=setTimeout(commitCodeMask,350);
}, {passive:true});
editor.on('beforeChange', (_cm, change) => {
  clearTimeout(maskCommitTimer);
  for(const item of [...codeMasks]){
    const pos = item.mark.find();
    if(!pos || change.origin === 'setValue' ||
      (maskCompare(change.from,pos.to)<0 && maskCompare(change.to,pos.from)>0) ||
      (maskCompare(change.from,change.to)===0 && maskCompare(change.from,pos.from)>0 && maskCompare(change.from,pos.to)<0)){
      removeCodeMask(item);
    }
  }
});

const sampleBody = {
  arrayFor:[
    'int a[5] = {0};', 'int i;', '',
    'for(i = 0; i < 5; i++){', '    a[i] = i * 10;',
    '    printf("%d\\n", a[i]);', '}'
  ],
  arrayBasic:['int a[3] = {10, 20, 30};', 'a[1] = 50;', 'printf("%d\\n", a[1]);'],
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
const UNLOCK_CODES = new Map([['getsample', 'samples'], ['getmask', 'mask'], ['getmovie', 'movie']]);
const UNLOCK_KEY = 'c-visualizer-lite-unlocks-v1';
const UNLOCKED_OPTIONS = {
  samples:[
    ['add', '足し算'], ['sub', '引き算'], ['mul', '掛け算'],
    ['div', '割り算'], ['all', '四則演算まとめ'], ['precedence', '括弧と計算順序'],
    ['scanfTwo', '2つの数を入力する'], ['ifBasic', 'if文の基本'],
    ['ifElse', 'if〜else文'], ['scanfIf', '入力して条件判定'], ['arrayBasic', '配列の基本'],
    ['arrayFor', '配列とfor文']
  ]
};
const UNLOCK_LABELS = {
  samples:'SAMPLE UNLOCKED',
  mask:'MASK UNLOCKED',
  movie:'MOVIE UNLOCKED'
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
renderUnlockedMask();
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
renderUnlockedMask();
  if(unlockId === 'movie'){
    document.dispatchEvent(new CustomEvent('cvlite:unlock', {detail:{id:unlockId}}));
  }
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

// 保護済み履歴は50件の通常枠を消費しない。元の順序を保ち、削除対象を通常履歴のみに限定する。
function limitHistoryEntries(entries){
  let normalCount = 0;
  return entries.filter(entry => {
    if(entry.locked === true) return true;
    return ++normalCount <= HISTORY_LIMIT;
  });
}

function loadHistory(){
  try{
    const raw = localStorage.getItem(HISTORY_KEY);
    if(!raw) return [];
    const data = JSON.parse(raw);
    if(data.version !== 1 || !Array.isArray(data.entries)) return [];
    // 旧v1の鍵属性なし履歴は非ロックとして読み取る。
    return limitHistoryEntries(data.entries.filter(entry =>
      entry && typeof entry.id === 'string' && typeof entry.timestamp === 'string' &&
      !Number.isNaN(Date.parse(entry.timestamp)) && typeof entry.code === 'string' &&
      ['result', 'check'].includes(entry.kind) && typeof entry.output === 'string' &&
      Array.isArray(entry.variables) && entry.variables.every(pair =>
        Array.isArray(pair) && pair.length === 2 && pair.every(value => typeof value === 'string')) &&
      Array.isArray(entry.warnings) && entry.warnings.every(value => typeof value === 'string')
    ).map(entry => ({...entry, locked:entry.locked === true})));
  }catch(_error){
    return [];
  }
}

function persistHistory(entries = historyEntries){
  try{
    localStorage.setItem(HISTORY_KEY, JSON.stringify({version:1, entries}));
    return true;
  }catch(_error){
    // 失敗時は画面の履歴を確定させない。RUN自体は引き続き可能。
    return false;
  }
}

function historyVariablePairs(result){
  return [
    ...(Array.isArray(result?.variables) ? result.variables : []),
    ...(result?.arrays || []).map(array => [
      `${array.name} (${array.type}[${array.length}])`,
      `[${array.values.map((value, index) => array.initialized[index] ? String(value) : '—').join(', ')}]`
    ])
  ];
}

function historySaveFailure(){
  $('feedback').textContent = '履歴を保存できませんでした。今回の実行結果は確認できます。';
  historyTransferMessage('履歴を保存できませんでした。既存履歴は変更していません。', true);
}

function saveHistory(code, kind, result, warnings = []){
  try{
    const snapshot = JSON.parse(JSON.stringify({
      code,
      kind,
      output:typeof result?.output === 'string' ? result.output : '',
      variables:historyVariablePairs(result),
      warnings
    }));
    // 配列を含む記録はexport→importの上限も検査し、欠落・切捨てを成功扱いにしません。
    if(result?.arrays?.length && !isValidImportedHistoryEntry({
      id:'pending', timestamp:new Date().toISOString(), ...snapshot
    })){
      historySaveFailure();
      return false;
    }
    const previous = historyEntries[0];
    const same = previous && ['code', 'kind', 'output', 'variables', 'warnings'].every(key =>
      JSON.stringify(previous[key]) === JSON.stringify(snapshot[key]));
    let nextEntries;
    // 保護済みの記録は同じコードの再RUNでも書き換えない。
    if(same && previous.locked !== true){
      nextEntries = [{...previous, timestamp:new Date().toISOString()}, ...historyEntries.slice(1)];
    }else{
      nextEntries = [{
        id:crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp:new Date().toISOString(), locked:false, ...snapshot
      }, ...historyEntries];
    }
    nextEntries = limitHistoryEntries(nextEntries);
    if(!persistHistory(nextEntries)){
      historySaveFailure();
      return false;
    }
    historyEntries = nextEntries;
    return true;
  }catch(_error){
    // 履歴用データが想定外でも解析結果へ影響させません。
    historySaveFailure();
    return false;
  }
}

// L-HISTORY-IO1 / L-HISTORY-LOCK1: JSON v1互換のまま鍵状態を受け渡す。
const HISTORY_FILE_FORMAT = 'c-code-visualizer-lite-history';
const HISTORY_FILE_VERSION = 1;
// ロック履歴を含む50件超のアーカイブも取り込めるよう、安全な上限を拡張する。
const HISTORY_MAX_FILE_BYTES = 8 * 1024 * 1024;
const HISTORY_MAX_IMPORT_ENTRIES = 5000;
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
      typeof value === 'string' && value.length <= 10000) &&
    (entry.locked === undefined || typeof entry.locked === 'boolean');
}

function parseHistoryImport(text){
  const data = JSON.parse(text);
  const isArchive = data && data.format === HISTORY_FILE_FORMAT;
  const isLegacy = data && data.format === undefined;
  if(!data || typeof data !== 'object' || Array.isArray(data) ||
    (!isArchive && !isLegacy) || data.version !== HISTORY_FILE_VERSION ||
    !Array.isArray(data.entries) || data.entries.length > HISTORY_MAX_IMPORT_ENTRIES ||
    !data.entries.every(isValidImportedHistoryEntry)){
    throw new Error('対応していない履歴形式、または不正なデータです。');
  }
  // 未知のプロパティを破棄。鍵はbooleanだけを保持し、旧JSONではfalseを補う。
  return data.entries.map(entry => ({
    id:entry.id, timestamp:entry.timestamp, code:entry.code,
    kind:entry.kind, output:entry.output,
    variables:entry.variables.map(pair => [pair[0],pair[1]]),
    warnings:[...entry.warnings], locked:entry.locked === true
  }));
}

function historyEntriesEqual(a, b){
  return a.timestamp === b.timestamp &&
    ['code','kind','output','variables','warnings'].every(key =>
      JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

function mergeHistoryImport(imported){
  const combined = historyEntries.map(entry => ({...entry, locked:entry.locked === true}));
  const signature = entry => JSON.stringify([
    entry.timestamp, entry.code, entry.kind, entry.output, entry.variables, entry.warnings
  ]);
  // 取り込み上限の拡張に合わせ、重複照合はMapで線形時間に抑える。
  const existingBySignature = new Map(combined.map(entry => [signature(entry), entry]));
  const usedIds = new Set(combined.map(entry => entry.id));
  let added = 0;
  let protectedUpdated = 0;
  for(const entry of imported){
    const key = signature(entry);
    const existing = existingBySignature.get(key);
    if(existing){
      // 重複レコードの片方でもロックされていたら保護を優先。
      if(entry.locked === true && existing.locked !== true){
        existing.locked = true;
        protectedUpdated++;
      }
      continue;
    }
    const copy = {...entry, locked:entry.locked === true};
    while(usedIds.has(copy.id)){
      copy.id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    usedIds.add(copy.id);
    combined.push(copy);
    existingBySignature.set(key, copy);
    added++;
  }
  combined.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const kept = limitHistoryEntries(combined);
  return {all:combined, kept, omitted:combined.length - kept.length, added, protectedUpdated};
}

historyExport.addEventListener('click', () => {
  if(!historyEntries.length) return;
  try{
    const archive = {
      format:HISTORY_FILE_FORMAT, version:HISTORY_FILE_VERSION,
      exportedAt:new Date().toISOString(), entries:historyEntries
    };
    const blob = new Blob([JSON.stringify(archive,null,2)],{type:'application/json;charset=utf-8'});
    if(blob.size > HISTORY_MAX_FILE_BYTES || historyEntries.length > HISTORY_MAX_IMPORT_ENTRIES){
      historyTransferMessage('履歴がJSON読み込みの安全上限を超えています。書き出しを中止しました。',true);
      return;
    }
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
  historyImportFile.value = '';
  if(!file) return;
  if(functionAssistAttempt?.functionPath || functionAssistResult){
    discardFunctionAssist();
    invalidateResult('履歴を読み込みます。RUNであらためて確認してください。');
  }
  if(file.size > HISTORY_MAX_FILE_BYTES){
    historyTransferMessage('ファイルが大きすぎます（上限8MB）。読み込みを中止しました。',true);
    return;
  }
  try{
    const imported = parseHistoryImport(await file.text());
    if(!imported.length){
      historyTransferMessage('履歴0件のファイルです。現在の履歴は変更していません。');
      return;
    }
    const merged = mergeHistoryImport(imported);
    if(!merged.added && !merged.protectedUpdated){
      historyTransferMessage('すべて読み込み済みです。履歴は変更していません。');
      return;
    }
    if(merged.omitted && !window.confirm(
      `通常履歴は最大${HISTORY_LIMIT}件です。統合後、ロックされていない古い${merged.omitted}件が一覧から外れます。続けますか？`)){
      historyTransferMessage('読み込みを取り消しました。履歴は変更していません。');
      return;
    }
    if(!persistHistory(merged.kept)){
      historyTransferMessage('ブラウザへ履歴を保存できませんでした。現在の履歴は変更していません。',true);
      return;
    }
    historyEntries = merged.kept;
    selectedHistoryId = null;
    renderHistory();
    historyTransferMessage(`読み込み完了：新規${merged.added}件、保護更新${merged.protectedUpdated}件、現在${historyEntries.length}件${merged.omitted ? `（通常履歴${merged.omitted}件を整理）` : ''}。コードは自動実行されません。`);
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

// 履歴カードの選択とロックは入れ子にせず、二つの独立したbuttonで操作する。
function historyLockIcon(locked){
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '19');
  svg.setAttribute('height', '19');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('x', '5'); rect.setAttribute('y', '11');
  rect.setAttribute('width', '14'); rect.setAttribute('height', '10'); rect.setAttribute('rx', '2');
  const shackle = document.createElementNS(ns, 'path');
  shackle.setAttribute('d', locked ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 8 0');
  svg.append(rect, shackle);
  return svg;
}

function toggleHistoryLock(id){
  const current = historyEntries.find(entry => entry.id === id);
  if(!current) return;
  const next = historyEntries.map(entry => entry.id === id ? {...entry, locked:entry.locked !== true} : entry);
  if(!persistHistory(next)){
    historyTransferMessage('ロック状態を保存できませんでした。履歴は変更していません。', true);
    return;
  }
  historyEntries = next;
  historyTransferMessage('');
  renderHistory();
  const toggle = [...$('history-list').querySelectorAll('.history-lock-toggle')]
    .find(button => button.dataset.historyId === id);
  toggle?.focus();
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
    const card = element('div', 'challenge-history-item');
    card.dataset.locked = String(entry.locked === true);
    card.dataset.selected = String(entry.id === selectedHistoryId);

    const select = element('button', 'history-item-select');
    select.type = 'button';
    select.setAttribute('aria-label', `${historyDate(entry.timestamp)}の履歴を選択`);
    select.setAttribute('aria-pressed', String(entry.id === selectedHistoryId));
    select.addEventListener('click', () => {
      selectedHistoryId = entry.id;
      renderHistory();
      const selectedButton = [...list.querySelectorAll('.history-item-select')]
        .find(button => button.dataset.historyId === entry.id);
      selectedButton?.focus();
    });
    select.dataset.historyId = entry.id;

    const top = element('div', 'history-item-top');
    const meta = element('span', 'history-item-meta', `${historyDate(entry.timestamp)} · ${entry.kind === 'result' ? 'RESULT' : '確認あり'}`);
    const toggle = element('button', 'history-lock-toggle');
    toggle.type = 'button';
    toggle.dataset.historyId = entry.id;
    toggle.setAttribute('aria-label', entry.locked === true ? 'この履歴のロックを解除' : 'この履歴をロックして保護');
    toggle.setAttribute('aria-pressed', String(entry.locked === true));
    toggle.title = entry.locked === true ? 'ロック解除' : 'ロックして保護';
    toggle.append(historyLockIcon(entry.locked === true));
    toggle.addEventListener('click', () => toggleHistoryLock(entry.id));
    // 鍵を左端に固定し、履歴タイトルと操作領域を視覚的に分離します。
    top.append(toggle, meta);

    const preview = entry.code.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 2).join(' / ');
    card.append(select, top, element('span', 'history-preview', preview || '（空のコード）'));
    list.append(card);
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
  remove.disabled = entry.locked === true;
  if(remove.disabled) remove.title = 'ロックを解除すると削除できます';
  remove.addEventListener('click', () => {
    if(entry.locked === true) return;
    const next = historyEntries.filter(item => item.id !== entry.id);
    if(!persistHistory(next)){
      historyTransferMessage('履歴を保存できませんでした。削除していません。',true);
      return;
    }
    historyEntries = next;
    selectedHistoryId = null;
    renderHistory();
    (historyEntries.length ? $('history-list').querySelector('.history-item-select') : $('history-close')).focus();
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
  $('step-slider').disabled = true;
  $('step-slider').max = '1';
  $('step-slider').value = '1';
  $('step-slider').removeAttribute('aria-valuetext');
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
  if(!state.variables.length && !state.arrays?.length){ values.textContent = '—'; return; }
  values.append(...state.variables.map(([name, value]) =>
    element('span', 'summary-variable', `${name} = ${value}`)
  ));
  values.append(...(state.arrays || []).map(array => renderLiteArray(array)));
}

// 最終状態はaccessを無視。STEPだけが自身のスナップショットで強調します。
function renderLiteArray(array, showAccess = false){
  const card = element('section', 'lite-array-card');
  card.setAttribute('aria-label', `配列 ${array.name}`);
  const header = element('div', 'lite-array-header');
  header.append(element('strong', 'lite-array-name', array.name),
    element('span', 'lite-array-type', `${array.type}[${array.length}]`));
  card.append(header);
  const accesses = showAccess ? array.accesses || [] : [];
  for(const variableAccess of accesses.filter(access => access.indexKind === 'variable')){
    if(!Number.isInteger(variableAccess.resolvedIndex)) continue;
    card.append(element('div', 'lite-array-resolution',
      `${variableAccess.role ? variableAccess.role + '：' : ''}${array.name}[${variableAccess.sourceIndex}] → ${array.name}[${variableAccess.resolvedIndex}]${variableAccess.role ? `（${variableAccess.value}）` : ''}`));
  }
  const scroll = element('div', 'lite-array-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', `配列 ${array.name} の要素一覧（横スクロール）`);
  const row = element('div', 'lite-array-row');
  array.values.forEach((value, index) => {
    const display = array.initialized[index] ? String(value) : '—';
    const cellAccesses = accesses.filter(item => item.index === index);
    const access = cellAccesses.find(item => item.mode === 'write') || cellAccesses[0];
    const label = cellAccesses.map(item => item.role || (item.mode === 'read' ? '参照' : '代入')).join('／');
    const cell = element('div', 'lite-array-cell');
    if(cellAccesses.length > 1) cell.style.minWidth = `${Math.max(58, label.length * 12 + 16)}px`;
    cell.setAttribute('aria-label', `${array.name}[${index}]：${array.initialized[index] ? display : 'まだ値を入れていない'}${label ? `、${label}` : ''}`);
    if(label){
      cell.dataset.access = access.mode;
      cell.append(element('span', 'lite-array-access', label));
    }
    cell.append(element('span', 'lite-array-value', display),
      element('span', 'lite-array-index', `[${index}]`));
    if(access?.mode === 'write' && Object.prototype.hasOwnProperty.call(access, 'previousValue')){
      const before = access.previousInitialized ? String(access.previousValue) : '—';
      cell.append(element('small', 'lite-array-history', `${before} → ${display}`));
    }
    row.append(cell);
  });
  scroll.append(row);
  card.append(scroll);
  if(array.initialized.some(initialized => !initialized)){
    card.append(element('small', 'lite-array-legend', '—：まだ値を入れていない要素'));
  }
  return card;
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

function markErrorLines(warnings, diagnostics){
  clearErrorLines();
  // Current engine supplies locations; retain text fallback for older result data.
  const lineNumbers = Array.isArray(diagnostics)
    ? diagnostics.map(item => item.lineNo)
    : warnings.map(warning => Number(/^(\d+)行目：/.exec(warning)?.[1]));
  for(const lineNo of lineNumbers){
    if(!Number.isInteger(lineNo) || lineNo < 1) continue;
    const line = lineNo - 1;
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
  discardFunctionAssist();
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
  if(functionAssistResult && step.functionEvent){
    renderFunctionAssistStep(step);
    return;
  }
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
      ? describeDecisionPurpose(step.branchDecision) + (step.branchDecision.conversionNote ? ` ${step.branchDecision.conversionNote}` : '')
      : step.scanfInput
        ? describeScanfPurpose(step.scanfInput)
      : decodeEngineExplanation(step.text))
  );
  if(step.arrayLoopContext?.length){
    const indexNames = new Set((step.arrayViews || []).flatMap(view => view.accesses || [])
      .map(access => access.indexVariable).filter(Boolean));
    const values = step.variablesAtStep.filter(([name]) => indexNames.has(name))
      .map(([name, value]) => `${name} = ${value}`);
    explanation.append(element('p', 'array-loop-context',
      step.arrayLoopContext.map(item => `${item.label}：${item.state}`).join(' ／ ') +
      (values.length ? ` ｜ ${values.join('、')}` : '')));
  }
  const decision = step.branchDecision ? renderDecisionStep(step.branchDecision)
    : step.loopDecision?.kind === 'for' ? renderForDecisionStep(step.loopDecision)
    : step.loopDecision?.kind === 'while' ? renderWhileDecisionStep(step.loopDecision) : null;
  const input = step.scanfInput ? element('div', 'scanf-step-input') : null;
  if(input){
    input.append(element('small', '', 'INPUT'), element('span', '', step.scanfInput.inputDisplay));
  }
  // 判定では値が変わらないので、空の変化カードを重ねません。
  const previousVariables = new Map(activeStep > 0 ? currentSteps[activeStep - 1].variablesAtStep : []);
  const scalarChanged = step.variablesAtStep.some(([name, value]) => previousVariables.get(name) !== value);
  const change = (isOmission || step.branchDecision || step.loopDecision?.kind === 'for' || step.loopDecision?.kind === 'while' ||
    (step.arrayViews?.length && !scalarChanged)) ? null : renderValueChange(activeStep);
  const omittedVariables = isOmission && step.arrayViews?.length ? element('div', 'value-card') : null;
  if(omittedVariables){
    omittedVariables.append(element('small', '', '省略区間終了時の変数'));
    const boxes = element('div', 'scalar-boxes');
    for(const [name, value] of step.variablesAtStep){
      const variable = element('div', 'scalar-variable');
      variable.append(element('span', 'scalar-variable-name', name),
        element('span', 'scalar-variable-value', value === '未初期化' ? '—' : value));
      boxes.append(variable);
    }
    omittedVariables.append(boxes);
  }
  const nextStep = currentSteps[activeStep + 1];
  const next = element('div', 'next-line');
  next.append(
    element('span', '', '次： '),
    element('strong', '', nextStep ? `${nextStep.lineNo}行目` : 'RESULT')
  );
  flow.replaceChildren(top, track, code, explanation, ...(decision ? [decision] : []),
    ...(input ? [input] : []), ...(change ? [change] : []),
    ...(omittedVariables ? [omittedVariables] : []),
    ...(step.arrayViews || []).map(array => renderLiteArray(array, true)), next);
  $('step-controls').hidden = false;
  $('step-prev').disabled = false;
  $('step-next').disabled = false;
  $('step-count').textContent = `${activeStep + 1} / ${currentSteps.length}`;
  $('step-slider').disabled = false;
  $('step-slider').max = String(currentSteps.length);
  $('step-slider').value = String(activeStep + 1);
  $('step-slider').setAttribute('aria-valuetext', `STEP ${activeStep + 1} / ${currentSteps.length}`);
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
  values.append(...(state.arrays || []).map(array => renderLiteArray(array)));
  if(!state.variables.length && !state.arrays?.length) values.textContent = '変数はありません';
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
  if(functionAssistAttempt?.approved && functionAssistAttempt.reusable) functionAssistAttempt.viewSurface = result;
  $('step-controls').hidden = true;
  outputCard.hidden = true;
  $('feedback').textContent = '';
  if(shouldReveal) revealResult(resultValue, finalState.displayOutput);
}

function showFailure(result){
  cancelResultReveal();
  playRunErrorFeedback();
  const warnings = (result.warningText || []).filter(Boolean);
  markErrorLines(warnings, result.diagnostics);
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

// Stage L-FUNC4: approval belongs to one RUN and one edit generation.
let functionAssistRunId = 0;
let functionAssistEditGeneration = 0;
let functionAssistInputGeneration = 0;
let functionAssistAttempt = null;
let functionAssistResult = null;

const discardFunctionAssist = function(){
  const hadFunctionState = !!functionAssistResult || !!functionAssistAttempt?.functionPath;
  if(functionAssistAttempt) functionAssistAttempt.cancelled = true;
  functionAssistAttempt = null;
  functionAssistResult = null;
  return hadFunctionState;
};

const isFunctionAssistAttemptCurrent = function(attempt){
  return functionAssistAttempt === attempt && !attempt.cancelled &&
    attempt.editGeneration === functionAssistEditGeneration &&
    attempt.inputGeneration === functionAssistInputGeneration &&
    attempt.code === editor.getValue() && attempt.input === scanfInput.value;
};

const clearFunctionAssistDisplay = function(){
  cancelResultReveal();
  clearRunSuccessFeedback();
  clearRunErrorFeedback();
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
  showExecutionLine(null);
  showFinalSummary(null);
  setOutput('');
  $('step-controls').hidden = true;
  $('step-slider').disabled = true;
  outputCard.hidden = true;
  $('feedback').textContent = '';
};

const showFunctionAssistDiagnostic = function(route){
  const card = element('div', 'function-assist-diagnostic');
  card.setAttribute('role', 'status');
  card.append(element('h3', '', 'コードを確認してください'), element('p', '', route.message));
  const diagnostics = route.catalog?.diagnostics || [];
  for(const diagnostic of diagnostics){
    card.append(element('p', '', `${diagnostic.lineNo || diagnostic.line || 1}行目：${diagnostic.message || diagnostic.code}`));
  }
  // Routing diagnostics are unexecuted; never create a success/check history entry.
  const firstCall = route.evidence?.lexicalUserCalls?.[0];
  const position = firstCall?.offset;
  const lineNo = Number.isInteger(position) ? editor.getValue().slice(0, position).split('\n').length : 1;
  markErrorLines([], diagnostics.length ? diagnostics.map(d => ({...d, lineNo:d.lineNo || d.line || 1})) : [{lineNo}]);
  flow.replaceChildren(card);
};

const adaptFunctionAssistResult = function(result){
  return {
    output:result.output,
    variables:result.variables.map(variable => [variable.name, variable.display]),
    arrays:[],
    learningHints:{},
    diagnostics:result.diagnostics,
    warningText:result.diagnostics.map(diagnostic =>
      `${diagnostic.lineNo || 1}行目：${diagnostic.message}` +
      (diagnostic.callLineNo ? `（呼出元：${diagnostic.callLineNo}行目）` : ''))
  };
};

// FA1: stable session hosts are distinct from replaceable result/STEP cards.
const hasFunctionInputHosts = function(attempt){
  const hosts = attempt?.hosts;
  return !!hosts && hosts.flow === flow && hosts.input === scanfInput &&
    hosts.editor === editor.getWrapperElement() && hosts.frame === editorFrame &&
    [hosts.flow, hosts.input, hosts.editor, hosts.frame].every(node => node.isConnected) &&
    $('flow-content') === flow && $('scanfInput') === scanfInput;
};

const canContinueFunctionInput = function(attempt){
  if(functionAssistAttempt !== attempt || !attempt?.approved || attempt.cancelled ||
    !attempt.functionPath || attempt.route !== 'P2' || !attempt.consumed ||
    attempt.editGeneration !== functionAssistEditGeneration || attempt.code !== editor.getValue() ||
    !hasFunctionInputHosts(attempt)) return false;
  if(['WAITING_FUNCTION','INPUT_PENDING'].includes(attempt.status)){
    return !!attempt.surface?.isConnected && flow.contains(attempt.surface);
  }
  return attempt.reusable && ['RESULT_REUSABLE','INPUT_DIRTY'].includes(attempt.status) &&
    !!attempt.viewSurface?.isConnected && flow.contains(attempt.viewSurface);
};

const isReusableFunctionResult = function(attempt, result){
  return attempt.route === 'P2' && attempt.consumed && attempt.approved &&
    result.ok === true && result.status === 'completed' && !result.diagnostics.length &&
    result.steps.some(step => step.functionName === 'main' && step.functionEvent === 'scanf' && step.scanfInput?.targetType === 'int') &&
    result.steps.some(step => step.functionName === 'main' && step.functionEvent === 'call' &&
      step.calleeName && step.calleeName !== 'main' && result.steps.some(returned =>
        returned.functionEvent === 'return-assign' && returned.functionName === 'main' &&
        returned.callId === step.callId && returned.calleeName === step.calleeName));
};

const showFunctionInputDirty = function(attempt){
  cancelResultReveal();clearRunSuccessFeedback();clearInputInjection();
  resultRevealPending = false;clearJumpableLines();showExecutionLine(null);
  functionAssistResult = attempt.completedResult;
  const adapted = adaptFunctionAssistResult(attempt.completedResult);
  finalState = {...adapted, displayOutput:adapted.output};
  resultCode = attempt.code;resultScanfInput = attempt.completedInput;resultInputDirty = true;
  currentSteps = [];activeStep = -1;
  attempt.status = 'INPUT_DIRTY';attempt.surface = null;
  showResultPage(true);
  attempt.viewSurface = flow.firstElementChild;
  $('step-slider').disabled = true;$('step-controls').hidden = true;outputCard.hidden = true;
  $('feedback').textContent = '前回の結果です。INPUTで再計算してください。';
};

const restoreFunctionInputResult = function(attempt){
  functionAssistResult = attempt.completedResult;currentSteps = functionAssistResult.steps;
  const adapted = adaptFunctionAssistResult(functionAssistResult);
  finalState = {...adapted, displayOutput:adapted.output};
  resultCode = attempt.code;resultScanfInput = attempt.completedInput;resultInputDirty = false;
  attempt.status = 'RESULT_REUSABLE';attempt.surface = null;
  showFinalSummary(finalState);markJumpableLines();showResultPage();
};

const showFunctionInputWaiting = function(result, attempt){
  const adapted = adaptFunctionAssistResult(result), request = result.inputRequest;
  const card = createResultState(adapted, result.output);
  card.classList.add('function-input-waiting');
  const box = element('div', 'waiting-state');
  box.setAttribute('role', 'status');
  box.append(element('h3', '', 'WAITING FOR INPUT'),
    element('p', '', `${request.ordinal}個目の整数を待っています。入力欄を改行で区切り、INPUTを押してください。`),
    element('small', '', `${request.lineNo}行目 · ${request.specifier} · ${request.target}`));
  const cancel = element('button', 'function-assist-cancel function-input-cancel', 'キャンセル');
  cancel.type = 'button';
  cancel.addEventListener('click', () => {
    if(!canContinueFunctionInput(attempt) || attempt.status !== 'WAITING_FUNCTION' || attempt.surface !== card || !card.isConnected) return;
    discardFunctionAssist();clearFunctionAssistDisplay();
    showIdle('実行をキャンセルしました', 'RUNであらためて確認できます。');
    $('visualize').focus();
  });
  const actions = element('div', 'function-assist-actions');actions.append(cancel);
  box.append(actions);card.append(box);flow.replaceChildren(card);
  attempt.surface = card;attempt.lastWaiting = result;attempt.status = 'WAITING_FUNCTION';
  $('step-controls').hidden = true;outputCard.hidden = true;
  setScanfAccordionOpen(true, true);scanfInput.focus();
};

let executeConfirmedFunctionAssist = function(attempt, action = 'run'){
  if(!attempt.approved || !isFunctionAssistAttemptCurrent(attempt)) return;
  if(action === 'input' && attempt.status === 'INPUT_PENDING') return;
  const operationToken = ++attempt.operationToken;
  const inputSnapshot = scanfInput.value;
  attempt.input = inputSnapshot;attempt.inputGeneration = functionAssistInputGeneration;
  attempt.pendingFrom = attempt.status;
  attempt.status = action === 'input' ? 'INPUT_PENDING' : 'FUNCTION';
  attempt.viewSurface = null;
  let result;
  try{
    result = FunctionExecutionCore.execute(attempt.code, {input:inputSnapshot});
  }catch(_error){
    result = {ok:false, output:'', variables:[], steps:[], diagnostics:[{
      lineNo:1, code:'FUNCTION_EXECUTION_UNAVAILABLE',
      message:'処理を表示できませんでした。コードを確認して、再RUNしてください。'
    }]};
  }
  if(!isFunctionAssistAttemptCurrent(attempt)) return;
  clearFunctionAssistDisplay();
  const adapted = adaptFunctionAssistResult(result);
  if(result.status === 'waiting-input'){
    const waiting = () => {
      if(!isFunctionAssistAttemptCurrent(attempt) || !hasFunctionInputHosts(attempt) || attempt.operationToken !== operationToken || !attempt.approved ||
        (attempt.surface && (!attempt.surface.isConnected || !flow.contains(attempt.surface)))) return;
      showFunctionInputWaiting(result, attempt);
    };
    if(action === 'input' && result.steps.some(step => step.scanfInput)){
      showAnalysisPending();attempt.surface = flow.firstElementChild;
      playInputInjection(waiting);
    }else waiting();
    return;
  }
  if(!result.ok){
    attempt.status = 'ERROR';attempt.approved = false;attempt.reusable = false;attempt.surface = null;
    attempt.viewSurface = null;attempt.completedResult = null;
    const warnings = showFailure(adapted);
    saveHistory(attempt.code, 'check', adapted, warnings);
    return;
  }
  functionAssistResult = result;
  showAnalysisPending();attempt.surface = flow.firstElementChild;
  const complete = () => {
    if(!isFunctionAssistAttemptCurrent(attempt) || !hasFunctionInputHosts(attempt) || attempt.operationToken !== operationToken || !attempt.approved ||
      !attempt.surface?.isConnected || !flow.contains(attempt.surface)) return;
    const reusable = isReusableFunctionResult(attempt, result);
    const sameCompletedInput = attempt.reusable && attempt.completedInput === inputSnapshot;
    attempt.status = reusable ? 'RESULT_REUSABLE' : 'RESULT';
    attempt.approved = reusable;attempt.reusable = reusable;attempt.surface = null;
    attempt.completedResult = reusable ? result : null;
    attempt.completedInput = reusable ? inputSnapshot : null;
    currentSteps = result.steps;
    finalState = {...adapted, displayOutput:result.output};
    resultCode = attempt.code;resultScanfInput = inputSnapshot;
    showFinalSummary(finalState);markJumpableLines();resultRevealPending = true;
    showResultPage();
    if(!sameCompletedInput) saveHistory(attempt.code, 'result', adapted);
  };
  if(action === 'input')playInputInjection(complete);
  else playRunSuccessFeedback(complete);
};


// A removed waiting surface cannot revive an approval if it is reinserted.
const functionAssistSurfaceObserver = new MutationObserver(records => {
  const attempt = functionAssistAttempt;
  if(!attempt?.approved) return;
  const surface = ['RESULT_REUSABLE','INPUT_DIRTY'].includes(attempt.status) ? attempt.viewSurface : attempt.surface;
  if(!hasFunctionInputHosts(attempt) || records.some(record => [...record.removedNodes].some(node =>
    (surface && (node === surface || node.contains?.(surface))) ||
    (attempt.hosts && Object.values(attempt.hosts).some(host => node === host || node.contains?.(host)))))){
    invalidateResult('表示が変更されました。RUNであらためて確認してください。');
  }
});
functionAssistSurfaceObserver.observe(document.body, {childList:true, subtree:true});

const showFunctionAssistConfirmation = function(attempt, route){
  const card = element('section', 'function-assist-confirm');
  card.setAttribute('aria-label', 'FUNCTION ASSISTの確認');
  const title = route.catalog.classification === 'DECLARATION_ONLY'
    ? 'サブ関数の宣言を検出しました' : 'サブ関数を検出しました';
  card.append(element('small', '', 'FUNCTION ASSIST'), element('h3', '', title),
    element('p', '', 'このプログラムには、main以外の関数が含まれているようです。サブ関数の呼び出しや戻り値も含めて、処理の流れを可視化しますか？'));
  const actions = element('div', 'function-assist-actions');
  const cancel = element('button', 'function-assist-cancel', 'キャンセル');
  const yes = element('button', 'function-assist-accept', '可視化する →');
  cancel.type = yes.type = 'button';
  actions.append(cancel, yes);
  card.append(actions);
  const valid = () => isFunctionAssistAttemptCurrent(attempt) &&
    attempt.status === 'CONFIRM' && !attempt.consumed && card.isConnected && flow.contains(card);
  cancel.addEventListener('click', () => {
    if(!valid()) return;
    attempt.consumed = true;
    cancel.disabled = yes.disabled = true;
    discardFunctionAssist();
    clearFunctionAssistDisplay();
    showIdle('実行をキャンセルしました', 'RUNであらためて確認できます。');
    $('visualize').focus();
  });
  yes.addEventListener('click', () => {
    if(!valid()) return;
    attempt.consumed = true;
    cancel.disabled = yes.disabled = true;
    attempt.status = 'FUNCTION';
    attempt.approved = true;
    attempt.hosts = {flow, input:scanfInput, editor:editor.getWrapperElement(), frame:editorFrame};
    executeConfirmedFunctionAssist(attempt);
  });
  flow.replaceChildren(card);
  cancel.focus({preventScroll:true});
};

function executeCode(action){
  if(action === 'input' && canContinueFunctionInput(functionAssistAttempt)){
    const attempt = functionAssistAttempt;
    if(attempt.reusable && attempt.completedInput === scanfInput.value &&
      ['RESULT_REUSABLE','INPUT_DIRTY'].includes(attempt.status)){
      if(attempt.status === 'INPUT_DIRTY') restoreFunctionInputResult(attempt);
      return;
    }
    if(attempt.status === 'INPUT_PENDING'){
      if(attempt.input === scanfInput.value && attempt.inputGeneration === functionAssistInputGeneration) return;
      ++attempt.operationToken;clearInputInjection();attempt.status = attempt.reusable ? 'INPUT_DIRTY' : 'WAITING_FUNCTION';
    }
    attempt.input = scanfInput.value;attempt.inputGeneration = functionAssistInputGeneration;
    executeConfirmedFunctionAssist(attempt, 'input');
    return;
  }
  discardFunctionAssist();
  const attempt = {
    runId:++functionAssistRunId,
    editGeneration:functionAssistEditGeneration,
    inputGeneration:functionAssistInputGeneration,
    code:editor.getValue(), input:scanfInput.value,
    status:'PREFLIGHT', consumed:false, cancelled:false, functionPath:false,
    approved:false, operationToken:0, route:null, surface:null, lastWaiting:null,
    reusable:false, hosts:null, viewSurface:null, completedResult:null, completedInput:null, pendingFrom:null
  };
  functionAssistAttempt = attempt;
  const route = typeof FunctionAssistRouting === 'undefined'
    ? {route:'DIAGNOSTIC', priority:'P0', message:'関数の事前検査を利用できません。実行していません。'}
    : FunctionAssistRouting.classify(attempt.code);
  if(route.route === 'NORMAL'){
    attempt.status = 'NORMAL';
    executeNormalCode(action, attempt);
    return;
  }
  attempt.functionPath = true;attempt.route = route.priority;
  clearFunctionAssistDisplay();
  if(route.route === 'CONFIRM' && action === 'run'){
    attempt.status = 'CONFIRM';
    showFunctionAssistConfirmation(attempt, route);
  }else{
    attempt.status = 'DIAGNOSTIC';
    showFunctionAssistDiagnostic(route.route === 'CONFIRM'
      ? {message:'サブ関数を含むコードはRUNから確認してください。このコードはRUNからあらためて確認してください。'}
      : route);
  }
}

const renderFunctionAssistStep = function(step){
  showExecutionLine(step.lineNo);
  const top = element('div', 'step-top');
  const context = step.functionName === 'main' ? 'main' : `${step.functionName}・${step.callId}回目`;
  top.append(element('span', '', `STEP ${String(activeStep + 1).padStart(2, '0')} / ${currentSteps.length}`),
    element('span', '', `${step.lineNo} 行目`));
  const track = element('div', 'step-track');
  const fill = element('span');
  fill.style.width = `${(activeStep + 1) / currentSteps.length * 100}%`;
  track.append(fill);
  const code = element('div', 'step-code');
  code.append(element('code', '', editor.getLine(step.lineNo - 1)));
  const detail = element('div', 'flow-detail function-assist-step');
  detail.dataset.event = step.functionEvent;
  const descriptions = {
    declare:'変数を用意します。', call:`${step.calleeName || 'サブ関数'} を呼び出します。`,
    arguments:'引数の値を、呼び出された関数の変数に渡します。', assign:'値を計算して変数に保存します。',
    return:`${step.returnValue ?? ''} を呼出元に返します。`,
    'return-assign':`mainに復帰し、戻り値を ${step.target || '変数'} に保存します。`,
    printf:'標準出力に表示します。', 'program-end':'mainの処理を終了します。',
    scanf:`入力された整数 ${step.scanfInput?.inputDisplay || ''} を ${step.scanfInput?.target || ''} に保存します。`,
    'input-wait':'次の整数の入力を待っています。',
    'branch-decision':step.branchDecision
      ? `${step.branchDecision.condition} は${step.branchDecision.conditionMet ? '真' : '偽'}です。${step.branchDecision.selectedBranch === 'if' ? 'if側' : 'else側'}のreturnへ進みます。` : ''
  };
  detail.append(element('small', '', context), element('p', '', descriptions[step.functionEvent] || '処理を確認します。'));
  if(step.branchDecision?.comparison){
    const comparison = step.branchDecision.comparison;
    detail.append(element('p', '', `比較する値：${comparison.leftDisplay} ${comparison.operator} ${comparison.rightDisplay}${comparison.conversionNote ? `。${comparison.conversionNote}` : ''}`));
  }
  const previous = new Map((activeStep > 0 ? currentSteps[activeStep - 1].scopesAtStep : [])
    .flatMap(scope => scope.variables.map(variable => [`${scope.scopeId}:${variable.name}`, variable.display])));
  const scopes = element('div', 'function-assist-scopes');
  for(const scope of step.scopesAtStep){
    const section = element('section', 'function-assist-scope');
    section.dataset.scopeId = scope.scopeId;
    section.classList.toggle('is-active', scope.scopeId === step.activeScopeId);
    section.append(element('h4', '', scope.functionName === 'main' ? 'main' : `${scope.functionName}・${scope.callId}回目`));
    const boxes = element('div', 'scalar-boxes');
    for(const variable of scope.variables){
      const box = element('div', 'scalar-variable');
      const key = `${scope.scopeId}:${variable.name}`;
      box.dataset.variableKey = key;
      const value = variable.display === '未初期化' ? '—' : variable.display;
      box.append(element('span', 'scalar-variable-name', variable.name), element('span', 'scalar-variable-value', value));
      if(previous.has(key) && previous.get(key) !== variable.display){
        box.append(element('span', 'scalar-variable-history', `${previous.get(key) === '未初期化' ? '—' : previous.get(key)} → ${value}`));
      }
      boxes.append(box);
    }
    section.append(boxes);
    scopes.append(section);
  }
  const nextStep = currentSteps[activeStep + 1];
  const next = element('div', 'next-line');
  next.append(element('span', '', '次： '), element('strong', '', nextStep ? `${nextStep.lineNo}行目` : 'RESULT'));
  flow.replaceChildren(top, track, code, detail, scopes, next);
  if(functionAssistAttempt?.approved && functionAssistAttempt.reusable) functionAssistAttempt.viewSurface = top;
  $('step-controls').hidden = false;
  $('step-prev').disabled = $('step-next').disabled = false;
  $('step-count').textContent = `${activeStep + 1} / ${currentSteps.length}`;
  $('step-slider').disabled = false;
  $('step-slider').max = String(currentSteps.length);
  $('step-slider').value = String(activeStep + 1);
  $('step-slider').setAttribute('aria-valuetext', `STEP ${activeStep + 1} / ${currentSteps.length}`);
  outputCard.hidden = false;
  setOutput(step.outputAtStep);
  $('feedback').textContent = '';
};

// The legacy reset API is retained; pending product approvals must also expire.
const resetCodeWithoutFunctionAssist = resetCode;
resetCode = function(){
  if(discardFunctionAssist()){
    ++functionAssistEditGeneration;
    invalidateResult('コードをリセットしました。');
    editor.setValue('');
  }
  return resetCodeWithoutFunctionAssist();
};
window.addEventListener('pagehide', () => {
  if(discardFunctionAssist()){
    cancelResultReveal();
    clearRunSuccessFeedback();
    clearInputInjection();
  }
});


// 解析と結果の確定は共通です。起点の操作に応じて表示専用の演出だけを選びます。
const executeNormalCode = function(action, attempt){
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
    const isSameInput = () => isFunctionAssistAttemptCurrent(attempt) && editor.getValue() === code && scanfInput.value === input;
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
        arrays:result.arrays,
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
};

editor.on('cursorActivity', updateCursor);
editor.on('change', () => {
  ++functionAssistEditGeneration;
  const hadFunctionState = discardFunctionAssist();
  if(hadFunctionState || resultCode !== null || errorLines.size || waitingCode !== null || pendingRunSuccess || pendingInputInjection) invalidateResult();
  // 手入力に戻ったことだけを選択欄に反映します。
  if($('sample-select').value) $('sample-select').value = '';
});
scanfInput.addEventListener('input', () => {
  ++functionAssistInputGeneration;
  if(canContinueFunctionInput(functionAssistAttempt)){
    const attempt = functionAssistAttempt;
    ++attempt.operationToken;
    clearInputInjection();clearRunSuccessFeedback();cancelResultReveal();
    attempt.input = scanfInput.value;attempt.inputGeneration = functionAssistInputGeneration;
    if(attempt.reusable && (['RESULT_REUSABLE','INPUT_DIRTY'].includes(attempt.status) ||
      (attempt.status === 'INPUT_PENDING' && attempt.pendingFrom !== 'WAITING_FUNCTION'))){
      showFunctionInputDirty(attempt);
    }else{
      functionAssistResult = null;
      if(attempt.status === 'INPUT_PENDING') showFunctionInputWaiting(attempt.lastWaiting, attempt);
      $('feedback').textContent = '入力が変更されました。INPUTで、このRUNを最初から確認します。';
    }
    return;
  }
  const hadFunctionState = discardFunctionAssist();
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
  }else if(hadFunctionState || resultCode !== null || errorLines.size || waitingCode !== null || pendingRunSuccess || pendingInputInjection){
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
  if(discardFunctionAssist()) invalidateResult();
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
  const normalCount = historyEntries.filter(entry => entry.locked !== true).length;
  const lockedCount = historyEntries.length - normalCount;
  if(!normalCount){
    historyTransferMessage('ロック中の履歴は削除されません。');
    return;
  }
  const kept = historyEntries.filter(entry => entry.locked === true);
  if(!persistHistory(kept)){
    historyTransferMessage('履歴を保存できませんでした。削除していません。',true);
    return;
  }
  historyEntries = kept;
  selectedHistoryId = null;
  renderHistory();
  historyTransferMessage(`通常履歴${normalCount}件を削除しました。ロック中${lockedCount}件は保護されています。`);
  (historyEntries.length ? $('history-list').querySelector('.history-item-select') : $('history-close')).focus();
});

$('step-next').addEventListener('click', () => {
  if(!hasCurrentResult() || activeStep < 0) return;
  if(activeStep === currentSteps.length - 1) showResultPage();
  else { activeStep++; renderStep(); }
});
$('step-slider').addEventListener('input', event => {
  if(!hasCurrentResult() || activeStep < 0 || !currentSteps.length) return;
  const index = Math.max(0, Math.min(currentSteps.length - 1, event.target.valueAsNumber - 1));
  if(!Number.isInteger(index) || index === activeStep) return;
  const navigatorTop = event.target.getBoundingClientRect().top;
  activeStep = index;
  renderStep();
  // CodeMirrorの行追従やSTEPごとの高さ変化で、操作中のつまみが画面外へ逃げないようにします。
  const shift = event.target.getBoundingClientRect().top - navigatorTop;
  if(Math.abs(shift) > 0.5) window.scrollBy({top:shift, left:0, behavior:'instant'});
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
