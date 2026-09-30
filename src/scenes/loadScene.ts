/**
 * 存档管理：读取 / 删除 / 导出 / 导入。
 * M3 阶段「读取」会先把状态装进 gameStore，再跳到 play 场景（M5 实现完整玩法）。
 */

import {
  deleteSlot,
  downloadSave,
  importGame,
  listSlots,
  loadGame,
  saveGame,
  slotKey,
} from '@/app/save';
import { gameStore, setActiveSlot } from '@/app/state';
import type { Scene, SceneContext } from '@/app/router';
import { C } from '@/render/palette';
import { drawBackground } from '@/render/tiles';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import { createPageHeader, createToast, type ToastHandle } from '@/ui/components';
import { h } from '@/ui/dom';
import { PHASE_META, SLOT_META } from '@/game/types';
import type { SaveSlotMeta } from '@/game/types';
import { findProtagonist } from '@/game/character';

function formatTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function loadScene(): Scene {
  let toast: ToastHandle | null = null;
  let bodyEl: HTMLElement | null = null;

  return {
    id: 'load',

    mount(ctx: SceneContext): void {
      toast = createToast();
      bodyEl = h('div', { class: 'page-body interactive' });

      const renderSlots = (): void => {
        if (!bodyEl) return;
        bodyEl.replaceChildren();
        const slots = listSlots();

        for (const slot of slots) {
          bodyEl.appendChild(renderSlotRow(ctx, slot, renderSlots));
        }

        bodyEl.appendChild(
          h(
            'section',
            { class: 'form-section' },
            h('h3', { class: 'section-title', text: '导入存档' }),
            h('p', {
              class: 'dim small-note',
              text: '选择同学发来的 .json 存档文件，导入后会覆盖到第 1 个存档位。',
            }),
            h(
              'div',
              { class: 'row-inline' },
              (() => {
                const file = h('input', {
                  class: 'pixel-input',
                  type: 'file',
                  accept: '.json,application/json',
                });
                file.addEventListener('change', () => {
                  const f = file.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    try {
                      const state = importGame(String(reader.result));
                      saveGame(1, state);
                      toast?.show('导入成功，已写入存档位 1', 'ok');
                      renderSlots();
                    } catch (err) {
                      toast?.show(`导入失败：${err instanceof Error ? err.message : String(err)}`, 'error');
                    }
                  };
                  reader.readAsText(f);
                });
                return file;
              })(),
            ),
          ),
        );
      };

      ctx.overlay.appendChild(
        h(
          'div',
          { class: 'page-scene' },
          createPageHeader('继续游戏', '选择要读取的进度', () => ctx.go('menu')),
          bodyEl,
          toast.el,
        ),
      );

      renderSlots();
    },

    unmount(): void {
      toast?.destroy();
      toast = null;
      bodyEl = null;
    },

    render(c: CanvasRenderingContext2D): void {
      drawBackground(c, 'corridor', { night: true });
      c.globalAlpha = 0.6;
      c.fillStyle = C.void;
      px(c, 0, 0, STAGE_W, STAGE_H);
      c.globalAlpha = 1;
    },
  };
}

function renderSlotRow(
  ctx: SceneContext,
  slot: SaveSlotMeta,
  refresh: () => void,
): HTMLElement {
  const peek = slot.exists
    ? (() => {
        try {
          const s = loadGame(slot.slot);
          return {
            name: findProtagonist(s)?.name ?? '无名',
            phase: PHASE_META[s.phase].name,
            week: s.week,
            day: s.day,
            slotName: SLOT_META[Object.keys(SLOT_META)[s.slotIndex] as keyof typeof SLOT_META]?.name ?? '',
            ai: s.aiEnabled,
          };
        } catch {
          return null;
        }
      })()
    : null;

  return h(
    'div',
    { class: `slot-card ${slot.exists ? '' : 'is-empty'}` },
    h(
      'div',
      { class: 'slot-main' },
      h('div', { class: 'slot-index', text: `存档 ${slot.slot}` }),
      slot.exists && peek
        ? h(
            'div',
            { class: 'slot-info' },
            h('div', {
              class: 'slot-line',
              text: `${peek.name} · ${peek.phase} · 第 ${peek.week} 周 第 ${peek.day} 天（${peek.slotName}）`,
            }),
            h('div', {
              class: 'slot-line dim',
              text: `${formatTime(slot.updatedAt)} · AI ${peek.ai ? '开' : '关'}`,
            }),
          )
        : h('div', { class: 'slot-info dim', text: '空存档位' }),
    ),
    h(
      'div',
      { class: 'slot-actions' },
      h('button', {
        class: 'pixel-btn pixel-btn--primary',
        type: 'button',
        text: '读取',
        disabled: !slot.exists,
        onClick: () => {
          try {
            const state = loadGame(slot.slot);
            gameStore.set(state);
            setActiveSlot(slot.slot);
            ctx.go('play');
          } catch (err) {
            alert(`读取失败：${err instanceof Error ? err.message : String(err)}`);
          }
        },
      }),
      h('button', {
        class: 'pixel-btn',
        type: 'button',
        text: '导出',
        disabled: !slot.exists,
        onClick: () => {
          try {
            downloadSave(slot.slot);
          } catch (err) {
            alert(`导出失败：${String(err)}`);
          }
        },
      }),
      h('button', {
        class: 'pixel-btn is-danger',
        type: 'button',
        text: '删除',
        disabled: !slot.exists,
        onClick: () => {
          if (!confirm(`确定删除存档 ${slot.slot}？此操作不可撤销。`)) return;
          deleteSlot(slot.slot);
          localStorage.removeItem(slotKey(slot.slot));
          refresh();
        },
      }),
    ),
  );
}
