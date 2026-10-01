import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * 版本号只在 package.json 里写一次，构建时注入到代码里。
 * 用 fs 读而不是 `import pkg from './package.json'`，省得为配置文件单独开 resolveJsonModule。
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

/**
 * base 用相对路径：构建产物可以直接丢进任意子目录托管（GitHub Pages / 校内服务器）。
 * 开发期把 /api 代理到本地 Node 代理服务，避免浏览器直连模型的 CORS 问题。
 */
export default defineConfig({
  base: './',
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
