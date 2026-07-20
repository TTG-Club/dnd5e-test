/**
 * Утилиты для работы с путями к ассетам (изображениям, аудио и т.д.)
 */

/**
 * Максимальный размер медиафайла по любой стороне в пикселях.
 *
 * Единый лимит для клиента (предпроверка видео перед загрузкой) и сервера
 * (автоматическое сжатие изображений при загрузке).
 */
export const MEDIA_MAX_DIMENSION_PX = 8192;

/**
 * Проверяет, является ли путь системным для файлового менеджера мира
 * (создание, переименование, перемещение и удаление запрещены).
 *
 * - `data`, `data/actors`, `data/creatures` — системные.
 * - `data/actors/<actorId>` и глубже — НЕ системные (папка ассетов актёра).
 * - `data/creatures/<creatureId>` и глубже — НЕ системные (папка ассетов существа).
 *
 * @param assetPath - путь относительно корня папки мира (любой разделитель)
 * @returns true, если путь системный и менять его нельзя
 */
export function isSystemAssetPath(
  assetPath: string | null | undefined,
): boolean {
  if (!assetPath) {
    return false;
  }

  const normalized = assetPath.replace(/\\/g, '/');

  if (!normalized.startsWith('data')) {
    return false;
  }

  if (normalized === 'data') {
    return true;
  }

  const segments = normalized.split('/');

  if (segments[0] !== 'data') {
    return false;
  }

  // data/actors/<actorId> (3+ сегмента) — папка сущности, изменения разрешены
  if (
    (segments[1] === 'actors' || segments[1] === 'creatures')
    && segments.length >= 3
  ) {
    return false;
  }

  // Все остальные пути внутри data — системные
  return true;
}

/**
 * Расширения видеофайлов (без точки), общие для клиента и сервера.
 * Единый источник правды, чтобы не дублировать список mp4/webm/... по коду.
 */
export const VIDEO_FILE_EXTENSIONS = ['mp4', 'webm', 'mkv', 'm4v'] as const;

/**
 * Множество видеорасширений для проверки членства произвольной строки.
 * `Set<string>.has` принимает любую строку — в отличие от
 * `VIDEO_FILE_EXTENSIONS.includes`, которому нужен литеральный тип.
 */
const VIDEO_FILE_EXTENSIONS_SET = new Set<string>(VIDEO_FILE_EXTENSIONS);

/**
 * Определяет, является ли путь/URL видеофайлом по расширению.
 * Единый хелпер вместо локальных дубликатов списка mp4/webm/... по компонентам.
 *
 * @param path - путь или URL файла (допускаются query/hash)
 * @returns true, если расширение входит в {@link VIDEO_FILE_EXTENSIONS}
 */
