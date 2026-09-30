/**
 * 外观选择器：肤色 / 发型 / 发色 / 校服 / 配饰 / 性别。
 * 只负责产出 Appearance，具体长什么样由 render/sprite.ts 决定。
 */

import { ACCESSORIES, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, UNIFORMS } from '@/data/appearances';
import type { Appearance, Gender } from '@/game/types';
import { h } from '@/ui/dom';

export interface AppearancePickerHandle {
  el: HTMLElement;
  getValue(): Appearance;
  setValue(a: Appearance): void;
}

interface OptionRow<T> {
  label: string;
  options: { value: T; label: string; color?: string }[];
  get(a: Appearance): T;
  set(a: Appearance, v: T): Appearance;
}

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'm', label: '男生' },
  { value: 'f', label: '女生' },
  { value: 'n', label: '不指定' },
];

export function createAppearancePicker(
  initial: Appearance,
  onChange: (a: Appearance) => void,
): AppearancePickerHandle {
  let value: Appearance = { ...initial };

  const rows: OptionRow<unknown>[] = [
    {
      label: '性别',
      options: GENDERS,
      get: (a) => a.gender,
      set: (a, v) => ({ ...a, gender: v as Gender }),
    },
    {
      label: '肤色',
      options: SKIN_TONES.map((color, i) => ({ value: i, label: `肤色${i + 1}`, color })),
      get: (a) => a.skin,
      set: (a, v) => ({ ...a, skin: v as number }),
    },
    {
      label: '发型',
      options: HAIR_STYLES.map((label, i) => ({ value: i, label })),
      get: (a) => a.hair,
      set: (a, v) => ({ ...a, hair: v as number }),
    },
    {
      label: '发色',
      options: HAIR_COLORS.map((color, i) => ({ value: color, label: `发色${i + 1}`, color })),
      get: (a) => a.hairColor,
      set: (a, v) => ({ ...a, hairColor: v as string }),
    },
    {
      label: '校服',
      options: UNIFORMS.map((u, i) => ({ value: i, label: u.name, color: u.body })),
      get: (a) => a.uniform,
      set: (a, v) => ({ ...a, uniform: v as number }),
    },
    {
      label: '配饰',
      options: ACCESSORIES.map((label, i) => ({ value: i, label })),
      get: (a) => a.accessory,
      set: (a, v) => ({ ...a, accessory: v as number }),
    },
  ];

  const el = h('div', { class: 'appearance-picker interactive' });
  const buttonRefs: { row: number; btn: HTMLButtonElement; optionValue: unknown }[] = [];

  const sync = (): void => {
    for (const ref of buttonRefs) {
      const row = rows[ref.row];
      ref.btn.classList.toggle('is-active', row.get(value) === ref.optionValue);
    }
  };

  rows.forEach((row, rowIndex) => {
    const optionEls = row.options.map((opt) => {
      const isColor = typeof opt.color === 'string';
      const btn = h(
        'button',
        {
          class: `opt ${isColor ? 'opt-swatch' : ''}`,
          type: 'button',
          title: opt.label,
          onClick: () => {
            value = row.set(value, opt.value);
            sync();
            onChange(value);
          },
        },
        isColor
          ? h('span', { class: 'swatch', style: `background:${opt.color}` })
          : null,
        h('span', { class: 'opt-label', text: opt.label }),
      );
      buttonRefs.push({ row: rowIndex, btn, optionValue: opt.value });
      return btn;
    });

    el.appendChild(
      h(
        'div',
        { class: 'appearance-row' },
        h('span', { class: 'appearance-label', text: row.label }),
        h('div', { class: 'appearance-options' }, ...optionEls),
      ),
    );
  });

  sync();

  return {
    el,
    getValue: () => ({ ...value }),
    setValue(a: Appearance): void {
      value = { ...a };
      sync();
    },
  };
}
