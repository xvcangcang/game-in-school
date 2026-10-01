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

import {
  loadProtagonistTemplate,
  loadRoster,
  resetProtagonistTemplate,
  resetRoster,
  saveProtagonistTemplate,
  saveRoster,
  type ProtagonistTemplate,
} from '@/app/roster';
import { gameStore, setActiveSlot, settingsStore } from '@/app/state';
import type { Scene, SceneContext } from '@/app/router';
import { C } from '@/render/palette';
import { drawBackground } from '@/render/tiles';
import { STAGE_H, STAGE_W, px } from '@/render/canvas';
import { clampAppearance, DEFAULT_APPEARANCE } from '@/data/appearances';
import { DEFAULT_PROTAGONIST_F, DEFAULT_PROTAGONIST_M } from '@/data/presets';
import { personalityMeta, PERSONALITY_LIST } from '@/data/personalities';
import { ROLE_GROUPS, roleMeta } from '@/data/roles';
import { createCharacter, displayTitle, relationLabel, SETTING_MAX_LENGTH, TITLE_MAX_LENGTH } from '@/game/character';
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
import { firstFreeSlot, oldestSlot, saveGame } from '@/app/save';
import type { NewGameParams } from '@/scenes/newGameScene';

interface Draft {
  phase: PhaseId;
  difficulty: Difficulty;
  aiEnabled: boolean;
  protagonist: {
    name: string;
    /** 自由填写的身份，留空就用「学生」 */
    title: string;
    /** 自由填写的设定，会原样交给 AI；关掉 AI 时没有意义 */
    setting: string;
    gender: Gender;
    personality: PersonalityId;
    appearance: Appearance;
  };
  npcs: Character[];
}

const STEP_TITLES = ['① 你是谁', '② 长什么样', '③ 班里还有谁'];
const STUDIO_STEP_TITLES = ['① 主角资料', '② 主角外观', '③ 班里的角色'];

