/**
 * Утилиты боевой механики D&D 5e.
 *
 * Содержит чистые функции для расчётов атаки:
 * определение критов, формирование лейблов, удвоение кубиков.
 *
 * Используется в dnd5eMacros.ts (хотбар) и DiceRollModal.vue (лист персонажа).
 */

import type { DiceRollData, DistanceUnit } from '@vtt/shared';

import type { CreatureAction } from './creatureTypes.js';
import type { DamageApplyResult } from './damageUtils.js';
import type { GameItem, Spell } from './dndEntities.js';

import { convertDistance } from '@vtt/shared';
import { getShortDamageTypeLabel } from './damageConstants.js';
import { formatDamageDefenseSuffix } from './damageUtils.js';

/** Досягаемость по умолчанию в футах (рукопашные атаки и заклинания касания) */
export const DEFAULT_REACH_FEET = 5;

/** Параметры для определения результата атаки */
interface AttackResolveParams {
  /** Итого броска (1к20 + модификатор) */
  total: number;
  /** Модификатор атаки (мод. характеристики + мастерство + бонус) */
  attackModifier: number;
  /** Класс доспеха цели */
  targetAc: number;
  /** Активные флаги цели (для иммунитета к критам и т.п.) */
  targetFlags?: ReadonlySet<string>;
}

/** Результат определения атаки */
export interface AttackResult {
  /** Натуральное значение к20 (без модификатора) */
  naturalRoll: number;
  /** Критическое попадание (натуральная 20) */
  isCriticalHit: boolean;
  /** Критический промах (натуральная 1) */
  isCriticalMiss: boolean;
  /** Попадание (крит или total >= AC, но не крит. промах) */
  isHit: boolean;
}

/**
 * Определяет результат броска атаки D&D 5e.
 *
 * @param params - параметры броска
 * @returns результат определения попадания
 */
export function resolveAttackRoll(params: AttackResolveParams): AttackResult {
  const naturalRoll = params.total - params.attackModifier;
  const isCriticalMiss = naturalRoll === 1;

  // Адамантиновая броня: критический удар становится обычным попаданием
  const hasCritImmunity =
    params.targetFlags?.has('defense.critImmunity') ?? false;

  const isCriticalHit = naturalRoll === 20 && !hasCritImmunity;

  const isHit =
    naturalRoll === 20 || (!isCriticalMiss && params.total >= params.targetAc);

  return { naturalRoll, isCriticalHit, isCriticalMiss, isHit };
}

/** Параметры для формирования лейбла атаки */
interface AttackLabelParams {
  /** Название оружия или контекст броска */
  weaponName: string;
  /** Имя цели */
  targetName: string;
  /** Результат определения попадания */
  result: AttackResult;
  /** Атака с помехой (дальняя дистанция) */
  isDisadvantage?: boolean;
}

/**
 * Формирует лейбл для броска атаки с результатом попадания.
 *
 * Пример: `Атака — Длинный меч → Гоблин | ✅ Попадание!`
 *
 * @param params - параметры для лейбла
 * @returns текст лейбла
 */
export function buildAttackLabel(params: AttackLabelParams): string {
  let label = `Атака\u00A0—\u00A0${params.weaponName}\u00A0→\u00A0${params.targetName}`;

  if (params.isDisadvantage) {
    label += '\u00A0|\u00A0⚠️\u00A0Помеха\u00A0(дальняя\u00A0дистанция)';
  }

  if (params.result.isCriticalHit) {
    label += '\u00A0|\u00A0✨\u00A0КРИТ!';
  } else if (params.result.isCriticalMiss) {
    label += '\u00A0|\u00A0❌\u00A0Крит.\u00A0промах!';
  } else if (params.result.isHit) {
    label += '\u00A0|\u00A0✅\u00A0Попадание!';
  } else {
    label += '\u00A0|\u00A0❌\u00A0Промах!';
  }

  return label;
}

