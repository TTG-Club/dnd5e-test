/**
 * Проставляет в `system.json` версию релиза и ссылки на артефакты GitHub.
 *
 * Запускается в CI ПЕРЕД сборкой: `npm run build` копирует манифест в `dist/`,
 * поэтому и внутри архива, и в отдельно выложенном `system.json` окажутся уже
 * правильные значения.
 *
 * Две ссылки различаются НАМЕРЕННО:
 * - `download` — архив КОНКРЕТНОЙ версии (тег фиксирован);
 * - `manifest` — «latest» у GitHub: этот адрес всегда отдаёт манифест самого
 *   свежего релиза. Именно по нему VTTG проверяет обновления, поэтому он обязан
 *   быть постоянным и не зависеть от номера версии.
 *
 * Использование: node scripts/stamp-manifest.mjs <tag> <owner/repo>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = path.join(ROOT, 'system.json');

const [tag, repository] = process.argv.slice(2);

if (!tag || !repository) {
  console.error(
    'Использование: node scripts/stamp-manifest.mjs <tag> <owner/repo>',
  );

  process.exit(1);
}

// Тег вида `v1.2.3` → версия `1.2.3` (VTTG сравнивает версии по числам).
const version = tag.replace(/^v/, '');

if (!/^\d+(?:\.\d+)*$/.test(version)) {
  console.error(
    `Тег "${tag}" не похож на версию: ожидается v1.2.3 — иначе VTTG не сможет `
      + 'сравнить версии и не увидит обновление.',
  );

  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
const releaseBase = `https://github.com/${repository}/releases`;
const archiveName = `${manifest.id}.zip`;

const stamped = {
  ...manifest,
  version,
  url: `https://github.com/${repository}`,
  // Архив ИМЕННО этой версии.
  download: `${releaseBase}/download/${tag}/${archiveName}`,
  // Постоянный адрес свежего манифеста — канал обновлений.
  manifest: `${releaseBase}/latest/download/system.json`,
  readme: `https://github.com/${repository}/blob/main/README.md`,
  bugs: `https://github.com/${repository}/issues`,
  changelog: `${releaseBase}`,
};

writeFileSync(
  MANIFEST_PATH,
  `${JSON.stringify(stamped, null, 2)}\n`,
  'utf-8',
);

console.log(`[stamp-manifest] ${manifest.id} → версия ${version}`);
console.log(`[stamp-manifest] download: ${stamped.download}`);
console.log(`[stamp-manifest] manifest: ${stamped.manifest}`);
