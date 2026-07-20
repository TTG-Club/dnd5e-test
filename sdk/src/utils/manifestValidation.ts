/**
 * Утилиты для строгой проверки манифестов модулей и систем.
 *
 * @module utils/manifestValidation
 */

import type { BaseManifest } from '../types/module.js';

/**
 * Проверяет наличие и типы обязательных полей для базового манифеста.
 * Мутирует (или валидирует) сырой объект. Не выбрасывает исключений, а возвращает boolean
 * и выводит ошибку в консоль при проблемах.
 *
 * @param raw - сырой объект из JSON.parse
 * @param dir - директория (для логов)
 * @param fileName - имя файла манифеста (для логов)
 * @returns true, если манифест валиден
 */
export function validateBaseManifest(
  raw: unknown,
  dir: string,
  fileName: string,
): raw is BaseManifest {
  if (!raw || typeof raw !== 'object') {
    console.error(
      `[ManifestValidation] Invalid ${fileName} in ${dir}: not an object`,
    );

    return false;
  }

  const manifest = raw as Record<string, unknown>;

  if (typeof manifest.id !== 'string' || !manifest.id) {
    console.error(
      `[ManifestValidation] Invalid ${fileName} in ${dir}: missing or empty "id"`,
    );

    return false;
  }

  if (typeof manifest.name !== 'string' || !manifest.name) {
    console.error(
      `[ManifestValidation] Invalid ${fileName} in ${dir}: missing or empty "name"`,
    );

    return false;
  }

  if (typeof manifest.version !== 'string' || !manifest.version) {
    console.error(
      `[ManifestValidation] Invalid ${fileName} in ${dir}: missing or empty "version"`,
    );

    return false;
  }

  return true;
}

/**
 * Проверяет совместимость модуля с игровой системой по полю `compatibleSystems`.
 *
 * `undefined` / пустой список / `['*']` — модуль системо-нейтрален (совместим с
 * любой системой). Строка вместо массива — частая опечатка автора манифеста:
 * трактуется как список из одного элемента (НЕ как «совместим со всеми», иначе
 * объявленное ограничение молча исчезало бы). Иначе список должен содержать
 * `systemId`. Общая логика для серверной загрузки модулей и клиентской раздачи
 * (DRY).
 *
 * @param compatibleSystems - объявленные системы модуля (из манифеста)
 * @param systemId - идентификатор активной системы мира
 * @returns true, если модуль совместим с системой
 */
export function isModuleCompatibleWithSystem(
  compatibleSystems: readonly string[] | string | undefined,
  systemId: string,
): boolean {
  const declaredSystems =
    typeof compatibleSystems === 'string'
      ? [compatibleSystems]
      : compatibleSystems;

  if (
    !declaredSystems
    || !Array.isArray(declaredSystems)
    || declaredSystems.length === 0
    || declaredSystems.includes('*')
  ) {
    return true;
  }

  return declaredSystems.includes(systemId);
}
