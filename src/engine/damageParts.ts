/**
 * Утилиты для работы с частями урона/лечения заклинаний (`Spell.damageParts`).
 *
 * Модуль намеренно импортирует ТОЛЬКО типы — чтобы его можно было использовать
 * из `calculations.ts` без циклических зависимостей рантайма.
 */

import type { DamagePart } from '@vtt/shared';
import type { Spell } from './dndEntities.js';

/**
 * Возвращает части урона/лечения заклинания.
 *
 * Единственный источник истины — `spell.damageParts` (legacy-поля
 * `damageFormula`/`damageType`/`isHealing` и их миграция удалены).
 * Если урона нет — пустой массив.
 *
 * @param spell - заклинание
 * @returns массив частей урона/лечения (может быть пустым)
 */
export function getSpellDamageParts(spell: Spell): DamagePart[] {
  return spell.damageParts ?? [];
}
