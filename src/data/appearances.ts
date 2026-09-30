/**
 * 程序化像素美术的「部件表」。
 *
 * 这里只描述有哪些部件、什么颜色；真正的绘制在 render/sprite.ts。
 * 分成两层的理由：AI 生成角色时只需要选索引，不需要懂画法。
 *
 * 注意：新增部件请**追加到数组末尾**，不要插到中间——存档里存的是索引。
 */

import type { Gender } from '@/game/types';

/** 肤色 */
export const SKIN_TONES = ['#f8d8bd', '#eec39a', '#d9a066', '#b87d4b', '#8d5524', '#5d3a1a'];

/** 发色 */
export const HAIR_COLORS = [
  '#1b1b1f', // 黑
  '#3b2314', // 深棕
  '#6b4423', // 棕
  '#a9713d', // 浅棕
  '#c9a227', // 金
  '#b03a2e', // 红
  '#7d3c98', // 紫
  '#2e86c1', // 蓝
  '#d5d8dc', // 银
];

/** 发型：索引对应 */
export const HAIR_STYLES = ['短发', '齐耳', '马尾', '寸头', '凌乱', '双马尾', '蘑菇头', '卷发'];

/** 校服配色 */
export const UNIFORMS = [
  { name: '蓝白运动服', body: '#e9eff6', accent: '#3d6ea8', collar: '#2c5282' },
  { name: '红白运动服', body: '#f7ecec', accent: '#b03a2e', collar: '#8c2b22' },
  { name: '墨绿制服', body: '#2f6b4f', accent: '#e8e6d9', collar: '#1f4a36' },
  { name: '藏青制服', body: '#2c3e6b', accent: '#e8e6d9', collar: '#1d2b4d' },
  { name: '米黄校服', body: '#e8dcc0', accent: '#8a6f3d', collar: '#6b5528' },
];

/** 配饰，0 必须是「无」 */
export const ACCESSORIES = ['无', '眼镜', '发带', '鸭舌帽', '耳机', '创可贴', '蝴蝶结'];

/** 新建角色时的随机外观 */
export interface AppearanceSpec {
  gender: Gender;
  skin: number;
  hair: number;
  hairColor: string;
  uniform: number;
  accessory: number;
}

export const DEFAULT_APPEARANCE: AppearanceSpec = {
  gender: 'n',
  skin: 1,
  hair: 0,
  hairColor: HAIR_COLORS[0],
  uniform: 0,
  accessory: 0,
};

/** 校验并夹取部件索引，防止 AI 或手改存档给出越界值 */
export function clampAppearance(a: Partial<AppearanceSpec>): AppearanceSpec {
  const pick = (v: unknown, len: number, fallback: number): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback;
    return Math.min(len - 1, Math.max(0, n));
  };
  return {
    gender: a.gender === 'm' || a.gender === 'f' || a.gender === 'n' ? a.gender : 'n',
    skin: pick(a.skin, SKIN_TONES.length, DEFAULT_APPEARANCE.skin),
    hair: pick(a.hair, HAIR_STYLES.length, DEFAULT_APPEARANCE.hair),
    hairColor:
      typeof a.hairColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(a.hairColor)
        ? a.hairColor
        : HAIR_COLORS[0],
    uniform: pick(a.uniform, UNIFORMS.length, DEFAULT_APPEARANCE.uniform),
    accessory: pick(a.accessory, ACCESSORIES.length, DEFAULT_APPEARANCE.accessory),
  };
}
