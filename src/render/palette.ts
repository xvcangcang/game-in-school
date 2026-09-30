/**
 * 调色板 —— 与 src/styles/global.css 里的 CSS 变量一一对应。
 * 改颜色请两边一起改，否则 Canvas 和 DOM 会出现色差。
 */

export const C = {
  void: '#0d1117',
  bg: '#1b2430',
  panel: '#2b3a4a',
  panel2: '#3d5170',
  line: '#56789b',
  sky: '#6fc3df',
  ink: '#0d1117',
  text: '#e8e6d9',
  textDim: '#9aa7b4',
  accent: '#f2b134',
  accent2: '#6fbf73',
  danger: '#e05c5c',
  pink: '#e87ea1',

  /* 场景专用色 */
  blackboard: '#2f6b4f',
  blackboardDark: '#24523c',
  chalk: '#e8e6d9',
  wood: '#c9a227',
  woodDark: '#8a6f14',
  desk: '#d9a066',
  deskDark: '#a9713d',
  floor: '#c68642',
  floorDark: '#8d5524',
  wall: '#e8dcc0',
  wallDark: '#c9bd9c',
  window: '#8fd3e8',
  corridor: '#b8c6cf',
  corridorDark: '#8b9aa5',
  grass: '#6fbf73',
  grassDark: '#4f9354',
  brick: '#b03a2e',
  brickDark: '#8c2b22',
  night: '#1a2340',
  nightSky: '#2b3a6b',
} as const;

/** 通用深色描边 */
export const OUTLINE = '#1a1410';
