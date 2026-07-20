/**
 * Шаблоны Active Effects для D&D 5e Conditions (PHB 2024)
 *
 * Каждый шаблон содержит предзаготовленные changes (числовые) и flags (булевые),
 * которые применяются автоматически при активации условия на акторе.
 *
 * Exhaustion — особый случай с уровнями (1-6, PHB 2024):
 * - Каждый уровень: -2 ко всем d20 тестам (атаки, спасброски, проверки/навыки)
 * - Каждый уровень: -5 фт ко всем видам скорости
 * - Смерть на уровне 6
 */

import type { AbilityType, MovementType, SkillType } from '@vtt/shared';
import type {
  ActiveEffect,
  EffectChange,
  EffectDuration,
  EffectFlagKey,
  EffectOrigin,
} from './activeEffectTypes.js';
import type { ConditionKey } from './conditionKeys.js';

import { generateId } from '@vtt/shared';
import { DEFAULT_EFFECT_CHANGE_PRIORITY } from './activeEffectTypes.js';
import { CONDITIONS } from './consts.js';

// ── Типы ──────────────────────────────────────────────────────

/** Шаблон эффекта для состояния D&D 5e */
export interface ConditionEffectTemplate {
  /** Числовые модификаторы */
  changes: EffectChange[];
  /** Булевые флаги */
  flags: EffectFlagKey[];
  /**
   * Состояния, к которым это состояние даёт иммунитет (напр. Окаменевший →
   * иммунитет к Отравлению). Прокидывается в `ActiveEffect.conditionImmunities`
   * и блокирует наложение состояния через `getEntityConditionImmunities`.
   */
  conditionImmunities?: ConditionKey[];
  /** Есть ли уровни (для Exhaustion) */
  hasLevels?: boolean;
  /** Максимальный уровень (для Exhaustion) */
  maxLevel?: number;
}

// ── Шаблоны Conditions ────────────────────────────────────────

/**
 * Шаблоны Active Effects для всех D&D 5e Conditions.
 *
 * Используются при клике на иконку состояния в ActorEffectsTab:
 * 1. Находим шаблон по ConditionKey
 * 2. Создаём ActiveEffect с changes и flags из шаблона
 * 3. Добавляем в actor.activeEffects
 */
export const CONDITION_EFFECT_TEMPLATES: Record<
  ConditionKey,
  ConditionEffectTemplate
