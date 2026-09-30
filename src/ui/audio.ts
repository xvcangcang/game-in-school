/**
 * 8-bit 音效：用 WebAudio 实时合成，不加载任何音频文件。
 *
 * 这块的难点不是"怎么发声"，而是"怎么不难听"。踩过的坑：
 *  1. 方波叠加会严重削波 → 必须过一条带限幅的母线，并限制同时发声的数量
 *  2. 高频方波连续触发会刺耳 → 打字音改用短促的噪声脉冲 + 高通，而不是方波
 *  3. 任何"每个字/每次移动都响"的音效都必须节流，否则就是噪音
 *
 * 所以这里有三道闸：**母线限幅** + **复音数上限** + **每个音效独立节流**。
 * 浏览器策略要求 AudioContext 由用户手势创建，故懒加载；不支持或隐私模式下静默失败。
 */

import { settingsStore } from '@/app/state';

/* ------------------------------------------------------------------ *
 * 音频图：source → voice gain → bus(lowpass) → master → limiter → 输出
 * ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let bus: BiquadFilterNode | null = null;
let master: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** 同时发声的上限。超过就直接丢弃新声音，宁可少响也不要糊成一片 */
const MAX_VOICES = 8;

/** 统计口径：调试与自动化测试用 */
export const audioStats = {
  scheduled: 0,
  droppedThrottle: 0,
  droppedVoices: 0,
  startedAt: 0,
};

/** 正在发声的结束时刻（用于数复音数） */
let voices: number[] = [];

/** 音量 100% 时母线的增益。实际音量 = 这个值 × 设置里的 sfxVolume */
const MASTER_BASE = 0.32;

function masterGainValue(): number {
  const s = settingsStore.get();
  if (!s.sfx) return 0;
  const v = typeof s.sfxVolume === 'number' ? s.sfxVolume : 0.5;
  return MASTER_BASE * Math.max(0, Math.min(1, v));
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    ctx = new Ctor();

    // 低通：削掉方波最扎耳朵的那部分高频
    bus = ctx.createBiquadFilter();
    bus.type = 'lowpass';
    bus.frequency.value = 4200;
    bus.Q.value = 0.7;

    master = ctx.createGain();
    master.gain.value = masterGainValue();

    // 限幅器：多声部叠加时兜住峰值，避免削波产生的爆音
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;

    bus.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);

    audioStats.startedAt = Date.now();
    return ctx;
  } catch {
    return null;
  }
}

/** 设置里的开关与音量直接映射到母线，改动立刻生效（正在响的也会跟着变） */
export function applySfxSetting(): void {
  if (!master || !ctx) return;
  const gain = masterGainValue();
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(gain, t, 0.01);
}

/* ------------------------------------------------------------------ *
 * 节流
 * ------------------------------------------------------------------ */

/** 每个音效名的最小间隔（毫秒）。key 就是音效名 */
const THROTTLE_MS: Record<string, number> = {
  // 悬停音是触发最频繁的一个，间隔给大一点，不然划过菜单就像在打电报
  move: 120,
  click: 60,
  tick: 110,
  confirm: 120,
  cancel: 120,
  good: 200,
  bad: 200,
  bell: 400,
  fanfare: 800,
};

const lastPlayedAt = new Map<string, number>();

function throttled(name: string): boolean {
  const min = THROTTLE_MS[name] ?? 0;
  const now = performance.now();
  const last = lastPlayedAt.get(name) ?? -Infinity;
  if (now - last < min) {
    audioStats.droppedThrottle++;
    return true;
  }
  lastPlayedAt.set(name, now);
  return false;
}

/* ------------------------------------------------------------------ *
 * 发声原语
 * ------------------------------------------------------------------ */

interface ToneOptions {
  name: string;
  freq: number;
  /** 持续秒数 */
  dur?: number;
  type?: OscillatorType;
  /** 滑到另一个频率，做出"叮——"或"咚"的效果 */
  slideTo?: number;
  delay?: number;
  /** 0~1，越大越响 */
  gain?: number;
  /** 跳过节流（旋律内部的音符用） */
  bypassThrottle?: boolean;
}

function tone(opts: ToneOptions): void {
  if (!settingsStore.get().sfx) return;
  if (!opts.bypassThrottle && throttled(opts.name)) return;

  const c = ensureContext();
  if (!c || !bus) return;
  if (c.state === 'suspended') void c.resume();

  const now = c.currentTime;
  // 清掉已经结束的声部再数
  voices = voices.filter((end) => end > now);
  if (voices.length >= MAX_VOICES) {
    audioStats.droppedVoices++;
    return;
  }

  const { freq, dur = 0.08, type = 'square', slideTo, delay = 0, gain = 1 } = opts;
  const t0 = now + delay;
  const attack = Math.min(0.008, dur * 0.25);
  const release = Math.max(0.02, dur * 0.6);

  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (typeof slideTo === 'number') {
    osc.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
  }

  const env = c.createGain();
  // 起音要快、收音要软，否则方波的头尾会"啪"一下
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + attack);
  env.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - release));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);

  osc.connect(env);
  env.connect(bus);

  const endAt = t0 + dur + release + 0.02;
  osc.start(t0);
  osc.stop(endAt);
  voices.push(endAt);
  audioStats.scheduled++;
}

