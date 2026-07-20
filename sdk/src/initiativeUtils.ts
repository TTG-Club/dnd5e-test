import type { InitiativeEntry } from './types/index.js';

/**
 * Сравнивает участников энкаунтера для сортировки по инициативе.
 * Сначала по итоговому значению (убывание), при равенстве — по модификатору.
 *
 * Системо-нейтрально: работает с уже вычисленными `total`/`modifier`
 * (правила подсчёта модификатора живут в конкретной системе). D&D-боёвка
 * (тик эффектов, DoT, спасброски) вынесена в `system/dnd/turnEffects.ts` и
 * вызывается через контракт `VttSystem`.
 *
 * @param entryA - первый участник
 * @param entryB - второй участник
 * @returns результат сравнения для Array.sort
 */
export function compareInitiativeEntries(
  entryA: InitiativeEntry,
  entryB: InitiativeEntry,
): number {
  if (entryB.total !== entryA.total) {
    return entryB.total - entryA.total;
  }

  return entryB.modifier - entryA.modifier;
}

/**
 * Сортирует массив участников по инициативе (мутирует исходный массив).
 * По убыванию total, при равенстве — по модификатору.
 * @param entries - записи участников энкаунтера
 */
export function sortInitiativeEntries(entries: InitiativeEntry[]): void {
  entries.sort(compareInitiativeEntries);
}