> = {
  blinded: {
    changes: [],
    flags: [
      'attack.disadvantage',
      'attacksAgainst.advantage',
      'vision.blinded',
    ],
  },

  charmed: {
    changes: [],
    flags: [],
    // Механика «нельзя атаковать» — специфичная, не через числа/флаги
  },

  deafened: {
    changes: [],
    flags: [],
    // Автопровал проверок слуха — специфичная механика
  },

  exhaustion: {
    changes: [],
    flags: [],
    hasLevels: true,
    maxLevel: 6,
    // Changes генерируются динамически через buildExhaustionChanges()
  },

  frightened: {
    changes: [],
    flags: ['attack.disadvantage', 'abilityCheck.disadvantage'],
  },

  grappled: {
    changes: [],
    flags: ['speed.zero'],
  },

  incapacitated: {
    changes: [],
    flags: ['incapacitated', 'initiative.disadvantage'],
  },

  invisible: {
    changes: [],
    flags: [
      'attack.advantage',
      'attacksAgainst.disadvantage',
      'initiative.advantage',
      'vision.invisible',
    ],
  },

  paralyzed: {
    changes: [],
    flags: [
      'incapacitated',
      // Недееспособность (PHB 2024) даёт помеху на инициативу; флаг
      // `incapacitated` инертен (его никто не читает), поэтому добавляем явно.
      'initiative.disadvantage',
      'speed.zero',
      'save.autoFail.strength',
      'save.autoFail.dexterity',
      'attacksAgainst.advantage',
    ],
    // Крит в пределах 5 фт автоматизировать нечем (нет флага «крит по мне»).
  },

  petrified: {
    changes: [],
    flags: [
      'incapacitated',
      'initiative.disadvantage',
      'speed.zero',
      'save.autoFail.strength',
      'save.autoFail.dexterity',
      'attacksAgainst.advantage',
      // Сопротивление всему урону (PHB 2024) — по типу на каждый вид урона.
      'resistance.slashing',
      'resistance.piercing',
      'resistance.bludgeoning',
      'resistance.fire',
      'resistance.cold',
      'resistance.lightning',
      'resistance.thunder',
      'resistance.poison',
      'resistance.acid',
      'resistance.necrotic',
      'resistance.radiant',
      'resistance.force',
      'resistance.psychic',
    ],
    // Иммунитет к Отравлению (само состояние; урон ядом — лишь сопротивление).
    conditionImmunities: ['poisoned'],
  },

  poisoned: {
    changes: [],
    flags: ['attack.disadvantage', 'abilityCheck.disadvantage'],
  },

  prone: {
    changes: [],
    flags: ['attack.disadvantage'],
    // Примечание: атаки в пределах 5 фт с преимуществом, дальше — с помехой
    // Дистанционная логика — будущая итерация
  },

  restrained: {
    changes: [],
    flags: [
      'speed.zero',
      'attack.disadvantage',
      'attacksAgainst.advantage',
      // PHB 2024: помеха на спасброски Ловкости.
      'save.disadvantage.dexterity',
    ],
  },

  stunned: {
    changes: [],
    flags: [
      'incapacitated',
      // Недееспособность (PHB 2024) → помеха на инициативу (флаг `incapacitated`
      // инертен). Скорость НЕ обнуляется: у Ошеломлённого 2024 нет пункта «не
      // может двигаться» (в отличие от Парализованного/Без сознания).
      'initiative.disadvantage',
      'save.autoFail.strength',
      'save.autoFail.dexterity',
      'attacksAgainst.advantage',
    ],
  },

  unconscious: {
    changes: [],
    flags: [
      'incapacitated',
      // Недееспособность → помеха на инициативу (флаг `incapacitated` инертен).
      'initiative.disadvantage',
      'speed.zero',
      'save.autoFail.strength',
      'save.autoFail.dexterity',
      'attacksAgainst.advantage',
      // Без сознания включает Лежащего ничком → помеха на свои броски атаки.
      'attack.disadvantage',
    ],
    // Крит в пределах 5 фт автоматизировать нечем (нет флага «крит по мне»).
  },
};

// ── Exhaustion ────────────────────────────────────────────────

/** Штраф к тестам d20 за каждый уровень истощения (PHB 2024) */
const EXHAUSTION_D20_PENALTY_PER_LEVEL = -2;

/** Штраф к скорости (в футах) за каждый уровень истощения (PHB 2024) */
const EXHAUSTION_SPEED_PENALTY_PER_LEVEL = -5;

/** Максимальный уровень истощения (PHB 2024: 6 = смерть) */
const EXHAUSTION_MAX_LEVEL = 6;

/** Характеристики для штрафа к спасброскам (часть «всех d20 тестов») */
const EXHAUSTION_ABILITY_KEYS: readonly AbilityType[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];

/**
 * Навыки для штрафа к проверкам (часть «всех d20 тестов»). Движок не имеет
 * единого ключа «проверка характеристики», поэтому штраф разворачивается по
 * навыкам — это покрывает подавляющее большинство проверок (чистые проверки
 * характеристики без навыка штраф не получают — ограничение модели).
 */
const EXHAUSTION_SKILL_KEYS: readonly SkillType[] = [
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
];

/** Виды скорости для штрафа −5 фт/уровень (часть «ко всем видам скорости») */
const EXHAUSTION_MOVEMENT_KEYS: readonly MovementType[] = [
  'walk',
  'fly',
  'swim',
  'climb',
  'burrow',
];

/**
 * Генерирует числовые изменения для заданного уровня Exhaustion (PHB 2024).
 *
 * PHB 2024 правила:
 * - Каждый уровень: -2 ко ВСЕМ d20 тестам — атаки (рукопашные/дальнобойные/
 *   заклинаниями), спасброски (все 6 характеристик) и проверки (все навыки);
 * - Каждый уровень: -5 фт ко ВСЕМ видам скорости;
 * - Уровень 6 = смерть (обрабатывается UI).
 *
 * Количество changes (до 32 на эффект) укладывается в `MAX_CHANGES_PER_EFFECT`.
 *
 * @param exhaustionLevel - текущий уровень истощения (1-6)
 * @returns массив EffectChange для этого уровня
 */
