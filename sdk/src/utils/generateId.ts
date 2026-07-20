/**
 * Утилита для централизованной генерации уникальных ID сущностей.
 *
 * Формат: `prefix_timestamp_random` (напр. `tok_1710000000000_ab3k7m9`)
 *
 * @module shared/generateId
 */

/**
 * Генерирует уникальный ID для сущности
 *
 * @param prefix - Префикс для ID (например, 'tok', 'msg', 'enc')
 * @returns Уникальный ID в формате `prefix_timestamp_random`
 */
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
