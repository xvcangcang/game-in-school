/**
 * 事件图鉴：按学段翻看所有内置剧情，看哪些还没触发过。
 *
 * 解锁记录是跨存档的（见 app/gallery.ts），所以换一局也不会清空收藏。
 * 详情里的正文会用当前对局（如果有）渲染一遍占位符，这样能看到真实的人名。
 */

import { galleryProgress, getUnlockedEventIds, resetGallery } from '@/app/gallery';
import { loadRoster } from '@/app/roster';
import { gameStore } from '@/app/state';
import type { Scene, SceneContext } from '@/app/router';
import { C } from '@/render/palette';
import { drawBackground } from '@/render/tiles';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import { ALL_EVENTS } from '@/data/events';
import {
  nameResolverFromRoster,
  nameResolverFromState,
  renderTemplateWith,
  type NameResolver,
} from '@/game/text';
import { sfx } from '@/ui/audio';
import { createPageHeader, createToast, type ToastHandle } from '@/ui/components';
import { h } from '@/ui/dom';
import type { GameEvent, GameState, PhaseId, StatKey } from '@/game/types';
import { PHASE_META, SCENE_KIND_NAME, STAT_META } from '@/game/types';

type Filter = 'all' | PhaseId;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'g1', label: '初一' },
  { value: 'g2', label: '初二' },
  { value: 'g3', label: '初三' },
];

const TONE_MARK: Record<GameEvent['tone'], { text: string; color: string }> = {
  good: { text: '顺', color: 'var(--c-accent-2)' },
  bad: { text: '坎', color: 'var(--c-danger)' },
  neutral: { text: '常', color: 'var(--c-text-dim)' },
};