/**
 * Формирует лейбл для броска урона с результатом применения.
 *
 * @param weaponName - название оружия
 * @param applyResult - результат применения урона к цели (может отсутствовать)
 * @param damageType - тип урона
 * @returns текст лейбла
 */
export function buildDamageLabel(
  weaponName: string,
  applyResult?: DamageApplyResult | null,
  damageType?: string,
): string {
  const typeLabel = damageType ? getShortDamageTypeLabel(damageType) : '';

  const typeSuffix = typeLabel ? ` (${typeLabel})` : '';

  let label = `Урон${typeSuffix}\u00A0—\u00A0${weaponName}`;

  if (applyResult) {
    const tempAbsorbed = applyResult.tempAbsorbed ?? 0;

    const totalDamage =
      applyResult.hpBefore - applyResult.hpAfter + tempAbsorbed;

    label += `\u00A0→\u00A0${applyResult.actorName}:\u00A0-${totalDamage}\u00A0HP`;

    if (tempAbsorbed > 0) {
      label += `\u00A0(врем.\u00A0-${tempAbsorbed})`;
    }

    label += formatDamageDefenseSuffix(applyResult.defenseOutcome);
  }

  return label;
}

const DOUBLE_DICE_REGEX = /(\d+)(к|d)(\d+)/gi;

/**
 * Удваивает количество кубиков в формуле для критического удара.
 *
 * @param formula - исходная формула урона (напр. "2к6+3")
 * @returns формула с удвоенными кубиками (напр. "4к6+3")
 */
export function doubleDiceInFormula(formula: string): string {
  return formula.replace(
    DOUBLE_DICE_REGEX,
    (_match, count, separator, sides) => {
      return `${Number(count) * 2}${separator}${sides}`;
    },
  );
}

/** Параметры для полного двухэтапного броска атаки */
export interface PerformAttackParams {
  /** Формула атаки (напр. "1к20+5") */
  attackFormula: string;
  /** Модификатор атаки */
  attackModifier: number;
  /** Класс доспеха цели */
  targetAc: number;
  /** Название оружия */
  weaponName: string;
  /** Имя цели */
  targetName: string;
  /** Атака с помехой */
  isDisadvantage?: boolean;
  /** Формула урона (если есть) */
  damageFormula?: string;
  /** ID актора цели (для применения урона) */
  targetActorId?: string | null;
  /** Активные флаги цели (для иммунитета к критам и т.п.) */
  targetFlags?: ReadonlySet<string>;
  /** Тип урона (если есть) */
  damageType?: string;
}

/** Результат двухэтапной атаки */
export interface PerformAttackResult {
  /** Данные броска атаки */
  attackRoll: DiceRollData;
  /** Данные броска урона (если попал и есть формула) */
  damageRoll?: DiceRollData;
  /** Результат определения попадания */
  attackResult: AttackResult;
}

/**
 * Выполняет двухэтапную атаку D&D 5e: бросок попадания → бросок урона.
 *
 * @param params - параметры атаки
 * @param rollFn - функция для парсинга и броска кубиков (parseAndRoll)
 * @param applyDamageFn - функция для применения урона к цели (опционально)
 * @returns результат атаки с данными обоих бросков
 */
export function performTwoStageAttack(
  params: PerformAttackParams,
  rollFn: (formula: string) => DiceRollData,
  applyDamageFn?: (
    damage: number,
    isHealing: boolean,
  ) => DamageApplyResult | null,
): PerformAttackResult {
  const attackRoll = rollFn(params.attackFormula);

  const attackResult = resolveAttackRoll({
    total: attackRoll.total,
    attackModifier: params.attackModifier,
    targetAc: params.targetAc,
    targetFlags: params.targetFlags,
  });

  attackRoll.label = buildAttackLabel({
    weaponName: params.weaponName,
    targetName: params.targetName,
    result: attackResult,
    isDisadvantage: params.isDisadvantage,
  });

  const output: PerformAttackResult = { attackRoll, attackResult };

  // Если попал и есть формула урона — бросок урона
  if (attackResult.isHit && params.damageFormula) {
    const damageFormula = attackResult.isCriticalHit
      ? doubleDiceInFormula(params.damageFormula)
      : params.damageFormula;

    const damageRoll = rollFn(damageFormula);

    let applyResult: DamageApplyResult | null = null;

    if (params.targetActorId && applyDamageFn) {
      applyResult = applyDamageFn(damageRoll.total, false);
    }

    damageRoll.label = buildDamageLabel(
      params.weaponName,
      applyResult,
      params.damageType,
    );

    output.damageRoll = damageRoll;
  }

  return output;
}

