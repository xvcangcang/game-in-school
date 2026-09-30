/**
 * 极小 DOM 构建工具。
 * 项目不引框架，所以需要这么一个 h() 来避免满屏的 createElement + appendChild。
 */

type Child = Node | string | number | null | undefined | false;

export interface ElementProps {
  class?: string;
  id?: string;
  text?: string;
  html?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
  /** 事件监听：onClick / onInput / onChange … */
  [key: `on${string}`]: unknown;
  [key: string]: unknown;
}

/**
 * 建元素。
 * - `class` / `text` / `html` / `style` / `dataset` 有专门处理
 * - 以 `on` 开头的函数属性会被当作事件监听
 * - 其余键作为 HTML 属性设置
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElementProps | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;

      if (key === 'class') {
        el.className = String(value);
      } else if (key === 'text') {
        el.textContent = String(value);
      } else if (key === 'html') {
        el.innerHTML = String(value);
      } else if (key === 'value') {
        /*
         * 表单控件的初值必须直接赋给 .value。
         * 用 setAttribute('value', ...) 对 <input> 只是设了 defaultValue（能显示），
         * 对 <textarea> 则**完全无效**——textarea 没有 value 属性这回事。
         * 这个坑踩过：编辑已有角色的「一句话人设」时文本框一直是空的。
         */
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLSelectElement
        ) {
          el.value = String(value);
        } else {
          el.setAttribute(key, String(value));
        }
      } else if (key === 'style') {
        if (typeof value === 'string') el.setAttribute('style', value);
        else Object.assign(el.style, value);
      } else if (key === 'dataset') {
        for (const [dk, dv] of Object.entries(value as Record<string, string>)) {
          el.dataset[dk] = dv;
        }
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }

  append(el, ...children);
  return el;
}

/** 追加子节点，自动跳过 null / false / undefined */
export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

/** 清空一个节点的所有子元素 */
export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** 转义 HTML（用 innerHTML 拼字符串时务必过一遍） */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
