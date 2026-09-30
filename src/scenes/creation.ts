/**
 * 角色工坊 / 新游戏的主角与阵容编辑。
 *
 * 同一个场景两种模式：
 *  - 新模式（从「新游戏」进来）：三步走完直接开局
 *  - 工坊模式（从主菜单「角色工坊」进来）：只编辑预设阵容，存回 localStorage
 *
 * 编辑结果都先放在 draft 里，只有点「开始游戏」或「保存」才真正落地——
 * 中途退出不会污染任何数据。
 */

import { loadRoster, saveRoster, resetRoster } from '@/app/roster';
import { gameStore, setActiveSlot, settingsStore } from '@/app/state';
import type { Scene, SceneContext } from '@/app/router';
import { C } from '@/render/palette';
import { drawBackground } from '@/render/tiles';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import { clampAppearance, DEFAULT_APPEARANCE } from '@/data/appearances';
import { DEFAULT_PROTAGONIST_F, DEFAULT_PROTAGONIST_M } from '@/data/presets';
import { personalityMeta, PERSONALITY_LIST } from '@/data/personalities';
import { ROLE_GROUPS, roleMeta } from '@/data/roles';
import { createCharacter, relationLabel } from '@/game/character';
import { createNewGame } from '@/game/newGame';
import type {
  Appearance,
  Character,
  Difficulty,
  Gender,
  PersonalityId,
  PhaseId,
  RoleId,
} from '@/game/types';
import { PHASE_META } from '@/game/types';
import { createAppearancePicker } from '@/ui/appearancePicker';
import { createCharacterPreview } from '@/ui/characterPreview';
import { createToast, type ToastHandle } from '@/ui/components';
import { h } from '@/ui/dom';
import { saveGame } from '@/app/save';
import type { NewGameParams } from '@/scenes/newGameScene';

interface Draft {
  phase: PhaseId;
  difficulty: Difficulty;
  aiEnabled: boolean;
  protagonist: {
    name: string;
    gender: Gender;
    personality: PersonalityId;
    appearance: Appearance;
  };
  npcs: Character[];
}

const STEP_TITLES = ['① 你是谁', '② 长什么样', '③ 班里还有谁'];

