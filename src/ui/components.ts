/**
 * 可复用 DOM 组件。
 * 全部返回「元素 + 句柄」，句柄里带 destroy()，场景卸载时务必调用，
 * 否则键盘监听会随场景切换越积越多（典型的内存泄漏）。
 */

import { h, clear } from '@/ui/dom';

/* ------------------------------------------------------------------ *
 * 菜单列表
 * ------------------------------------------------------------------ */

export interface MenuItem {
  id: string;
  label: string;
  /** 次要说明，显示在右侧 */
  hint?: string;
  disabled?: boolean;
  /** 危险操作（删除等）显示成红色 */
  danger?: boolean;
  onSelect?: () => void;
}

export interface MenuListHandle {
  el: HTMLElement;
  /** 重新渲染（条目内容变化时调用） */
  refresh(items: MenuItem[]): void;
  /** 处理键盘事件，返回 true 表示已消化 */
  handleKey(e: KeyboardEvent): boolean;
  focusIndex(i: number): void;
  destroy(): void;
}

export interface MenuListOptions {
  /** 变更焦点时回调，可用于播放音效 */
  onFocusChange?: (item: MenuItem, index: number) => void;
}

export function createMenuList(initial: MenuItem[], options: MenuListOptions = {}): MenuListHandle {
  let items = initial;
  let index = 0;
  const listEl = h('div', { class: 'menu-list interactive' });
  /** 当前的按钮节点，顺序与 items 一致 */
  let rows: HTMLButtonElement[] = [];

  const enabledIndexes = (): number[] =>
    items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  function build(): void {
    clear(listEl);
    rows = [];
    items.forEach((item, i) => {
      const row = h('button', {
        class: 'menu-item',
        type: 'button',
        onClick: () => {
          if (item.disabled) return;
          if (index !== i) {
            index = i;
            syncActive();
          }
          item.onSelect?.();
        },
        onMouseEnter: () => {
          if (item.disabled || index === i) return;
          index = i;
          syncActive();
          options.onFocusChange?.(item, i);
        },
      });
      row.appendChild(h('span', { class: 'menu-label', text: item.label }));
      if (item.hint) row.appendChild(h('span', { class: 'menu-hint', text: item.hint }));
      rows.push(row);
      listEl.appendChild(row);
    });
    syncActive();
  }

  /**
   * 只改 class，**绝不重建 DOM**。
   *
   * 这是一个真踩过的坑：原来悬停时直接 clear() 重建整个列表，
   * 光标下的按钮被销毁又新建，浏览器会再派发一次 mouseover，
   * 于是「重建 → 再次触发 → 再重建」形成死循环——音效变成机关枪，CPU 也白烧。
   */
  function syncActive(): void {
    items.forEach((item, i) => {
      const row = rows[i];
      if (!row) return;
      row.classList.toggle('is-active', i === index);
      row.classList.toggle('is-disabled', Boolean(item.disabled));
      row.classList.toggle('is-danger', Boolean(item.danger));
      row.disabled = Boolean(item.disabled);
    });
  }

  function move(delta: number): void {
    const avail = enabledIndexes();
    if (avail.length === 0) return;
    const pos = avail.indexOf(index);
    const nextPos = pos < 0 ? 0 : (pos + delta + avail.length) % avail.length;
    const nextIndex = avail[nextPos];
    if (nextIndex === index) return;
    index = nextIndex;
    syncActive();
    options.onFocusChange?.(items[index], index);
  }

  build();

  return {
    el: listEl,
    refresh(next: MenuItem[]): void {
      items = next;
      const avail = enabledIndexes();
      if (!avail.includes(index)) index = avail[0] ?? 0;
      build();
    },
    handleKey(e: KeyboardEvent): boolean {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          move(-1);
          return true;
        case 'ArrowDown':
        case 's':
        case 'S':
          move(1);
          return true;
        case 'Enter':
        case ' ':
        case 'Spacebar': {
          const item = items[index];
          if (item && !item.disabled) item.onSelect?.();
          return true;
        }
        default:
          return false;
      }
    },
    focusIndex(i: number): void {
      if (i === index) return;
      index = i;
      syncActive();
    },
    destroy(): void {
      clear(listEl);
      rows = [];
      listEl.remove();
    },
  };
}

/* ------------------------------------------------------------------ *
 * 标题栏 / 页脚
 * ------------------------------------------------------------------ */

export function createPageHeader(title: string, subtitle?: string, onBack?: () => void): HTMLElement {
  return h(
    'header',
    { class: 'page-header interactive' },
    onBack
      ? h('button', { class: 'pixel-btn page-back', type: 'button', text: '← 返回', onClick: onBack })
      : null,
    h(
      'div',
      { class: 'page-title-wrap' },
      h('h2', { class: 'page-title', text: title }),
      subtitle ? h('p', { class: 'page-subtitle dim', text: subtitle }) : null,
    ),
  );
}

