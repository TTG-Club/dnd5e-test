/**
 * Генерирует src/client/hostClasses.txt — снапшот CSS-классов приложения VTTG.
 *
 * Зачем: client.css системы и CSS хоста живут на одной странице. Обе таблицы —
 * сборки Tailwind, но КАЖДАЯ содержит только классы своих исходников. Медиа-
 * варианты (lg:*, md:* …) не добавляют специфичности — побеждает та таблица,
 * что подключена позже (наша). Если у элемента ХОСТА базовый класс есть в нашей
 * таблице, а его медиа-вариант — нет (пример: `w-auto lg:w-80` у SidePanel),
 * наш базовый класс перебивает вариант хоста → раскладка хоста ломается.
 *
 * Лекарство: client.css системы делается СУПЕРНАБОРОМ — Tailwind системы
 * сканирует и этот снапшот классов хоста, поэтому пары «база+вариант» хоста
 * попадают в нашу таблицу в каноническом внутреннем порядке и конфликтов между
 * таблицами не остаётся (ровно как при единой сборке, когда dnd5e была встроенной).
 *
 * Когда перегенерировать: после заметных изменений UI приложения (новые
 * responsive-классы у хоста). Запуск:
 *
 *   node scripts/extract-host-classes.mjs <путь к vttg>/packages/client/dist/web/assets
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assetsDir = process.argv[2];

if (!assetsDir || !fs.existsSync(assetsDir)) {
  console.error(
    'Использование: node scripts/extract-host-classes.mjs <vttg>/packages/client/dist/web/assets',
  );
  process.exit(1);
}

const cssFiles = fs
  .readdirSync(assetsDir)
  .filter((name) => name.endsWith('.css'))
  .map((name) => path.join(assetsDir, name));

if (cssFiles.length === 0) {
  console.error(`В ${assetsDir} нет .css — соберите клиент VTTG (pnpm build).`);
  process.exit(1);
}

/** Селекторные классы Tailwind с эскейпами: `.lg\:w-80`, `.bg-elevated\/50`. */
const CLASS_PATTERN = /\.((?:\\.|[A-Za-z0-9_-])+)/g;

const classes = new Set();

for (const file of cssFiles) {
  const css = fs.readFileSync(file, 'utf-8');

  for (const match of css.matchAll(CLASS_PATTERN)) {
    // Снимаем CSS-эскейпы: `\:` → `:`, `\/` → `/`, `\[` → `[` и т.д.
    const name = match[1].replace(/\\(.)/g, '$1');

    // Пропускаем чисто числовые и односимвольные обрывки (артефакты парсинга).
    if (name.length > 1 && !/^\d+$/.test(name)) {
      classes.add(name);
    }
  }
}

const sorted = [...classes].sort();

const header =
  '// АВТОГЕНЕРАЦИЯ scripts/extract-host-classes.mjs — снапшот классов CSS приложения VTTG.\n'
  + '// Нужен, чтобы client.css системы был супернабором и не конфликтовал с CSS хоста\n'
  + '// (медиа-варианты решаются порядком, не специфичностью). Не редактировать руками.\n';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(scriptDir, '..', 'src', 'client', 'hostClasses.txt');

fs.writeFileSync(outPath, `${header}${sorted.join('\n')}\n`);
console.log(`[extract-host-classes] классов: ${sorted.size ?? sorted.length} → ${outPath}`);
