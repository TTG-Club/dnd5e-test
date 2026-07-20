/**
 * Утилиты для костей хитов D&D 5e.
 *
 * Чистые функции группировки костей хитов (из классов и ручных групп) и
 * иммутабельного распределения их траты. Используются модалками очков
 * здоровья и короткого отдыха.
 */

import type {
  ActorClassEntry,
  HitDie,
  ManualHitDieGroup,
} from './classTypes.js';

/** Сводная группа костей хитов одного размера (для отображения и траты) */
export interface HitDiceGroup {
  /** Размер кости (к6/к8/к10/к12) */
  die: HitDie;
  /** Всего костей этого размера */
  total: number;
  /** Использовано костей */
  used: number;
  /** Доступно к трате (total − used) */
  available: number;
}

/**
 * Сводит кости хитов классов и ручных групп в группы по размеру кости.
 *
 * @param classes - классы актора (источник `hitDie`/`level`/`hitDiceUsed`)
 * @param manualHitDice - ручные группы костей (для актёров без классов)
 * @returns группы по размеру кости, отсортированные по убыванию размера
 */
export function getHitDiceGroups(
  classes: ActorClassEntry[],
  manualHitDice: ManualHitDieGroup[] = [],
): HitDiceGroup[] {
  const totals = new Map<HitDie, { total: number; used: number }>();

  for (const classEntry of classes) {
    if (!classEntry.hitDie) {
      continue;
    }

    const entry = totals.get(classEntry.hitDie) ?? { total: 0, used: 0 };

    entry.total += classEntry.level;
    entry.used += classEntry.hitDiceUsed ?? 0;
    totals.set(classEntry.hitDie, entry);
  }

  for (const group of manualHitDice) {
    const entry = totals.get(group.die) ?? { total: 0, used: 0 };

    entry.total += group.total;
    entry.used += group.used;
    totals.set(group.die, entry);
  }

  return Array.from(totals.entries())
    .map(([die, stats]) => ({
      die,
      total: stats.total,
      used: stats.used,
      available: stats.total - stats.used,
    }))
    .sort((groupA, groupB) => groupB.die - groupA.die);
}

/**
 * Распределяет трату `count` костей размера `die`: сначала по классам
 * (`hitDiceUsed`), затем по ручным группам (`used`). Возвращает НОВЫЕ массивы
 * (исходные не мутируются — `.map()` + spread).
 *
 * @param die - размер кости к трате
 * @param count - сколько костей этого размера потратить
 * @param classes - классы актора
 * @param manualHitDice - ручные группы костей
 * @returns новые массивы классов и ручных групп с увеличенным счётчиком траты
 */
export function spendHitDice(
  die: HitDie,
  count: number,
  classes: ActorClassEntry[],
  manualHitDice: ManualHitDieGroup[] = [],
): { classes: ActorClassEntry[]; manualHitDice: ManualHitDieGroup[] } {
  let remaining = count;

  const updatedClasses = classes.map((classEntry) => {
    if (remaining <= 0 || classEntry.hitDie !== die) {
      return classEntry;
    }

    const available = classEntry.level - (classEntry.hitDiceUsed ?? 0);

    if (available <= 0) {
      return classEntry;
    }

    const spend = Math.min(available, remaining);

    remaining -= spend;

    return {
      ...classEntry,
      hitDiceUsed: (classEntry.hitDiceUsed ?? 0) + spend,
    };
  });

  const updatedManualHitDice = manualHitDice.map((group) => {
    if (remaining <= 0 || group.die !== die) {
      return group;
    }

    const available = group.total - group.used;

    if (available <= 0) {
      return group;
    }

    const spend = Math.min(available, remaining);

    remaining -= spend;

    return { ...group, used: group.used + spend };
  });

  return { classes: updatedClasses, manualHitDice: updatedManualHitDice };
}

