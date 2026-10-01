import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * 版本号只在 package.json 里写一次，构建时注入到代码里。
 * 用 fs 读而不是 `import pkg from './package.json'`，省得为配置文件单独开 resolveJsonModule。
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

/**
 * 把版本号与构建时刻写进 index.html 的 meta。
 *
 * 为什么不只用 define：**Vite 8 的 dev 模式不会替换 __APP_VERSION__**（实测），只有 build 才替换。
 * 那样本地开发时菜单会显示 "vdev"。transformIndexHtml 在 dev 与 build 都会执行，
 * 两边都能读到真实版本。define 保留着当兜底。
 */
function versionMetaPlugin(): Plugin {
  const stamp = new Date().toISOString();
  return {
    name: 'app-version-meta',
    transformIndexHtml(html: string): string {
      return html.replace(
        '    <title>',
        `    <meta name="app-version" content="${pkg.version}" />\n` +
          `    <meta name="app-build" content="${stamp}" />\n` +
          '    <title>',
      );
    },
  };
}

/**
 * base 用相对路径：构建产物可以直接丢进任意子目录托管（GitHub Pages / 校内服务器）。
 * 开发期把 /api 代理到本地 Node 代理服务，避免浏览器直连模型的 CORS 问题。
 */
export default defineConfig({
  base: './',
  plugins: [versionMetaPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    target: 'es2022',
  },
});