export function buildExhaustionChanges(
  exhaustionLevel: number,
): EffectChange[] {
  const clampedLevel = Math.max(
    0,
    Math.min(exhaustionLevel, EXHAUSTION_MAX_LEVEL),
  );

  if (clampedLevel === 0) {
    return [];
  }

  const d20Penalty = String(EXHAUSTION_D20_PENALTY_PER_LEVEL * clampedLevel);

  const speedPenalty = String(
    EXHAUSTION_SPEED_PENALTY_PER_LEVEL * clampedLevel,
  );

  const changes: EffectChange[] = [];

  // Штраф к атакам (все три вида)
  for (const attackKey of [
    'attack.melee',
    'attack.ranged',
    'attack.spell',
  ] as const) {
    changes.push({
      key: attackKey,
      mode: 'add',
      value: d20Penalty,
      priority: DEFAULT_EFFECT_CHANGE_PRIORITY,
    });
  }

  // Штраф ко всем спасброскам
  for (const ability of EXHAUSTION_ABILITY_KEYS) {
    changes.push({
      key: `save.${ability}`,
      mode: 'add',
      value: d20Penalty,
      priority: DEFAULT_EFFECT_CHANGE_PRIORITY,
    });
  }

  // Штраф ко всем навыкам (приближение «проверок характеристик»)
  for (const skill of EXHAUSTION_SKILL_KEYS) {
    changes.push({
      key: `skill.${skill}`,
      mode: 'add',
      value: d20Penalty,
      priority: DEFAULT_EFFECT_CHANGE_PRIORITY,
    });
  }

  // Штраф ко всем видам скорости
  for (const movement of EXHAUSTION_MOVEMENT_KEYS) {
    changes.push({
      key: `movement.${movement}`,
      mode: 'add',
      value: speedPenalty,
      priority: DEFAULT_EFFECT_CHANGE_PRIORITY,
    });
  }

  return changes;
}

// ── Сборка эффекта состояния ──────────────────────────────────

/** Опции сборки ActiveEffect для состояния */
export interface BuildConditionEffectOptions {
  /** Источник эффекта (по умолчанию `condition`) */
  origin?: EffectOrigin;
  /** Длительность (по умолчанию постоянная) */
  duration?: EffectDuration;
  /** Цель применения: на себя или на цель атаки (для райдеров — `target`) */
  effectTarget?: 'self' | 'target';
  /** Уровень истощения (учитывается только для `exhaustion`) */
  exhaustionLevel?: number;
}

/**
 * Собирает ActiveEffect для состояния D&D 5e из шаблона.
 *
 * Единый источник правды для наложения состояний (тоггл на листе актора,
 * применение по цели атаки, райдеры). Проставляет `conditionKey` — он нужен
 * для проверки иммунитета цели и устойчивого опознания состояния.
 *
 * @param conditionKey - ключ состояния
 * @param options - источник, длительность, цель применения, уровень истощения
 * @returns готовый ActiveEffect или `null`, если состояние неизвестно
 */
export function buildConditionActiveEffect(
  conditionKey: ConditionKey,
  options: BuildConditionEffectOptions = {},
): ActiveEffect | null {
  const condition = CONDITIONS.find((entry) => entry.key === conditionKey);

  if (!condition) {
    return null;
  }

  const template = CONDITION_EFFECT_TEMPLATES[conditionKey];

  const changes =
    conditionKey === 'exhaustion'
      ? buildExhaustionChanges(options.exhaustionLevel ?? 1)
      : [...template.changes];

  const effect: ActiveEffect = {
    id: generateId('effect'),
    name: condition.nameRu,
    description: condition.description,
    icon: condition.icon,
    disabled: false,
    origin: options.origin ?? 'condition',
    transfer: false,
    duration: options.duration ?? { type: 'permanent' },
    changes,
    flags: [...template.flags],
    conditionKey,
  };

  if (options.effectTarget) {
    effect.effectTarget = options.effectTarget;
  }

  if (template.conditionImmunities && template.conditionImmunities.length > 0) {
    effect.conditionImmunities = [...template.conditionImmunities];
  }

  return effect;
}