export function creationScene(): Scene {
  let step = 0;
  let mode: 'new' | 'studio' = 'new';
  let draft: Draft;
  /** 非 null 表示正在编辑第 index 个 NPC（-1 表示新建） */
  let editingIndex: number | null = null;
  let toast: ToastHandle | null = null;
  /** 「下一步」按钮的引用，用于在姓名输入时实时切换可用状态 */
  let nextBtnRef: HTMLButtonElement | null = null;

  /** 这一局/这个模式到底会不会用到 AI。用来决定「设定」这类 AI 专用输入框是否可用。 */
  const aiInUse = (): boolean =>
    mode === 'new' ? draft.aiEnabled && settingsStore.get().ai.enabled : settingsStore.get().ai.enabled;

  /**
   * 「设定」输入框。
   *
   * 它是**纯 AI 上下文**——只写进提示词，不参与任何引擎判定。
   * 所以关掉 AI 时直接禁用并说明原因，比让玩家白写半天却毫无效果强。
   */
  function createSettingField(
    initial: string,
    onChange: (v: string) => void,
    placeholder: string,
  ): { el: HTMLElement; textarea: HTMLTextAreaElement } {
    const aiOn = aiInUse();
    const textarea = h('textarea', {
      class: 'pixel-input pixel-textarea',
      maxlength: String(SETTING_MAX_LENGTH),
      placeholder: aiOn ? placeholder : '（已关闭 AI 剧情，这里填了也不会被使用）',
      value: initial,
      disabled: !aiOn,
    });
    textarea.addEventListener('input', () => onChange(textarea.value));
    textarea.addEventListener('keydown', (e) => e.stopPropagation());

    return {
      textarea,
      el: h(
        'div',
        { class: 'field' },
        textarea,
        h('p', {
          class: 'dim small-note',
          text: aiOn
            ? `想写什么就写什么（最多 ${SETTING_MAX_LENGTH} 字），会原样交给 AI 当作背景设定。`
            : 'AI 剧情已关闭，这个输入框用不上。到「设置 → AI 剧情」打开就能填。',
        }),
      ),
    };
  }

  const templateToDraft = (t: ProtagonistTemplate): Draft['protagonist'] => ({
    name: t.name,
    title: t.title,
    setting: t.setting,
    gender: t.gender,
    personality: t.personality,
    appearance: t.appearance,
  });

  const resetDraft = (params?: unknown): void => {
    const p = params as NewGameParams | undefined;
    const template = loadProtagonistTemplate();

    if (p && p.phase) {
      mode = 'new';
      draft = {
        phase: p.phase,
        difficulty: p.difficulty,
        aiEnabled: p.aiEnabled,
        // 预填上一次在角色工坊里存下的主角设定，省得每局重敲
        protagonist: templateToDraft(template),
        npcs: loadRoster(),
      };
    } else {
      mode = 'studio';
      draft = {
        phase: 'g1',
        difficulty: 'normal',
        aiEnabled: settingsStore.get().ai.enabled,
        protagonist: templateToDraft(template),
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

    // 身份：自由填写，和同学一样。role 仍然是隐藏的 'classmate'，title 才是玩家看到的那个标签。
    const titleInput = h('input', {
      class: 'pixel-input',
      type: 'text',
      maxlength: String(TITLE_MAX_LENGTH),
      placeholder: '例如：转学生 / 班长 / 体育委员',
      value: draft.protagonist.title ?? '',
    });
    titleInput.addEventListener('input', () => {
      draft.protagonist.title = titleInput.value;
    });
    titleInput.addEventListener('keydown', (e) => e.stopPropagation());

    // 设定：想写多长写多长，原样交给 AI。关掉 AI 时它没有任何作用，所以直接禁用并说明原因。
    const settingTextarea = createSettingField(
      draft.protagonist.setting,
      (v) => {
        draft.protagonist.setting = v;
      },
      '例如：家里开小卖部，数学很差但跑得快，口头禅是「这个我会」。写什么都可以。',
    );

    const titleRow = h(
      'div',
      { class: 'form-grid' },
      h(
        'section',
        { class: 'form-section' },
        h('h3', { class: 'section-title', text: '身份' }),
        titleInput,
        h('p', {
          class: 'dim small-note',
          text: '短标签，显示在名字后面。留空就是「学生」。',
        }),
      ),
      h(
        'section',
        { class: 'form-section' },
        h('h3', { class: 'section-title', text: '设定' }),
        settingTextarea.el,
      ),
    );

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
      titleRow,
      h('section', { class: 'form-section' }, h('h3', { class: 'section-title', text: '性别' }), genderRow),
      h(
        'section',
        { class: 'form-section' },
        h('h3', { class: 'section-title', text: '性格（决定初始属性和可选选项）' }),
        personalityRow,
      ),
      mode === 'studio'
        ? h(
            'div',
            { class: 'row-inline' },
            h('button', {
              class: 'pixel-btn',
              type: 'button',
              text: '恢复默认主角',
              onClick: () => {
                if (!confirm('把默认主角恢复成初始状态？当前改动会丢失。')) return;
                draft.protagonist = templateToDraft(resetProtagonistTemplate());
                renderBody();
              },
            }),
          )
        : null,
    );
  }

  /* ---------------- 阵容（第 3 步） ---------------- */

  function buildRosterStep(): HTMLElement {
    const list = h('div', { class: 'roster-list interactive' });

    draft.npcs.forEach((npc, index) => {
      const rel = relationLabel(npc.relation, {
        role: npc.role,
        gender: npc.gender,
        protagonistGender: draft.protagonist.gender,
      });
      const title = displayTitle(npc);
      const roleName = roleMeta(npc.role).name;
      list.appendChild(
        h(
          'div',
          { class: 'roster-row' },
          h(
            'div',
            { class: 'roster-main' },
            h('span', { class: 'roster-name', text: npc.name }),
            h('span', { class: 'roster-tag roster-title', text: title }),
            // 身份和身份类别同名时（默认情况）就不重复显示了
            title === roleName ? null : h('span', { class: 'roster-tag', text: roleName }),
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

    // 身份：自由填写，和主角用的是同一个字段
    const titleInput = h('input', {
      class: 'pixel-input',
      type: 'text',
      maxlength: String(TITLE_MAX_LENGTH),
      placeholder: '例如：班长 / 隔壁班来借书的',
      value: working.title ?? '',
    });
    titleInput.addEventListener('input', () => {
      working.title = titleInput.value;
    });
    titleInput.addEventListener('keydown', (e) => e.stopPropagation());

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

    /*
     * 设定：想写多长写多长，原样交给 AI。
     * 原来这里是一个 60 字的「一句话人设」（Character.bio），但那个字段是给预设角色写死的资料用的；
     * 玩家自己写的东西走 setting，两个框长得一样、作用也重叠，索性只留一个。
     * 预设角色的 bio 仍然保留在数据里，一样会进 AI 上下文（见 describeCharacter）。
     */
    const settingField = createSettingField(
      working.setting ?? '',
      (v) => {
        working.setting = v;
      },
      '例如：其实想当美术生，但家里不同意；书包里永远有一包水果糖。',
    );

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
            h(
              'label',
              { class: 'field' },
              h(
                'span',
                { class: 'field-label' },
                '身份类别',
                h('span', { class: 'field-hint dim', text: '决定 TA 说话的口气' }),
              ),
              roleSelect,
            ),
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
            h(
              'span',
              { class: 'field-label' },
              '身份',
              h('span', { class: 'field-hint dim', text: '随便写，留空就用身份类别' }),
            ),
            titleInput,
          ),
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-label', text: `对主角好感：${working.relation}` }),
            h('span', { class: 'slider-wrap' }, relInput, relValue),
          ),
          settingField.el,
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

    const stepTitles = mode === 'new' ? STEP_TITLES : STUDIO_STEP_TITLES;
    if (titleEl) titleEl.textContent = stepTitles[step] ?? '角色工坊';

    /*
     * 工坊模式和「新游戏」走同一套三步流程，区别只在于**保存到哪里**：
     *  - 新模式：这份主角 + 阵容直接开局
     *  - 工坊模式：存成「默认主角模板」+「预设阵容」，下次开新游戏时预填
     * 之前工坊没有分步导航，step 永远停在 0，只能看到主角页，改不了同学——那是个死胡同。
     */
    const pieces: HTMLElement[] = [];
    if (mode === 'studio' && step === 0) {
      pieces.push(
        h('p', {
          class: 'dim small-note',
          text: '工坊里改的是「默认主角」和「预设阵容」，开新游戏时会用它们预填。切页自动保存，只存在本机浏览器里。',
        }),
      );
    }
    pieces.push(
      step === 0 ? buildIdentityStep() : step === 1 ? buildAppearanceStep() : buildRosterStep(),
    );
    bodyEl.replaceChildren(...pieces);

    const canFinish = mode === 'studio' || draft.protagonist.name.trim().length > 0;

    /** 工坊模式下切页就顺手存一次：否则玩家改了主角却没走到最后一步，改动会无声丢掉 */
    const goStep = (next: number): void => {
      if (mode === 'studio') saveStudioDraft();
      step = Math.max(0, Math.min(2, next));
      renderBody();
    };

    const actions: HTMLButtonElement[] = [];

    if (step > 0) {
      actions.push(
        h('button', {
          class: 'pixel-btn',
          type: 'button',
          text: '← 上一步',
          onClick: () => goStep(step - 1),
        }),
      );
    }

    if (step < 2) {
      const nextBtn = h('button', {
        class: 'pixel-btn pixel-btn--primary',
        type: 'button',
        text: '下一步 →',
        // 新模式必须有名字才能继续；工坊模式允许先留着空
        disabled: mode === 'new' && step === 0 && draft.protagonist.name.trim().length === 0,
        onClick: () => {
          if (mode === 'new' && step === 0 && draft.protagonist.name.trim().length === 0) return;
          goStep(step + 1);
        },
      });
      nextBtnRef = nextBtn;
      actions.push(nextBtn);
    } else {
      nextBtnRef = null;
    }

    if (step === 2) {
      actions.push(
        mode === 'new'
          ? h('button', {
              class: 'pixel-btn pixel-btn--primary',
              type: 'button',
              text: '开学！',
              disabled: !canFinish,
              onClick: finishNewGame,
            })
          : h('button', {
              class: 'pixel-btn pixel-btn--primary',
              type: 'button',
              text: '完成',
              onClick: () => {
                saveStudioDraft();
                ctxRef?.go('menu');
              },
            }),
      );
    }

    actionsEl.replaceChildren(...actions);
  }

  /** 工坊模式的保存：主角模板 + 预设阵容一起存 */
  function saveStudioDraft(): void {
    saveProtagonistTemplate({
      name: draft.protagonist.name.trim(),
      title: draft.protagonist.title.trim(),
      setting: draft.protagonist.setting.trim(),
      gender: draft.protagonist.gender,
      personality: draft.protagonist.personality,
      appearance: draft.protagonist.appearance,
    });
    saveRoster(draft.npcs);
    toast?.show('已保存：默认主角 + 预设阵容', 'ok');
  }

  let ctxRef: SceneContext | null = null;

  /**
   * 新游戏该存到哪个位。
   *
   * 以前这里写死 1（`saveGame(1, state)`），于是每开一局都把上一个存档顶掉，
   * 2、3 号位永远空着——玩家根本用不到那两位。
   * 现在的规矩：优先第一个空位；三个都满了，问一句再覆盖最旧的那个。
   * 返回 null 表示玩家不愿意覆盖，这时候**不该开局**（原因见 finishNewGame）。
   */
  function pickSlotForNewGame(): number | null {
    const free = firstFreeSlot();
    if (free !== null) return free;

    const oldest = oldestSlot();
    const ok = confirm(
      `三个存档位都满了。\n\n要覆盖最旧的「存档 ${oldest}」吗？\n想保留它就点取消，先去「继续游戏」里删掉一个。`,
    );
    return ok ? oldest : null;
  }

  function finishNewGame(): void {
    /*
     * 存档位要在建局**之前**定下来：
     * 三个位都满、玩家又不想覆盖时，直接不开这一局——否则游戏照样能玩，
     * 但进度无处可存，一关页面就全没了，那比拦住更坑。
     */
    const slot = pickSlotForNewGame();
    if (slot === null) {
      toast?.show('腾不出存档位，本局没有开始。去「继续游戏」删掉一个再试。', 'error');
      return;
    }

    const state = createNewGame({
      phase: draft.phase,
      difficulty: draft.difficulty,
      aiEnabled: draft.aiEnabled,
      protagonist: {
        name: draft.protagonist.name.trim() || '无名同学',
        title: draft.protagonist.title,
        setting: draft.protagonist.setting,
        gender: draft.protagonist.gender,
        personality: draft.protagonist.personality,
        appearance: draft.protagonist.appearance,
      },
      npcs: draft.npcs.map((n) => ({ ...n })),
    });

    // 顺手把主角和阵容存成默认值，下次开新游戏不用重捏
    saveProtagonistTemplate({
      name: draft.protagonist.name.trim(),
      title: draft.protagonist.title.trim(),
      setting: draft.protagonist.setting.trim(),
      gender: draft.protagonist.gender,
      personality: draft.protagonist.personality,
      appearance: draft.protagonist.appearance,
    });
    saveRoster(draft.npcs);

    gameStore.set(state);
    setActiveSlot(slot);
    try {
      saveGame(slot, state);
      toast?.show(`新游戏已存到存档位 ${slot}`, 'ok');
    } catch (err) {
      console.warn('[creation]自动存档失败：', err);
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
                    : '默认主角 + 预设的同学与老师',
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