export function galleryScene(): Scene {
  let filter: Filter = 'all';
  let selected: GameEvent | null = null;
  let toast: ToastHandle | null = null;
  let listEl: HTMLElement | null = null;
  let detailEl: HTMLElement | null = null;
  let progressEl: HTMLElement | null = null;

  function eventPhase(e: GameEvent): PhaseId | 'any' {
    return e.phase && e.phase.length === 1 ? e.phase[0] : 'any';
  }

  function filteredEvents(): GameEvent[] {
    if (filter === 'all') return ALL_EVENTS;
    const phase: PhaseId = filter;
    return ALL_EVENTS.filter((e) => !e.phase || e.phase.includes(phase));
  }

  function renderList(): void {
    if (!listEl) return;
    const unlocked = getUnlockedEventIds();
    const events = filteredEvents();

    listEl.replaceChildren(
      ...events.map((e) => {
        const isUnlocked = unlocked.has(e.id);
        const tone = TONE_MARK[e.tone];
        if (!isUnlocked) {
          return h('div', {
            class: 'gallery-card is-locked',
            text: '???',
          });
        }
        const phase = eventPhase(e);
        return h(
          'button',
          {
            class: `gallery-card ${selected?.id === e.id ? 'is-active' : ''}`,
            type: 'button',
            onClick: () => {
              sfx.click();
              selected = e;
              renderList();
              renderDetail();
            },
          },
          h('span', { class: 'gallery-tone', style: `color:${tone.color}`, text: tone.text }),
          h('span', { class: 'gallery-title', text: e.title }),
          h('span', {
            class: 'gallery-meta dim',
            text: `${phase === 'any' ? '通用' : PHASE_META[phase].name} · ${SCENE_KIND_NAME[e.scene ?? 'classroom']}`,
          }),
        );
      }),
    );
  }

  function renderDetail(): void {
    if (!detailEl) return;

    if (!selected) {
      detailEl.replaceChildren(
        h('p', { class: 'dim', text: '左边点一条剧情看详情。没解锁的显示成 ???。' }),
      );
      return;
    }

    const event = selected;
    const state: GameState | null = gameStore.get();
    const unlocked = getUnlockedEventIds();

    if (!unlocked.has(event.id)) {
      detailEl.replaceChildren(h('p', { class: 'dim', text: '这条还没触发过。' }));
      return;
    }

    // 没有进行中的对局时用预设阵容来渲染名字，免得玩家看到 {npc_math_teacher} 这种占位符
    const names: NameResolver = state
      ? nameResolverFromState(state)
      : nameResolverFromRoster(loadRoster());
    const render = (t: string): string => renderTemplateWith(t, names);

    const text = render(event.text);
    const myHistory = state?.history.filter((log) => log.eventId === event.id) ?? [];

    detailEl.replaceChildren(
      h('h3', { class: 'gallery-detail-title', text: event.title }),
      h('p', { class: 'dim small-note', text: `${SCENE_KIND_NAME[event.scene ?? 'classroom']}` }),
      h('p', { class: 'dialog-text', text }),
      h('h4', { class: 'section-title', text: '选项与后果' }),
      h(
        'div',
        { class: 'gallery-choices' },
        ...event.choices.map((c, i) => {
          const deltas = describeEffects(c.effects, names);
          const picked = myHistory.some((log) => log.choiceText === c.text);
          return h(
            'div',
            { class: `gallery-choice ${picked ? 'is-picked' : ''}` },
            h('span', { class: 'choice-index', text: String(i + 1) }),
            h(
              'div',
              { class: 'gallery-choice-body' },
              h('span', { class: 'gallery-choice-text', text: render(c.text) }),
              c.resultText
                ? h('span', { class: 'dim small-note', text: render(c.resultText) })
                : null,
              deltas ? h('span', { class: 'gallery-deltas', text: deltas }) : null,
            ),
          );
        }),
      ),
      myHistory.length > 0
        ? h('p', {
            class: 'dim small-note',
            text: `当前这局遇到过 ${myHistory.length} 次，最近一次选了「${myHistory[myHistory.length - 1].choiceText}」。`,
          })
        : h('p', { class: 'dim small-note', text: '当前这一局还没遇到过。' }),
    );
  }

  function describeEffects(
    effects: GameEvent['choices'][number]['effects'],
    names: NameResolver,
  ): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(effects.stats ?? {})) {
      const meta = STAT_META[key as StatKey];
      if (!meta) continue;
      parts.push(`${meta.name} ${(value as number) > 0 ? '+' : ''}${value}`);
    }
    for (const [id, value] of Object.entries(effects.relations ?? {})) {
      const name = names.byId[id] ?? id;
      parts.push(`${name} ${(value as number) > 0 ? '+' : ''}${value}`);
    }
    return parts.join('　');
  }

  function renderAll(): void {
    renderList();
    renderDetail();
    if (progressEl) {
      const { unlocked, total } = galleryProgress();
      progressEl.textContent = `已解锁 ${unlocked} / ${total}`;
    }
  }

  return {
    id: 'gallery',

    mount(ctx: SceneContext): void {
      toast = createToast();
      progressEl = h('span', { class: 'gallery-progress' });
      listEl = h('div', { class: 'gallery-list interactive' });
      detailEl = h('div', { class: 'gallery-detail interactive' });

      const tabBar = h(
        'div',
        { class: 'tab-bar interactive' },
        ...FILTERS.map((f) =>
          h('button', {
            class: `tab ${filter === f.value ? 'is-active' : ''}`,
            type: 'button',
            text: f.label,
            'data-filter': f.value,
            onClick: () => {
              sfx.move();
              filter = f.value;
              tabBar.querySelectorAll('.tab').forEach((el) => el.classList.remove('is-active'));
              const target = tabBar.querySelector(`[data-filter="${f.value}"]`);
              target?.classList.add('is-active');
              renderAll();
            },
          }),
        ),
        h('span', { class: 'gallery-spacer' }),
        progressEl,
        h('button', {
          class: 'pixel-btn',
          type: 'button',
          text: '重置图鉴',
          onClick: () => {
            if (!confirm('清空图鉴解锁记录？已解锁的剧情会重新变成 ???。')) return;
            resetGallery();
            selected = null;
            renderAll();
            toast?.show('图鉴已重置', 'info');
          },
        }),
      );

      ctx.overlay.appendChild(
        h(
          'div',
          { class: 'page-scene' },
          createPageHeader('事件图鉴', '玩到过的剧情会在这里点亮', () => ctx.go('menu')),
          tabBar,
          h('div', { class: 'gallery-body interactive' }, listEl, detailEl),
          toast.el,
        ),
      );

      renderAll();
    },

    unmount(): void {
      toast?.destroy();
      toast = null;
      listEl = null;
      detailEl = null;
      progressEl = null;
      selected = null;
    },

    render(c: CanvasRenderingContext2D): void {
      drawBackground(c, 'home', { night: true });
      c.globalAlpha = 0.7;
      c.fillStyle = C.void;
      px(c, 0, 0, STAGE_W, STAGE_H);
      c.globalAlpha = 1;
    },
  };
}
