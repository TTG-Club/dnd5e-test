export * from './colors.js';
export * from './formatting.js';
export * from './generateId.js';
export * from './geometry.js';
export * from './getTokenDistance.js';
export * from './manifestValidation.js';
export * from './typeGuards.js';
export * from './unitConverter.js';

/**
 * Типизированный `Object.entries` для объектов с известными ключами.
 * Возвращает `[K, V][]` вместо `[string, V][]`.
 *
 * @param obj Объект с известными ключами типа `K`
 * @returns Массив пар `[ключ, значение]` с сохранением типа ключа
 */
export function typedObjectEntries<K extends string, V>(
  obj: Partial<Record<K, V>>,
): [K, V][] {
  return Object.entries(obj) as [K, V][];
}

/**
 * Добавляет элементы в массив без дублей (мутирует `target` на месте).
 *
 * @param target Целевой массив (изменяется на месте)
 * @param items Добавляемые элементы
 */
export function pushUnique<T>(target: T[], items: ReadonlyArray<T>): void {
  for (const item of items) {
    if (!target.includes(item)) {
      target.push(item);
    }
  }
}

/**
 * Удаляет первое вхождение каждого из `items` из `target` (мутирует на месте).
 *
 * @param target Целевой массив (изменяется на месте)
 * @param items Удаляемые элементы
 */
export function removeItems<T>(target: T[], items: ReadonlyArray<T>): void {
  for (const item of items) {
    const index = target.indexOf(item);

    if (index !== -1) {
      target.splice(index, 1);
    }
  }
}