export function creationScene(): Scene {
  let step = 0;
  let mode: 'new' | 'studio' = 'new';
  let draft: Draft;
  /** 非 null 表示正在编辑第 index 个 NPC（-1 表示新建） */
  let editingIndex: number | null = null;
  let toast: ToastHandle | null = null;
  /** 「下一步」按钮的引用，用于在姓名输入时实时切换可用状态 */
  let nextBtnRef: HTMLButtonElement | null = null;

  const resetDraft = (params?: unknown): void => {
    const p = params as NewGameParams | undefined;
    if (p && p.phase) {
      mode = 'new';
      draft = {
        phase: p.phase,
        difficulty: p.difficulty,
        aiEnabled: p.aiEnabled,
        protagonist: {
          name: '',
          gender: 'm',
          personality: 'ordinary',
          appearance: clampAppearance({ ...DEFAULT_PROTAGONIST_M }),
        },
        npcs: loadRoster(),
      };
    } else {
      mode = 'studio';
      draft = {
        phase: 'g1',
        difficulty: 'normal',
        aiEnabled: settingsStore.get().ai.enabled,
        protagonist: {
          name: '',
          gender: 'm',
          personality: 'ordinary',
          appearance: clampAppearance({ ...DEFAULT_PROTAGONIST_M }),
        },
        npcs: loadRoster(),
      };
    }
    step = 0;
    editingIndex = null;
  };

  /* ---------------- 主角外观编辑器（第 2 步） ---------------- */

  function buildAppearanceStep(): HTMLElement {
    const preview = createCharacterPreview(draft.protagonist.appearance);
    const picker = createAppearancePicker(draft.protagonist.appearance, (a) => {
      draft.protagonist.appearance = a;
      draft.protagonist.gender = a.gender;
      preview.update(a);
    });
    return h(
      'div',
      { class: 'creation-split' },
      h('div', { class: 'creation-preview-col' }, preview.el),
      h('div', { class: 'creation-form-col' }, picker.el),
    );
  }

  /* ---------------- 主角基本信息（第 1 步） ---------------- */

  function buildIdentityStep(): HTMLElement {
    const nameInput = h('input', {
      class: 'pixel-input',
      type: 'text',
      maxlength: '12',
      placeholder: '输入主角姓名（最多 12 字）',
      value: draft.protagonist.name,
    });
    nameInput.addEventListener('input', () => {
      draft.protagonist.name = nameInput.value;
      // 「下一步」按钮的可用状态要跟着姓名实时变，
      // 因为按钮在 body 之外的 actions 栏里，没法靠重渲染整块 body 来刷新
      // （重渲染会把输入框焦点丢掉，正在打字的人会疯）
      if (nextBtnRef) nextBtnRef.disabled = nameInput.value.trim().length === 0;
    });
    nameInput.addEventListener('keydown', (e) => e.stopPropagation());

    const genderRow = h('div', { class: 'opt-row' });
    const genderButtons: HTMLButtonElement[] = [];
    const genderOptions: { value: Gender; label: string }[] = [
      { value: 'm', label: '男生' },
      { value: 'f', label: '女生' },
      { value: 'n', label: '不指定' },
    ];
    const syncGender = (): void => {
      genderOptions.forEach((opt, i) => {
        genderButtons[i].classList.toggle('is-active', draft.protagonist.gender === opt.value);
      });
    };
    for (const opt of genderOptions) {
      const btn = h('button', {
        class: 'opt',
        type: 'button',
        text: opt.label,
        onClick: () => {
          draft.protagonist.gender = opt.value;
          draft.protagonist.appearance = clampAppearance({
            ...draft.protagonist.appearance,
            gender: opt.value,
          });
          // 切性别时顺手换一套默认外观，省得每次都要手动调
          if (opt.value === 'm' || opt.value === 'f') {
            const preset = opt.value === 'm' ? DEFAULT_PROTAGONIST_M : DEFAULT_PROTAGONIST_F;
            draft.protagonist.appearance = clampAppearance({
              ...draft.protagonist.appearance,
              hair: preset.hair,
            });
          }
          syncGender();
        },
      });
      genderButtons.push(btn);
      genderRow.appendChild(btn);
    }
    syncGender();

    const personalityRow = h(
      'div',
      { class: 'card-group' },
      ...PERSONALITY_LIST.map((p) =>
        h(
          'button',
          {
            class: `card ${draft.protagonist.personality === p.id ? 'is-active' : ''}`,
            type: 'button',
            onClick: (e: Event) => {
              draft.protagonist.personality = p.id;
              const group = (e.currentTarget as HTMLElement).parentElement;
              group?.querySelectorAll('.card').forEach((c) => c.classList.remove('is-active'));
              (e.currentTarget as HTMLElement).classList.add('is-active');
            },
          },
          h('span', { class: 'card-title', text: p.name }),
          h('span', { class: 'card-desc', text: p.desc }),
          h('span', {
            class: 'card-desc dim',
            text: Object.entries(p.statBonus)
              .map(([k, v]) => `${k} ${(v as number) > 0 ? '+' : ''}${v}`)
              .join('  ') || '没有属性加成',
          }),
        ),
      ),
    );

    return h(
      'div',
      { class: 'creation-stack' },
      h(
        'section',
        { class: 'form-section' },
        h('h3', { class: 'section-title', text: '姓名' }),
        nameInput,
      ),
      h('section', { class: 'form-section' }, h('h3', { class: 'section-title', text: '性别' }), genderRow),
      h(
        'section',
        { class: 'form-section' },
        h('h3', { class: 'section-title', text: '性格（决定初始属性和可选选项）' }),
        personalityRow,
      ),
    );
  }

  /* ---------------- 阵容（第 3 步） ---------------- */

  function buildRosterStep(): HTMLElement {
    const list = h('div', { class: 'roster-list interactive' });

    draft.npcs.forEach((npc, index) => {
      const rel = relationLabel(npc.relation);
      list.appendChild(
        h(
          'div',
          { class: 'roster-row' },
          h(
            'div',
            { class: 'roster-main' },
            h('span', { class: 'roster-name', text: npc.name }),
            h('span', { class: 'roster-tag', text: roleMeta(npc.role).name }),
            h('span', { class: 'roster-tag', text: personalityMeta(npc.personality).name }),
            h('span', { class: 'roster-rel', style: `color:${rel.color}`, text: `好感 ${npc.relation}（${rel.name}）` }),
          ),
          h(
            'div',
            { class: 'roster-actions' },
            h('button', {
              class: 'pixel-btn',
              type: 'button',
              text: '编辑',
              onClick: () => {
                editingIndex = index;
                renderBody();
              },
            }),
            h('button', {
              class: 'pixel-btn is-danger',
              type: 'button',
              text: '删除',
              disabled: draft.npcs.length <= 1,
              onClick: () => {
                draft.npcs.splice(index, 1);
                renderBody();
              },
            }),
          ),
        ),
      );
    });

    return h(
      'div',
      { class: 'creation-stack' },
      h(
        'section',
        { class: 'form-section' },
        h('h3', { class: 'section-title', text: `班里的角色（${draft.npcs.length} 人）` }),
        h('p', {
          class: 'dim small-note',
          text: '这些人会参与随机剧情。身份决定 TA 说话的口气，性格决定 TA 的反应，好感影响剧情走向。',
        }),
        list,
      ),
      h(
        'div',
        { class: 'row-inline' },
        h('button', {
          class: 'pixel-btn pixel-btn--primary',
          type: 'button',
          text: '+ 新建角色',
          onClick: () => {
            const npc = createCharacter({
              name: '新同学',
              role: 'classmate',
              gender: 'n',
              personality: 'ordinary',
              appearance: { ...DEFAULT_APPEARANCE },
              relation: 0,
              preset: true,
            });
            draft.npcs.push(npc);
            editingIndex = draft.npcs.length - 1;
            renderBody();
          },
        }),
        h('button', {
          class: 'pixel-btn',
          type: 'button',
          text: '恢复默认阵容',
          onClick: () => {
            if (!confirm('恢复成默认的同学和老师名单？当前改动会丢失。')) return;
            draft.npcs = resetRoster();
            renderBody();
          },
        }),
      ),
    );
  }

  /* ---------------- 单个 NPC 的编辑表单 ---------------- */

  function buildNpcEditor(): HTMLElement {
    const index = editingIndex ?? -1;
    const isNew = index < 0 || index >= draft.npcs.length;
    // 对副本改，点保存才写回
    const working: Character = isNew
      ? createCharacter({ name: '新同学', role: 'classmate', gender: 'n', preset: true })
      : { ...draft.npcs[index] };

    const preview = createCharacterPreview(working.appearance);
    const picker = createAppearancePicker(working.appearance, (a) => {
      working.appearance = a;
      working.gender = a.gender;
      preview.update(a);
    });

    const nameInput = h('input', {
      class: 'pixel-input',
      type: 'text',
      maxlength: '12',
      value: working.name,
    });
    nameInput.addEventListener('input', () => {
      working.name = nameInput.value;
    });
    nameInput.addEventListener('keydown', (e) => e.stopPropagation());

    const roleSelect = h('select', { class: 'pixel-input' });
    for (const group of ROLE_GROUPS) {
      const og = h('optgroup', { label: group.label });
      for (const roleId of group.roles) {
        const opt = h('option', { value: roleId, text: roleMeta(roleId).name });
        if (roleId === working.role) opt.selected = true;
        og.appendChild(opt);
      }
      roleSelect.appendChild(og);
    }
    roleSelect.addEventListener('change', () => {
      working.role = roleSelect.value as RoleId;
    });
    roleSelect.addEventListener('keydown', (e) => e.stopPropagation());

    const personalitySelect = h('select', { class: 'pixel-input' });
    for (const p of PERSONALITY_LIST) {
      const opt = h('option', { value: p.id, text: p.name });
      if (p.id === working.personality) opt.selected = true;
      personalitySelect.appendChild(opt);
    }
    personalitySelect.addEventListener('change', () => {
      working.personality = personalitySelect.value as PersonalityId;
    });
    personalitySelect.addEventListener('keydown', (e) => e.stopPropagation());

    const relValue = h('span', { class: 'slider-value', text: String(working.relation) });
    const relInput = h('input', {
      class: 'pixel-range',
      type: 'range',
      min: '-100',
      max: '100',
      step: '5',
      value: String(working.relation),
    });
    relInput.addEventListener('input', () => {
      working.relation = Number(relInput.value);
      relValue.textContent = String(working.relation);
    });
    relInput.addEventListener('keydown', (e) => e.stopPropagation());

    const bioInput = h('textarea', {
      class: 'pixel-input pixel-textarea',
      maxlength: '60',
      placeholder: '一句话人设，会作为 AI 生成剧情时的上下文',
      value: working.bio,
    });
    bioInput.addEventListener('input', () => {
      working.bio = bioInput.value;
    });
    bioInput.addEventListener('keydown', (e) => e.stopPropagation());

    return h(
      'div',
      { class: 'creation-stack' },
      h(
        'div',
        { class: 'row-inline' },
        h('h3', { class: 'section-title', text: isNew ? '新建角色' : `编辑「${working.name}」` }),
      ),
      h(
        'div',
        { class: 'creation-split' },
        h('div', { class: 'creation-preview-col' }, preview.el),
        h(
          'div',
          { class: 'creation-form-col' },
          h(
            'section',
            { class: 'form-section' },
            h('h3', { class: 'section-title', text: '姓名' }),
            nameInput,
          ),
          h(
            'div',
            { class: 'form-grid' },
            h('label', { class: 'field' }, h('span', { class: 'field-label', text: '身份' }), roleSelect),
            h(
              'label',
              { class: 'field' },
              h('span', { class: 'field-label', text: '性格' }),
              personalitySelect,
            ),
          ),
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-label', text: `对主角好感：${working.relation}` }),
            h('span', { class: 'slider-wrap' }, relInput, relValue),
          ),
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-label', text: '一句话人设' }),
            bioInput,
          ),
        ),
      ),
      picker.el,
      h(
        'div',
        { class: 'page-actions' },
        isNew
          ? null
          : h('button', {
              class: 'pixel-btn is-danger',
              type: 'button',
              text: '删除这个角色',
              onClick: () => {
                if (!confirm(`删除「${working.name}」？`)) return;
                draft.npcs.splice(index, 1);
                editingIndex = null;
                renderBody();
              },
            }),
        h('button', {
          class: 'pixel-btn',
          type: 'button',
          text: '取消',
          onClick: () => {
            editingIndex = null;
            renderBody();
          },
        }),
        h('button', {
          class: 'pixel-btn pixel-btn--primary',
          type: 'button',
          text: '保存',
          onClick: () => {
            working.name = working.name.trim() || '无名同学';
            working.appearance = clampAppearance(working.appearance);
            if (isNew) draft.npcs.push(working);
            else draft.npcs[index] = working;
            editingIndex = null;
            renderBody();
          },
        }),
      ),
    );
  }

  /* ---------------- 渲染 ---------------- */

  let bodyEl: HTMLElement | null = null;
  let actionsEl: HTMLElement | null = null;
  let titleEl: HTMLElement | null = null;

  function renderBody(): void {
    if (!bodyEl || !actionsEl || !ctxRef) return;

    if (editingIndex !== null) {
      bodyEl.replaceChildren(buildNpcEditor());
      actionsEl.replaceChildren();
      if (titleEl) titleEl.textContent = '角色编辑';
      return;
    }

    if (titleEl) titleEl.textContent = mode === 'new' ? STEP_TITLES[step] : '角色工坊';

    const pieces: HTMLElement[] = [];
    if (mode === 'studio') {
      pieces.push(
        h('p', {
          class: 'dim small-note',
          text: '这里编辑的是预设阵容，开新游戏时会默认使用这套名单。改动保存在本机浏览器里。',
        }),
      );
    }
    pieces.push(step === 0 ? buildIdentityStep() : step === 1 ? buildAppearanceStep() : buildRosterStep());
    bodyEl.replaceChildren(...pieces);

    const canFinish =
      mode === 'studio' || draft.protagonist.name.trim().length > 0;

    const actions: HTMLButtonElement[] = [];

    if (mode === 'new' && step > 0) {
      actions.push(
        h('button', {
          class: 'pixel-btn',
          type: 'button',
          text: '← 上一步',
          onClick: () => {
            step--;
            renderBody();
          },
        }),
      );
    }

    if (mode === 'new' && step < 2) {
      const nextBtn = h('button', {
        class: 'pixel-btn pixel-btn--primary',
        type: 'button',
        text: '下一步 →',
        disabled: step === 0 && draft.protagonist.name.trim().length === 0,
        onClick: () => {
          if (step === 0 && draft.protagonist.name.trim().length === 0) return;
          step++;
          renderBody();
        },
      });
      nextBtnRef = nextBtn;
      actions.push(nextBtn);
    } else {
      nextBtnRef = null;
    }

    if (mode === 'new' && step === 2) {
      actions.push(
        h('button', {
          class: 'pixel-btn pixel-btn--primary',
          type: 'button',
          text: '开学！',
          disabled: !canFinish,
          onClick: finishNewGame,
        }),
      );
    }

    if (mode === 'studio') {
      actions.push(
        h('button', {
          class: 'pixel-btn pixel-btn--primary',
          type: 'button',
          text: '保存阵容',
          onClick: () => {
            saveRoster(draft.npcs);
            toast?.show('阵容已保存，开新游戏时会用到', 'ok');
          },
        }),
      );
    }

    actionsEl.replaceChildren(...actions);
  }

  let ctxRef: SceneContext | null = null;

  function finishNewGame(): void {
    const state = createNewGame({
      phase: draft.phase,
      difficulty: draft.difficulty,
      aiEnabled: draft.aiEnabled,
      protagonist: {
        name: draft.protagonist.name.trim() || '无名同学',
        gender: draft.protagonist.gender,
        personality: draft.protagonist.personality,
        appearance: draft.protagonist.appearance,
      },
      npcs: draft.npcs.map((n) => ({ ...n })),
    });

    // 顺手把这份阵容存成默认阵容，下次开新游戏不用重捏
    saveRoster(draft.npcs);

    gameStore.set(state);
    setActiveSlot(1);
    try {
      saveGame(1, state);
      toast?.show('已自动存到存档位 1', 'ok');
    } catch (err) {
      console.warn('[creation] 自动存档失败：', err);
    }
    ctxRef?.go('play');
  }

  return {
    id: 'creation',

    mount(ctx: SceneContext, params?: unknown): void {
      ctxRef = ctx;
      resetDraft(params);
      toast = createToast();

      bodyEl = h('div', { class: 'page-body interactive' });
      actionsEl = h('div', { class: 'page-actions interactive' });
      titleEl = h('h2', { class: 'page-title', text: '' });

      ctx.overlay.appendChild(
        h(
          'div',
          { class: 'page-scene' },
          h(
            'header',
            { class: 'page-header interactive' },
            h('button', {
              class: 'pixel-btn page-back',
              type: 'button',
              text: '← 返回',
              onClick: () => ctx.go(mode === 'new' ? 'new-game' : 'menu'),
            }),
            h(
              'div',
              { class: 'page-title-wrap' },
              titleEl,
              h('p', {
                class: 'page-subtitle dim',
                text:
                  mode === 'new'
                    ? `${PHASE_META[draft.phase].name} · 主角和阵容`
                    : '编辑预设的同学与老师',
              }),
            ),
          ),
          bodyEl,
          actionsEl,
          toast.el,
        ),
      );

      renderBody();
    },

    unmount(): void {
      toast?.destroy();
      toast = null;
      bodyEl = null;
      actionsEl = null;
      titleEl = null;
      ctxRef = null;
    },

    render(c: CanvasRenderingContext2D): void {
      drawBackground(c, mode === 'new' ? 'classroom' : 'office');
      c.globalAlpha = 0.68;
      c.fillStyle = C.void;
      px(c, 0, 0, STAGE_W, STAGE_H);
      c.globalAlpha = 1;
    },

    onKey(e: KeyboardEvent): boolean {
      if (e.key === 'Escape' && editingIndex !== null) {
        editingIndex = null;
        renderBody();
        return true;
      }
      return false;
    },
  };
}
