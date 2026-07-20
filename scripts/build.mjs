/**
 * Полная сборка папки системы, готовой к установке в VTTG.
 *
 * Результат `dist/`: `index.js` (сервер) + `client.js`/`client.css` (клиент) +
 * `system.json` + `data/` (справочники и компендиум). Ровно эту папку архивируют
 * в релиз, на который указывает поле `download` манифеста.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');

/** Расширения кода — в `data/` не копируются (код уже в бандлах). */
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.map',
]);

/**
 * Запускает шаг сборки, прерывая всё при ненулевом коде выхода.
 *
 * @param command - исполняемая команда
 * @param args - аргументы
 */
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/**
 * Рекурсивно копирует только НЕ-кодовые файлы (данные, ассеты).
 *
 * @param sourceDir - откуда
 * @param targetDir - куда
 * @returns число скопированных файлов
 */
function copyDataFiles(sourceDir, targetDir) {
  let copied = 0;

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copied += copyDataFiles(sourcePath, targetPath);
      continue;
    }

    if (CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    mkdirSync(path.dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath);
    copied += 1;
  }

  return copied;
}

// 1. Клиент (vite создаёт dist/ заново — поэтому он первым).
run('npx', ['vite', 'build']);

// 2. Сервер.
run('node', ['scripts/build-server.mjs']);

// 3. Манифест системы.
cpSync(path.join(ROOT, 'system.json'), path.join(DIST, 'system.json'));

// 4. Справочные данные и компендиум (лежат внутри исходников движка).
const dataSource = path.join(ROOT, 'src', 'engine');
const dataTarget = path.join(DIST, 'data');

const dataFiles = existsSync(dataSource)
  ? copyDataFiles(dataSource, dataTarget)
  : 0;

const clientSize = existsSync(path.join(DIST, 'client.js'))
  ? statSync(path.join(DIST, 'client.js')).size
  : 0;

const serverSize = existsSync(path.join(DIST, 'index.js'))
  ? statSync(path.join(DIST, 'index.js')).size
  : 0;

console.log(
  `[build] готово: client.js ${Math.round(clientSize / 1024)}KB, `
    + `index.js ${Math.round(serverSize / 1024)}KB, data ${dataFiles} файлов`,
);