/** 一段白噪声，用来做"哒"这类不需要音高的音效 */
function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.max(1, Math.floor(c.sampleRate * 0.03));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    // 自带衰减包络，听起来像轻敲而不是"嘶——"
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  noiseBuffer = buffer;
  return buffer;
}

/**
 * 噪声脉冲。比方波柔和得多，适合打字机、翻页这种高频重复的音。
 */
function noiseBlip(name: string, gain: number, highpass: number, dur = 0.03): void {
  if (!settingsStore.get().sfx) return;
  if (throttled(name)) return;

  const c = ensureContext();
  if (!c || !bus) return;
  if (c.state === 'suspended') void c.resume();

  const now = c.currentTime;
  voices = voices.filter((end) => end > now);
  if (voices.length >= MAX_VOICES) {
    audioStats.droppedVoices++;
    return;
  }

  const src = c.createBufferSource();
  src.buffer = getNoise(c);

  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = highpass;

  const env = c.createGain();
  env.gain.setValueAtTime(gain, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(hp);
  hp.connect(env);
  env.connect(bus);

  const endAt = now + dur + 0.01;
  src.start(now);
  src.stop(endAt);
  voices.push(endAt);
  audioStats.scheduled++;
}

/** 一串音符，用来做"上课铃""升学"这类小旋律 */
function melody(
  name: string,
  notes: number[],
  opts: { step?: number; dur?: number; type?: OscillatorType; gain?: number } = {},
): void {
  if (!settingsStore.get().sfx) return;
  if (throttled(name)) return;
  const { step = 0.09, dur = 0.12, type = 'square', gain = 0.8 } = opts;
  notes.forEach((f, i) =>
    tone({
      name,
      freq: f,
      dur,
      type,
      gain,
      delay: i * step,
      // 整条旋律已经节流过一次，内部音符不再各自节流，否则会被吃掉
      bypassThrottle: true,
    }),
  );
}

const NOTE = {
  C5: 523,
  D5: 587,
  E5: 659,
  G5: 784,
  A5: 880,
  C6: 1047,
  E6: 1319,
  G4: 392,
  E4: 330,
  C4: 262,
  A4: 440,
};

/* ------------------------------------------------------------------ *
 * 对外音效
 * ------------------------------------------------------------------ */

export const sfx = {
  /** 光标移动：很轻很短，菜单里最常响的一个 */
  move(): void {
    tone({ name: 'move', freq: NOTE.E5, dur: 0.028, type: 'square', gain: 0.28 });
  },

  /** 点击 / 确认一个按钮 */
  click(): void {
    tone({ name: 'click', freq: NOTE.A5, dur: 0.035, type: 'square', gain: 0.5 });
  },

  /** 进入下一步（两步上行，有"前进"的感觉） */
  confirm(): void {
    melody('confirm', [NOTE.E5, NOTE.A5], { step: 0.055, dur: 0.06, gain: 0.55 });
  },

  /** 取消 / 返回 */
  cancel(): void {
    tone({ name: 'cancel', freq: NOTE.A5, dur: 0.09, type: 'square', gain: 0.5, slideTo: NOTE.E4 });
  },

  /** 好事发生 */
  good(): void {
    melody('good', [NOTE.C5, NOTE.E5, NOTE.G5], { step: 0.06, dur: 0.09, gain: 0.6 });
  },

  /** 坏事发生 */
  bad(): void {
    melody('bad', [NOTE.C4, NOTE.E4], { step: 0.09, dur: 0.13, type: 'triangle', gain: 0.7 });
  },

  /** 上课铃：只在新的一天开始时响，不是每个时段都响 */
  bell(): void {
    melody('bell', [NOTE.C6, NOTE.C6], { step: 0.17, dur: 0.1, type: 'sine', gain: 0.5 });
  },

  /** 期末结算 / 升学 */
  fanfare(): void {
    melody('fanfare', [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.G5, NOTE.C6], {
      step: 0.11,
      dur: 0.15,
      gain: 0.7,
    });
  },

  /**
   * 打字机的"哒"。
   * 用噪声脉冲而不是方波——连续触发时方波会变成刺耳的电子音。
   */
  type(): void {
    noiseBlip('tick', 0.16, 2400, 0.022);
  },
};

/** 调试用：把每种音效都播一遍 */
export function playAllSfx(): void {
  const order: [string, () => void][] = [
    ['move', sfx.move],
    ['click', sfx.click],
    ['confirm', sfx.confirm],
    ['good', sfx.good],
    ['bad', sfx.bad],
    ['bell', sfx.bell],
    ['fanfare', sfx.fanfare],
    ['type', sfx.type],
  ];
  // 逐个播放时清掉节流记录，否则会被自己的节流吃掉
  order.forEach(([, fn], i) => {
    window.setTimeout(() => {
      lastPlayedAt.clear();
      fn();
    }, i * 320);
  });
}

/** 调试用：把统计快照给出来（自动化测试会读它） */
export function audioStatsSnapshot(): typeof audioStats & { voices: number; running: boolean } {
  const now = ctx?.currentTime ?? 0;
  return {
    ...audioStats,
    voices: voices.filter((end) => end > now).length,
    running: Boolean(ctx) && ctx?.state === 'running',
  };
}

/** 调试用：重置统计 */
export function resetAudioStats(): void {
  audioStats.scheduled = 0;
  audioStats.droppedThrottle = 0;
  audioStats.droppedVoices = 0;
  voices = [];
  lastPlayedAt.clear();
}
