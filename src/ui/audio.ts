/**
 * 8-bit 音效：用 WebAudio 实时合成，不加载任何音频文件。
 *
 * 浏览器的策略是「音频上下文必须由用户手势创建」，所以这里**懒加载**：
 * 第一次播放（必然发生在某次点击里）才建上下文。
 * 隐私模式或浏览器不支持时静默失败，绝不影响游戏。
 */

import { settingsStore } from '@/app/state';

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function ensureContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.22;
    masterGain.connect(audioCtx.destination);
    return audioCtx;
  } catch {
    return null;
  }
}

interface ToneOptions {
  freq: number;
  /** 持续秒数 */
  dur?: number;
  type?: OscillatorType;
  /** 滑到另一个频率，做出"叮——"或"咚"的效果 */
  slideTo?: number;
  delay?: number;
  gain?: number;
}

function tone(opts: ToneOptions): void {
  if (!settingsStore.get().sfx) return;
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  // 有些浏览器会把上下文挂起，用户交互时恢复一下
  if (ctx.state === 'suspended') void ctx.resume();

  const { freq, dur = 0.08, type = 'square', slideTo, delay = 0, gain = 1 } = opts;
  const t0 = ctx.currentTime + delay;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (typeof slideTo === 'number') {
    osc.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(env);
  env.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 一串音符，用来做"上课铃""升级"这类小旋律 */
function melody(notes: number[], opts: { step?: number; dur?: number; type?: OscillatorType } = {}): void {
  const { step = 0.09, dur = 0.12, type = 'square' } = opts;
  notes.forEach((f, i) => tone({ freq: f, dur, type, delay: i * step }));
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

export const sfx = {
  /** 光标移动 */
  move(): void {
    tone({ freq: NOTE.E5, dur: 0.04, type: 'square', gain: 0.7 });
  },
  /** 确认 / 点击 */
  click(): void {
    tone({ freq: NOTE.A5, dur: 0.05 });
  },
  /** 进入下一步 */
  confirm(): void {
    melody([NOTE.E5, NOTE.A5], { step: 0.06, dur: 0.08 });
  },
  /** 取消 / 返回 */
  cancel(): void {
    tone({ freq: NOTE.A5, dur: 0.1, slideTo: NOTE.E4 });
  },
  /** 好事发生 */
  good(): void {
    melody([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], { step: 0.07, dur: 0.1 });
  },
  /** 坏事发生 */
  bad(): void {
    melody([NOTE.C4, NOTE.E4], { step: 0.1, dur: 0.16, type: 'triangle' });
  },
  /** 上课铃：两声短促的高音 */
  bell(): void {
    melody([NOTE.C6, NOTE.C6], { step: 0.16, dur: 0.12, type: 'sine' });
  },
  /** 期末结算 / 升学 */
  fanfare(): void {
    melody([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.G5, NOTE.C6], { step: 0.12, dur: 0.18 });
  },
  /** 打字机的轻微"哒" */
  type(): void {
    tone({ freq: 1400 + Math.random() * 400, dur: 0.012, type: 'square', gain: 0.35 });
  },
};

/** 调试用：把每种音效都播一遍 */
export function playAllSfx(): void {
  sfx.move();
  window.setTimeout(() => sfx.click(), 200);
  window.setTimeout(() => sfx.confirm(), 400);
  window.setTimeout(() => sfx.good(), 700);
  window.setTimeout(() => sfx.bad(), 1100);
  window.setTimeout(() => sfx.bell(), 1500);
  window.setTimeout(() => sfx.fanfare(), 1900);
}
