// L-UI15: 初期CSSには触れず、PCで指定した寸法だけを上書きします。
(() => {
  'use strict';
  const STORAGE_KEY = 'c-visualizer-lite:workspace-layout:v1';
  const desktop = window.matchMedia('(min-width: 901px) and (pointer: fine)');
  const workspace = document.querySelector('.workspace');
  const codePanel = document.querySelector('.code-panel');
  const flowPanel = document.querySelector('.flow-panel');
  const defaultHeight = 390;
  let layout = { ratio: null, height: null };
  let drag = null;
  let refreshFrame = 0;

  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (stored && stored.version === 1 &&
        (stored.ratio === null || (typeof stored.ratio === 'number' &&
          Number.isFinite(stored.ratio) && stored.ratio > 0 && stored.ratio < 1)) &&
        (stored.height === null || (typeof stored.height === 'number' &&
          Number.isFinite(stored.height) && stored.height >= 200 && stored.height <= 1600))) {
      layout = { ratio: stored.ratio, height: stored.height };
    }
  } catch (_error) { /* 不正な保存値・読み取り禁止なら既存CSSの標準形を使います。 */ }

  function separator(id, label, orientation) {
    const handle = document.createElement('div');
    handle.id = id;
    handle.className = 'workspace-resizer workspace-resizer-' + orientation;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', label);
    handle.setAttribute('aria-orientation', orientation);
    handle.setAttribute('aria-controls', orientation === 'vertical' ? 'workspace-code workspace-flow' : 'code-input');
    handle.title = label + '（ドラッグ・矢印キー、Homeで標準へ）';
    handle.tabIndex = 0;
    handle.hidden = true;
    workspace.append(handle);
    return handle;
  }

  codePanel.id = 'workspace-code';
  flowPanel.id = 'workspace-flow';
  const widthHandle = separator('workspace-width-resizer', 'CODEとRESULTの幅を調整', 'vertical');
  const heightHandle = separator('workspace-height-resizer', 'CODEの高さを調整', 'horizontal');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.id = 'workspace-layout-reset';
  reset.className = 'workspace-layout-reset editor-font-button';
  reset.textContent = 'Default';
  reset.setAttribute('aria-label', 'CODEとRESULTのレイアウトを標準に戻す');
  reset.title = 'CODEとRESULTのレイアウトを標準に戻す';
  reset.hidden = true;
  document.querySelector('.editor-heading-actions').prepend(reset);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function limits() {
    const gap = parseFloat(getComputedStyle(workspace).columnGap);
    const available = workspace.getBoundingClientRect().width - gap;
    return { gap, available, minWidth: 380, maxWidth: available - 300,
      minHeight: 200, maxHeight: Math.max(defaultHeight, Math.min(1600, window.innerHeight * 2)) };
  }

  function save() {
    try {
      if (layout.ratio === null && layout.height === null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...layout }));
    } catch (_error) { /* 保存できなくてもセッション中の調整・RUNは継続できます。 */ }
  }

  function updateHandles() {
    if (!desktop.matches) return;
    const bounds = limits();
    const outer = workspace.getBoundingClientRect();
    const code = codePanel.getBoundingClientRect();
    const frame = editorFrame.getBoundingClientRect();
    widthHandle.style.left = `${code.right - outer.left + bounds.gap / 2 - 6}px`;
    widthHandle.style.height = `${Math.max(code.height, flowPanel.getBoundingClientRect().height)}px`;
    heightHandle.style.left = `${frame.left - outer.left}px`;
    heightHandle.style.top = `${frame.bottom - outer.top - 1}px`;
    heightHandle.style.width = `${frame.width}px`;
    widthHandle.setAttribute('aria-valuemin', String(bounds.minWidth));
    widthHandle.setAttribute('aria-valuemax', String(Math.floor(bounds.maxWidth)));
    widthHandle.setAttribute('aria-valuenow', String(Math.round(code.width)));
    widthHandle.setAttribute('aria-valuetext', `CODE ${Math.round(code.width)}px`);
    const height = editor.getWrapperElement().getBoundingClientRect().height;
    heightHandle.setAttribute('aria-valuemin', String(bounds.minHeight));
    heightHandle.setAttribute('aria-valuemax', String(bounds.maxHeight));
    heightHandle.setAttribute('aria-valuenow', String(Math.round(height)));
    heightHandle.setAttribute('aria-valuetext', `CODE ${Math.round(height)}px`);
  }

  function apply() {
    const active = desktop.matches;
    const bounds = limits();
    workspace.classList.toggle('workspace-resizable', active);
    widthHandle.hidden = heightHandle.hidden = !active;
    reset.hidden = !active || (layout.ratio === null && layout.height === null);
    if (active && layout.ratio !== null) {
      const left = clamp(bounds.available * layout.ratio, bounds.minWidth, bounds.maxWidth);
      workspace.style.gridTemplateColumns = `${left}px minmax(0, 1fr)`;
    } else workspace.style.removeProperty('grid-template-columns');
    // nullでCodeMirrorのinline高さを除去し、600px以下も含め既存CSSへ戻します。
    const height = active && layout.height !== null
      ? clamp(layout.height, bounds.minHeight, bounds.maxHeight) : null;
    if (height === null) editor.getWrapperElement().style.removeProperty('height');
    else editor.setSize(null, height);
    cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      editor.refresh();
      updateHandles();
    });
    updateHandles();
  }

  function finishDrag() {
    if (!drag) return;
    const previous = drag;
    drag = null;
    workspace.classList.remove('is-resizing-width', 'is-resizing-height');
    if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
    save();
  }

  function connect(handle, axis) {
    handle.addEventListener('pointerdown', event => {
      if (!desktop.matches || event.button !== 0 || !event.isPrimary || event.pointerType === 'touch') return;
      event.preventDefault();
      finishDrag();
      const rect = codePanel.getBoundingClientRect();
      drag = { handle, axis, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        width: rect.width, height: editor.getWrapperElement().getBoundingClientRect().height };
      handle.focus({ preventScroll: true });
      handle.setPointerCapture(event.pointerId);
      workspace.classList.add(axis === 'width' ? 'is-resizing-width' : 'is-resizing-height');
    });
    handle.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const bounds = limits();
      if (axis === 'width') {
        layout.ratio = clamp(drag.width + event.clientX - drag.x, bounds.minWidth, bounds.maxWidth) / bounds.available;
      } else layout.height = clamp(drag.height + event.clientY - drag.y, bounds.minHeight, bounds.maxHeight);
      apply();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => handle.addEventListener(type, finishDrag));
    handle.addEventListener('keydown', event => {
      if (!desktop.matches) return;
      const negative = axis === 'width' ? 'ArrowLeft' : 'ArrowUp';
      const positive = axis === 'width' ? 'ArrowRight' : 'ArrowDown';
      if (![negative, positive, 'Home'].includes(event.key)) return;
      event.preventDefault();
      finishDrag();
      const bounds = limits();
      const delta = (event.key === negative ? -1 : 1) * (event.shiftKey ? 40 : 10);
      if (axis === 'width') {
        layout.ratio = event.key === 'Home' ? null
          : clamp(codePanel.getBoundingClientRect().width + delta, bounds.minWidth, bounds.maxWidth) / bounds.available;
      } else layout.height = event.key === 'Home' ? null
        : clamp(editor.getWrapperElement().getBoundingClientRect().height + delta, bounds.minHeight, bounds.maxHeight);
      apply();
      save();
    });
  }

  connect(widthHandle, 'width');
  connect(heightHandle, 'height');
  reset.addEventListener('click', () => {
    finishDrag();
    layout = { ratio: null, height: null };
    widthHandle.focus({ preventScroll: true });
    apply();
    save();
  });
  window.addEventListener('blur', finishDrag);
  window.addEventListener('resize', () => { finishDrag(); apply(); });
  desktop.addEventListener('change', () => { finishDrag(); apply(); });
  // INPUT開閉・RESULT/FLOW切替で行の高さが変わっても境界へ追従します。
  const observer = new ResizeObserver(updateHandles);
  observer.observe(codePanel);
  observer.observe(flowPanel);
  observer.observe(editorFrame);
  apply();
})();
