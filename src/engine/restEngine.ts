/**
 * Движок отдыха D&D 5e (короткий / продолжительный).
 *
 * Чистые функции вычисляют патч сущности при отдыхе: восстанавливают
 * счётчики классов, заряды заклинаний, ячейки заклинаний и хиты в
 * зависимости от типа отдыха и прописанного для ресурса способа отката.
 * Используется кнопками отдыха в листах актора и существа.
 */

import type { ActorClassEntry, CounterRecovery } from './classTypes.js';
import type {
  Creature,
  DnDActor,
  Spell,
  SpellUsesRecovery,
} from './dndEntities.js';
import type { ActorCounterState, DnDActorSystem } from './types.js';

import {
  getHalfHitDiceRecovery,
  getHitDiceGroups,
  recoverHitDice,
} from './hitDiceUtils.js';

/** Тип отдыха */
export type RestType = 'short' | 'long';

/** Параметры продолжительного отдыха */
export interface LongRestOptions {
  /** Вернуть ВСЕ потраченные кости хитов (домашнее правило вместо половины) */
  recoverAllHitDice?: boolean;
}

/**
 * Предпросмотр продолжительного отдыха — что и сколько будет восстановлено.
 * Используется модалкой долгого отдыха для отображения итогов до подтверждения.
 */
export interface LongRestPreview {
  /** Хиты: текущие, максимум и насколько поднимутся */
  hitPoints: { current: number; max: number; restored: number };
  /** Временные хиты, которые будут сброшены */
  tempHitPointsCleared: number;
  /** Кости хитов: всего, потрачено, вернётся по правилам и при «вернуть все» */
  hitDice: {
    total: number;
    used: number;
    recoverHalf: number;
    recoverAll: number;
  };
  /** Сколько использованных ячеек заклинаний (вкл. пактовые) восстановится */
  spellSlotsRestored: number;
  /** Сколько классовых счётчиков восстановится */
  countersRestored: number;
  /** Сколько заклинаний восстановят заряды */
  spellChargesRestored: number;
}

/**
 * Результат броска костей хитов из модалки короткого отдыха.
 * Случайный бросок выполняется на клиенте (diceRollerStore), сюда приходит
 * уже вычисленное лечение и обновлённые счётчики потраченных костей.
 */
export interface ShortRestHitDiceResult {
  /** Новое значение текущих хитов (после лечения, не выше максимума) */
  hitPointsCurrent: number;
  /** Классы с обновлённым `hitDiceUsed` */
  classes: ActorClassEntry[];
  /** Ручные кости хитов с обновлённым `used` */
  manualHitDice?: DnDActorSystem['manualHitDice'];
}

/**
 * Восстанавливается ли ресурс с данным способом отката при этом типе отдыха.
 * Продолжительный отдых включает в себя эффект короткого.
 *
 * @param recovery - способ отката ресурса ('short'/'long' или recovery заряда)
 * @param restType - тип совершённого отдыха
 * @returns true, если ресурс нужно восстановить до максимума
 */
function recoveryMatchesRest(
  recovery: CounterRecovery | SpellUsesRecovery,
  restType: RestType,
): boolean {
  if (recovery === 'short' || recovery === 'shortRest') {
    return true;
  }

  if (recovery === 'long' || recovery === 'longRest') {
    return restType === 'long';
  }

  return false;
}

/**
 * Возвращает копию счётчика класса с восстановленным значением, если его
 * способ отката соответствует типу отдыха; иначе — исходный счётчик.
 *
 * @param counter - текущее состояние счётчика
 * @param restType - тип совершённого отдыха
 * @returns счётчик (новый объект при восстановлении)
 */
function restoreCounter(
  counter: ActorCounterState,
  restType: RestType,
): ActorCounterState {
  // Без указанного отката восстанавливаем только продолжительным отдыхом
  const recovery: CounterRecovery = counter.recovery ?? 'long';

  if (recoveryMatchesRest(recovery, restType)) {
    return { ...counter, current: counter.max };
  }

  return counter;
}

/**
 * Возвращает копию заклинания с восстановленными зарядами, если способ отката
 * зарядов соответствует типу отдыха; иначе — исходное заклинание. Заклинания
 * без зарядов или «по желанию» не изменяются.
 *
 * @param spell - заклинание
 * @param restType - тип совершённого отдыха
 * @returns заклинание (новый объект при восстановлении зарядов)
 */
function restoreSpellUses(spell: Spell, restType: RestType): Spell {
  if (!spell.uses || spell.uses.recovery === 'atWill') {
    return spell;
  }

  if (recoveryMatchesRest(spell.uses.recovery, restType)) {
    return { ...spell, uses: { ...spell.uses, current: spell.uses.max } };
  }

  return spell;
}

/**
 * Вычисляет патч актора при отдыхе.
 *
 * Короткий отдых: пактовые ячейки, счётчики с откатом 'short', заряды
 * заклинаний 'shortRest'. Продолжительный — дополнительно: все ячейки
 * заклинаний, счётчики 'long', заряды 'longRest', хиты до максимума и
 * сброс временных хитов.
 *
 * @param actor - актор
 * @param restType - тип отдыха
 * @param options - параметры долгого отдыха (напр. вернуть все кости хитов)
 * @returns частичный патч актора для emit('update:actor', ...)
 */
