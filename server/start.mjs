/**
 * 生产启动入口。
 *
 * 为什么不直接 `"start": "npm run build && node server/index.mjs"`：
 * PocketBay 要按 `package.json` 的 start 去认「这是个 Node 应用」，
 * 复合命令（npm run build && node …）看着不像一个标准的 Node 服务入口；
 * 而 `node <文件>` 是最没有歧义的写法。
 *
 * 但删掉构建又不行：平台有可能直接跑 `npm start` 而不先构建。
 * 所以这里自己判断一次——dist 不在就先构建，再交给真正的服务。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.log('[start] 没有构建产物，先跑一次 npm run build');
  const r = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: false });
  if (r.status !== 0) {
    console.error('[start] 构建失败，退出');
    process.exit(r.status ?? 1);
  }
}

// 动态 import：确保上面的构建先跑完，服务再去读 dist
await import('./index.mjs');
