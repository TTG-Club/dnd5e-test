/**
 * Сборка СЕРВЕРНОЙ части системы: единый самодостаточный ESM-бандл `dist/index.js`.
 *
 * Нейтральное ядро (`@vtt/shared`) и движок правил инлайнятся, поэтому папка
 * системы не зависит от `node_modules` приложения. Серверные рантайм-библиотеки
 * приложения (better-sqlite3 и пр.) остаются внешними — система их не использует,
 * список нужен лишь как страховка от случайного втягивания.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Рантайм-зависимости приложения — в бандл системы попадать не должны. */
const EXTERNAL_DEPS = [
  'better-sqlite3',
  'sharp',
  'ffmpeg-static',
  'ffprobe-static',
  'fluent-ffmpeg',
  'ws',
  'h3',
  '@silentbot1/nat-api',
];

await build({
  entryPoints: [path.join(ROOT, 'src', 'server', 'index.ts')],
  outfile: path.join(ROOT, 'dist', 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: EXTERNAL_DEPS,
  alias: {
    // Движок правил и нейтральное ядро живут в этой же репе (SDK ещё не
    // опубликован отдельным пакетом — см. README).
    '@vtt/shared/system/dnd.js': path.join(ROOT, 'src', 'engine', 'index.ts'),
    '@vtt/shared': path.join(ROOT, 'sdk', 'index.ts'),
  },
  logLevel: 'info',
});

console.log('[build-server] dist/index.js готов');