export function applyActorRest(
  actor: DnDActor,
  restType: RestType,
  options: LongRestOptions = {},
): Partial<DnDActor> {
  const system = actor.system;

  const restoredSystem: DnDActorSystem = {
    ...system,
    // Пактовая магия восстанавливается и коротким, и продолжительным отдыхом
    pactSlotsUsed: 0,
    classCounters: system.classCounters.map((counter) =>
      restoreCounter(counter, restType),
    ),
  };

  if (restType === 'long') {
    // Долгий отдых: все ячейки «не использованы», хиты до максимума, temp сброшен
    restoredSystem.spellSlotsUsed = [];

    restoredSystem.hitPoints = {
      ...system.hitPoints,
      current: system.hitPoints.max,
      temp: 0,
    };

    // Возвращается до половины потраченных костей хитов (минимум 1),
    // либо все — при включённом домашнем правиле
    const recovered = recoverHitDice(
      system.classes,
      system.manualHitDice,
      options.recoverAllHitDice ?? false,
    );

    restoredSystem.classes = recovered.classes;

    if (system.manualHitDice) {
      restoredSystem.manualHitDice = recovered.manualHitDice;
    }
  }

  return {
    spells: actor.spells.map((spell) => restoreSpellUses(spell, restType)),
    system: restoredSystem,
  };
}

/**
 * Считает предпросмотр продолжительного отдыха актора: сколько хитов, костей
 * хитов, ячеек, счётчиков и зарядов будет восстановлено. Чистая функция,
 * ничего не мутирует — только агрегирует текущее состояние.
 *
 * @param actor - актор
 * @returns структура с итогами восстановления для отображения в модалке
 */
export function summarizeActorLongRest(actor: DnDActor): LongRestPreview {
  const system = actor.system;

  const groups = getHitDiceGroups(system.classes, system.manualHitDice);
  const totalHitDice = groups.reduce((sum, group) => sum + group.total, 0);
  const usedHitDice = groups.reduce((sum, group) => sum + group.used, 0);

  const spellSlotsUsed = (system.spellSlotsUsed ?? []).reduce(
    (sum, used) => sum + used,
    0,
  );

  const spellSlotsRestored = spellSlotsUsed + (system.pactSlotsUsed ?? 0);

  const countersRestored = system.classCounters.filter(
    (counter) => counter.current < counter.max,
  ).length;

  const spellChargesRestored = actor.spells.filter((spell) => {
    if (!spell.uses || spell.uses.recovery === 'atWill') {
      return false;
    }

    return (
      recoveryMatchesRest(spell.uses.recovery, 'long')
      && spell.uses.current < spell.uses.max
    );
  }).length;

  return {
    hitPoints: {
      current: system.hitPoints.current,
      max: system.hitPoints.max,
      restored: Math.max(0, system.hitPoints.max - system.hitPoints.current),
    },
    tempHitPointsCleared: system.hitPoints.temp,
    hitDice: {
      total: totalHitDice,
      used: usedHitDice,
      recoverHalf: getHalfHitDiceRecovery(system.classes, system.manualHitDice),
      recoverAll: usedHitDice,
    },
    spellSlotsRestored,
    countersRestored,
    spellChargesRestored,
  };
}

/**
 * Короткий отдых с тратой костей хитов.
 *
 * Накладывает результат броска костей хитов (новые текущие хиты и обновлённые
 * счётчики потраченных костей) поверх обычного восстановления ресурсов
 * короткого отдыха (`applyActorRest(actor, 'short')` — пактовые ячейки,
 * короткие счётчики, заряды заклинаний 'shortRest').
 *
 * @param actor - актор
 * @param hitDice - результат броска костей хитов из модалки
 * @returns частичный патч актора для emit('update:actor', ...)
 */
export function applyShortRestWithHitDice(
  actor: DnDActor,
  hitDice: ShortRestHitDiceResult,
): Partial<DnDActor> {
  const base = applyActorRest(actor, 'short');
  const baseSystem = base.system ?? actor.system;

  return {
    ...base,
    system: {
      ...baseSystem,
      classes: hitDice.classes,
      manualHitDice: hitDice.manualHitDice,
      hitPoints: {
        ...baseSystem.hitPoints,
        current: hitDice.hitPointsCurrent,
      },
    },
  };
}

/**
 * Вычисляет патч существа при отдыхе.
 *
 * Восстанавливает заряды заклинаний существа (`Creature.spells`) по их способу
 * отката; продолжительный отдых дополнительно поднимает хиты до максимума и
 * сбрасывает временные хиты.
 *
 * @param creature - существо
 * @param restType - тип отдыха
 * @returns частичный патч существа для emit('update:creature', ...)
 */
export function applyCreatureRest(
  creature: Creature,
  restType: RestType,
): Partial<Creature> {
  const patch: Partial<Creature> = {
    spells: (creature.spells ?? []).map((spell) =>
      restoreSpellUses(spell, restType),
    ),
  };

  if (restType === 'long') {
    const hitPoints = creature.system.hitPoints;
    const restoredMax = hitPoints.max ?? hitPoints.average ?? hitPoints.current;

    patch.system = {
      ...creature.system,
      hitPoints: {
        ...hitPoints,
        current: restoredMax ?? hitPoints.current,
        temp: 0,
      },
    };
  }

  return patch;
}