/* ------------------------------------------------------------------ *
 * 表单控件
 * ------------------------------------------------------------------ */

export interface FieldOptions {
  label: string;
  hint?: string;
  control: HTMLElement;
}

export function createField(opts: FieldOptions): HTMLElement {
  return h(
    'label',
    { class: 'field' },
    h(
      'span',
      { class: 'field-label' },
      opts.label,
      opts.hint ? h('span', { class: 'field-hint dim', text: opts.hint }) : null,
    ),
    opts.control,
  );
}

export function createTextInput(
  value: string,
  onChange: (v: string) => void,
  opts: { type?: string; placeholder?: string; maxLength?: number } = {},
): HTMLInputElement {
  const input = h('input', {
    class: 'pixel-input',
    type: opts.type ?? 'text',
    value,
    placeholder: opts.placeholder ?? '',
    maxlength: opts.maxLength ?? 40,
  });
  input.addEventListener('input', () => onChange(input.value));
  // 输入框里不要触发场景级快捷键
  input.addEventListener('keydown', (e) => e.stopPropagation());
  return input;
}

export function createSelect<T extends string>(
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): HTMLSelectElement {
  const sel = h('select', { class: 'pixel-input' });
  for (const o of options) {
    const opt = h('option', { value: o.value, text: o.label });
    if (o.value === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value as T));
  sel.addEventListener('keydown', (e) => e.stopPropagation());
  return sel;
}

export function createToggle(
  checked: boolean,
  onChange: (v: boolean) => void,
  labels: [string, string] = ['开', '关'],
): HTMLButtonElement {
  const btn = h('button', {
    class: `pixel-btn pixel-toggle ${checked ? 'is-on' : ''}`,
    type: 'button',
    text: checked ? labels[0] : labels[1],
  });
  btn.addEventListener('click', () => {
    const next = !btn.classList.contains('is-on');
    btn.classList.toggle('is-on', next);
    btn.textContent = next ? labels[0] : labels[1];
    onChange(next);
  });
  return btn;
}

export function createSlider(
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void,
  format: (v: number) => string = (v) => String(v),
): HTMLElement {
  const out = h('span', { class: 'slider-value', text: format(value) });
  const input = h('input', {
    class: 'pixel-range',
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
  });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    onChange(v);
  });
  input.addEventListener('keydown', (e) => e.stopPropagation());
  return h('span', { class: 'slider-wrap' }, input, out);
}

/* ------------------------------------------------------------------ *
 * 提示条
 * ------------------------------------------------------------------ */

export type ToastKind = 'info' | 'ok' | 'error';

export interface ToastHandle {
  el: HTMLElement;
  show(message: string, kind?: ToastKind): void;
  destroy(): void;
}

export function createToast(): ToastHandle {
  const el = h('div', { class: 'toast-host interactive' });
  let timer = 0;
  return {
    el,
    show(message: string, kind: ToastKind = 'info'): void {
      el.textContent = message;
      el.className = `toast-host interactive is-visible toast-${kind}`;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        el.className = 'toast-host interactive';
      }, 2600);
    },
    destroy(): void {
      window.clearTimeout(timer);
      el.remove();
    },
  };
}

/* ------------------------------------------------------------------ *
 * 卡片选择（学段 / 难度用）
 * ------------------------------------------------------------------ */

export interface CardOption<T extends string> {
  value: T;
  title: string;
  desc: string;
  icon?: string;
}

export interface CardGroupHandle<T extends string> {
  el: HTMLElement;
  getValue(): T;
  setValue(v: T): void;
}

export function createCardGroup<T extends string>(
  options: CardOption<T>[],
  initial: T,
  onChange?: (v: T) => void,
): CardGroupHandle<T> {
  let value = initial;
  const el = h('div', { class: 'card-group interactive' });
  const buttons = new Map<T, HTMLButtonElement>();

  const sync = (): void => {
    for (const [v, btn] of buttons) btn.classList.toggle('is-active', v === value);
  };

  for (const opt of options) {
    const btn = h(
      'button',
      {
        class: 'card',
        type: 'button',
        onClick: () => {
          value = opt.value;
          sync();
          onChange?.(value);
        },
      },
      opt.icon ? h('span', { class: 'card-icon', text: opt.icon }) : null,
      h('span', { class: 'card-title', text: opt.title }),
      h('span', { class: 'card-desc', text: opt.desc }),
    );
    buttons.set(opt.value, btn);
    el.appendChild(btn);
  }
  sync();

  return {
    el,
    getValue: () => value,
    setValue: (v: T) => {
      value = v;
      sync();
    },
  };
}