/** Режим броска атаки */
export type AttackRollMode = 'normal' | 'advantage' | 'disadvantage';

/** Категория атаки для подбора профильных флагов преимущества/помехи */
export type AttackFlagCategory = 'melee' | 'ranged' | 'spell';

/** Параметры расчёта режима броска атаки по флагам атакующего и цели */
export interface AttackRollModeParams {
  /** Активные флаги атакующего (`ResolvedActorStats.activeFlags`) */
  attackerFlags: ReadonlySet<string>;
  /** Категория атаки: профильные флаги `attack.<category>.advantage/disadvantage` */
  attackType: AttackFlagCategory;
  /** Активные флаги цели (для `attacksAgainst.advantage/disadvantage`) */
  targetFlags?: ReadonlySet<string>;
  /** Внешняя помеха (напр. стрельба за пределы нормальной дистанции) */
  forceDisadvantage?: boolean;
}

/**
 * Определяет итоговый режим броска атаки D&D 5e по флагам атакующего и цели.
 *
 * Учитывает общие флаги (`attack.advantage`/`attack.disadvantage`), профильные
 * по категории атаки (`attack.<melee|ranged|spell>.*`), флаги «атак по цели»
 * (`attacksAgainst.*`) и внешнюю помеху `forceDisadvantage` (дистанция). По
 * правилу 5e преимущество и помеха взаимно гасятся до «обычного» броска.
 *
 * Единая точка для всех путей атаки (оружие/заклинания актёра, действия и
 * заклинания существа), чтобы флаги атакующего читались одинаково везде.
 *
 * @param params - флаги атакующего/цели и контекст
 * @returns режим броска: обычный / преимущество / помеха
 */
export function resolveAttackRollMode(
  params: AttackRollModeParams,
): AttackRollMode {
  const { attackerFlags, attackType, targetFlags, forceDisadvantage } = params;

  const hasAdvantage =
    attackerFlags.has('attack.advantage')
    || attackerFlags.has(`attack.${attackType}.advantage`)
    || (targetFlags?.has('attacksAgainst.advantage') ?? false);

  const hasDisadvantage =
    forceDisadvantage === true
    || attackerFlags.has('attack.disadvantage')
    || attackerFlags.has(`attack.${attackType}.disadvantage`)
    || (targetFlags?.has('attacksAgainst.disadvantage') ?? false);

  if (hasAdvantage && !hasDisadvantage) {
    return 'advantage';
  }

  if (hasDisadvantage && !hasAdvantage) {
    return 'disadvantage';
  }

  return 'normal';
}

/**
 * Формирует формулу для броска атаки D&D 5e.
 *
 * - `normal`: `1к20+N`
 * - `advantage`: `2к20kh1+N` (бросить 2 к20, взять лучший)
 * - `disadvantage`: `2к20kl1+N` (бросить 2 к20, взять худший)
 *
 * @param attackModifier - суммарный модификатор атаки
 * @param rollMode - режим броска (обычный / преимущество / помеха)
 * @returns формула атаки
 */
export function buildAttackFormula(
  attackModifier: number,
  rollMode: AttackRollMode = 'normal',
): string {
  const sign = attackModifier >= 0 ? '+' : '-';

  let diceExpr = '1к20';

  if (rollMode === 'advantage') {
    diceExpr = '2к20kh1';
  } else if (rollMode === 'disadvantage') {
    diceExpr = '2к20kl1';
  }

  return `${diceExpr}${sign}${Math.abs(attackModifier)}`;
}