/**
 * Возвращает `count` потраченных костей размера `die`: сначала по классам
 * (`hitDiceUsed`), затем по ручным группам (`used`). Возвращает НОВЫЕ массивы
 * и фактически восстановленное число (может быть меньше `count`, если костей
 * этого размера потрачено меньше).
 *
 * @param die - размер кости к восстановлению
 * @param count - сколько костей этого размера вернуть
 * @param classes - классы актора
 * @param manualHitDice - ручные группы костей
 * @returns новые массивы и фактически восстановленное число костей
 */
function recoverHitDiceOfSize(
  die: HitDie,
  count: number,
  classes: ActorClassEntry[],
  manualHitDice: ManualHitDieGroup[],
): {
  classes: ActorClassEntry[];
  manualHitDice: ManualHitDieGroup[];
  recovered: number;
} {
  let remaining = count;

  const updatedClasses = classes.map((classEntry) => {
    if (remaining <= 0 || classEntry.hitDie !== die) {
      return classEntry;
    }

    const used = classEntry.hitDiceUsed ?? 0;

    if (used <= 0) {
      return classEntry;
    }

    const recover = Math.min(used, remaining);

    remaining -= recover;

    return { ...classEntry, hitDiceUsed: used - recover };
  });

  const updatedManualHitDice = manualHitDice.map((group) => {
    if (remaining <= 0 || group.die !== die) {
      return group;
    }

    if (group.used <= 0) {
      return group;
    }

    const recover = Math.min(group.used, remaining);

    remaining -= recover;

    return { ...group, used: group.used - recover };
  });

  return {
    classes: updatedClasses,
    manualHitDice: updatedManualHitDice,
    recovered: count - remaining,
  };
}

/**
 * Сколько костей хитов вернётся за продолжительный отдых по правилам D&D 5e:
 * до половины общего числа костей (минимум 1), но не больше реально потраченных.
 * Если ничего не потрачено — возвращает 0.
 *
 * @param classes - классы актора
 * @param manualHitDice - ручные группы костей
 * @returns число костей к восстановлению
 */
export function getHalfHitDiceRecovery(
  classes: ActorClassEntry[],
  manualHitDice: ManualHitDieGroup[] = [],
): number {
  const groups = getHitDiceGroups(classes, manualHitDice);

  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const used = groups.reduce((sum, group) => sum + group.used, 0);

  if (used <= 0) {
    return 0;
  }

  return Math.min(used, Math.max(1, Math.floor(total / 2)));
}

/**
 * Восстанавливает потраченные кости хитов при продолжительном отдыхе.
 *
 * По правилам D&D 5e за долгий отдых возвращается до половины общего числа
 * костей хитов (минимум 1, но не больше реально потраченных). Кости большего
 * размера восстанавливаются в первую очередь — это выгоднее игроку на
 * последующих коротких отдыхах. При `recoverAll` возвращаются все потраченные
 * кости (домашнее правило). Возвращает НОВЫЕ массивы (без мутаций).
 *
 * @param classes - классы актора
 * @param manualHitDice - ручные группы костей
 * @param recoverAll - вернуть все потраченные кости вместо половины
 * @returns новые массивы классов и ручных групп со сниженным счётчиком траты
 */
export function recoverHitDice(
  classes: ActorClassEntry[],
  manualHitDice: ManualHitDieGroup[] = [],
  recoverAll = false,
): { classes: ActorClassEntry[]; manualHitDice: ManualHitDieGroup[] } {
  const groups = getHitDiceGroups(classes, manualHitDice);

  const used = groups.reduce((sum, group) => sum + group.used, 0);

  let remaining = recoverAll
    ? used
    : getHalfHitDiceRecovery(classes, manualHitDice);

  let recoveredClasses = classes;
  let recoveredManualHitDice = manualHitDice;

  // groups уже отсортированы по убыванию размера кости
  for (const group of groups) {
    if (remaining <= 0) {
      break;
    }

    const result = recoverHitDiceOfSize(
      group.die,
      remaining,
      recoveredClasses,
      recoveredManualHitDice,
    );

    remaining -= result.recovered;
    recoveredClasses = result.classes;
    recoveredManualHitDice = result.manualHitDice;
  }

  return { classes: recoveredClasses, manualHitDice: recoveredManualHitDice };
}
