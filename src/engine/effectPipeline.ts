/**
 * Трёхфазный пайплайн подготовки данных актора
 *
 * Pipeline:
 * 1. prepareBaseData — извлечение «сырых» значений из actor.system
 * 2. applyActiveEffects — применение числовых changes + сбор булевых flags
 * 3. prepareDerivedData — вычисление производных (модификаторы, AC, навыки)
 *
 * Итоговый результат — ResolvedActorStats, содержащий все вычисленные
 * значения с учётом всех активных эффектов.
 */

import type {
  AbilityType,
  DefensibleDamageType,
  MovementType,
  SkillType,
} from '@vtt/shared';
// IncomingAttackContext — нейтральный контрактный тип (system/contracts/combat),
// D&D его лишь реэкспортит для своих потребителей.
import type { IncomingAttackContext } from '@vtt/shared';
import type {
  ActiveEffect,
  EffectChange,
  EffectChangeMode,
  EffectFlagKey,
  EffectTargetKey,
  ResolvedActorStats,
} from './activeEffectTypes.js';
import type { Creature, DnDActor, DnDSceneEntity } from './dndEntities.js';
import type { FormulaContext } from './formulaParser.js';
import type { BonusDamageFormula, TargetHpGate } from './spellUtils.js';

import { isActorEntity, isCreatureEntity } from '@vtt/shared';
import { isRecord } from '@vtt/shared';
import { isDnDEffect } from './activeEffectTypes.js';
import {
  calculateProficiencyBonus,
  getProficiencyContribution,
  isProficiencyLevel,
} from './calculations.js';
import { getTotalLevel } from './classTypes.js';
import { BASE_UNARMORED_AC, SKILL_ABILITY_MAP } from './consts.js';
import { DEFENSIBLE_DAMAGE_TYPES } from './damageConstants.js';
import { collectStaticDamageDefenses } from './damageUtils.js';
import { buildFormulaContext, evaluateFormula } from './formulaParser.js';

export type { IncomingAttackContext };

// ── Константы ─────────────────────────────────────────────────

