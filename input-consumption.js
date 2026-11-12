/* Display only. The native textarea owns all text, editing, selection and IME.
   A hidden mirror measures soft wraps; only the textarea background is painted. */
'use strict';
class InputConsumptionView {
  constructor(input, getCode){
    this.input = input;
    this.getCode = getCode;
    this.rows = new Set();
    this.snapshot = '';
    this.code = null;
    this.mirror = document.createElement('div');
    this.mirror.className = 'input-consumption-mirror';
    this.mirror.setAttribute('aria-hidden', 'true');
    this.status = document.createElement('span');
    this.status.id = 'input-consumption-status';
    this.status.className = 'input-consumption-status';
    input.setAttribute('aria-describedby', this.status.id);
    document.body.append(this.status, this.mirror);
    input.addEventListener('scroll', () => this.paint(), {passive:true});
    this.observer = new ResizeObserver(() => this.paint());
    this.observer.observe(input);
    window.addEventListener('resize', () => this.paint(), {passive:true});
    document.fonts?.ready.then(() => this.paint());
    this.reset();
  }

  reset(){
    this.rows.clear();
    this.snapshot = this.input.value;
    this.code = null;
    this.paint();
  }

  edit(){
    if(this.code !== this.getCode()) return this.reset();
    const before = this.snapshot.split('\n'), after = this.input.value.split('\n');
    let prefix = 0;
    while(prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
    // Retain only the unchanged prefix. Reverting text cannot resurrect old marks.
    this.rows = new Set([...this.rows].filter(row => row < prefix));
    this.snapshot = this.input.value;
    this.paint();
  }

  commit(result, code, input){
    if(code !== this.getCode() || input !== this.input.value) return;
    const lines = input.split('\n');
    this.rows = new Set((result?.steps || []).flatMap(step => {
      const data = step.scanfInput, row = data?.inputLineIndex;
      return Number.isInteger(row) && row >= 0 && row < lines.length &&
        lines[row] !== '' && lines[row] === data.rawInput ? [row] : [];
    }));
    this.code = code;
    this.snapshot = input;
    this.paint();
  }

  paint(){
    const input = this.input;
    // Programmatic resets and restore paths must never paint a stale value.
    if(input.value !== this.snapshot || (this.code !== null && this.code !== this.getCode())){
      this.rows.clear();
      this.snapshot = input.value;
      this.code = null;
    }
    this.status.textContent = this.rows.size
      ? `受取済み ${[...this.rows].map(row => row + 1).join('・')}行目（明るい背景）。その他は未受取。`
      : '未受取。scanfで受け取った行は明るい背景で表示します。';
    if(!this.rows.size || !input.clientWidth){
      input.style.removeProperty('background-image');
      return;
    }
    const css = getComputedStyle(input), mirror = this.mirror;
    for(const name of ['fontFamily','fontSize','fontWeight','fontStyle','fontVariant',
      'lineHeight','letterSpacing','wordSpacing','tabSize','textIndent','textTransform',
      'direction','overflowWrap','wordBreak']) mirror.style[name] = css[name];
    mirror.style.width = `${input.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)}px`;
    mirror.style.whiteSpace = input.wrap === 'off' ? 'pre' : 'pre-wrap';
    mirror.replaceChildren(...input.value.split('\n').map(line => {
      const node = document.createElement('div');
      node.textContent = line || '\u200b';
      return node;
    }));
    const top = mirror.getBoundingClientRect().top;
    const bands = [...this.rows].map(row => {
      const rect = mirror.children[row].getBoundingClientRect();
      const y = rect.top - top + parseFloat(css.paddingTop) - input.scrollTop;
      return `transparent ${y}px, var(--input-consumed-bg) ${y}px, var(--input-consumed-bg) ${y + rect.height}px, transparent ${y + rect.height}px`;
    });
    input.style.backgroundImage = `linear-gradient(to bottom, transparent, ${bands.join(', ')}, transparent)`;
  }
}
