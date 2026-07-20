/**
 * Таблицы ячеек заклинаний D&D 5e (PHB 2024)
 *
 * Каждая таблица: уровень класса → массив ячеек [1-9 круг].
 * Индекс массива: 0 = 1-й круг, 8 = 9-й круг.
 */

import type { ActorClassEntry, CasterType } from './classTypes.js';

/**
 * Минимальная структура данных актора, необходимая для расчёта ячеек заклинаний.
 *
 * Используется вместо `any` для типобезопасных утилит spell slot.
 */
export interface SpellSlotActorData {
  system?: {
    classes?: ActorClassEntry[];
    spellSlotsUsed?: number[];
    pactSlotsUsed?: number;
  };
}

/** Количество ячеек заклинаний по кругам (индекс 0 = 1-й круг) */
export type SpellSlotArray = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

// ── Полный заклинатель (Волшебник, Жрец, Друид, Бард, Колдун-Чародей) ──

/** Таблица ячеек для полного заклинателя (PHB 2024) */
export const FULL_CASTER_SLOTS: Record<number, SpellSlotArray> = {
  1: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  4: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  5: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  7: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  8: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  9: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

// ── Половинный заклинатель (Паладин, Рейнджер) ──

/** Таблица ячеек для половинного заклинателя (PHB 2024) */
export const HALF_CASTER_SLOTS: Record<number, SpellSlotArray> = {
  1: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  4: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  5: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  6: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  7: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  8: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  9: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  10: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  11: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  12: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  13: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  14: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  15: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  16: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  17: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  18: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  19: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  20: [4, 3, 3, 3, 2, 0, 0, 0, 0],
};

// ── Третичный заклинатель (Мистический ловкач, Волшебный рыцарь) ──

/** Таблица ячеек для третичного заклинателя (PHB 2024) */
export const THIRD_CASTER_SLOTS: Record<number, SpellSlotArray> = {
  1: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  4: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  5: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  6: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  7: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  8: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  9: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  10: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  11: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  12: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  13: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  14: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  15: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  16: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  17: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  18: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  19: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  20: [4, 3, 3, 1, 0, 0, 0, 0, 0],
};

// ── Пакт (Колдун) ──

/** Таблица ячеек для колдуна: уровень → [количество, круг] */
export const PACT_SLOTS: Record<number, { count: number; level: number }> = {
  1: { count: 1, level: 1 },
  2: { count: 2, level: 1 },
  3: { count: 2, level: 2 },
  4: { count: 2, level: 2 },
  5: { count: 2, level: 3 },
  6: { count: 2, level: 3 },
  7: { count: 2, level: 4 },
  8: { count: 2, level: 4 },
  9: { count: 2, level: 5 },
  10: { count: 2, level: 5 },
  11: { count: 3, level: 5 },
  12: { count: 3, level: 5 },
  13: { count: 3, level: 5 },
  14: { count: 3, level: 5 },
  15: { count: 3, level: 5 },
  16: { count: 3, level: 5 },
  17: { count: 4, level: 5 },
  18: { count: 4, level: 5 },
  19: { count: 4, level: 5 },
  20: { count: 4, level: 5 },
};

/** Пустой массив ячеек (нет заклинаний) */
const EMPTY_SLOTS: SpellSlotArray = [0, 0, 0, 0, 0, 0, 0, 0, 0];

// ── Маппинг тип заклинателя → таблица ──

/** Коэффициент для расчёта caster level при мультиклассе */
const CASTER_LEVEL_MULTIPLIER: Record<CasterType, number> = {
  full: 1,
  half: 0.5,
  third: 1 / 3,
  pact: 0,
  none: 0,
};

/**
 * Получает таблицу ячеек по типу заклинателя
 *
 * @param casterType - тип заклинателя
 */
function getSlotTable(
  casterType: CasterType,
): Record<number, SpellSlotArray> | null {
  switch (casterType) {
    case 'full':
      return FULL_CASTER_SLOTS;
    case 'half':
      return HALF_CASTER_SLOTS;
    case 'third':
      return THIRD_CASTER_SLOTS;
    default:
      return null;
  }
}

// ── Публичный API ────────────────────────────────────────────

/**
 * Получает ячейки заклинаний для одноклассового персонажа
 *
 * @param casterType - тип заклинателя
 * @param classLevel - уровень в классе
 * @returns массив ячеек [1-9 круг]
 */
export function getSpellSlots(
  casterType: CasterType,
  classLevel: number,
): SpellSlotArray {
  const table = getSlotTable(casterType);

  if (!table) {
    return [...EMPTY_SLOTS] as SpellSlotArray;
  }

  const clampedLevel = Math.max(1, Math.min(20, classLevel));

  return [...(table[clampedLevel] ?? EMPTY_SLOTS)] as SpellSlotArray;
}

/**
 * Вычисляет caster level для мультикласса
 *
 * Full = ×1, Half = ×0.5 (округление вниз), Third = ×1/3 (округление вниз).
 * Pact magic не участвует в мультиклассовом расчёте.
 *
 *
 * @param classes - массив классов актора
 * @param casterTypeMap - карта определений классов (key → CasterType)
 * @returns уровень заклинателя для таблицы мультикласса
 */
export function getMulticlassCasterLevel(
  classes: ActorClassEntry[],
  casterTypeMap: Map<string, CasterType>,
): number {
  let casterLevel = 0;

  for (const entry of classes) {
    const casterType = casterTypeMap.get(entry.classKey) ?? 'none';
    const multiplier = CASTER_LEVEL_MULTIPLIER[casterType];

    casterLevel += Math.floor(entry.level * multiplier);
  }

  return casterLevel;
}

/**
 * Вычисляет итоговые ячейки заклинаний для персонажа
 *
 * Для одноклассового — берёт таблицу класса напрямую.
 * Для мультикласса — складывает caster levels и использует таблицу полного заклинателя.
 *
 * @param classes - массив классов актора
 * @param casterTypeMap - карта classKey → CasterType
 * @returns массив ячеек [1-9 круг]
 */
export function computeSpellSlots(
  classes: ActorClassEntry[],
  casterTypeMap: Map<string, CasterType>,
): SpellSlotArray {
  if (classes.length === 0) {
    return [...EMPTY_SLOTS] as SpellSlotArray;
  }

  // Одноклассовый — используем таблицу конкретного типа
  if (classes.length === 1) {
    const casterType = casterTypeMap.get(classes[0].classKey) ?? 'none';

    return getSpellSlots(casterType, classes[0].level);
  }

  // Мультикласс — caster level через общую таблицу полного заклинателя
  const casterLevel = getMulticlassCasterLevel(classes, casterTypeMap);

  if (casterLevel === 0) {
    return [...EMPTY_SLOTS] as SpellSlotArray;
  }

  return [...(FULL_CASTER_SLOTS[casterLevel] ?? EMPTY_SLOTS)] as SpellSlotArray;
}

/**
 * Получает список доступных кругов заклинаний для актора, начиная с `minLevel`.
 */
export function getAvailableSpellLevels(
  actor: SpellSlotActorData,
  minLevel: number,
  maxAvailableLevel: number = 9,
): number[] {
  if (minLevel <= 0) {
    return [0];
  }

  let hasAnyMaxSlots = false;

  const availableLevels = new Set<number>();

  // 1. Проверяем Pact Slots
  const pactClass = (actor.system?.classes ?? []).find(
    (entry) => entry.casterType === 'pact',
  );

  if (pactClass) {
    const pactInfo = PACT_SLOTS[pactClass.level];

    if (pactInfo) {
      hasAnyMaxSlots = true;

      if (pactInfo.level >= minLevel) {
        const pactUsed = actor.system?.pactSlotsUsed ?? 0;

        if (pactUsed < pactInfo.count) {
          availableLevels.add(pactInfo.level);
        }
      }
    }
  }

  // 2. Проверяем обычные ячейки
  const typeMap = new Map<string, CasterType>();
  const classes = actor.system?.classes ?? [];

  for (const entry of classes) {
    if (entry.casterType) {
      typeMap.set(entry.classKey, entry.casterType);
    }
  }

  const maxSlots = computeSpellSlots(classes, typeMap);
  const usedSlots = actor.system?.spellSlotsUsed ?? [0, 0, 0, 0, 0, 0, 0, 0, 0];

  for (let i = 0; i < 9; i++) {
    if ((maxSlots[i] ?? 0) > 0) {
      hasAnyMaxSlots = true;

      break;
    }
  }

  // Если у актора вообще нет ячеек - считаем, что это NPC / Врождённый каст,
  // разрешаем каст на любом доступном круге.
  if (!hasAnyMaxSlots) {
    const levels = [];

    for (let i = minLevel; i <= maxAvailableLevel; i++) {
      levels.push(i);
    }

    return levels;
  }

  for (let i = minLevel - 1; i < 9; i++) {
    const max = maxSlots[i] ?? 0;
    const used = usedSlots[i] ?? 0;

    if (max > 0 && used < max) {
      availableLevels.add(i + 1);
    }
  }

  return Array.from(availableLevels).sort((left, right) => left - right);
}

/**
 * Проверяет, есть ли у актора свободные ячейки заклинаний для указанного уровня.
 * В случае если актор имеет `maxSlots` = 0 (например NPC с врожденным кастом), вернёт `true`,
 * чтобы не блокировать каст заклинаний.
 *
 * @param actor Структура данных актора для получения классов и `spellSlotsUsed`.
 * @param minLevel Минимальный требуемый круг заклинания
 * @returns boolean `true`, если можно произнести заклинание (есть ячейки или они не нужны)
 */
export function hasAvailableSpellSlot(
  actor: SpellSlotActorData,
  minLevel: number,
): boolean {
  if (minLevel <= 0) {
    return true;
  }

  return getAvailableSpellLevels(actor, minLevel).length > 0;
}

/**
 * Возвращает максимальный круг ячеек заклинаний, доступный актеру.
 * @param actor Структура данных актора
 * @returns number 0-9 (максимальный круг)
 */
export function getMaxAvailableSpellLevel(actor: SpellSlotActorData): number {
  let maxLvl = 0;

  // 1. Проверяем Pact Slots
  const pactClass = (actor.system?.classes ?? []).find(
    (entry) => entry.casterType === 'pact',
  );

  if (pactClass) {
    const pactInfo = PACT_SLOTS[pactClass.level];

    if (pactInfo && pactInfo.level > maxLvl) {
      maxLvl = pactInfo.level;
    }
  }

  // 2. Проверяем обычные ячейки
  const typeMap = new Map<string, CasterType>();
  const classes = actor.system?.classes ?? [];

  for (const entry of classes) {
    if (entry.casterType) {
      typeMap.set(entry.classKey, entry.casterType);
    }
  }

  const maxSlots = computeSpellSlots(classes, typeMap);

  maxSlots.forEach((max, i) => {
    if ((max ?? 0) > 0) {
      maxLvl = Math.max(maxLvl, i + 1);
    }
  });

  return maxLvl;
}

/**
 * Возвращает информацию о Pact-слотах для актора (Warlock).
 *
 * Использует таблицу PACT_SLOTS для определения уровня и количества ячеек.
 *
 * @param classes - массив классов актора
 * @returns объект с максимальным количеством и уровнем Pact-слотов
 */
export function getPactSlotInfo(
  classes: ReadonlyArray<{ casterType?: string; level: number }>,
): { max: number; level: number } {
  const pactClass = classes.find((entry) => entry.casterType === 'pact');

  if (!pactClass) {
    return { max: 0, level: 0 };
  }

  const pactInfo = PACT_SLOTS[pactClass.level];

  if (!pactInfo) {
    return { max: 0, level: 0 };
  }

  return { max: pactInfo.count, level: pactInfo.level };
}