/** Все ключи характеристик в порядке итерации */
const ABILITY_KEYS: readonly AbilityType[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

/** Все ключи навыков в порядке итерации */
const SKILL_KEYS: readonly SkillType[] = [
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'sleightOfHand',
  'stealth',
  'survival',
  'religion',
] as const;

/** Все типы движения */
const MOVEMENT_KEYS: readonly MovementType[] = [
  'walk',
  'swim',
  'fly',
  'climb',
  'burrow',
] as const;

/** Множество ключей характеристик для быстрой проверки принадлежности. */
const ABILITY_KEY_SET = new Set<string>(ABILITY_KEYS);

/**
 * Type-guard: значение — допустимый ключ характеристики (`AbilityType`).
 *
 * @param value - проверяемое значение
 * @returns true, если value входит в набор характеристик
 */
function isAbilityType(value: unknown): value is AbilityType {
  return typeof value === 'string' && ABILITY_KEY_SET.has(value);
}

/**
 * Извлекает максимум ХП из структуры hitPoints актора либо существа.
 * Порядок: `max` → `average` (у существ) → дефолт 10.
 *
 * @param hitPoints - структура хитов (форма различается у актора и существа)
 * @returns максимум хитов
 */
function resolveHitPointsMax(hitPoints: unknown): number {
  if (isRecord(hitPoints)) {
    if (typeof hitPoints.max === 'number') {
      return hitPoints.max;
    }

    if (typeof hitPoints.average === 'number') {
      return hitPoints.average;
    }
  }

  return 10;
}

// ── Фаза 1: prepareBaseData ───────────────────────────────────

/**
 * Извлекает «сырые» базовые значения из actor.system.
 *
 * Это первая фаза пайплайна — заполняет ResolvedActorStats
 * данными напрямую из актора, БЕЗ учёта эффектов.
 *
 * @param actor - объект DnDActor | Creature
 * @returns начальные базовые статы
 */
export function prepareBaseData(
  actor: DnDActor | Creature,
): ResolvedActorStats {
  const system = actor.system;

  const abilities = Object.fromEntries(
    ABILITY_KEYS.map((key) => [key, 0]),
  ) as Record<AbilityType, number>;

  const abilityMods = Object.fromEntries(
    ABILITY_KEYS.map((key) => [key, 0]),
  ) as Record<AbilityType, number>;

  const saves = Object.fromEntries(
    ABILITY_KEYS.map((key) => [key, 0]),
  ) as Record<AbilityType, number>;

  const skills = Object.fromEntries(
    SKILL_KEYS.map((key) => [key, 0]),
  ) as Record<SkillType, number>;

  const movement = Object.fromEntries(
    MOVEMENT_KEYS.map((key) => [key, 0]),
  ) as Record<MovementType, number>;

  // Характеристики
  for (const abilityKey of ABILITY_KEYS) {
    abilities[abilityKey] = system.abilities[abilityKey] ?? 10;
    abilityMods[abilityKey] = 0; // вычислится в prepareDerivedData
    saves[abilityKey] = 0;
  }

  // Навыки — заполняем нулями, вычислятся в prepareDerivedData
  for (const skillKey of SKILL_KEYS) {
    skills[skillKey] = 0;
  }

  // Движение
  for (const movementKey of MOVEMENT_KEYS) {
    if ('movement' in system && system.movement) {
      movement[movementKey] = system.movement[movementKey] ?? 0;
    } else {
      movement[movementKey] = 0;
    }
  }

  return {
    abilities,
    abilityMods,
    saves,
    skills,
    armorClass: system.armorClass?.value ?? BASE_UNARMORED_AC,
    initiative: 0,
    proficiencyBonus: 0,
    movement,
    hitPointsMax: resolveHitPointsMax(system.hitPoints),
    attackBonuses: { melee: 0, ranged: 0, spell: 0 },
    damageBonuses: { melee: 0, ranged: 0, spell: 0 },
    spellSaveDC: 0,
    activeFlags: new Set<EffectFlagKey>(),
    damageDefenses: {
      immunities: new Set<DefensibleDamageType>(),
      resistances: new Set<DefensibleDamageType>(),
      vulnerabilities: new Set<DefensibleDamageType>(),
    },
    overriddenKeys: new Set<string>(),
  };
}

// ── Сбор эффектов ─────────────────────────────────────────────

/**
 * Собирает все активные эффекты актора.
 *
 * Включает:
 * 1. Эффекты напрямую на акторе (actor.activeEffects)
 * 2. Эффекты с экипированных предметов (transfer === true && equipped)
 *
 * Исключает отключённые (disabled === true).
 *
 * @param actor - объект DnDActor | Creature
 * @returns массив активных эффектов (immutable)
 */
export function collectActiveEffects(
  actor: DnDActor | Creature,
): readonly ActiveEffect[] {
  const collectedEffects: ActiveEffect[] = [];

  // Эффекты на самом акторе
  const actorEffects = actor.activeEffects ?? [];

  for (const effect of actorEffects) {
    if (!effect.disabled) {
      if (effect.aura && !effect.aura.applyToSelf) {
        continue; // Эффект-аура генерируется, но на самого себя не действует
      }

      collectedEffects.push(effect);
    }
  }

  // Transferred-эффекты с экипированных предметов (только для DnDActor)
  if ('equipment' in actor) {
    const equipment = (actor as DnDActor).equipment ?? [];

    for (const item of equipment) {
      if (!item.equipped || !item.activeEffects) {
        continue;
      }

      for (const itemEffect of item.activeEffects.filter(isDnDEffect)) {
        // Игнорируем отключенные эффекты, свойство transfer больше не требуется (все эффекты предметов переносятся)
        if (!itemEffect.disabled) {
          // Эффекты, предназначенные для цели атаки, не применяются к владельцу при экипировке
          if (itemEffect.effectTarget === 'target') {
            continue;
          }

          if (itemEffect.aura && !itemEffect.aura.applyToSelf) {
            continue; // Эффект-аура экипировки генерируется, но на самого себя не действует
          }

          collectedEffects.push(itemEffect);
        }
      }
    }
  }

  // Эффекты от черт существа (только для Creature).
  // Черты (traits) содержат пассивные эффекты, постоянно действующие на само существо
  // (например, «Магическое сопротивление»).
  // Эффекты из actions/bonusActions/reactions/legendary.actions НЕ собираются здесь —
  // они предназначены для применения к целям при использовании действия,
  // а не к самому существу.
  if (isCreatureEntity(actor)) {
    for (const trait of actor.system.traits ?? []) {
      if (!trait.activeEffects) {
        continue;
      }

      for (const traitEffect of trait.activeEffects) {
        if (!traitEffect.disabled) {
          if (traitEffect.aura && !traitEffect.aura.applyToSelf) {
            continue;
          }

          collectedEffects.push(traitEffect);
        }
      }
    }
  }

  return collectedEffects;
}

// ── Фаза 2: applyActiveEffects ────────────────────────────────

/**
 * Применяет числовые changes и собирает булевые flags из эффектов.
 *
 * Шаги:
 * 1. Собирает все changes из всех эффектов
 * 2. Сортирует по priority (меньше = раньше)
 * 3. Применяет каждый change к соответствующему полю baseStats
 * 4. Собирает все flags в Set
 *
 * Результат — IMMUTABLE: возвращает новый объект, не мутирует baseStats.
 *
 * @param baseStats - базовые статы из prepareBaseData
 * @param effects - массив активных эффектов
 * @param formulaContext - контекст для вычисления формул
 * @returns модифицированные статы
 */
export function applyActiveEffects(
  baseStats: ResolvedActorStats,
  effects: readonly ActiveEffect[],
  formulaContext: FormulaContext,
): ResolvedActorStats {
  // Клонируем baseStats (immutable transforms)
  const modifiedStats = cloneResolvedStats(baseStats);

  // Собираем все changes и сортируем по priority
  const allChanges: Array<{ change: EffectChange; effectName: string }> = [];

  for (const effect of effects) {
    for (const change of effect.changes) {
      allChanges.push({ change, effectName: effect.name });
    }

    // Собираем flags
    for (const flag of effect.flags) {
      modifiedStats.activeFlags.add(flag);
    }
  }

  // Сортировка по priority: меньше = раньше
  allChanges.sort(
    (itemA, itemB) => itemA.change.priority - itemB.change.priority,
  );

  // Применяем каждый change (без условий — условные бонусы оцениваются в момент броска)
  for (const { change } of allChanges) {
    if (change.condition) {
      continue;
    }

    // Кость-формулы в damage.* — бонус-части урона, катаются отдельным броском
    // в момент атаки (collectBonusDamageFormulas), в плоские статы не входят.
    if (change.key.startsWith('damage.') && isDiceFormulaValue(change.value)) {
      continue;
    }

    applyChange(modifiedStats, change, formulaContext);
  }

  return modifiedStats;
}

// ── Условные бонусы (roll-time evaluation) ─────────────

/**
 * Контекст броска для оценки условных эффектов.
 * Передаётся при выполнении атаки для проверки условий вида
 * `roll.hasAdvantage === true`.
 */
export interface RollContext {
  /** Бросок с преимуществом */
  hasAdvantage: boolean;
  /** Бросок с помехой */
  hasDisadvantage: boolean;
  /**
   * Состояние HP цели — для условий `target.hp.*` (напр. «Убийца»/«Окровавлен»).
   * Отсутствует вне таргет-контекста; такие условия тогда не срабатывают.
   */
  target?: { currentHp: number; maxHp: number };
}

// Тип `IncomingAttackContext` вынесен в нейтральный контракт
// (`../contracts/combat`) и реэкспортится выше.

/**
 * Маппинг условий `target.hp.*` на гейты состояния HP цели.
 * Используется и для прямой оценки ({@link evaluateCondition}), и для
 * отложенной per-target оценки, когда единой цели на касте нет
 * ({@link collectBonusDamageFormulas}).
 */
const TARGET_HP_CONDITION_GATES: Record<string, TargetHpGate> = {
  'target.hp.value === target.hp.max': 'full',
  'target.hp.value < target.hp.max': 'notFull',
  'target.hp.value <= (target.hp.max / 2)': 'halfOrLess',
};

/**
 * Возвращает гейт состояния HP цели для условия change (если это условие
 * `target.hp.*`).
 *
 * @param condition - строка условия
 * @returns гейт или undefined (условие не про HP цели)
 */
export function targetHpGateForCondition(
  condition: string,
): TargetHpGate | undefined {
  return TARGET_HP_CONDITION_GATES[condition.trim()];
}

/**
 * Проверяет состояние HP против гейта (единая семантика гейтов
 * `full`/`notFull`/`halfOrLess` для условий и per-target фильтра оркестратора).
 *
 * @param gate - гейт состояния HP
 * @param currentHp - текущее HP
 * @param maxHp - максимальное HP
 * @returns true если состояние HP проходит гейт
 */
export function targetHpGateMatches(
  gate: TargetHpGate,
  currentHp: number,
  maxHp: number,
): boolean {
  if (gate === 'full') {
    return currentHp >= maxHp;
  }

  if (gate === 'halfOrLess') {
    return currentHp <= maxHp / 2;
  }

  return currentHp < maxHp;
}

/**
 * Оценивает условие EffectChange против контекста броска.
 *
 * Поддерживаемые паттерны:
 * - `roll.hasAdvantage === true`
 * - `roll.hasDisadvantage === true`
 * - `target.hp.value === target.hp.max` — у цели полное HP («Убийца»)
 * - `target.hp.value <= (target.hp.max / 2)` — у цели ≤ половины HP («Окровавлен»)
 * - `target.hp.value < target.hp.max` — цель ранена (не полное HP)
 *
 * Условия `target.hp.*` срабатывают только если в контексте есть HP цели;
 * иначе возвращают false (нет цели — нет состояния). Для кость-формул
 * бонус-урона без единой цели такие условия не гасятся, а откладываются в
 * per-target гейт ({@link collectBonusDamageFormulas}).
 *
 * @param condition - строка условия
 * @param rollContext - контекст текущего броска
 * @returns true если условие выполняется
 */
function evaluateCondition(
  condition: string,
  rollContext: RollContext,
): boolean {
  const trimmed = condition.trim();

  if (trimmed === 'roll.hasAdvantage === true') {
    return rollContext.hasAdvantage;
  }

  if (trimmed === 'roll.hasDisadvantage === true') {
    return rollContext.hasDisadvantage;
  }

  // Условия по состоянию HP цели
  const { target } = rollContext;
  const hpGate = TARGET_HP_CONDITION_GATES[trimmed];

  if (hpGate) {
    return target
      ? targetHpGateMatches(hpGate, target.currentHp, target.maxHp)
      : false;
  }

  // Неизвестное условие — не применяем
  return false;
}

/**
 * Оценивает условие защитного эффекта против контекста входящей атаки.
 *
 * Поддерживаемые паттерны:
 * - `incoming.attackType === "ranged"` — от дальнобойных атак
 * - `incoming.attackType === "melee"` — от рукопашных атак
 * - `incoming.attackType === "spell"` — от атак заклинаниями
 *
 * @param condition - строка условия
 * @param attackContext - контекст входящей атаки
 * @returns true если условие выполняется
 */
function evaluateDefensiveCondition(
  condition: string,
  attackContext: IncomingAttackContext,
): boolean {
  const trimmed = condition.trim();

  if (trimmed === 'incoming.attackType === "ranged"') {
    return attackContext.attackType === 'ranged';
  }

  if (trimmed === 'incoming.attackType === "melee"') {
    return attackContext.attackType === 'melee';
  }

  if (trimmed === 'incoming.attackType === "spell"') {
    return attackContext.attackType === 'spell';
  }

  return false;
}

/**
 * Вычисляет дополнительный бонус к AC защитника от условных эффектов.
 *
 * Проходит по всем активным эффектам актора, ищет changes с ключом `armorClass`
 * и условием типа `incoming.attackType === "ranged"`, и суммирует подходящие бонусы.
 *
 * @param effects - массив активных эффектов защитника
 * @param attackContext - контекст входящей атаки (тип: melee/ranged/spell)
 * @returns суммарный условный бонус к AC
 */
export function evaluateDefensiveACBonus(
  effects: readonly ActiveEffect[],
  attackContext: IncomingAttackContext,
): number {
  let bonus = 0;

  for (const effect of effects) {
    if (effect.disabled) {
      continue;
    }

    for (const change of effect.changes) {
      if (change.key !== 'armorClass' || !change.condition) {
        continue;
      }

      if (evaluateDefensiveCondition(change.condition, attackContext)) {
        const value = Number(change.value);

        if (!Number.isNaN(value)) {
          bonus += value;
        }
      }
    }
  }

  return bonus;
}

/**
 * Вычисляет дополнительные бонусы от условных Active Effects
 * для указанного ключа (например `attack.melee`).
 *
 * Вызывается в момент броска, когда известен контекст (преимущество/помеха).
 * Возвращает суммарный бонус от всех подходящих условных changes.
 *
 * @param effects - массив активных эффектов (включая ауры)
 * @param targetKey - ключ, для которого ищем бонусы (например `attack.melee`)
 * @param rollContext - контекст текущего броска
 * @returns суммарный бонус от условных эффектов
 */
export function evaluateConditionalBonuses(
  effects: readonly ActiveEffect[],
  targetKey: EffectTargetKey,
  rollContext: RollContext,
): number {
  let bonus = 0;

  for (const effect of effects) {
    if (effect.disabled) {
      continue;
    }

    for (const change of effect.changes) {
      if (!change.condition || change.key !== targetKey) {
        continue;
      }

      if (evaluateCondition(change.condition, rollContext)) {
        const value = Number(change.value);

        if (!Number.isNaN(value)) {
          bonus += value;
        }
      }
    }
  }

  return bonus;
}

// ── Бонус-части урона (кость-формулы в damage.*) ──────────────

/** Регэксп кубиковой нотации в значении change (напр. "2к6", "1d4", "к8"). */
const DICE_VALUE_REGEX = /\d*\s*[кd]\s*\d+/i;

/**
 * Определяет, является ли значение change формулой костей (а не плоским числом).
 *
 * Такие значения в ключах `damage.*` не складываются в `damageBonuses` пайплайна,
 * а собираются в момент броска как отдельные бонус-части урона
 * (см. {@link collectBonusDamageFormulas}).
 *
 * @param value - строка значения change
 * @returns true если в значении есть кубиковая нотация
 */
export function isDiceFormulaValue(value: string): boolean {
  return DICE_VALUE_REGEX.test(value);
}

/**
 * Проверяет, есть ли среди активных эффектов кость-формулы бонус-урона
 * для указанного ключа (`damage.melee` / `damage.ranged` / `damage.spell`).
 *
 * Условия change НЕ оцениваются — функция отвечает на вопрос «нужно ли вообще
 * идти многочастным путём урона», а сработают ли условные бонусы, решается
 * в момент броска ({@link collectBonusDamageFormulas}).
 *
 * @param effects - массив активных эффектов (включая ауры)
 * @param targetKey - ключ урона (например `damage.melee`)
 * @returns true если есть хотя бы одна кость-формула бонус-урона
 */
export function hasBonusDamageFormulas(
  effects: readonly ActiveEffect[],
  targetKey: EffectTargetKey,
): boolean {
  for (const effect of effects) {
    if (effect.disabled) {
      continue;
    }

    for (const change of effect.changes) {
      if (change.key === targetKey && isDiceFormulaValue(change.value)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Собирает кость-формулы бонус-урона из активных эффектов для указанного ключа.
 *
 * Дополнение к {@link evaluateConditionalBonuses}: та суммирует ПЛОСКИЕ числовые
 * бонусы, а эта возвращает формулы костей (напр. «2к6@dmg.fire@target.full») —
 * они катаются отдельными частями урона в многочастном пути. Условие change
 * оценивается против контекста броска; change без условия применяется всегда.
 * Особый случай — условие `target.hp.*` БЕЗ HP цели в контексте (AoE / снаряды:
 * единой цели нет): формула не гасится, а возвращается с отложенным гейтом
 * `conditionGate` — оркестратор оценит HP каждой цели в момент применения.
 * Токены `@dmg.<type>`/`@target.*` остаются в формуле — их разбирает
 * `resolveBonusDamageParts` (spellUtils).
 *
 * @param effects - массив активных эффектов (включая ауры)
 * @param targetKey - ключ урона (например `damage.melee`)
 * @param rollContext - контекст текущего броска (преимущество/помеха, HP цели)
 * @returns массив формул бонус-урона, прошедших условия (или с отложенным гейтом)
 */
export function collectBonusDamageFormulas(
  effects: readonly ActiveEffect[],
  targetKey: EffectTargetKey,
  rollContext: RollContext,
): BonusDamageFormula[] {
  const formulas: BonusDamageFormula[] = [];

  for (const effect of effects) {
    if (effect.disabled) {
      continue;
    }

    for (const change of effect.changes) {
      if (change.key !== targetKey || !isDiceFormulaValue(change.value)) {
        continue;
      }

      if (change.condition) {
        const conditionGate = targetHpGateForCondition(change.condition);

        if (conditionGate && rollContext.target === undefined) {
          // HP-условие без единой цели: откладываем в per-target гейт
          formulas.push({ formula: change.value, conditionGate });

          continue;
        }

        if (!evaluateCondition(change.condition, rollContext)) {
          continue;
        }
      }

      formulas.push({ formula: change.value });
    }
  }

  return formulas;
}

/**
 * Применяет один EffectChange к соответствующему полю ResolvedActorStats.
 *
 * @param stats - мутабельные статы (клон)
 * @param change - применяемое изменение
 * @param formulaContext - контекст для формул
 */
function applyChange(
  stats: ResolvedActorStats,
  change: EffectChange,
  formulaContext: FormulaContext,
): void {
  try {
    const resolvedValue = resolveChangeValue(change.value, formulaContext);
    const currentValue = getStatValue(stats, change.key);
    const newValue = applyMode(currentValue, resolvedValue, change.mode);

    setStatValue(stats, change.key, newValue);

    // Помечаем ключ как перезаписанный, чтобы Фаза 3 не добавляла базовые значения
    if (
      change.mode === 'override'
      || change.mode === 'upgrade'
      || change.mode === 'downgrade'
    ) {
      stats.overriddenKeys.add(change.key);
    }
  } catch (error) {
    console.warn(
      `[EffectPipeline] Ошибка применения эффекта (key: ${change.key}):`,
      error,
    );
  }
}

/**
 * Вычисляет числовое значение из строки (число или формула).
 *
 * @param value - строка со значением или формулой
 * @param formulaContext - контекст @-переменных
 * @returns числовое значение
 */
function resolveChangeValue(
  value: string,
  formulaContext: FormulaContext,
): number {
  try {
    return evaluateFormula(value, formulaContext);
  } catch {
    // Если формула невалидна — игнорируем (fallback на 0)
    console.warn(`[ActiveEffects] Невалидная формула: "${value}"`);

    return 0;
  }
}

/**
 * Применяет режим изменения к текущему и новому значению.
 *
 * @param currentValue - текущее значение поля
 * @param resolvedValue - вычисленное значение из change
 * @param mode - режим применения
 * @returns результирующее значение
 */
function applyMode(
  currentValue: number,
  resolvedValue: number,
  mode: EffectChangeMode,
): number {
  switch (mode) {
    case 'add':
      return currentValue + resolvedValue;
    case 'multiply':
      return currentValue * resolvedValue;
    case 'override':
      return resolvedValue;
    case 'upgrade':
      return Math.max(currentValue, resolvedValue);
    case 'downgrade':
      return Math.min(currentValue, resolvedValue);
    case 'custom':
      // Custom mode = add (для расширяемости в будущем)
      return currentValue + resolvedValue;
    default:
      return currentValue;
  }
}

/**
 * Извлекает текущее значение поля из ResolvedActorStats по EffectTargetKey.
 *
 * @param stats - статы актора
 * @param targetKey - ключ поля
 * @returns текущее числовое значение
 */
function getStatValue(
  stats: ResolvedActorStats,
  targetKey: EffectTargetKey,
): number {
  // Характеристики
  if (targetKey.startsWith('ability.')) {
    const abilityName = targetKey.slice(8) as AbilityType;

    return stats.abilities[abilityName] ?? 0;
  }

  // Спасброски
  if (targetKey.startsWith('save.')) {
    const abilityName = targetKey.slice(5) as AbilityType;

    return stats.saves[abilityName] ?? 0;
  }

  // Навыки
  if (targetKey.startsWith('skill.')) {
    const skillName = targetKey.slice(6) as SkillType;

    return stats.skills[skillName] ?? 0;
  }

  // Движение
  if (targetKey.startsWith('movement.')) {
    const movementName = targetKey.slice(9) as MovementType;

    return stats.movement[movementName] ?? 0;
  }

  // Атака
  if (targetKey.startsWith('attack.')) {
    const attackType = targetKey.slice(
      7,
    ) as keyof ResolvedActorStats['attackBonuses'];

    return stats.attackBonuses[attackType] ?? 0;
  }

  // Урон
  if (targetKey.startsWith('damage.')) {
    const damageType = targetKey.slice(
      7,
    ) as keyof ResolvedActorStats['damageBonuses'];

    return stats.damageBonuses[damageType] ?? 0;
  }

  // Простые поля
  switch (targetKey) {
    case 'armorClass':
      return stats.armorClass;
    case 'hitPoints.max':
      return stats.hitPointsMax;
    case 'hitPoints.temp':
      return 0; // temp HP не хранятся в resolved stats
    case 'initiative':
      return stats.initiative;
    case 'proficiencyBonus':
      return stats.proficiencyBonus;
    case 'spellSaveDC':
      return stats.spellSaveDC;
    default:
      return 0;
  }
}

/**
 * Устанавливает значение поля в ResolvedActorStats по EffectTargetKey.
 *
 * @param stats - статы актора (мутабельный клон)
 * @param targetKey - ключ поля
 * @param statValue - новое значение
 */
function setStatValue(
  stats: ResolvedActorStats,
  targetKey: EffectTargetKey,
  statValue: number,
): void {
  // Характеристики
  if (targetKey.startsWith('ability.')) {
    const abilityName = targetKey.slice(8) as AbilityType;

    stats.abilities[abilityName] = statValue;

    return;
  }

  // Спасброски
  if (targetKey.startsWith('save.')) {
    const abilityName = targetKey.slice(5) as AbilityType;

    stats.saves[abilityName] = statValue;

    return;
  }

  // Навыки
  if (targetKey.startsWith('skill.')) {
    const skillName = targetKey.slice(6) as SkillType;

    stats.skills[skillName] = statValue;

    return;
  }

  // Движение
  if (targetKey.startsWith('movement.')) {
    const movementName = targetKey.slice(9) as MovementType;

    stats.movement[movementName] = statValue;

    return;
  }

  // Атака
  if (targetKey.startsWith('attack.')) {
    const attackType = targetKey.slice(
      7,
    ) as keyof ResolvedActorStats['attackBonuses'];

    stats.attackBonuses[attackType] = statValue;

    return;
  }

  // Урон
  if (targetKey.startsWith('damage.')) {
    const damageType = targetKey.slice(
      7,
    ) as keyof ResolvedActorStats['damageBonuses'];

    stats.damageBonuses[damageType] = statValue;

    return;
  }

  // Простые поля
  switch (targetKey) {
    case 'armorClass':
      stats.armorClass = statValue;

      break;
    case 'hitPoints.max':
      stats.hitPointsMax = statValue;

      break;
    case 'initiative':
      stats.initiative = statValue;

      break;
    case 'proficiencyBonus':
      stats.proficiencyBonus = statValue;

      break;
    case 'spellSaveDC':
      stats.spellSaveDC = statValue;

      break;
  }
}

// ── Фаза 3: prepareDerivedData ────────────────────────────────

/**
 * Собирает итоговые защиты сущности от урона по типам.
 *
 * Универсально объединяет два источника:
 * 1. Статическое поле `system.defenses` (существа и любые будущие сущности).
 * 2. Флаги активных эффектов (`resistance.*` / `immunity.*` / `vulnerability.*`)
 *    — так защиты получают акторы (через предметы, виды, состояния).
 *
 * @param actor - актор или существо
 * @param activeFlags - финальный набор флагов после применения эффектов
 * @returns наборы иммунитетов, сопротивлений и уязвимостей
 */
function resolveDamageDefenses(
  actor: DnDActor | Creature,
  activeFlags: ReadonlySet<EffectFlagKey>,
): ResolvedActorStats['damageDefenses'] {
  const { immunities, resistances, vulnerabilities } =
    collectStaticDamageDefenses(actor.system);

  for (const damageType of DEFENSIBLE_DAMAGE_TYPES) {
    if (activeFlags.has(`resistance.${damageType}`)) {
      resistances.add(damageType);
    }

    if (activeFlags.has(`immunity.${damageType}`)) {
      immunities.add(damageType);
    }

    if (activeFlags.has(`vulnerability.${damageType}`)) {
      vulnerabilities.add(damageType);
    }
  }

  return { immunities, resistances, vulnerabilities };
}

/**
 * Собирает иммунитеты сущности к состояниям из двух источников:
 * 1. Статический список существа (`system.defenses.conditionImmunities`).
 * 2. Поля `conditionImmunities` активных эффектов (предметы, виды, состояния) —
 *    единственный путь для актёров, у которых нет `system.defenses`.
 *
 * Единый помощник для всех мест наложения состояний (DRY): и проверка цели
 * атаки/заклинания, и тоггл на листе используют один источник правды.
 *
 * @param entity - актор или существо
 * @returns ключи состояний, к которым сущность иммунна (может быть пустым)
 */
export function getEntityConditionImmunities(
  entity: DnDSceneEntity,
): readonly string[] {
  const fromEffects: string[] = [];

  for (const effect of entity.activeEffects ?? []) {
    if (effect.disabled) {
      continue;
    }

    for (const conditionKey of effect.conditionImmunities ?? []) {
      fromEffects.push(conditionKey);
    }
  }

  if (isCreatureEntity(entity)) {
    return [...entity.system.defenses.conditionImmunities, ...fromEffects];
  }

  return fromEffects;
}

/**
 * Вычисляет производные значения на основе модифицированных базовых данных.
 *
 * Эта фаза выполняется ПОСЛЕ применения Active Effects.
 * Модификаторы, AC, навыки, спасброски — всё вычисляется здесь.
 *
 * @param modifiedStats - статы после applyActiveEffects
 * @param actor - исходный актор (для proficiencies и настроек)
 * @returns финальные resolved статы
 */
export function prepareDerivedData(
  modifiedStats: ResolvedActorStats,
  actor: DnDActor | Creature,
): ResolvedActorStats {
  const system = actor.system;
  const derivedStats = cloneResolvedStats(modifiedStats);

  // Вычисляем proficiency bonus
  let proficiencyBonus = 2;

  if ('classes' in system && Array.isArray(system.classes)) {
    // DnDActor
    const level = getTotalLevel(system.classes);

    proficiencyBonus = calculateProficiencyBonus(level);
  } else if ('details' in system) {
    // Legacy / Fallback
    const details = system.details;

    proficiencyBonus =
      isRecord(details) && typeof details.proficiencyBonus === 'number'
        ? details.proficiencyBonus
        : 2;
  } else if ('proficiencyBonus' in system) {
    // Creature
    const creatureProficiencyBonus = system.proficiencyBonus;

    proficiencyBonus =
      typeof creatureProficiencyBonus === 'number'
        ? creatureProficiencyBonus
        : 2;
  }

  derivedStats.proficiencyBonus =
    derivedStats.proficiencyBonus || proficiencyBonus;

  // 2. Модификаторы характеристик
  for (const abilityKey of ABILITY_KEYS) {
    derivedStats.abilityMods[abilityKey] = Math.floor(
      (derivedStats.abilities[abilityKey] - 10) / 2,
    );
  }

  // 3. Спасброски
  for (const abilityKey of ABILITY_KEYS) {
    if (derivedStats.overriddenKeys.has(`save.${abilityKey}`)) {
      continue;
    }

    let hasProficiency = false;

    const proficiencies = system.proficiencies;
    const rootSavingThrows = system.savingThrows;

    if (Array.isArray(proficiencies)) {
      hasProficiency = proficiencies.includes(abilityKey);
    } else if (isRecord(proficiencies)) {
      const proficiencySaves = proficiencies.savingThrows;

      hasProficiency =
        Array.isArray(proficiencySaves)
        && proficiencySaves.includes(abilityKey);
    } else if (Array.isArray(rootSavingThrows)) {
      // Creature: спасброски хранятся на корне system
      hasProficiency = rootSavingThrows.includes(abilityKey);
    }

    const profBonus = hasProficiency ? derivedStats.proficiencyBonus : 0;

    derivedStats.saves[abilityKey] =
      derivedStats.abilityMods[abilityKey]
      + profBonus
      + derivedStats.saves[abilityKey];
  }

  // 4. Навыки
  for (const skillKey of SKILL_KEYS) {
    if (derivedStats.overriddenKeys.has(`skill.${skillKey}`)) {
      continue;
    }

    const baseAbility = SKILL_ABILITY_MAP[skillKey];

    let profContribution = 0;

    const proficiencies = system.proficiencies;

    if (isRecord(proficiencies) && isRecord(proficiencies.skills)) {
      const rawLevel = proficiencies.skills[skillKey];
      const profLevel = isProficiencyLevel(rawLevel) ? rawLevel : 'none';

      profContribution = getProficiencyContribution(
        derivedStats.proficiencyBonus,
        profLevel,
      );
    }

    derivedStats.skills[skillKey] =
      derivedStats.abilityMods[baseAbility]
      + profContribution
      + derivedStats.skills[skillKey];
  }

  // 5. Инициатива
  if (!derivedStats.overriddenKeys.has('initiative')) {
    const initAbility = system.initiativeAbility ?? 'dexterity';

    derivedStats.initiative =
      derivedStats.abilityMods[initAbility]
      + (system.initiativeBonus ?? 0)
      + derivedStats.initiative;
  }

  // 6. Класс доспеха (AC)
  const dexMod = derivedStats.abilityMods.dexterity;

  let calculatedAC: number;
  let shieldBonus = 0;
  let acEffectBonus = 0;

  if ('equipment' in actor) {
    // Бонус от Active Effects, применённых в фазе 2 (разница с базовым значением)
    acEffectBonus =
      modifiedStats.armorClass
      - (system.armorClass?.value ?? BASE_UNARMORED_AC);

    // Поиск экипированной брони и щита.
    // `'equipment' in actor` уже сузил тип до DnDActor — каст не нужен.
    const equipment = actor.equipment ?? [];

    // Список ключей базовых типов брони/щитов, которыми актёр владеет.
    const armorProficiencies = actor.system.proficiencies?.armor ?? [];

    let equippedArmor: (typeof equipment)[number] | undefined;
    // Носит броню или щит, которым не владеет → помеха по правилам D&D 5e
    let lacksArmorProficiency = false;
    // Надетая броня даёт помеху на Скрытность (свойство брони)
    let hasStealthDisadvantage = false;

    for (const item of equipment) {
      if (!item.equipped || !item.baseArmorAC) {
        continue;
      }

      if (item.type !== 'equipment') {
        continue;
      }

      // Владение: baseType надетого предмета должен быть в списке владений.
      // Если baseType неизвестен (кастомный предмет) — не штрафуем.
      if (item.baseType && !armorProficiencies.includes(item.baseType)) {
        lacksArmorProficiency = true;
      }

      if (item.equipmentCategory === 'shield') {
        shieldBonus += item.baseArmorAC + (item.magicBonus ?? 0);
      } else if (item.baseArmorAC > 0) {
        if (item.stealthDisadvantage) {
          hasStealthDisadvantage = true;
        }

        // Берём лучшую экипированную броню (по baseArmorAC)
        if (
          !equippedArmor
          || item.baseArmorAC > (equippedArmor.baseArmorAC ?? 0)
        ) {
          equippedArmor = item;
        }
      }
    }

    // Помеха за ношение брони/щита без владения: на проверки и спасброски
    // Силы и Ловкости и на броски атаки (по правилам — атаки оружием).
    if (lacksArmorProficiency) {
      derivedStats.activeFlags.add('abilityCheck.disadvantage.strength');
      derivedStats.activeFlags.add('abilityCheck.disadvantage.dexterity');
      derivedStats.activeFlags.add('save.disadvantage.strength');
      derivedStats.activeFlags.add('save.disadvantage.dexterity');
      derivedStats.activeFlags.add('attack.disadvantage');
    }

    if (hasStealthDisadvantage) {
      derivedStats.activeFlags.add('skill.stealth.disadvantage');
    }

    const calculation = system.armorClass?.calculation ?? 'default';

    switch (calculation) {
      case 'flat': {
        calculatedAC = system.armorClass?.value ?? BASE_UNARMORED_AC;

        break;
      }
      case 'natural':
        // Природная броня: базовое значение + DEX mod
        calculatedAC = (system.armorClass?.value ?? BASE_UNARMORED_AC) + dexMod;

        break;
      case 'default':
      default:
        if (equippedArmor) {
          // Есть экипированная броня
          const armorBase = equippedArmor.baseArmorAC ?? BASE_UNARMORED_AC;
          const armorMagicBonus = equippedArmor.magicBonus ?? 0;
          const maxDex = equippedArmor.maxDexBonus;

          // maxDexBonus: null = без ограничений, 0 = DEX не добавляется, N = cap
          const effectiveDex =
            maxDex === null || maxDex === undefined
              ? dexMod
              : Math.min(dexMod, maxDex);

          calculatedAC = armorBase + effectiveDex + armorMagicBonus;
        } else {
          // Без брони: 10 + DEX mod
          calculatedAC = BASE_UNARMORED_AC + dexMod;
        }

        break;
    }
  } else {
    // Creature
    const creatureAC = system.armorClass;

    calculatedAC = creatureAC?.value ?? BASE_UNARMORED_AC;

    const modifiedAC = modifiedStats.armorClass;

    acEffectBonus = Number(modifiedAC) - calculatedAC;

    if (Number.isNaN(acEffectBonus)) {
      acEffectBonus = 0;
    }
  }

  // Итоговое AC = расчётный КД + щит + бонусы от Active Effects
  derivedStats.armorClass = calculatedAC + shieldBonus + acEffectBonus;

  // 8. Spell Save DC (8 + бонус мастерства + мод. характеристики заклинателя)
  const spellcastingAbility = getFirstSpellcastingAbility(actor);

  if (spellcastingAbility) {
    const spellMod = derivedStats.abilityMods[spellcastingAbility];

    derivedStats.spellSaveDC =
      derivedStats.spellSaveDC // бонусы от эффектов (фаза 2)
      + 8
      + derivedStats.proficiencyBonus
      + spellMod;
  }

  // 9. Speed.zero flag — обнуляет все скорости
  if (derivedStats.activeFlags.has('speed.zero')) {
    for (const movementKey of MOVEMENT_KEYS) {
      derivedStats.movement[movementKey] = 0;
    }
  }

  // 10. Защиты от урона (статические + от флагов активных эффектов)
  derivedStats.damageDefenses = resolveDamageDefenses(
    actor,
    derivedStats.activeFlags,
  );

  return derivedStats;
}

// ── Полный пайплайн ───────────────────────────────────────────

/**
 * Объединяет нативные эффекты актора с внешними (ambient, от аур на карте).
 *
 * Ambient-эффект не добавляется, если на акторе УЖЕ есть такой же активный
 * эффект — по правилам D&D 5e эффекты с одинаковым именем не суммируются.
 * Ambient-эффект имеет id `${effect.id}_aura_${source.id}`; совпадение ищется
 * по оригинальному ID или имени.
 *
 * @param nativeEffects - собственные эффекты актора (см. collectActiveEffects)
 * @param ambientEffects - внешние эффекты от аур
 * @returns объединённый список эффектов без дублей
 */
export function combineEffectsWithAmbient(
  nativeEffects: readonly ActiveEffect[],
  ambientEffects: readonly ActiveEffect[],
): ActiveEffect[] {
  const filteredAmbient = ambientEffects.filter((ambientEff) => {
    const ambientBaseId = ambientEff.id.split('_aura_')[0];

    return !nativeEffects.some(
      (nativeEff) =>
        nativeEff.id === ambientBaseId
        || (nativeEff.name || '').trim().toLowerCase()
          === (ambientEff.name || '').trim().toLowerCase(),
    );
  });

  return nativeEffects.concat(filteredAmbient);
}

/**
 * Полный пайплайн расчёта статов актора.
 *
 * Объединяет все три фазы:
 * 1. prepareBaseData — сырые данные из actor.system
 * 2. applyActiveEffects — применение всех эффектов
 * 3. prepareDerivedData — вычисление производных
 *
 * @param actor - объект DnDActor
 * @param ambientEffects - временные внешние эффекты (например, от аур на карте)
 * @returns полностью вычисленные ResolvedActorStats
 */
export function resolveActorStats(
  actor: DnDActor | Creature,
  ambientEffects: readonly ActiveEffect[] = [],
): ResolvedActorStats {
  // Фаза 1: базовые данные
  const baseStats = prepareBaseData(actor);

  // Сбор нативных эффектов + внешние (ambient) от аур без дублей
  const activeEffects = combineEffectsWithAmbient(
    collectActiveEffects(actor),
    ambientEffects,
  );

  // Контекст формул (из базовых данных — ДО модификации)
  const formulaContext = buildFormulaContext(actor);

  // Фаза 2: применение эффектов
  const modifiedStats = applyActiveEffects(
    baseStats,
    activeEffects,
    formulaContext,
  );

  // Фаза 3: производные данные
  return prepareDerivedData(modifiedStats, actor);
}

// ── Вспомогательные функции ───────────────────────────────────

/**
 * Определяет характеристику заклинателя из классов актора.
 *
 * Берёт первый класс, у которого заполнено spellcastingAbility
 * (копируется из ClassDefinition.spellcasting.ability при выборе класса).
 *
 * @param actor - актор
 * @returns характеристика заклинателя или null если нет классов-заклинателей
 */
function getFirstSpellcastingAbility(
  actor: DnDActor | Creature,
): AbilityType | null {
  // Ручной приоритет в корне персонажа
  const manualSpellcastingAbility = actor.system.spellcastingAbility;

  if (isAbilityType(manualSpellcastingAbility)) {
    return manualSpellcastingAbility;
  }

  // Если есть классы
  if (isActorEntity(actor)) {
    const casterClass = actor.system.classes.find(
      (entry) => entry.spellcastingAbility != null,
    );

    if (casterClass?.spellcastingAbility) {
      return casterClass.spellcastingAbility;
    }
  }

  return null;
}

/**
 * Создаёт глубокую копию ResolvedActorStats.
 *
 * Необходимо для immutable transforms (AGENTS.md).
 *
 * @param stats - исходные статы
 * @returns независимая копия
 */
function cloneResolvedStats(stats: ResolvedActorStats): ResolvedActorStats {
  return {
    abilities: { ...stats.abilities },
    abilityMods: { ...stats.abilityMods },
    saves: { ...stats.saves },
    skills: { ...stats.skills },
    armorClass: stats.armorClass,
    initiative: stats.initiative,
    proficiencyBonus: stats.proficiencyBonus,
    movement: { ...stats.movement },
    hitPointsMax: stats.hitPointsMax,
    attackBonuses: { ...stats.attackBonuses },
    damageBonuses: { ...stats.damageBonuses },
    spellSaveDC: stats.spellSaveDC,
    activeFlags: new Set(stats.activeFlags),
    damageDefenses: {
      immunities: new Set(stats.damageDefenses.immunities),
      resistances: new Set(stats.damageDefenses.resistances),
      vulnerabilities: new Set(stats.damageDefenses.vulnerabilities),
    },
    overriddenKeys: new Set(stats.overriddenKeys),
  };
}
