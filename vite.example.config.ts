import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export default defineConfig({
  root: fileURLToPath(new URL('./src/example', import.meta.url)),
  base: './',
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'example-license-notices',
      generateBundle() {
        const materials = [
          ['Access Atlas', './LICENSE'],
          ['React', './node_modules/react/LICENSE'],
          ['React DOM', './node_modules/react-dom/LICENSE'],
          ['Scheduler', './node_modules/scheduler/LICENSE'],
          ['Lucide', './node_modules/lucide-react/LICENSE'],
          ['Zod', './node_modules/zod/LICENSE'],
          ['Manrope', './node_modules/@fontsource-variable/manrope/LICENSE'],
          ['Vite', './node_modules/vite/LICENSE.md'],
        ];
        const source = materials
          .map(
            ([name, path]) =>
              name +
              '\n' +
              '='.repeat(name.length) +
              '\n\n' +
              readFileSync(new URL(path, import.meta.url), 'utf8'),
          )
          .join('\n\n');
        this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_LICENSES.txt', source });
      },
    },
  ],
  build: {
    outDir: fileURLToPath(new URL('./dist-example', import.meta.url)),
    emptyOutDir: true,
  },
});