export function isVideoPath(path: string | null | undefined): boolean {
  if (!path) {
    return false;
  }

  // Отбрасываем query/hash перед проверкой расширения
  const queryIndex = path.search(/[?#]/);
  const basePart = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const lastDot = basePart.lastIndexOf('.');

  if (lastDot === -1) {
    return false;
  }

  const ext = basePart.slice(lastDot + 1).toLowerCase();

  return VIDEO_FILE_EXTENSIONS_SET.has(ext);
}

/**
 * Суффикс файла статического постера, который сервер генерирует рядом с
 * видео-фоном при загрузке (первый кадр в WebP). Единый источник правды для
 * клиента (запрос постера) и сервера (генерация файла).
 */
export const VIDEO_POSTER_SUFFIX = '.poster.webp';

/**
 * Преобразует путь или URL видеофайла в путь/URL его статического постера.
 *
 * Постер лежит рядом с видео с тем же базовым именем: расширение видео
 * заменяется целиком на {@link VIDEO_POSTER_SUFFIX}
 * (`scenes/bg.mp4` → `scenes/bg.poster.webp`). Корректно сохраняет query/hash,
 * если они есть в URL.
 *
 * @param videoPath - путь или URL видеофайла
 * @returns путь/URL постера или `null`, если расширение не распознано как видео
 */
export function getVideoPosterPath(
  videoPath: string | null | undefined,
): string | null {
  if (!videoPath) {
    return null;
  }

  // Отделяем query/hash, чтобы замена расширения их не затронула
  const queryIndex = videoPath.search(/[?#]/);

  const basePart =
    queryIndex === -1 ? videoPath : videoPath.slice(0, queryIndex);

  const suffixPart = queryIndex === -1 ? '' : videoPath.slice(queryIndex);

  const lastDot = basePart.lastIndexOf('.');

  if (lastDot === -1) {
    return null;
  }

  const ext = basePart.slice(lastDot + 1).toLowerCase();

  if (
    !VIDEO_FILE_EXTENSIONS.includes(
      ext as (typeof VIDEO_FILE_EXTENSIONS)[number],
    )
  ) {
    return null;
  }

  return `${basePart.slice(0, lastDot)}${VIDEO_POSTER_SUFFIX}${suffixPart}`;
}

/**
 * Получает базовый URL сервера мира
 * @param worldPort - порт сервера мира. Если не передан, возвращает пустую строку (относительный URL).
 * @returns Базовый URL (например, "http://vds.example.com:30001") или пустую строку
 */
export function getServerBaseUrl(worldPort?: number): string {
  if (!worldPort) {
    return '';
  }

  // Используем hostname из адресной строки — работает и в Electron (localhost), и на VDS
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:${worldPort}`;
  }

  return `http://localhost:${worldPort}`;
}

const TOKEN_FRAMES_REGEX = /^\/?(public\/)(token-frames\/)/;

/**
 * Преобразует относительный путь ассета в абсолютный URL в зависимости от среды
 *
 * @param path Относительный путь (например, "/uploads/images/token.png")
 * @param worldPort Порт сервера (обязателен для Electron)
 * @returns Полный URL до ассета
 */
export function getAssetUrl(
  path: string | null | undefined,
  worldPort?: number,
): string | null {
  if (!path) {
    return null;
  }

  // Если путь уже абсолютный, возвращаем как есть
  if (
    path.startsWith('http://')
    || path.startsWith('https://')
    || path.startsWith('data:')
  ) {
    return path;
  }

  // Обратная совместимость: public/token-frames/ → assets/token-frames/
  // (старые актёры хранят frameUrl как 'public/token-frames/0.png',
  //  но файл реально в packages/client/public/assets/token-frames/)
  // Нормализация обратных слэшей (Windows path.join создаёт 'public\\file.png')
  let normalizedPath = path.replace(/\\/g, '/');

  if (
    normalizedPath.startsWith('public/token-frames/')
    || normalizedPath.startsWith('/public/token-frames/')
  ) {
    normalizedPath = normalizedPath.replace(TOKEN_FRAMES_REGEX, 'assets/$2');
  }

  // Убеждаемся, что путь начинается со слэша
  normalizedPath = normalizedPath.startsWith('/')
    ? normalizedPath
    : `/${normalizedPath}`;

  // Кодируем каждый сегмент пути отдельно, чтобы кириллица и пробелы
  // не вызывали InvalidStateError при загрузке через PixiJS / браузер.
  // encodeURIComponent кодирует всё кроме [A-Za-z0-9_.!~*'()-],
  // поэтому применяем его к каждому сегменту, сохраняя разделители '/'.
  const encodedPath = normalizedPath
    .split('/')
    .map((segment) => {
      if (!segment) {
        return segment;
      }

      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        // Невалидный percent-encoding (например, '%E0%A4%A') — кодируем как есть
        return encodeURIComponent(segment);
      }
    })
    .join('/');

  // Получаем базовый URL
  const baseUrl = getServerBaseUrl(worldPort);

  return `${baseUrl}${encodedPath}`;
}

/** Префикс статической раздачи файлов мира в URL (контракт сервера). */
const WORLD_ASSET_URL_PREFIX = '/world/';

/**
 * Декодирует percent-encoding в каждом сегменте пути, не трогая разделители `/`.
 *
 * Безопасно для уже «сырых» путей: сегмент без `%` остаётся как есть, а
 * некорректный percent-encoding (например, `100%cool`) возвращается без
 * изменений вместо исключения.
 *
 * @param encodedPath - путь с разделителями `/`
 * @returns путь с декодированными сегментами
 */
function decodeAssetPathSegments(encodedPath: string): string {
  return encodedPath
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
}

/**
 * Приводит сохранённую ссылку на ассет мира к относительному пути файлового
 * менеджера (обратная операция к {@link getAssetUrl} и серверному контракту
 * `url = /world/<relativePath>`, см. сборку записей в `assetsRoutes`).
 *
 * Понимает все формы хранения ассета в проекте:
 * - URL мира (`/world/maps/bg.png` или `http://host:port/world/...`) — снимает
 *   префикс `/world/`, отбрасывает query/hash и декодирует сегменты;
 * - готовый относительный путь (`maps/bg.png`) — возвращает как есть;
 * - внешняя ссылка (`https://…`, `data:`, `blob:`) — возвращает `null`.
 *
 * @param reference - сохранённая ссылка на ассет (URL мира, относительный путь или внешняя ссылка)
 * @returns относительный путь мира или `null` для внешней/пустой ссылки
 */
export function resolveWorldAssetRelativePath(
  reference: string | null | undefined,
): string | null {
  if (!reference) {
    return null;
  }

  const normalized = reference.replace(/\\/g, '/');
  const prefixIndex = normalized.indexOf(WORLD_ASSET_URL_PREFIX);

  // URL ассета мира — берём всё после префикса, отбрасываем query/hash
  if (prefixIndex !== -1) {
    const pathAfterPrefix =
      normalized
        .slice(prefixIndex + WORLD_ASSET_URL_PREFIX.length)
        .split(/[?#]/)[0] ?? '';

    return decodeAssetPathSegments(pathAfterPrefix);
  }

  // Внешняя ссылка без префикса мира — относительного пути нет
  if (/^(?:https?:|data:|blob:)/i.test(normalized)) {
    return null;
  }

  // Уже относительный путь
  return normalized;
}
