import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
export function localPwa(name: string): Plugin {
  let directory: string, base: string;
  return {
    name: 'dexfin-local-pwa', apply: 'build',
    configResolved(config) {
      directory = resolve(config.root, config.build.outDir); base = config.base;
      if (!base.startsWith('/') || base.startsWith('//') || !base.endsWith('/') || /[?#]/.test(base)) throw new Error('A PWA exige uma base local absoluta, como / ou /anyx/.');
    },
    transformIndexHtml: {
      order: 'post', handler() { return [
        { tag: 'link', attrs: { rel: 'manifest', href: `${base}manifest.webmanifest` }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}icon-192.png` }, injectTo: 'head' },
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" }, injectTo: 'head-prepend' },
      ]; },
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify({ id: base, name, short_name: name, description: 'Finanças pessoais com clareza e privacidade.', lang: 'pt-BR', start_url: base, scope: base, display: 'standalone', theme_color: '#101512', background_color: '#101512', icons: [192, 512].map(size => ({ src: `${base}icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable' })) }) });
    },
    async closeBundle() {
      const entries = await readdir(directory, { recursive: true, withFileTypes: true });
      const files = entries.filter(entry => entry.isFile() && entry.name !== 'sw.js' && !entry.name.endsWith('.map')).map(entry => resolve(entry.parentPath, entry.name));
      const hash = createHash('sha256'); for (const path of files.sort()) hash.update(await readFile(path));
      const urls = files.map(path => base + path.slice(directory.length + 1).replaceAll('\\', '/'));
      const prefix = `dexfin-static-${createHash('sha256').update(base).digest('hex').slice(0, 16)}-`;
      const template = await readFile(resolve('build/service-worker.js'), 'utf8');
      await writeFile(resolve(directory, 'sw.js'), template.replace('__CACHE_NAME__', JSON.stringify(`${prefix}${hash.digest('hex').slice(0, 16)}`)).replace('__CACHE_PREFIX__', JSON.stringify(prefix)).replace('__BASE_URL__', JSON.stringify(base)).replace('__PRECACHE_FILES__', JSON.stringify(urls)));
    },
  };
}