/**
 * Проверяет, находится ли цель в пределах досягаемости оружия.
 *
 * @param weapon - оружие для атаки
 * @param distance - расстояние до цели
 * @returns объект с результатом проверки или null
 */
export function checkRange(
  weapon: GameItem,
  distance: number,
): { allowed: boolean; disadvantage: boolean } {
  if (weapon.rangeType === 'ranged' && weapon.range) {
    const normalRange = weapon.range.normal;
    const longRange = weapon.range.long ?? normalRange;

    if (distance > longRange) {
      return { allowed: false, disadvantage: false };
    }

    if (distance > normalRange) {
      return { allowed: true, disadvantage: true };
    }

    return { allowed: true, disadvantage: false };
  }

  // Ближний бой: проверяем reach
  const reach = weapon.reach ?? DEFAULT_REACH_FEET;

  if (distance > reach) {
    return { allowed: false, disadvantage: false };
  }

  return { allowed: true, disadvantage: false };
}

/**
 * Проверяет, находится ли цель в пределах досягаемости действия существа.
 *
 * Логика идентична checkRange для оружия:
 * - ranged: проверяет normal/long дистанцию, помеха при превышении нормальной
 * - melee: проверяет reach (по умолчанию 5)
 *
 * @param action - действие существа
 * @param distance - расстояние до цели
 * @returns объект с результатом проверки
 */
export function checkCreatureActionRange(
  action: CreatureAction,
  distance: number,
): { allowed: boolean; disadvantage: boolean } {
  if (action.rangeType === 'ranged' && action.range) {
    const normalRange = action.range.normal;
    const longRange = action.range.long ?? normalRange;

    if (distance > longRange) {
      return { allowed: false, disadvantage: false };
    }

    if (distance > normalRange) {
      return { allowed: true, disadvantage: true };
    }

    return { allowed: true, disadvantage: false };
  }

  // Ближний бой: проверяем reach
  const actionReach = action.reach ?? DEFAULT_REACH_FEET;

  if (distance > actionReach) {
    return { allowed: false, disadvantage: false };
  }

  return { allowed: true, disadvantage: false };
}

/**
 * Возвращает предел дистанции каста заклинания в единицах сцены.
 *
 * В отличие от оружия, у заклинаний D&D 5e нет «длинной» дистанции
 * с помехой — только жёсткий предел:
 * - `melee` / `touch`: досягаемость 5 футов;
 * - `ranged` с дистанцией больше 0: дистанция заклинания, сконвертированная
 *   из `rangeUnit` заклинания в единицы сцены;
 * - `self` / `sight` / `none` или дистанция 0: без ограничений.
 *
 * @param spell - заклинание
 * @param sceneUnit - единица измерения сцены
 * @returns предел дистанции в единицах сцены (null — дистанция не ограничена)
 */
export function getSpellMaxRange(
  spell: Spell,
  sceneUnit: DistanceUnit,
): number | null {
  if (spell.deliveryType === 'melee' || spell.deliveryType === 'touch') {
    return Math.round(convertDistance(DEFAULT_REACH_FEET, 'ft', sceneUnit));
  }

  if (spell.deliveryType === 'ranged' && spell.range > 0) {
    return Math.round(convertDistance(spell.range, spell.rangeUnit, sceneUnit));
  }

  return null;
}

/**
 * Проверяет, находится ли цель в пределах дистанции заклинания.
 *
 * Предел дистанции считается по правилам `getSpellMaxRange`.
 *
 * @param spell - заклинание
 * @param distance - расстояние до цели в единицах сцены
 * @param sceneUnit - единица измерения сцены
 * @returns результат проверки и предел дистанции в единицах сцены
 *   (`maxRange: null` — дистанция не ограничена)
 */
export function checkSpellRange(
  spell: Spell,
  distance: number,
  sceneUnit: DistanceUnit,
): { allowed: boolean; maxRange: number | null } {
  const maxRange = getSpellMaxRange(spell, sceneUnit);

  return {
    allowed: maxRange === null || distance <= maxRange,
    maxRange,
  };
}
